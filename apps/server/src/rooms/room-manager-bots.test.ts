import { DEFAULT_TABLE_RULES, type Move, type TableRules } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type GameEvent, type MatchPace } from '@uno/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../logger.js'
import { RoomManager, type Timers } from './room-manager.js'
import type { Room } from './room.js'

/** A hand-driven clock that remembers the delay each timer was armed with. */
const fakeClock = () => {
  let now = 1_000_000
  let nextHandle = 1
  const pending = new Map<number, { fireAt: number; ms: number; fn: () => void }>()
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const handle = nextHandle++
      pending.set(handle, { fireAt: now + ms, ms, fn })
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
        if (timer.fireAt > now || !pending.has(handle)) continue
        pending.delete(handle)
        timer.fn()
      }
    },
    delays: () => [...pending.values()].map((t) => t.ms),
    handles: () => [...pending.keys()],
    pendingCount: () => pending.size,
  }
}

type Clock = ReturnType<typeof fakeClock>

const tableOf = (opts: {
  humans: string[]
  bots?: ('easy' | 'normal' | 'hard')[]
  pace?: MatchPace
  rules?: TableRules
}) => {
  const clock = fakeClock()
  const rooms = new RoomManager({
    maxRooms: 10,
    gracePeriodMs: 60_000,
    timers: clock.timers,
    now: clock.now,
    seedSource: () => 42,
    delaySeed: 7,
  })
  const created = rooms.create(DEFAULT_MATCH_GOAL, opts.pace ?? null, opts.rules)
  if (!created.okay) throw new Error(created.error)
  const room = created.value
  const tokens = opts.humans.map((name, i) => {
    const joined = room.join(name, `socket-${i}`)
    if (!joined.okay) throw new Error(joined.error)
    return joined.value.sessionToken
  })
  for (const level of opts.bots ?? []) room.addBot(0, level)
  const begun = room.start(0)
  if (!begun.okay) throw new Error(begun.error)
  return { clock, rooms, room, tokens }
}

/** The whole retime of handlers.ts, recording the delay of every bot timer it arms. */
const wire = (rooms: RoomManager, room: Room, clock: Clock) => {
  const events: GameEvent[] = []
  const botDelays: number[] = []
  const retime = (cause: 'move' | 'presence' = 'move'): void => {
    if (cause === 'presence') {
      rooms.keepTurn(room, afterExpiry)
      rooms.keepNextRound(room, afterExpiry)
      rooms.keepUnoGrace(room, afterExpiry)
      rooms.keepBot(room, afterExpiry)
      rooms.armReactions(room, afterExpiry)
      return
    }
    rooms.armTurn(room, afterExpiry)
    rooms.armNextRound(room, afterExpiry)
    rooms.armUnoGrace(room, afterExpiry)
    const before = new Set(clock.handles())
    rooms.keepBot(room, afterExpiry)
    const fresh = clock.handles().filter((h) => !before.has(h))
    const all = clock.delays()
    const handles = clock.handles()
    for (const h of fresh) botDelays.push(all[handles.indexOf(h)] ?? -1)
    rooms.armReactions(room, afterExpiry)
  }
  const afterExpiry = (batch: GameEvent[]): void => {
    events.push(...batch)
    retime()
  }
  return { events, botDelays, retime }
}

/** A neutral move for a human on turn. */
const humanMove = (room: Room, seat: number): Move => {
  const moves = room.viewFor(seat)?.you.legalMoves ?? []
  const move =
    moves.find((m) => m.type === 'pass') ??
    moves.find((m) => m.type === 'acceptDraw') ??
    moves.find((m) => m.type === 'draw') ??
    moves[0]
  if (move === undefined) throw new Error(`seat ${seat} has no move`)
  return move
}

const play = (room: Room, seat: number, move: Move, push: (e: GameEvent[]) => void) => {
  const moved = room.move(seat, move)
  if (!moved.okay) throw new Error(moved.error)
  push(moved.value)
}

/** Human seats move at once until `seat` is on turn and a bot (or nobody automatic) holds it. */
const humansUntil = (room: Room, seat: number, push: (e: GameEvent[]) => void) => {
  for (let i = 0; i < 200 && room.currentSeat !== seat; i++) {
    const on = room.currentSeat ?? 0
    if (room.turnController() !== null) throw new Error(`seat ${on} is not a human's to play`)
    play(room, on, humanMove(room, on), push)
  }
  if (room.currentSeat !== seat) throw new Error(`seat ${seat} never came on turn`)
}

/** A Room double for the paths no public Room sequence reaches cleanly. */
const stubRoom = (overrides: Partial<Record<keyof Room, unknown>>): Room =>
  ({
    code: 'STUB01',
    currentSeat: 1,
    turnSeconds: null,
    connectedHumanCount: () => 1,
    turnController: () => 'bot',
    levelFor: () => 'normal',
    pendingReactions: () => [],
    exposedSeat: () => 0,
    viewFor: () => null,
    ...overrides,
  }) as unknown as Room

const managerOf = (clock: Clock) =>
  new RoomManager({
    maxRooms: 10,
    gracePeriodMs: 60_000,
    timers: clock.timers,
    now: clock.now,
    delaySeed: 7,
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bot turn timing', () => {
  it("a bot's turn fires within 800-3000 ms", () => {
    const { clock, rooms, room } = tableOf({ humans: ['Ana'], bots: ['normal'] })
    const { events, botDelays, retime } = wire(rooms, room, clock)
    humansUntil(room, 1, (e) => events.push(...e))
    retime()

    expect(botDelays).toHaveLength(1)
    const ms = botDelays[0] ?? 0
    expect(ms).toBeGreaterThanOrEqual(800)
    expect(ms).toBeLessThanOrEqual(3000)
    clock.advance(ms - 1)
    expect(events.some((e) => 'seat' in e && e.seat === 1)).toBe(false)
    clock.advance(1)
    expect(
      events.some((e) => (e.type === 'cardPlayed' || e.type === 'cardsDrawn') && e.seat === 1),
    ).toBe(true)
  })

  it('blazing caps the bot delay below the clock', () => {
    const { clock, rooms, room } = tableOf({
      humans: ['Ana'],
      bots: ['easy'],
      pace: { turnSeconds: 3 },
    })
    const { events, botDelays, retime } = wire(rooms, room, clock)
    retime()
    // Ana answers at once; the bot plays on its own timers, many turns over.
    for (let tick = 0; tick < 400 && room.phase === 'playing'; tick++) {
      if (room.currentSeat === 0 && room.turnController() === null) {
        play(room, 0, humanMove(room, 0), (e) => events.push(...e))
        retime()
        continue
      }
      clock.advance(100)
    }

    expect(botDelays.length).toBeGreaterThan(10)
    expect(Math.max(...botDelays)).toBeLessThanOrEqual(2000)
    expect(events.filter((e) => e.type === 'turnTimedOut')).toEqual([])
  })
})

describe('the absent grace', () => {
  it('the absent grace is 15 s, then bot timing', () => {
    const { clock, rooms, room } = tableOf({ humans: ['Ana', 'Ben'] })
    const { events, botDelays, retime } = wire(rooms, room, clock)
    room.disconnect('socket-1')
    humansUntil(room, 1, (e) => events.push(...e))
    retime()
    expect(botDelays).toEqual([15_000])

    clock.advance(14_999)
    expect(events).not.toContainEqual({ type: 'botTookOver', seat: 1 })
    clock.advance(1)
    expect(events).toContainEqual({ type: 'botTookOver', seat: 1 })

    // Ana plays her turns; the next timer armed for seat 1 is ordinary bot timing.
    const armedBefore = botDelays.length
    for (let i = 0; i < 50 && botDelays.length === armedBefore; i++) {
      if (room.currentSeat === 0) {
        play(room, 0, humanMove(room, 0), (e) => events.push(...e))
        retime()
      } else clock.advance(3000)
    }
    const next = botDelays[armedBefore] ?? 0
    expect(next).toBeGreaterThanOrEqual(800)
    expect(next).toBeLessThanOrEqual(3000)
  })

  it('the absent grace shrinks under blazing', () => {
    const { clock, rooms, room } = tableOf({ humans: ['Ana', 'Ben'], pace: { turnSeconds: 10 } })
    const { events, botDelays, retime } = wire(rooms, room, clock)
    room.disconnect('socket-1')
    humansUntil(room, 1, (e) => events.push(...e))
    retime()
    expect(botDelays).toEqual([9000])
  })

  it('the bot delay factor scales the grace and bot timing', () => {
    const clock = fakeClock()
    const rooms = new RoomManager({
      maxRooms: 10,
      gracePeriodMs: 60_000,
      timers: clock.timers,
      now: clock.now,
      seedSource: () => 42,
      delaySeed: 7,
      botDelayFactor: 0.01,
    })
    const created = rooms.create(DEFAULT_MATCH_GOAL)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.start(0)
    room.disconnect('socket-1')
    const { events, botDelays, retime } = wire(rooms, room, clock)
    humansUntil(room, 1, (e) => events.push(...e))
    retime()
    expect(botDelays).toEqual([150])
  })
})

describe('presence', () => {
  it('nothing is armed once no human is connected', () => {
    const { clock, rooms, room } = tableOf({
      humans: ['Ana', 'Ben'],
      bots: ['hard'],
      rules: { ...DEFAULT_TABLE_RULES, liar: true },
    })
    const { events } = wire(rooms, room, clock)
    humansUntil(room, 2, (e) => events.push(...e))
    const onEvents = (batch: GameEvent[]) => events.push(...batch)
    rooms.armBot(room, onEvents)
    rooms.armReactions(room, onEvents)
    expect(clock.pendingCount()).toBe(1)

    room.disconnect('socket-0')
    room.disconnect('socket-1')
    rooms.keepBot(room, onEvents)
    rooms.armReactions(room, onEvents)
    expect(clock.pendingCount()).toBe(0)

    rooms.armBot(room, onEvents)
    rooms.armReactions(room, onEvents)
    rooms.armTurn(room, onEvents)
    rooms.armNextRound(room, onEvents)
    expect(clock.pendingCount()).toBe(0)
  })

  it("a reconnect cancels the stand-in's pending move", () => {
    const { clock, rooms, room, tokens } = tableOf({ humans: ['Ana', 'Ben'] })
    const { events } = wire(rooms, room, clock)
    room.disconnect('socket-1')
    humansUntil(room, 1, (e) => events.push(...e))
    const onEvents = (batch: GameEvent[]) => events.push(...batch)
    rooms.armBot(room, onEvents)
    const [armed] = clock.handles()
    expect(armed).toBeDefined()

    expect(room.rejoin(tokens[1] ?? '', 'socket-1b').okay).toBe(true)
    rooms.keepBot(room, onEvents)
    expect(clock.handles()).not.toContain(armed)
    expect(room.turnController()).toBeNull()
  })

  it('keeps the pending move across a presence change that leaves the seat a bot', () => {
    const { clock, rooms, room } = tableOf({ humans: ['Ana', 'Ben'], bots: ['normal'] })
    const { events } = wire(rooms, room, clock)
    humansUntil(room, 2, (e) => events.push(...e))
    const onEvents = (batch: GameEvent[]) => events.push(...batch)
    rooms.armBot(room, onEvents)
    const [armed] = clock.handles()

    room.disconnect('socket-1')
    rooms.keepBot(room, onEvents)
    expect(clock.handles()).toEqual([armed])
  })
})

describe('bot reactions', () => {
  /** Ana plays without ever calling UNO, the bot plays on its own, until Ana is exposed. */
  const exposeAna = (room: Room) => {
    for (let i = 0; i < 5000 && room.exposedSeat() !== 0; i++) {
      if (room.betweenRounds) {
        room.nextRound(room.hostSeat, 1000 + i)
        continue
      }
      if (room.turnController() !== null) {
        room.botStep()
        continue
      }
      const moves = room.viewFor(0)?.you.legalMoves ?? []
      const move = moves.find((m) => m.type === 'play') ?? humanMove(room, 0)
      play(room, 0, move, () => undefined)
    }
    if (room.exposedSeat() !== 0) throw new Error('Ana was never exposed')
  }

  it('a call-out reaction is scheduled at 2000-10000 ms and dropped if the window closes first', () => {
    const { clock, rooms, room } = tableOf({
      humans: ['Ana'],
      bots: ['normal'],
      rules: { ...DEFAULT_TABLE_RULES, liar: true },
    })
    exposeAna(room)
    expect(room.pendingReactions()).toEqual([{ seat: 1, kind: 'callOut' }])

    const events: GameEvent[] = []
    const onEvents = (batch: GameEvent[]) => events.push(...batch)
    rooms.armReactions(room, onEvents)
    const [delay] = clock.delays()
    const [handle] = clock.handles()
    expect(delay).toBeGreaterThanOrEqual(2000)
    expect(delay).toBeLessThanOrEqual(10_000)

    // A retime while still open keeps the delay sampled when the window opened.
    rooms.armReactions(room, onEvents)
    expect(clock.handles()).toEqual([handle])

    play(room, 0, { type: 'callUno' }, onEvents)
    rooms.armReactions(room, onEvents)
    expect(clock.pendingCount()).toBe(0)
    clock.advance(10_000)
    expect(events.some((e) => e.type === 'calledOut')).toBe(false)
  })

  it('a call-out still open when its timer fires is played', () => {
    const { clock, rooms, room } = tableOf({
      humans: ['Ana'],
      bots: ['normal'],
      rules: { ...DEFAULT_TABLE_RULES, liar: true },
    })
    exposeAna(room)
    const events: GameEvent[] = []
    rooms.armReactions(room, (batch) => events.push(...batch))
    clock.advance(10_000)
    expect(events).toContainEqual({ type: 'calledOut', by: 1, target: 0 })
  })
})

describe('a timer never throws', () => {
  it('a bot step that throws is logged and the turn is forced instead', () => {
    const errors = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const forced: GameEvent[] = [{ type: 'turnTimedOut', seat: 1 }]
    const room = stubRoom({
      botStep: () => {
        throw new Error('illegal bot move')
      },
      forceTurnMove: () => forced,
    })
    const clock = fakeClock()
    const received: GameEvent[][] = []
    managerOf(clock).armBot(room, (events) => received.push(events))

    expect(() => clock.advance(3000)).not.toThrow()
    expect(received).toEqual([forced])
    expect(errors).toHaveBeenCalledOnce()
  })

  it('a reaction that throws is logged and dropped', () => {
    const errors = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const room = stubRoom({
      pendingReactions: () => [{ seat: 1, kind: 'callOut' }],
      botReact: () => {
        throw new Error('illegal bot move')
      },
    })
    const clock = fakeClock()
    const received: GameEvent[][] = []
    const manager = managerOf(clock)
    manager.armReactions(room, (events) => received.push(events))

    expect(() => clock.advance(10_000)).not.toThrow()
    expect(received).toEqual([])
    expect(errors).toHaveBeenCalledOnce()
    // Spent: a retime while the window is still open does not try it again.
    manager.armReactions(room, (events) => received.push(events))
    expect(clock.pendingCount()).toBe(0)
  })

  it('purge cancels the bot timers with the room', () => {
    const { clock, rooms, room } = tableOf({ humans: ['Ana'], bots: ['normal'] })
    const { events } = wire(rooms, room, clock)
    humansUntil(room, 1, (e) => events.push(...e))
    rooms.armBot(room, () => undefined)
    expect(clock.pendingCount()).toBe(1)
    room.leave('socket-0')
    expect(rooms.purge()).toBe(1)
    expect(clock.pendingCount()).toBe(0)
  })
})

describe('turn clock and bot timers across retimes', () => {
  it('a declined reaction leaves the turn clock alone', () => {
    const { clock, rooms, room } = tableOf({
      humans: ['Ana', 'Ben'],
      bots: ['normal'],
      pace: { turnSeconds: 60 },
      rules: { ...DEFAULT_TABLE_RULES, liar: true },
    })
    vi.spyOn(room, 'pendingReactions').mockReturnValue([{ seat: 2, kind: 'callOut' }])
    const declined = vi.spyOn(room, 'botReact').mockReturnValue([])
    const { events, retime } = wire(rooms, room, clock)
    retime()
    expect(room.turnController()).toBeNull()
    const [turnClock, reaction] = clock.handles()
    expect(reaction).toBeDefined()
    const deadline = room.viewFor(0)?.turnDeadline

    clock.advance(10_000)
    expect(declined).toHaveBeenCalledOnce()
    expect(events).toEqual([])
    expect(clock.handles()).toEqual([turnClock])
    expect(room.viewFor(0)?.turnDeadline).toBe(deadline)
  })

  it('a move that leaves the same bot on turn keeps its timer and delay', () => {
    const { clock, rooms, room } = tableOf({ humans: ['Ana'], bots: ['normal'] })
    const { retime, botDelays } = wire(rooms, room, clock)
    for (let i = 0; i < 50 && room.turnController() === null; i++) {
      play(room, 0, humanMove(room, 0), () => undefined)
    }
    expect(room.turnController()).toBe('bot')
    retime()
    const armed = clock.handles()
    expect(armed).toHaveLength(1)
    expect(botDelays).toHaveLength(1)

    // A call-out or late UNO call retimes as a move without changing whose turn it is.
    retime()
    expect(clock.handles()).toEqual(armed)
    expect(botDelays).toHaveLength(1)
  })

  it('Blazing deals the next round with one human and a stand-in', () => {
    const { clock, rooms, room } = tableOf({ humans: ['Ana', 'Ben'], pace: { turnSeconds: 5 } })
    room.leave('socket-1')
    for (let i = 0; i < 2000 && room.phase === 'playing'; i++) {
      if (room.turnController() !== null) {
        room.botStep()
        continue
      }
      const moves = room.viewFor(0)?.you.legalMoves ?? []
      const move =
        moves.find((m) => m.type === 'callUno') ??
        moves.find((m) => m.type === 'play') ??
        humanMove(room, 0)
      play(room, 0, move, () => undefined)
    }
    expect(room.betweenRounds).toBe(true)
    expect(room.activeMemberCount()).toBe(1)

    rooms.armNextRound(room, () => undefined)
    expect(room.viewFor(0)?.nextRoundDeadline).not.toBeNull()
    expect(clock.pendingCount()).toBe(1)
  })

  it('a failed first stand-in move still reports botTookOver', () => {
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const { clock, rooms, room } = tableOf({ humans: ['Ana', 'Ben'] })
    room.disconnect('socket-1')
    humansUntil(room, 1, () => undefined)
    // Fails the way the real one would: after the takeover, while choosing the move.
    vi.spyOn(room, 'botStep').mockImplementation(() => {
      const member = room.memberAt(1)
      if (member !== null) member.standIn = true
      throw new Error('illegal bot move')
    })
    const received: GameEvent[][] = []
    rooms.armBot(room, (events) => received.push(events))
    clock.advance(15_000)

    expect(received).toHaveLength(1)
    expect(received[0]?.slice(0, 2)).toEqual([
      { type: 'botTookOver', seat: 1 },
      { type: 'turnTimedOut', seat: 1 },
    ])
  })

  it("a Hard bot's jump-in arms within 1000-3000 ms and a Normal stand-in arms none", () => {
    const { clock, rooms, room } = tableOf({
      humans: ['Ana', 'Ben'],
      bots: ['hard'],
      rules: { ...DEFAULT_TABLE_RULES, jumpIn: true },
    })
    room.leave('socket-1')
    const hardDelays: number[] = []
    let standInChecked = false
    for (let i = 0; i < 5000 && (hardDelays.length === 0 || !standInChecked); i++) {
      const pending = room.pendingReactions()
      if (pending.length === 1 && pending[0]?.seat === 2 && pending[0].kind === 'jumpIn') {
        rooms.cancelBots(room)
        rooms.armReactions(room, () => undefined)
        hardDelays.push(...clock.delays())
      }
      const offeredToStandIn =
        room.currentSeat !== 1 &&
        (room.viewFor(1)?.you.legalMoves ?? []).some((m) => m.type === 'play')
      if (offeredToStandIn && !pending.some((r) => r.seat === 2)) {
        rooms.cancelBots(room)
        rooms.armReactions(room, () => undefined)
        expect(clock.pendingCount()).toBe(0)
        standInChecked = true
      }
      if (room.betweenRounds) {
        room.nextRound(room.hostSeat, 1000 + i)
        continue
      }
      if (room.phase !== 'playing') break
      if (room.turnController() !== null) room.botStep()
      else play(room, 0, humanMove(room, 0), () => undefined)
    }
    rooms.cancelBots(room)

    expect(standInChecked).toBe(true)
    expect(hardDelays.length).toBeGreaterThan(0)
    for (const ms of hardDelays) {
      expect(ms).toBeGreaterThanOrEqual(1000)
      expect(ms).toBeLessThanOrEqual(3000)
    }
  })
})

describe('the bot timer guards', () => {
  it('arms no next round while a deal would fail, even with a human connected', () => {
    const clock = fakeClock()
    const manager = managerOf(clock)
    const setNextRoundDeadline = vi.fn()
    const room = stubRoom({
      turnSeconds: 5,
      betweenRounds: true,
      seatedCount: () => 1,
      setNextRoundDeadline,
    })
    manager.armNextRound(room, () => undefined)
    manager.keepNextRound(room, () => undefined)
    expect(clock.pendingCount()).toBe(0)
    expect(setNextRoundDeadline).not.toHaveBeenCalledWith(expect.any(Number))
  })

  it('arms no UNO grace with no human connected, and drops a running one', () => {
    const clock = fakeClock()
    const manager = managerOf(clock)
    let humans = 1
    const room = stubRoom({
      callOutsAllowed: false,
      connectedHumanCount: () => humans,
      chargeForgottenUno: () => [],
    })
    manager.armUnoGrace(room, () => undefined)
    expect(clock.pendingCount()).toBe(1)

    humans = 0
    manager.keepUnoGrace(room, () => undefined)
    expect(clock.pendingCount()).toBe(0)
    manager.armUnoGrace(room, () => undefined)
    expect(clock.pendingCount()).toBe(0)
  })

  it('a declined call-out on one seat does not suppress one on the next exposed seat', () => {
    const clock = fakeClock()
    const manager = managerOf(clock)
    let exposed = 0
    const declined = vi.fn((): GameEvent[] => [])
    const room = stubRoom({
      pendingReactions: () => [{ seat: 2, kind: 'callOut' }],
      exposedSeat: () => exposed,
      botReact: declined,
    })
    manager.armReactions(room, () => undefined)
    clock.advance(10_000)
    expect(declined).toHaveBeenCalledOnce()

    // Same target still exposed: the spent window is not offered again.
    manager.armReactions(room, () => undefined)
    expect(clock.pendingCount()).toBe(0)

    exposed = 1
    manager.armReactions(room, () => undefined)
    expect(clock.pendingCount()).toBe(1)
  })

  it('a bot step that changes nothing emits nothing and leaves the turn clock alone', () => {
    const clock = fakeClock()
    const manager = managerOf(clock)
    const setTurnDeadline = vi.fn()
    const room = stubRoom({
      turnSeconds: 30,
      awaitingMove: true,
      decidingOnDrawnCard: false,
      setTurnDeadline,
      forceTurnMove: () => [],
      botStep: () => [],
    })
    const received: GameEvent[][] = []
    const retime = (events: GameEvent[]): void => {
      received.push(events)
      manager.armTurn(room, retime)
      manager.armBot(room, retime)
    }
    manager.armTurn(room, retime)
    const [turnClock] = clock.handles()
    manager.armBot(room, retime)
    expect(clock.pendingCount()).toBe(2)
    const deadlineWrites = setTurnDeadline.mock.calls.length

    clock.advance(3000)
    expect(received).toEqual([])
    expect(clock.handles()).toEqual([turnClock])
    expect(setTurnDeadline).toHaveBeenCalledTimes(deadlineWrites)
  })
})
