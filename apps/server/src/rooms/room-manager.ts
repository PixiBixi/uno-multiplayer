import { randomInt } from 'node:crypto'
import { err, ok, type Result } from '@uno/engine'
import type { ErrorCode, GameEvent } from '@uno/protocol'
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
  private readonly maxRooms: number
  private readonly gracePeriodMs: number
  private readonly timers: Timers
  private readonly seedSource: () => number

  constructor(options: RoomManagerOptions) {
    this.maxRooms = options.maxRooms
    this.gracePeriodMs = options.gracePeriodMs
    this.timers = options.timers ?? defaultTimers
    this.seedSource = options.seedSource ?? (() => randomInt(2 ** 31 - 1))
  }

  get size(): number {
    return this.rooms.size
  }

  create(): Result<Room, ErrorCode> {
    if (this.rooms.size >= this.maxRooms) return err('server_full')

    // Retry on the astronomically unlikely collision rather than overwrite.
    let code = generateRoomCode()
    for (let attempt = 0; this.rooms.has(code) && attempt < 10; attempt++) {
      code = generateRoomCode()
    }
    if (this.rooms.has(code)) return err('server_full')

    const room = new Room(code, this.seedSource())
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

  /** Drops rooms nobody is connected to. Returns how many went away. */
  purge(): number {
    let removed = 0
    for (const [code, room] of this.rooms) {
      if (!room.isEmpty()) continue
      for (let seat = 0; seat < room.memberCount; seat++) this.cancelGrace(room, seat)
      this.rooms.delete(code)
      removed++
    }
    return removed
  }
}

const graceKey = (code: string, seat: number): string => `${code}#${seat}`
