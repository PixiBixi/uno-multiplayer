import type { MatchGoal } from '@uno/engine'
import { randomInt } from 'node:crypto'
import { err, ok, type Result } from '@uno/engine'
import {
  BETWEEN_ROUNDS_SECONDS,
  type ErrorCode,
  type GameEvent,
  type MatchPace,
} from '@uno/protocol'
import { generateRoomCode } from './room-code.js'
import { Room } from './room.js'

export type Timers = {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export type RoomManagerOptions = {
  maxRooms: number
  gracePeriodMs: number
  timers?: Timers
  seedSource?: () => number
  /** Injectable for the same reason the timers are: tests must not wait. */
  now?: () => number
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * The room directory, and the only place in the server that owns timers. They
 * sit behind an injectable interface so tests never wait on real time.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly graceTimers = new Map<string, unknown>()
  private readonly turnTimers = new Map<string, unknown>()
  private readonly roundTimers = new Map<string, unknown>()
  private readonly maxRooms: number
  private readonly gracePeriodMs: number
  private readonly timers: Timers
  private readonly seedSource: () => number
  private readonly now: () => number

  constructor(options: RoomManagerOptions) {
    this.maxRooms = options.maxRooms
    this.gracePeriodMs = options.gracePeriodMs
    this.timers = options.timers ?? defaultTimers
    this.seedSource = options.seedSource ?? (() => randomInt(2 ** 31 - 1))
    this.now = options.now ?? (() => Date.now())
  }

  get size(): number {
    return this.rooms.size
  }

  create(goal: MatchGoal, pace: MatchPace = null): Result<Room, ErrorCode> {
    if (this.rooms.size >= this.maxRooms) return err('server_full')

    // Retry on the astronomically unlikely collision rather than overwrite.
    let code = generateRoomCode()
    for (let attempt = 0; this.rooms.has(code) && attempt < 10; attempt++) {
      code = generateRoomCode()
    }
    if (this.rooms.has(code)) return err('server_full')

    const room = new Room(code, this.seedSource(), goal, pace)
    this.rooms.set(code, room)
    return ok(room)
  }

  /** The seed source, so a restart can draw one without owning randomness. */
  nextSeed(): number {
    return this.seedSource()
  }

  get(code: string): Room | null {
    return this.rooms.get(code.toUpperCase()) ?? null
  }

  scheduleGrace(room: Room, seat: number, onExpire: (events: GameEvent[]) => void): void {
    this.cancelGrace(room, seat)
    const key = graceKey(room.code, seat)
    const handle = this.timers.setTimeout(() => {
      this.graceTimers.delete(key)
      onExpire(room.expireGrace(seat))
    }, this.gracePeriodMs)
    this.graceTimers.set(key, handle)
  }

  cancelGrace(room: Room, seat: number): void {
    const key = graceKey(room.code, seat)
    const handle = this.graceTimers.get(key)
    if (handle === undefined) return
    this.timers.clearTimeout(handle)
    this.graceTimers.delete(key)
  }

  /**
   * Re-arms the clock for whoever is now on turn, and writes the deadline into the
   * room so every view agrees on it.
   *
   * Called after anything that can change whose turn it is. Idempotent by design:
   * arming twice for the same turn simply restarts it, which is what a re-deal or
   * a reconnection wants anyway.
   */
  armTurn(room: Room, onExpire: (events: GameEvent[]) => void): void {
    this.cancelTurn(room)

    const seconds = room.turnSeconds
    if (seconds === null || !room.awaitingMove) {
      room.setTurnDeadline(null)
      return
    }

    const deadline = this.now() + seconds * 1000
    room.setTurnDeadline(deadline)
    const handle = this.timers.setTimeout(() => {
      this.turnTimers.delete(room.code)
      /* Deliberately does NOT re-arm itself. The caller re-times the room before
         it broadcasts, so exactly one place decides when a clock starts and the
         deadline in the views being sent already belongs to the next seat. */
      onExpire(room.forceTurnMove())
    }, seconds * 1000)
    this.turnTimers.set(room.code, handle)
  }

  cancelTurn(room: Room): void {
    const handle = this.turnTimers.get(room.code)
    if (handle !== undefined) {
      this.timers.clearTimeout(handle)
      this.turnTimers.delete(room.code)
    }
    room.setTurnDeadline(null)
  }

  /**
   * Deals the next round on its own after a short pause, so a fast match does not
   * stall on the host clicking a button. Only ever armed on a table with a clock;
   * everywhere else the host still decides when to move on.
   */
  armNextRound(room: Room, onExpire: (events: GameEvent[]) => void): void {
    this.cancelNextRound(room)
    if (room.turnSeconds === null || !room.betweenRounds) {
      room.setNextRoundDeadline(null)
      return
    }

    const ms = BETWEEN_ROUNDS_SECONDS * 1000
    room.setNextRoundDeadline(this.now() + ms)
    const handle = this.timers.setTimeout(() => {
      this.roundTimers.delete(room.code)
      room.setNextRoundDeadline(null)
      const dealt = room.dealNextRoundAutomatically(this.seedSource())
      onExpire(dealt)
    }, ms)
    this.roundTimers.set(room.code, handle)
  }

  cancelNextRound(room: Room): void {
    const handle = this.roundTimers.get(room.code)
    if (handle !== undefined) {
      this.timers.clearTimeout(handle)
      this.roundTimers.delete(room.code)
    }
    room.setNextRoundDeadline(null)
  }

  /** Drops rooms nobody is connected to. Returns how many went away. */
  purge(): number {
    let removed = 0
    for (const [code, room] of this.rooms) {
      if (!room.isEmpty()) continue
      for (let seat = 0; seat < room.memberCount; seat++) this.cancelGrace(room, seat)
      this.cancelTurn(room)
      this.cancelNextRound(room)
      this.rooms.delete(code)
      removed++
    }
    return removed
  }
}

const graceKey = (code: string, seat: number): string => `${code}#${seat}`
