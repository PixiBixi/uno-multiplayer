import { randomUUID } from 'node:crypto'
import {
  applyMove,
  applyRound,
  err,
  initGame,
  markSeatLeft,
  matchWinners,
  ok,
  roundPoints,
  setSeatStatus,
  skipDisconnectedTurn,
  startMatch,
  type GameState,
  type MatchGoal,
  type MatchState,
  type Move,
  type Result,
  type SeatStatus,
} from '@uno/engine'
import {
  MAX_SEATS,
  MIN_SEATS,
  type ErrorCode,
  type GameEvent,
  type LobbyView,
  type MatchProgress,
  type PlayerView,
} from '@uno/protocol'
import { redactFor } from '../views.js'

export type Member = {
  seat: number
  name: string
  /** The player's identity across reconnections. Never the socket id. */
  sessionToken: string
  socketId: string | null
  status: SeatStatus
}

export type RoomPhase = 'lobby' | 'playing' | 'finished'

/**
 * One room: a lobby, then a game. Deliberately synchronous and timer-free — it
 * knows nothing of socket.io or setTimeout, which is what makes the whole
 * lifecycle testable without a clock or a network. Grace periods live in
 * RoomManager, which calls expireGrace when one elapses.
 */
export class Room {
  readonly code: string
  private readonly seed: number
  private readonly members: Member[] = []
  private host = 0
  private game: GameState | null = null
  private readonly goal: MatchGoal
  /** Null until the first round is dealt; the goal is known from creation. */
  private match: MatchState | null = null

  constructor(code: string, seed: number, goal: MatchGoal) {
    this.code = code
    this.seed = seed
    this.goal = goal
  }

  get phase(): RoomPhase {
    if (this.game === null) return 'lobby'
    return this.game.phase === 'finished' ? 'finished' : 'playing'
  }

  get hostSeat(): number {
    return this.host
  }

  get memberCount(): number {
    return this.members.length
  }

  join(name: string, socketId: string): Result<{ seat: number; sessionToken: string }, ErrorCode> {
    if (this.phase !== 'lobby') return err('game_already_started')
    if (this.members.length >= MAX_SEATS) return err('room_full')

    const member: Member = {
      seat: this.members.length,
      name,
      sessionToken: randomUUID(),
      socketId,
      status: 'active',
    }
    this.members.push(member)
    return ok({ seat: member.seat, sessionToken: member.sessionToken })
  }

  memberAt(seat: number): Member | null {
    return this.members[seat] ?? null
  }

  seatOfSocket(socketId: string): number | null {
    return this.members.find((m) => m.socketId === socketId)?.seat ?? null
  }

  isEmpty(): boolean {
    return this.members.every((m) => m.socketId === null)
  }

  activeMemberCount(): number {
    return this.members.filter((m) => m.status === 'active').length
  }

  lobbyView(): LobbyView {
    return {
      roomCode: this.code,
      hostSeat: this.host,
      seats: this.members.map((m) => ({ seat: m.seat, name: m.name, status: m.status })),
      canStart: this.activeMemberCount() >= MIN_SEATS,
      goal: this.goal,
    }
  }

  /** True once somebody has met the goal, which is when a new match is the only move. */
  get matchOver(): boolean {
    return this.match !== null && matchWinners(this.match) !== null
  }

  private matchProgress(): MatchProgress {
    const match = this.match ?? startMatch(this.goal, this.members.length)
    return {
      goal: match.goal,
      scores: [...match.scores],
      round: match.round,
      winners: matchWinners(match),
    }
  }

  /**
   * Deals a round to every member seat, active or not.
   *
   * Dealing only to the active members is what the first version did, and it made
   * an engine seat index and a member seat index different numbers the moment
   * anybody was absent at deal time. viewFor() indexes the engine by member seat,
   * so the highest-numbered player fell off the end of the seat array and received
   * no view of the game at all — present, holding cards, looking at nothing.
   *
   * Absent seats are then reconciled: a player gone for good has their hand
   * returned to the pile, which both keeps the 108-card invariant and means they
   * score nothing for the round. Someone merely disconnected keeps their hand,
   * because the grace period may still bring them back to it.
   */
  private dealRound(seed: number): Result<GameState, ErrorCode> {
    const active = this.members.filter((m) => m.status === 'active')
    if (active.length < MIN_SEATS) return err('too_few_players')

    const init = initGame({ names: this.members.map((m) => m.name), seed })
    if (!init.okay) return err('too_few_players')

    let game = init.value
    for (const member of this.members) {
      if (member.status === 'active') continue
      game =
        member.status === 'left'
          ? markSeatLeft(game, member.seat)
          : setSeatStatus(game, member.seat, 'disconnected')
    }
    // The deal always starts on seat 0, which may be one of the absent ones.
    return ok(skipDisconnectedTurn(game))
  }

  /**
   * Settles a round that has just ended and reports it. Lives here rather than in
   * diffEvents because only the Room knows the standings — a pure diff of two game
   * states cannot say what the round paid out.
   */
  private settleRound(before: GameState, after: GameState): GameEvent[] {
    if (after.phase !== 'finished' || before.phase === 'finished') return []
    if (this.match === null) return []

    const awarded = roundPoints(after)
    this.match = applyRound(this.match, after)

    const events: GameEvent[] = [
      { type: 'roundEnded', winner: after.winner, awarded, scores: [...this.match.scores] },
    ]
    const winners = matchWinners(this.match)
    if (winners !== null) {
      events.push({ type: 'matchEnded', winners, scores: [...this.match.scores] })
    }
    return events
  }

  start(bySeat: number): Result<GameEvent[], ErrorCode> {
    if (this.game !== null) return err('game_already_started')
    if (bySeat !== this.host) return err('not_host')

    const dealt = this.dealRound(this.seed)
    if (!dealt.okay) return err(dealt.error)

    this.game = dealt.value
    this.match = startMatch(this.goal, this.members.length)
    return ok([])
  }

  /**
   * The next round of the same match: the standings carry over. The seed arrives
   * as a parameter for the same reason restart's does — a Room that draws its own
   * randomness stops being reproducible.
   */
  nextRound(bySeat: number, nextSeed: number): Result<GameEvent[], ErrorCode> {
    if (this.game === null || this.match === null) return err('game_not_started')
    if (this.game.phase !== 'finished') return err('round_in_progress')
    if (this.matchOver) return err('match_over')
    if (bySeat !== this.host) return err('not_host')

    const dealt = this.dealRound(nextSeed)
    if (!dealt.okay) return err(dealt.error)

    this.game = dealt.value
    return ok([{ type: 'roundStarted', round: this.match.round }])
  }

  /**
   * A whole new match on the same goal: the standings are abandoned. Distinct from
   * nextRound on purpose — the host may want either, and letting one action mean
   * both depending on hidden state is how a player loses a scoreboard by accident.
   */
  restart(bySeat: number, nextSeed: number): Result<GameEvent[], ErrorCode> {
    if (this.game === null) return err('game_not_started')
    if (this.game.phase !== 'finished') return err('round_in_progress')
    if (bySeat !== this.host) return err('not_host')

    const dealt = this.dealRound(nextSeed)
    if (!dealt.okay) return err(dealt.error)

    this.game = dealt.value
    this.match = startMatch(this.goal, this.members.length)
    return ok([{ type: 'gameRestarted' }])
  }

  viewFor(seat: number): PlayerView | null {
    if (this.game === null) return null
    return redactFor(this.game, seat, this.matchProgress())
  }

  move(seat: number, move: Move): Result<GameEvent[], ErrorCode> {
    const before = this.game
    if (before === null) return err('game_not_started')

    const result = applyMove(before, seat, move)
    if (!result.okay) {
      return err(result.error === 'not_your_turn' ? 'not_your_turn' : 'illegal_move')
    }

    this.game = result.value
    return ok([
      ...diffEvents(before, result.value, seat, move),
      ...this.settleRound(before, result.value),
    ])
  }

  disconnect(socketId: string): { seat: number; events: GameEvent[] } | null {
    const member = this.members.find((m) => m.socketId === socketId)
    if (member === undefined) return null

    member.socketId = null
    member.status = 'disconnected'
    this.transferHostIfNeeded()

    if (this.game !== null && this.game.phase === 'playing') {
      // Mirror presence into the game state, then move the turn past them so the
      // table never stalls on someone who is gone.
      this.game = skipDisconnectedTurn(setSeatStatus(this.game, member.seat, 'disconnected'))
    }
    return { seat: member.seat, events: [{ type: 'seatDisconnected', seat: member.seat }] }
  }

  rejoin(sessionToken: string, socketId: string): Result<{ seat: number }, ErrorCode> {
    const member = this.members.find((m) => m.sessionToken === sessionToken)
    if (member === undefined || member.status === 'left') return err('invalid_session')

    member.socketId = socketId
    member.status = 'active'
    if (this.game !== null) {
      this.game = setSeatStatus(this.game, member.seat, 'active')
    }
    return ok({ seat: member.seat })
  }

  /** Called by RoomManager when the grace period elapses. */
  expireGrace(seat: number): GameEvent[] {
    const member = this.members[seat]
    if (member === undefined) return []
    // Came back in time, or already gone for good: nothing to do.
    if (member.status !== 'disconnected') return []

    member.status = 'left'
    member.socketId = null
    this.transferHostIfNeeded()

    const events: GameEvent[] = [{ type: 'seatLeft', seat }]
    if (this.game !== null) {
      const before = this.game
      this.game = markSeatLeft(before, seat)
      events.push(...this.settleRound(before, this.game))
    }
    return events
  }

  /** The host role follows the lowest-indexed seat still present. */
  private transferHostIfNeeded(): void {
    const currentHost = this.members[this.host]
    if (currentHost !== undefined && currentHost.status === 'active') return
    const candidate = this.members.find((m) => m.status === 'active')
    if (candidate !== undefined) this.host = candidate.seat
  }
}

/**
 * Derives the narrative feed by comparing the state before and after. Deriving
 * rather than hand-emitting means an event can never contradict the state it
 * describes.
 */
function diffEvents(before: GameState, after: GameState, seat: number, move: Move): GameEvent[] {
  const events: GameEvent[] = []

  if (move.type === 'callUno') return [{ type: 'unoCalled', seat }]

  const played = after.discardPile[after.discardPile.length - 1]
  if (played !== undefined && after.discardPile.length > before.discardPile.length) {
    events.push({ type: 'cardPlayed', seat, card: played })
  }

  for (const seatAfter of after.seats) {
    const handBefore = before.seats[seatAfter.index]?.hand.length ?? 0
    const gained = seatAfter.hand.length - handBefore
    if (gained <= 0) continue
    events.push(
      seatAfter.index === seat && move.type === 'play'
        ? { type: 'unoPenalty', seat: seatAfter.index, count: gained }
        : { type: 'cardsDrawn', seat: seatAfter.index, count: gained },
    )
  }

  /* The round-end event is emitted by the Room, not here: it carries the standings,
     and a pure diff of two game states has no access to them. */
  return events
}
