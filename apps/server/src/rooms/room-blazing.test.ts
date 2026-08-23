import { DEFAULT_TABLE_RULES, type TableRules } from '@uno/engine'
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
 * players still seated by somebody actually going out - dropping a seat from a
 * table of three leaves two active and the round rightly carries on - so ending
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

/**
 * The three house rules off, and the drawn-card rule off too.
 *
 * Deliberately explicit rather than left to the defaults. The clock's own behaviour is "a
 * draw, and the turn moves on", and on a table that plays the drawn card a draw sometimes
 * does not move the turn at all - which is correct, and which would make every assertion
 * below conditional on the deal. The interaction has a describe block of its own further
 * down, on a table that says so.
 */
const NO_DRAWN_CARD: TableRules = {
  liar: false,
  sevenZero: false,
  jumpIn: false,
  playDrawnCard: false,
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
  const created = rooms.create(DEFAULT_MATCH_GOAL, { turnSeconds }, NO_DRAWN_CARD)
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

describe('the clock and the card you just drew', () => {
  /** The same table, with the official drawn-card rule left on rather than switched off. */
  const drawnCardTable = (turnSeconds = 10) => {
    const clock = fakeClock()
    const rooms = new RoomManager({
      maxRooms: 10,
      gracePeriodMs: 60_000,
      timers: clock.timers,
      now: clock.now,
      seedSource: () => 42,
    })
    const created = rooms.create(DEFAULT_MATCH_GOAL, { turnSeconds }, DEFAULT_TABLE_RULES)
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
    rooms.armTurn(room, push)
    return { clock, rooms, room, events, push }
  }

  /**
   * Draws over and over until one of the cards drawn turns out playable, which is the only
   * way to reach the sub-state: whether it happens is a property of the deal, so the drive
   * asks rather than assuming, and the caller asserts it really got there.
   *
   * A second of the fake clock is burnt on every turn, and that is load-bearing rather than
   * decoration. With time frozen, `now() + turnSeconds` recomputes to the very number it
   * replaced, so a clock that wrongly restarts for the draw is indistinguishable from one
   * that does not - the assertion below passed against the mutant until this line existed.
   */
  const drawUntilDeciding = (
    room: Room,
    push: (events: GameEvent[]) => void,
    clock: { advance: (ms: number) => void },
  ): { seat: number; deadlineBefore: number | null; held: number } | null => {
    for (let turn = 0; turn < 200; turn += 1) {
      const seat = room.currentSeat
      if (seat === null || room.viewFor(seat)?.phase !== 'playing') return null
      // Well inside the ten-second limit, so nothing times out mid-drive.
      clock.advance(1000)
      const view = room.viewFor(seat)
      const draw = view?.you.legalMoves.find((move) => move.type === 'draw')
      if (draw === undefined) {
        // A debt stands against this seat: accept it and carry on to the next.
        const accept = view?.you.legalMoves.find((move) => move.type === 'acceptDraw')
        if (accept === undefined) return null
        const forced = room.move(seat, accept)
        if (!forced.okay) throw new Error(forced.error)
        push(forced.value)
        continue
      }

      const deadlineBefore = view?.turnDeadline ?? null
      const held = view?.you.hand.length ?? 0
      const result = room.move(seat, draw)
      if (!result.okay) throw new Error(result.error)
      push(result.value)
      if (room.decidingOnDrawnCard) return { seat, deadlineBefore, held }
    }
    return null
  }

  it('does not restart the countdown because a card was drawn', () => {
    /* The failure this guards against is invisible in the rules and obvious on screen: a
       seat that draws with two seconds left must not be handed ten more. Every move
       re-times the room, so the clock has to be preserved deliberately. */
    const { room, push, clock } = drawnCardTable(10)
    const reached = drawUntilDeciding(room, push, clock)
    if (reached === null) throw new Error('never reached the drawn-card decision')

    expect(room.currentSeat).toBe(reached.seat)
    expect(room.viewFor(reached.seat)?.you.hand.length).toBe(reached.held + 1)
    // Still the deadline the turn began with, and still in the future.
    expect(room.viewFor(reached.seat)?.turnDeadline).toBe(reached.deadlineBefore)
    expect(room.viewFor(reached.seat)?.turnDeadline).toBeGreaterThan(clock.now())
    // And every seat is told the same instant, as they are for any other turn.
    expect(room.viewFor(0)?.turnDeadline).toBe(reached.deadlineBefore)
  })

  it('passes rather than drawing again when the clock expires on the decision', () => {
    /* They have already drawn. Forcing a second card would punish the clock twice, and
       `draw` is not even on offer in the sub-state - so without `pass` the clock would
       expire against the same seat for ever, which is what the absentee test above catches
       from the other side. */
    const { room, push, clock, events } = drawnCardTable(10)
    const reached = drawUntilDeciding(room, push, clock)
    if (reached === null) throw new Error('never reached the drawn-card decision')
    const held = room.viewFor(reached.seat)?.you.hand.length ?? 0
    const timeoutsBefore = events.filter((event) => event.type === 'turnTimedOut').length

    clock.advance(10_000)

    expect(events.filter((event) => event.type === 'turnTimedOut')).toHaveLength(timeoutsBefore + 1)
    // Not one card more: a pass takes nothing.
    expect(room.viewFor(reached.seat)?.you.hand.length).toBe(held)
    expect(room.currentSeat).not.toBe(reached.seat)
    expect(room.decidingOnDrawnCard).toBe(false)
    // And the clock is running for whoever holds the turn now.
    expect(room.viewFor(0)?.turnDeadline).toBe(clock.now() + 10_000)
  })

  it('keeps timing out through the decision, so a table of absentees still finishes', () => {
    /* Two clock periods per absent turn rather than one - the draw, then the pass - and
       that is the whole cost. What must not happen is a turn the clock can never end. */
    const { clock, events } = drawnCardTable(10)
    for (let turn = 0; turn < 12; turn += 1) clock.advance(10_000)
    expect(events.filter((event) => event.type === 'turnTimedOut')).toHaveLength(12)
  })

  it('arms a fresh clock when a forced draw lands on the decision', () => {
    /* The timer that just fired is gone from the map, so the sub-state must not stop the
       next one being armed - a preserved deadline already in the past would never fire
       again and the table would sit there. */
    const { room, clock } = drawnCardTable(10)
    for (let turn = 0; turn < 8; turn += 1) {
      clock.advance(10_000)
      const deadline = room.viewFor(0)?.turnDeadline
      if (room.viewFor(0)?.phase !== 'playing') break
      expect(deadline).toBeGreaterThan(clock.now())
    }
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
