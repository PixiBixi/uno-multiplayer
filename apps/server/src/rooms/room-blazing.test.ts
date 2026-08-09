import { DEFAULT_MATCH_GOAL, type GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { RoomManager, type Timers } from './room-manager.js'
import { Room } from './room.js'

/**
 * A clock the test drives by hand. Nothing here ever waits on real time, which is
 * the whole reason RoomManager takes its timers and its `now` as options.
 */
const fakeClock = () => {
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
    /** Advances time and fires whatever was due, in order. */
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

/**
 * Plays greedily until the round ends. A round can only finish with two or more
 * players still seated by somebody actually going out — dropping a seat from a
 * table of three leaves two active and the round rightly carries on — so ending
 * one for real is the only way to reach the pause that follows it.
 */
const playOutRound = (room: Room, push: (events: GameEvent[]) => void): void => {
  for (let turn = 0; turn < 800; turn += 1) {
    const seat = room.currentSeat
    if (seat === null || room.viewFor(seat)?.phase !== 'playing') return
    const moves = room.viewFor(seat)?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) return
    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)
    push(result.value)
  }
}

const blazingTable = (turnSeconds = 10) => {
  const clock = fakeClock()
  const rooms = new RoomManager({
    maxRooms: 10,
    gracePeriodMs: 60_000,
    timers: clock.timers,
    now: clock.now,
    seedSource: () => 42,
  })
  const created = rooms.create(DEFAULT_MATCH_GOAL, { turnSeconds })
  if (!created.okay) throw new Error(created.error)
  const room = created.value
  room.join('Ana', 'socket-0')
  room.join('Ben', 'socket-1')
  room.start(0)

  const events: GameEvent[] = []
  const push = (batch: GameEvent[]): void => {
    events.push(...batch)
    rooms.armTurn(room, push)
    rooms.armNextRound(room, push)
  }
  rooms.armTurn(room, push)

  return { clock, rooms, room, events, push }
}

describe('the turn clock', () => {
  it('puts a deadline in the view, so every player agrees on it', () => {
    const { room, clock } = blazingTable(10)
    const deadline = room.viewFor(0)?.turnDeadline
    expect(deadline).toBe(clock.now() + 10_000)
    // Both players are told the same instant, not each their own countdown.
    expect(room.viewFor(1)?.turnDeadline).toBe(deadline)
  })

  it('leaves the deadline null on a table with no clock', () => {
    const clock = fakeClock()
    const rooms = new RoomManager({
      maxRooms: 10,
      gracePeriodMs: 60_000,
      timers: clock.timers,
      now: clock.now,
      seedSource: () => 42,
    })
    const created = rooms.create(DEFAULT_MATCH_GOAL, null)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 's0')
    room.join('Ben', 's1')
    room.start(0)
    rooms.armTurn(room, () => undefined)

    expect(room.viewFor(0)?.turnDeadline).toBeNull()
    expect(clock.pendingCount()).toBe(0)
  })

  it('draws for whoever ran out, and moves the turn on', () => {
    const { room, clock, events } = blazingTable(10)
    const seat = room.currentSeat
    const before = room.viewFor(seat ?? 0)?.you.hand.length ?? 0

    clock.advance(10_000)

    expect(events.some((event) => event.type === 'turnTimedOut')).toBe(true)
    expect(room.viewFor(seat ?? 0)?.you.hand.length).toBe(before + 1)
    expect(room.currentSeat).not.toBe(seat)
  })

  it('draws even when the seat had a card it could have played', () => {
    /* Choosing a card for somebody is choosing their move. Drawing is the one
       action that is always legal and never spends a card they were saving. */
    const { room, clock } = blazingTable(10)
    const seat = room.currentSeat ?? 0
    expect(room.viewFor(seat)?.you.legalMoves.some((move) => move.type === 'play')).toBe(true)

    const before = room.viewFor(seat)?.you.hand.length ?? 0
    clock.advance(10_000)

    expect(room.viewFor(seat)?.you.hand.length).toBe(before + 1)
  })

  it('restarts the clock for the next seat rather than leaving it expired', () => {
    const { room, clock } = blazingTable(10)
    clock.advance(10_000)
    expect(room.viewFor(0)?.turnDeadline).toBe(clock.now() + 10_000)
  })

  it('keeps timing out, so a table of absentees still finishes', () => {
    const { room, clock, events } = blazingTable(10)
    for (let turn = 0; turn < 5; turn += 1) clock.advance(10_000)
    expect(events.filter((event) => event.type === 'turnTimedOut')).toHaveLength(5)
    expect(room.viewFor(0)?.phase).toBe('playing')
  })

  it('stops once the round is over', () => {
    const { room, rooms, clock } = blazingTable(10)
    room.disconnect('socket-1')
    room.expireGrace(1)
    rooms.armTurn(room, () => undefined)

    expect(room.viewFor(0)?.phase).toBe('finished')
    expect(room.viewFor(0)?.turnDeadline).toBeNull()
    // And nothing is left ticking against a room that is finished with.
    expect(clock.pendingCount()).toBe(0)
  })
})

describe('the pause between rounds', () => {
  /**
   * Three seats, because a round has to end while at least two players remain for
   * a next round to be dealt at all. With two, the only way to end a round quickly
   * also empties the table, and the test would pass without proving anything.
   */
  const threeSeatTable = (turnSeconds = 10) => {
    const clock = fakeClock()
    const rooms = new RoomManager({
      maxRooms: 10,
      gracePeriodMs: 60_000,
      timers: clock.timers,
      now: clock.now,
      seedSource: () => 42,
    })
    const created = rooms.create({ kind: 'rounds', count: 3 }, { turnSeconds })
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.join('Cleo', 'socket-2')
    room.start(0)

    const events: GameEvent[] = []
    const push = (batch: GameEvent[]): void => {
      events.push(...batch)
      rooms.armTurn(room, push)
      rooms.armNextRound(room, push)
    }
    return { clock, rooms, room, events, push }
  }

  it('deals the next round on its own, without the host', () => {
    const { room, clock, events, push } = threeSeatTable()
    playOutRound(room, push)
    expect(room.viewFor(0)?.phase).toBe('finished')

    expect(room.viewFor(0)?.nextRoundDeadline).toBe(clock.now() + 5000)

    clock.advance(5000)

    expect(room.viewFor(0)?.phase).toBe('playing')
    expect(room.viewFor(0)?.you.hand).toHaveLength(7)
    expect(events.some((event) => event.type === 'roundStarted')).toBe(true)
  })

  it('starts the turn clock again for the round it just dealt', () => {
    const { room, clock, push } = threeSeatTable()
    playOutRound(room, push)
    clock.advance(5000)
    expect(room.viewFor(0)?.turnDeadline).toBe(clock.now() + 10_000)
  })

  it('carries the standings across the pause', () => {
    const { room, clock, push } = threeSeatTable()
    playOutRound(room, push)
    const scores = room.viewFor(0)?.match.scores
    expect(scores?.some((score) => score > 0)).toBe(true)

    clock.advance(5000)

    expect(room.viewFor(0)?.match.scores).toEqual(scores)
    expect(room.viewFor(0)?.match.round).toBe(2)
  })

  it('has no deadline while a round is still being played', () => {
    const { room, rooms, push } = threeSeatTable()
    rooms.armNextRound(room, push)
    expect(room.viewFor(0)?.nextRoundDeadline).toBeNull()
  })

  it('is never armed on a table without a clock', () => {
    // The host still decides when to move on, which is what pace: null means.
    const clock = fakeClock()
    const rooms = new RoomManager({
      maxRooms: 10,
      gracePeriodMs: 60_000,
      timers: clock.timers,
      now: clock.now,
      seedSource: () => 42,
    })
    const created = rooms.create({ kind: 'rounds', count: 3 }, null)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.join('Cleo', 'socket-2')
    room.start(0)

    const push = (batch: GameEvent[]): void => {
      void batch
      rooms.armTurn(room, push)
      rooms.armNextRound(room, push)
    }
    playOutRound(room, push)

    expect(room.viewFor(0)?.phase).toBe('finished')
    expect(room.viewFor(0)?.nextRoundDeadline).toBeNull()
    expect(clock.pendingCount()).toBe(0)
  })

  it('does not deal again once the match itself is over', () => {
    const clock = fakeClock()
    const rooms = new RoomManager({
      maxRooms: 10,
      gracePeriodMs: 60_000,
      timers: clock.timers,
      now: clock.now,
      seedSource: () => 42,
    })
    // One round, so finishing it finishes the match.
    const created = rooms.create({ kind: 'rounds', count: 1 }, { turnSeconds: 10 })
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.join('Cleo', 'socket-2')
    room.start(0)

    const push = (batch: GameEvent[]): void => {
      void batch
      rooms.armTurn(room, push)
      rooms.armNextRound(room, push)
    }
    playOutRound(room, push)

    expect(room.matchOver).toBe(true)
    expect(room.viewFor(0)?.nextRoundDeadline).toBeNull()
  })
})

describe('Room.forceTurnMove', () => {
  const bare = (turnSeconds = 10) => {
    const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL, { turnSeconds })
    room.join('Ana', 's0')
    room.join('Ben', 's1')
    room.start(0)
    return room
  }

  it('reports nothing before a game has started', () => {
    const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL, { turnSeconds: 10 })
    expect(room.forceTurnMove()).toEqual([])
  })

  it('reports nothing once the round has finished', () => {
    const room = bare()
    room.disconnect('s1')
    room.expireGrace(1)
    expect(room.forceTurnMove()).toEqual([])
  })

  it('names the seat it played for', () => {
    const room = bare()
    const seat = room.currentSeat
    const events = room.forceTurnMove()
    expect(events[0]).toEqual({ type: 'turnTimedOut', seat })
  })
})
