import { DEFAULT_MATCH_GOAL, type GameEvent } from '@uno/protocol'
import { UNO_PENALTY } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { RoomManager, type Timers } from './room-manager.js'
import type { Room } from './room.js'

/** Collects scheduled callbacks so a test can fire them on demand. */
const manualTimers = () => {
  const pending = new Map<number, () => void>()
  let nextHandle = 1
  const timers: Timers = {
    setTimeout(fn) {
      const handle = nextHandle++
      pending.set(handle, fn)
      return handle
    },
    clearTimeout(handle) {
      pending.delete(handle as number)
    },
  }
  return {
    timers,
    fireAll: () => {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback()
    },
    pendingCount: () => pending.size,
  }
}

/** A table dealt and played down to one uncalled card, so a window is open. */
const exposedTable = (rules: { liar: boolean }) => {
  const clock = manualTimers()
  const manager = new RoomManager({
    maxRooms: 10,
    gracePeriodMs: 60_000,
    timers: clock.timers,
    seedSource: () => 42,
  })
  const created = manager.create(DEFAULT_MATCH_GOAL)
  if (!created.okay) throw new Error(created.error)
  const room: Room = created.value
  room.join('Ana', 'a')
  room.join('Ben', 'b')
  room.configure(0, { rules: { ...rules, sevenZero: false, jumpIn: false, playDrawnCard: false } })
  const started = room.start(0)
  if (!started.okay) throw new Error(started.error)

  // Play down to one card without ever calling UNO.
  for (let turn = 0; turn < 400; turn += 1) {
    const view = room.viewFor(0)
    if (view === null || view.phase === 'finished') break
    const seat = view.currentSeat
    const state = room.viewFor(seat)
    if (state === null) break
    const exposed = [0, 1].find((s) => room.exposedSeat() === s)
    if (exposed !== undefined) break
    const moves = state.you.legalMoves.filter((m) => m.type !== 'callUno' && m.type !== 'callOut')
    const move = moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) break
    if (!room.move(seat, move).okay) break
  }
  return { manager, room, clock }
}

describe('the three-second window on a plain table', () => {
  it('charges the forgotten UNO when the clock runs out', () => {
    const { manager, room, clock } = exposedTable({ liar: false })
    const seat = room.exposedSeat()
    expect(seat, 'a seat is exposed').not.toBeNull()
    if (seat === null) return

    const before = room.viewFor(seat)?.you.hand.length ?? 0
    const events: GameEvent[] = []
    manager.armUnoGrace(room, (e) => events.push(...e))
    clock.fireAll()

    expect(room.viewFor(seat)?.you.hand).toHaveLength(before + UNO_PENALTY)
    expect(events).toContainEqual({ type: 'unoPenalty', seat, count: UNO_PENALTY })
  })

  it('charges nothing when the call arrives in time', () => {
    const { manager, room, clock } = exposedTable({ liar: false })
    const seat = room.exposedSeat()
    if (seat === null) return

    const before = room.viewFor(seat)?.you.hand.length ?? 0
    manager.armUnoGrace(room, () => undefined)
    expect(room.move(seat, { type: 'callUno' }).okay).toBe(true)
    clock.fireAll()

    expect(room.viewFor(seat)?.you.hand).toHaveLength(before)
  })

  /* The two tables differ in who shuts the window, and only one of them is a clock. */
  it('arms nothing on a table that opted into call-outs', () => {
    const { manager, room, clock } = exposedTable({ liar: true })
    expect(room.exposedSeat()).not.toBeNull()
    const armed = clock.pendingCount()
    manager.armUnoGrace(room, () => undefined)
    expect(clock.pendingCount()).toBe(armed)
  })
})
