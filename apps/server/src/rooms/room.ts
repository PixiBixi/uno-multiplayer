import { randomUUID } from 'node:crypto'
import {
  applyMove,
  err,
  initGame,
  markSeatLeft,
  ok,
  setSeatStatus,
  skipDisconnectedTurn,
  type GameState,
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

  constructor(code: string, seed: number) {
    this.code = code
    this.seed = seed
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
    }
  }

  start(bySeat: number): Result<GameEvent[], ErrorCode> {
    if (this.game !== null) return err('game_already_started')
    if (bySeat !== this.host) return err('not_host')

    const active = this.members.filter((m) => m.status === 'active')
    if (active.length < MIN_SEATS) return err('too_few_players')

    const init = initGame({ names: active.map((m) => m.name), seed: this.seed })
    if (!init.okay) return err('too_few_players')

    this.game = init.value
    return ok([])
  }

  viewFor(seat: number): PlayerView | null {
    if (this.game === null) return null
    return redactFor(this.game, seat)
  }

  move(seat: number, move: Move): Result<GameEvent[], ErrorCode> {
    const before = this.game
    if (before === null) return err('game_not_started')

    const result = applyMove(before, seat, move)
    if (!result.okay) {
      return err(result.error === 'not_your_turn' ? 'not_your_turn' : 'illegal_move')
    }

    this.game = result.value
    return ok(diffEvents(before, result.value, seat, move))
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
      if (this.game.phase === 'finished' && before.phase !== 'finished') {
        events.push({ type: 'gameOver', winner: this.game.winner })
      }
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

  if (after.phase === 'finished' && before.phase !== 'finished') {
    events.push({ type: 'gameOver', winner: after.winner })
  }
  return events
}
