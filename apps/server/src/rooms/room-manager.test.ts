import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { RoomManager, type Timers } from './room-manager.js'

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

const managerWith = (overrides: { maxRooms?: number } = {}) => {
  const clock = manualTimers()
  const manager = new RoomManager({
    maxRooms: overrides.maxRooms ?? 10,
    gracePeriodMs: 60_000,
    timers: clock.timers,
    seedSource: () => 42,
  })
  return { manager, clock }
}

const createdRoom = (manager: RoomManager) => {
  const created = manager.create(DEFAULT_MATCH_GOAL)
  if (!created.okay) throw new Error(created.error)
  return created.value
}

describe('RoomManager.create', () => {
  it('creates a room reachable by its code', () => {
    const { manager } = managerWith()
    const room = createdRoom(manager)
    expect(manager.get(room.code)).toBe(room)
    expect(manager.size).toBe(1)
  })

  it('is case-insensitive on lookup', () => {
    const { manager } = managerWith()
    const room = createdRoom(manager)
    expect(manager.get(room.code.toLowerCase())).toBe(room)
  })

  it('returns null for an unknown code', () => {
    expect(managerWith().manager.get('ZZZZZZ')).toBeNull()
  })

  it('refuses to exceed the room cap, bounding memory', () => {
    const { manager } = managerWith({ maxRooms: 2 })
    expect(manager.create(DEFAULT_MATCH_GOAL).okay).toBe(true)
    expect(manager.create(DEFAULT_MATCH_GOAL).okay).toBe(true)
    expect(manager.create(DEFAULT_MATCH_GOAL)).toEqual({ okay: false, error: 'server_full' })
  })
})

describe('RoomManager.purge', () => {
  it('removes rooms nobody is connected to', () => {
    const { manager } = managerWith()
    createdRoom(manager)
    expect(manager.purge()).toBe(1)
    expect(manager.size).toBe(0)
  })

  it('keeps a room that still has a connected member', () => {
    const { manager } = managerWith()
    createdRoom(manager).join('Ana', 'socket-0')
    expect(manager.purge()).toBe(0)
    expect(manager.size).toBe(1)
  })
})

describe('RoomManager grace periods', () => {
  it('fires the expiry callback with the events from the room', () => {
    const { manager, clock } = managerWith()
    const room = createdRoom(manager)
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.disconnect('socket-1')

    let received: unknown = null
    manager.scheduleGrace(room, 1, (events) => (received = events))
    expect(clock.pendingCount()).toBe(1)
    clock.fireAll()
    expect(received).toContainEqual({ type: 'seatLeft', seat: 1 })
  })

  it('cancels a pending expiry when the player reconnects', () => {
    const { manager, clock } = managerWith()
    const room = createdRoom(manager)
    room.join('Ana', 'socket-0')
    room.disconnect('socket-0')

    let fired = false
    manager.scheduleGrace(room, 0, () => (fired = true))
    manager.cancelGrace(room, 0)
    clock.fireAll()
    expect(fired).toBe(false)
  })

  it('replaces an existing timer rather than stacking two', () => {
    const { manager, clock } = managerWith()
    const room = createdRoom(manager)
    room.join('Ana', 'socket-0')
    room.disconnect('socket-0')

    manager.scheduleGrace(room, 0, () => undefined)
    manager.scheduleGrace(room, 0, () => undefined)
    expect(clock.pendingCount()).toBe(1)
  })

  it('fires immediately when the grace period is zero', async () => {
    const manager = new RoomManager({ maxRooms: 10, gracePeriodMs: 0, seedSource: () => 42 })
    const room = createdRoom(manager)
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.disconnect('socket-1')

    const events = await new Promise<unknown>((resolve) => {
      manager.scheduleGrace(room, 1, resolve)
    })
    expect(events).toContainEqual({ type: 'seatLeft', seat: 1 })
  })
})
