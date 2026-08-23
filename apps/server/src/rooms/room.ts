import { randomUUID } from 'node:crypto'
import {
  DEFAULT_TABLE_RULES,
  activeCount,
  applyMove,
  applyRound,
  err,
  legalMoves,
  initGame,
  markSeatLeft,
  matchWinners,
  ok,
  roundPoints,
  setSeatStatus,
  skipDisconnectedTurn,
  startMatch,
  type Card,
  type GameState,
  type MatchGoal,
  type MatchState,
  type Move,
  type Result,
  type SeatStatus,
  type TableRules,
} from '@uno/engine'
import {
  MAX_SEATS,
  MIN_SEATS,
  type ErrorCode,
  type GameEvent,
  type LobbyView,
  type MatchPace,
  type MatchProgress,
  type PlayerView,
  type TableConfiguration,
} from '@uno/protocol'
import { redactFor } from '../views.js'
import { emptyStatsFor, tally } from './stats.js'

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
 * One room: a lobby, then a game. Deliberately synchronous and timer-free - it
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
  /* Settable from the lobby by the host and frozen by the first deal of the match -
     see configure(). Not readonly any more, and not mutable for long: changing any of
     the three mid-match would rewrite a contest that has already been partly played
     under the old ones. */
  private goal: MatchGoal
  private pace: MatchPace
  private rules: TableRules
  /* Held, never computed. Room owns no clock - RoomManager hands these in, the
     same way it hands in a seed, so the whole lifecycle stays testable without
     time passing. */
  private turnDeadline: number | null = null
  private nextRoundDeadline: number | null = null
  private stats = emptyStatsFor(0)
  /** Null until the first round is dealt; the goal is known from creation. */
  private match: MatchState | null = null

  constructor(
    code: string,
    seed: number,
    goal: MatchGoal,
    pace: MatchPace = null,
    rules: TableRules = DEFAULT_TABLE_RULES,
  ) {
    this.code = code
    this.seed = seed
    this.goal = goal
    this.pace = pace
    this.rules = rules
  }

  /**
   * Every event this room reports leaves through here, so the match tally is
   * taken in one place rather than at each of the eight paths that produce one.
   * Miss a path and the statistics quietly under-count; a test cross-checks the
   * totals against the events actually returned, so missing one fails loudly.
   */
  private record(events: GameEvent[]): GameEvent[] {
    if (events.length > 0) this.stats = tally(this.stats, events)
    return events
  }

  /** Null on a table with no clock, which is what makes the rest opt-in. */
  get turnSeconds(): number | null {
    return this.pace?.turnSeconds ?? null
  }

  /** True while somebody could still be timed out. */
  get awaitingMove(): boolean {
    return this.game !== null && this.game.phase === 'playing'
  }

  get currentSeat(): number | null {
    return this.game?.currentSeat ?? null
  }

  /**
   * True while the seat on turn is deciding what to do with a card it has just drawn.
   *
   * Read by RoomManager and nothing else: a voluntary draw does not end the turn on a table
   * that plays the drawn card, so the turn clock must not restart for it. The seat gets the
   * time it had left to play, not a fresh allowance for having drawn.
   */
  get decidingOnDrawnCard(): boolean {
    return this.game?.drawnCard != null
  }

  /** A round has ended, the match has not, so another deal is due. */
  get betweenRounds(): boolean {
    return this.game !== null && this.game.phase === 'finished' && !this.matchOver
  }

  /**
   * The clock dealing the next round rather than the host.
   *
   * Distinct from nextRound(): no seat asked for this, so there is no host to
   * check, and it reports nothing when the table can no longer deal - everybody
   * having left during the pause is an ordinary way for a fast match to end.
   */
  dealNextRoundAutomatically(nextSeed: number): GameEvent[] {
    if (this.game === null || this.match === null) return []
    if (this.game.phase !== 'finished' || this.matchOver) return []

    const dealt = this.dealRound(nextSeed)
    if (!dealt.okay) return []

    this.game = dealt.value
    return this.record([{ type: 'roundStarted', round: this.match.round }])
  }

  setTurnDeadline(at: number | null): void {
    this.turnDeadline = at
  }

  setNextRoundDeadline(at: number | null): void {
    this.nextRoundDeadline = at
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

  /**
   * Nobody could come back even if they tried: every member has left for good, or
   * nobody ever sat down. Distinct from isEmpty(), which is merely "no sockets
   * attached right now" and is also true of a table whose players are mid-reload.
   */
  get abandoned(): boolean {
    // `every` on no members is true, which is the right answer for a room created
    // and never joined.
    return this.members.every((member) => member.status === 'left')
  }

  activeMemberCount(): number {
    return this.members.filter((m) => m.status === 'active').length
  }

  /**
   * Whether the host may still change the goal, the pace or the rules.
   *
   * Derived from the match having begun, deliberately not from `canStart`: that reports
   * how many seats are filled, and a room can be un-startable while already holding a
   * dealt round and a score - somebody left mid-match. Gating on it would reopen the
   * rules at exactly the moment they must not move.
   *
   * `match` rather than `game`: the lock is the first deal of the MATCH, not of each
   * round, because a match spans rounds and carries a score.
   */
  get configurable(): boolean {
    return this.match === null
  }

  /**
   * Changes the table before it is dealt. The host's job, and only theirs.
   *
   * Partial by design: a field absent from `changes` is left alone, so toggling one rule
   * cannot write back a goal the client read a moment earlier. `pace` distinguishes
   * absent from null - null takes the clock off the table.
   *
   * Reports no event. There is no narrative feed in the lobby and nothing here belongs
   * in the match statistics; the result reaches players as a fresh `room:state`, which
   * carries the whole configuration anyway and therefore covers a reconnection too.
   */
  configure(bySeat: number, changes: TableConfiguration): Result<GameEvent[], ErrorCode> {
    if (!this.configurable) return err('game_already_started')
    if (bySeat !== this.host) return err('not_host')

    if (changes.goal !== undefined) this.goal = changes.goal
    if (changes.pace !== undefined) this.pace = changes.pace
    if (changes.rules !== undefined) this.rules = changes.rules
    return ok([])
  }

  lobbyView(): LobbyView {
    return {
      roomCode: this.code,
      hostSeat: this.host,
      seats: this.members.map((m) => ({ seat: m.seat, name: m.name, status: m.status })),
      canStart: this.activeMemberCount() >= MIN_SEATS,
      goal: this.goal,
      pace: this.pace,
      rules: this.rules,
      configurable: this.configurable,
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
      stats: this.stats.map((seat) => ({ ...seat })),
    }
  }

  /**
   * Deals a round to every member seat, active or not.
   *
   * Dealing only to the active members is what the first version did, and it made
   * an engine seat index and a member seat index different numbers the moment
   * anybody was absent at deal time. viewFor() indexes the engine by member seat,
   * so the highest-numbered player fell off the end of the seat array and received
   * no view of the game at all - present, holding cards, looking at nothing.
   *
   * Absent seats are then reconciled: a player gone for good has their hand
   * returned to the pile, which both keeps the 108-card invariant and means they
   * score nothing for the round. Someone merely disconnected keeps their hand,
   * because the grace period may still bring them back to it.
   */
  private dealRound(seed: number): Result<GameState, ErrorCode> {
    const active = this.members.filter((m) => m.status === 'active')
    if (active.length < MIN_SEATS) return err('too_few_players')

    const init = initGame({ names: this.members.map((m) => m.name), seed, rules: this.rules })
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
   * diffEvents because only the Room knows the standings - a pure diff of two game
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
    this.stats = emptyStatsFor(this.members.length)
    return ok([])
  }

  /**
   * The next round of the same match: the standings carry over. The seed arrives
   * as a parameter for the same reason restart's does - a Room that draws its own
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
    return ok(this.record([{ type: 'roundStarted', round: this.match.round }]))
  }

  /**
   * A whole new match on the same goal: the standings are abandoned. Distinct from
   * nextRound on purpose - the host may want either, and letting one action mean
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
    // A new match starts from nothing; the old tally described a different one.
    this.stats = emptyStatsFor(this.members.length)
    return ok(this.record([{ type: 'gameRestarted' }]))
  }

  viewFor(seat: number): PlayerView | null {
    if (this.game === null) return null
    return redactFor(this.game, seat, this.matchProgress(), {
      turnDeadline: this.turnDeadline,
      nextRoundDeadline: this.nextRoundDeadline,
    })
  }

  move(seat: number, move: Move): Result<GameEvent[], ErrorCode> {
    const before = this.game
    if (before === null) return err('game_not_started')

    const result = applyMove(before, seat, move)
    if (!result.okay) {
      return err(result.error === 'not_your_turn' ? 'not_your_turn' : 'illegal_move')
    }

    this.game = result.value
    return ok(
      this.record([
        ...diffEvents(before, result.value, seat, move),
        ...this.settleRound(before, result.value),
      ]),
    )
  }

  /**
   * Plays for whoever is on turn when their time runs out.
   *
   * Always a draw, even when they held something playable: choosing a card for
   * someone is choosing their move, while drawing is the one action that is always
   * legal, always neutral, and never spends a card they were saving. It ends the
   * turn, which is the entire point of the clock.
   *
   * A pending draw against them makes `draw` illegal, so accepting it is the same
   * decision taken on their behalf. If neither is available - the seat could only
   * have called UNO - nothing is forced: that penalty belongs to the player who
   * forgot, not to the clock.
   *
   * A seat already holding a drawn card is passed rather than made to draw again. They
   * have drawn; forcing a second card would punish the clock twice, and it is also the
   * only move that ends that turn - `draw` is not on offer in the sub-state, so without
   * `pass` first the clock would expire against the same seat for ever.
   */
  forceTurnMove(): GameEvent[] {
    const before = this.game
    if (before === null || before.phase !== 'playing') return []

    const seat = before.currentSeat
    const moves = legalMoves(before, seat)
    const forced =
      moves.find((move) => move.type === 'pass') ??
      moves.find((move) => move.type === 'acceptDraw') ??
      moves.find((move) => move.type === 'draw')
    if (forced === undefined) return []

    const result = applyMove(before, seat, forced)
    if (!result.okay) return []
    this.game = result.value

    return this.record([
      { type: 'turnTimedOut', seat },
      ...diffEvents(before, result.value, seat, forced),
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
    return {
      seat: member.seat,
      events: this.record([{ type: 'seatDisconnected', seat: member.seat }]),
    }
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
    return this.record(events)
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
 * The Seven-Zero effect a play had, or null when it had none.
 *
 * Read from the card and the table's rules rather than from hand sizes, which a
 * permutation can leave entirely unchanged: two seats holding four cards each swap
 * to no visible difference at all. A finished round means the card emptied a hand
 * and the round ended before any hand could move - first empty hand wins, and the
 * reducer settles that before the effect.
 */
function sevenZeroEvent(
  after: GameState,
  seat: number,
  move: Move,
  played: Card,
): GameEvent | null {
  if (!after.rules.sevenZero || move.type !== 'play') return null
  if (after.phase !== 'playing' || played.kind !== 'number') return null

  /* `swapWith` is present only when the reducer really swapped: legalMoves offers a
     bare 7 when nobody else is active or when the card wins the round, and the move
     gate compares the field. */
  if (played.value === 7) {
    return move.swapWith === undefined ? null : { type: 'handsSwapped', seat, with: move.swapWith }
  }
  // Rotating a single active hand is a no-op, and reporting one would be a lie.
  if (played.value === 0 && activeCount(after) > 1) {
    return { type: 'handsRotated', direction: after.direction }
  }
  return null
}

/**
 * Derives the narrative feed by comparing the state before and after. Deriving
 * rather than hand-emitting means an event can never contradict the state it
 * describes.
 */
function diffEvents(before: GameState, after: GameState, seat: number, move: Move): GameEvent[] {
  const events: GameEvent[] = []

  if (move.type === 'callUno') return [{ type: 'unoCalled', seat }]

  /* Read from the move for the same reason a call-out is: nothing else about the state
     changed. A pass moves the turn and touches no hand and no pile, so the diff below has
     nothing to find and would report a turn that ended as though nothing had. */
  if (move.type === 'pass') return [{ type: 'turnPassed', seat }]

  /* Named explicitly rather than left to the hand-size loop below, which would
     read the two cards as an ordinary draw by the target. The penalty keeps its
     own `unoPenalty` event so the statistics and the sound for a forgotten UNO do
     not have to learn about a second way of charging it. */
  if (move.type === 'callOut') {
    const gained =
      (after.seats[move.target]?.hand.length ?? 0) - (before.seats[move.target]?.hand.length ?? 0)
    const events: GameEvent[] = [{ type: 'calledOut', by: seat, target: move.target }]
    // Zero only if the pile could not pay it, which the engine allows rather than
    // inventing cards.
    if (gained > 0) events.push({ type: 'unoPenalty', seat: move.target, count: gained })
    return events
  }

  const played = after.discardPile[after.discardPile.length - 1]
  if (played !== undefined && after.discardPile.length > before.discardPile.length) {
    /* A play by a seat whose turn it was not is a jump-in, and there is nothing else
       it could be: the reducer exempts exactly two moves from the turn check, and the
       other one is a call-out, which returned above. Read from `before`, since `after`
       has the turn on the jumper by then - that being the whole effect of the rule. */
    if (before.rules.jumpIn && before.currentSeat !== seat) {
      events.push({ type: 'jumpedIn', seat })
    }
    events.push({ type: 'cardPlayed', seat, card: played })

    /* Seven-Zero moved hands, so every difference in size below is that permutation
       and not one card was drawn: the reducer deliberately charges no automatic UNO
       penalty on a play that permutes, which is what keeps this a size diff rather
       than an id diff. Reporting a swap as a draw is exactly the sort of event that
       would contradict the state it describes. */
    const permutation = sevenZeroEvent(after, seat, move, played)
    if (permutation !== null) {
      events.push(permutation)
      return events
    }
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
