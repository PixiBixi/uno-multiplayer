import { DEFAULT_MATCH_GOAL, type GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { RoomManager, type Timers } from './room-manager.js'

const clockOf = () => {
  let now = 1_000_000
  let nextHandle = 1
  const pending = new Map<number, { fireAt: number; fn: () => void }>()

  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const handle = nextHandle++
      pending.set(handle, { fireAt: now + ms, fn })
      return handle
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number)
    },
  }

  return {
    timers,
    now: () => now,
    advance: (ms: number) => {
      now += ms
      for (const [handle, timer] of [...pending].sort((a, b) => a[1].fireAt - b[1].fireAt)) {
        if (timer.fireAt > now) continue
        pending.delete(handle)
        timer.fn()
      }
    },
    pendingCount: () => pending.size,
  }
}

const managerOf = (clock: ReturnType<typeof clockOf>, gracePeriodMs = 60_000) =>
  new RoomManager({
    maxRooms: 10,
    gracePeriodMs,
    timers: clock.timers,
    now: clock.now,
    seedSource: () => 42,
  })

describe('a table that can no longer deal', () => {
  /**
   * The arming guard used to be looser than the dealing guard: a round could end
   * with one player left, the deal would fail, nothing about the room would
   * change, and the caller would arm it again. Every five seconds, for the life
   * of the process, pushing a view each time with a countdown that never
   * resolved.
   */
  it('stops arming the next round instead of retrying forever', () => {
    const clock = clockOf()
    const rooms = managerOf(clock)
    const created = rooms.create(DEFAULT_MATCH_GOAL, { turnSeconds: 5 })
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.start(0)

    let arms = 0
    const retime = (events: GameEvent[]): void => {
      void events
      arms += 1
      rooms.armTurn(room, retime)
      rooms.armNextRound(room, retime)
    }

    // Ben goes for good, leaving one active seat: the round ends with no winner
    // and, on a points goal, the match is not over.
    room.disconnect('socket-1')
    room.expireGrace(1)
    retime([])

    expect(room.betweenRounds).toBe(true)
    expect(room.activeMemberCount()).toBe(1)

    const armsBefore = arms
    for (let tick = 0; tick < 25; tick += 1) clock.advance(5000)

    expect(arms).toBe(armsBefore)
    expect(clock.pendingCount()).toBe(0)
    expect(room.viewFor(0)?.nextRoundDeadline).toBeNull()
  })

  it('stops arming the turn clock when no seat is left to time out', () => {
    const clock = clockOf()
    const rooms = managerOf(clock)
    const created = rooms.create(DEFAULT_MATCH_GOAL, { turnSeconds: 5 })
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.start(0)

    room.disconnect('socket-0')
    room.disconnect('socket-1')
    rooms.armTurn(room, () => undefined)

    expect(clock.pendingCount()).toBe(0)
    expect(room.viewFor(0)?.turnDeadline).toBeNull()
  })
})

describe('purge and the grace window', () => {
  /**
   * A room counted as empty the instant every socket id was null, which includes
   * players still inside their grace period. Purge runs on the same 60 s cadence
   * as the grace period, so it won whenever its tick landed first - and it
   * cancelled the very grace timers it was pre-empting. A player who reloaded at
   * the wrong moment lost the game.
   */
  it('keeps a room whose players may still be coming back', () => {
    const clock = clockOf()
    const rooms = managerOf(clock)
    const created = rooms.create(DEFAULT_MATCH_GOAL)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.start(0)

    room.disconnect('socket-0')
    room.disconnect('socket-1')
    expect(room.isEmpty()).toBe(true)

    expect(rooms.purge()).toBe(0)
    expect(rooms.get(room.code)).not.toBeNull()
  })

  it('reclaims it once nobody has come back for a whole grace period', () => {
    const clock = clockOf()
    const rooms = managerOf(clock)
    const created = rooms.create(DEFAULT_MATCH_GOAL)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.disconnect('socket-0')

    expect(rooms.purge()).toBe(0)
    clock.advance(60_001)

    expect(rooms.purge()).toBe(1)
    expect(rooms.get(room.code)).toBeNull()
  })

  it('forgets the empty stamp when somebody comes back', () => {
    const clock = clockOf()
    const rooms = managerOf(clock)
    const created = rooms.create(DEFAULT_MATCH_GOAL)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.disconnect('socket-0')
    rooms.purge()

    clock.advance(59_000)
    room.rejoin(room.memberAt(0)?.sessionToken ?? '', 'socket-0b')
    rooms.purge()

    // Their earlier absence must not count toward a later one.
    clock.advance(59_000)
    room.disconnect('socket-0b')
    expect(rooms.purge()).toBe(0)
  })

  it('reclaims a room nobody ever sat in without waiting', () => {
    const clock = clockOf()
    const rooms = managerOf(clock)
    const created = rooms.create(DEFAULT_MATCH_GOAL)
    if (!created.okay) throw new Error(created.error)

    /* No members means nobody holds a session token for it, so the wait would
       protect nobody. Safe despite room:create joining the creator a moment
       later: both happen inside one handler, and purge cannot run between them. */
    expect(rooms.purge()).toBe(1)
  })

  it('reclaims a room everybody left without waiting either', () => {
    const clock = clockOf()
    const rooms = managerOf(clock)
    const created = rooms.create(DEFAULT_MATCH_GOAL)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.disconnect('socket-0')
    room.expireGrace(0)

    // rejoin refuses a seat that has left, so holding the room protects nobody.
    expect(room.abandoned).toBe(true)
    expect(rooms.purge()).toBe(1)
  })
})
