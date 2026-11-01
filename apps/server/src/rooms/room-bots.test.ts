import { DEFAULT_TABLE_RULES, type Move, type TableRules } from '@uno/engine'
import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { BOT_NAMES, Room } from './room.js'

const humans = (...names: string[]) => {
  const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL)
  for (const [i, name] of names.entries()) {
    const joined = room.join(name, `socket-${i}`)
    if (!joined.okay) throw new Error(joined.error)
  }
  return room
}

describe('bots in the lobby', () => {
  it('host adds a bot and a solo table can start', () => {
    const room = humans('Ana')
    expect(room.lobbyView().canStart).toBe(false)
    expect(room.addBot(0, 'normal').okay).toBe(true)
    expect(room.lobbyView().canStart).toBe(true)
    expect(room.lobbyView().seats[1]).toEqual({
      seat: 1,
      name: 'Ada',
      status: 'active',
      bot: 'normal',
    })
    expect(room.start(0).okay).toBe(true)
  })

  it('names bots from the fixed list, first unused', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'hard')
    expect(room.lobbyView().seats.map((s) => s.name)).toEqual(['Ana', 'Ada', 'Bip'])
  })

  it('only the host manages bots', () => {
    const room = humans('Ana', 'Ben')
    room.addBot(0, 'easy')
    expect(room.addBot(1, 'easy')).toEqual({ okay: false, error: 'not_host' })
    expect(room.setBotLevel(1, 2, 'hard')).toEqual({ okay: false, error: 'not_host' })
    expect(room.removeBot(1, 2)).toEqual({ okay: false, error: 'not_host' })
  })

  it('refuses a level change or removal aimed at a human', () => {
    const room = humans('Ana', 'Ben')
    expect(room.setBotLevel(0, 1, 'hard')).toEqual({ okay: false, error: 'invalid_payload' })
    expect(room.removeBot(0, 1)).toEqual({ okay: false, error: 'invalid_payload' })
  })

  it('changes a bot level and reports a full table', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    expect(room.setBotLevel(0, 1, 'hard').okay).toBe(true)
    expect(room.levelFor(1)).toBe('hard')
    room.addBot(0, 'easy')
    room.addBot(0, 'easy')
    expect(room.addBot(0, 'easy')).toEqual({ okay: false, error: 'room_full' })
  })

  it('bots are frozen once the match is dealt', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.start(0)
    expect(room.addBot(0, 'easy')).toEqual({ okay: false, error: 'game_already_started' })
    expect(room.setBotLevel(0, 1, 'hard')).toEqual({ okay: false, error: 'game_already_started' })
    expect(room.removeBot(0, 1)).toEqual({ okay: false, error: 'game_already_started' })
  })

  it('a joiner replaces the last-added bot on a full table', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'normal')
    room.addBot(0, 'hard')
    const joined = room.join('Ben', 'socket-9')
    expect(joined.okay && joined.value.seat).toBe(3)
    expect(room.lobbyView().seats.map((s) => s.bot)).toEqual([null, 'easy', 'normal', null])
  })

  it('a full table of humans stays full', () => {
    const room = humans('A', 'B', 'C', 'D')
    expect(room.join('E', 'socket-9')).toEqual({ okay: false, error: 'room_full' })
  })

  it('remove, join, start keeps seat == engine index', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'easy')
    expect(room.removeBot(0, 1).okay).toBe(true)
    const joined = room.join('Ben', 'socket-1')
    expect(joined.okay && joined.value.seat).toBe(1)
    expect(room.start(0).okay).toBe(true)
    expect(room.viewFor(0)?.you.seat).toBe(0)
    expect(room.viewFor(1)?.you.seat).toBe(1)
    expect(room.lobbyView().seats.some((s) => s.status === 'left')).toBe(false)
  })

  it('a removed bot is omitted from the lobby view', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'easy')
    room.removeBot(0, 1)
    expect(room.lobbyView().seats.map((s) => s.seat)).toEqual([0, 2])
  })

  it('a table of bots alone is abandoned', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.disconnect('socket-0')
    room.expireGrace(0)
    expect(room.abandoned).toBe(true)
  })

  it('host transfer skips bots', () => {
    const room = humans('Ana', 'Ben')
    room.addBot(0, 'easy')
    room.disconnect('socket-0')
    expect(room.hostSeat).toBe(1)
  })

  it('exposes bot control and levels, with presence from the member in views', () => {
    const room = humans('Ana')
    room.addBot(0, 'hard')
    room.start(0)
    expect(room.connectedHumanCount()).toBe(1)
    expect(room.isBotControlled(0)).toBe(false)
    expect(room.isBotControlled(1)).toBe(true)
    expect(room.levelFor(0)).toBeNull()
    expect(room.levelFor(1)).toBe('hard')
    expect(room.viewFor(0)?.opponents).toEqual([
      expect.objectContaining({
        seat: 1,
        name: 'Ada',
        status: 'active',
        bot: 'hard',
        standIn: false,
      }),
    ])
  })
})

type PlayMove = Extract<Move, { type: 'play' }>

const table = (rules: TableRules, ...names: string[]) => {
  const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL, null, rules)
  const tokens = names.map((name, i) => {
    const joined = room.join(name, `socket-${i}`)
    if (!joined.okay) throw new Error(joined.error)
    return joined.value.sessionToken
  })
  return { room, tokens }
}

const begin = (room: Room) => {
  const begun = room.start(0)
  if (!begun.okay) throw new Error(begun.error)
  return room
}

/** A neutral move for a human on turn: a pass, a debt paid, a draw, else anything. */
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

/** One step of the table: the bot plays when one controls the turn, else the human. */
const step = (room: Room, pick: (seat: number) => Move = (seat) => humanMove(room, seat)) => {
  if (room.turnController() !== null) return room.botStep()
  const seat = room.currentSeat ?? 0
  const moved = room.move(seat, pick(seat))
  if (!moved.okay) throw new Error(moved.error)
  return moved.value
}

const advanceTo = (room: Room, seat: number) => {
  for (let i = 0; i < 200 && room.currentSeat !== seat; i++) step(room)
  if (room.currentSeat !== seat) throw new Error(`seat ${seat} never came on turn`)
}

/** Greedy play to the end of the round, so restart runs on a real finished game. */
const playOut = (room: Room) => {
  const greedy = (seat: number): Move => {
    const moves = room.viewFor(seat)?.you.legalMoves ?? []
    return (
      moves.find((m) => m.type === 'callUno') ??
      moves.find((m) => m.type === 'play') ??
      humanMove(room, seat)
    )
  }
  for (let i = 0; i < 2000 && room.phase === 'playing'; i++) step(room, greedy)
  if (room.phase === 'playing') throw new Error('the round never ended')
}

/** Plays on until `done`, dealing the next round whenever one ends. */
const playUntil = (room: Room, done: () => boolean, pick?: (seat: number) => Move) => {
  for (let i = 0; i < 5000 && !done(); i++) {
    if (room.betweenRounds) {
      const dealt = room.nextRound(room.hostSeat, 1000 + i)
      if (!dealt.okay) throw new Error(dealt.error)
      continue
    }
    if (room.phase !== 'playing') break
    step(room, pick)
  }
  if (!done()) throw new Error('the table never reached the moment')
}

describe('bots at the table', () => {
  it('a bot seat plays its own turn', () => {
    const { room } = table(DEFAULT_TABLE_RULES, 'Ana')
    room.addBot(0, 'normal')
    begin(room)
    advanceTo(room, 1)
    expect(room.turnController()).toBe('bot')

    const events = room.botStep()
    expect(
      events.some((e) => (e.type === 'cardPlayed' || e.type === 'cardsDrawn') && e.seat === 1),
    ).toBe(true)
    // A drawn card may leave the turn on the bot for one more decision.
    for (let i = 0; i < 3 && room.currentSeat === 1 && room.phase === 'playing'; i++) room.botStep()
    expect(room.currentSeat !== 1 || room.phase !== 'playing').toBe(true)
  })

  it('an absent human is stood in for on their turn', () => {
    const { room } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben', 'Cleo')
    begin(room)
    room.disconnect('socket-1')
    advanceTo(room, 1)
    expect(room.turnController()).toBe('absent')

    const events = room.botStep()
    expect(events[0]).toEqual({ type: 'botTookOver', seat: 1 })
    expect(room.memberAt(1)?.standIn).toBe(true)
    advanceTo(room, 2)
    advanceTo(room, 1)
    expect(room.turnController()).toBe('bot')
  })

  it('reconnecting takes the seat back', () => {
    const { room, tokens } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben', 'Cleo')
    begin(room)
    room.disconnect('socket-1')
    advanceTo(room, 1)
    room.botStep()

    expect(room.rejoin(tokens[1] ?? '', 'socket-1b').okay).toBe(true)
    expect(room.memberAt(1)?.standIn).toBe(false)
    advanceTo(room, 1)
    expect(room.turnController()).toBeNull()
  })

  it('grace expiry mid-match keeps the hand', () => {
    const { room, tokens } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben', 'Cleo')
    begin(room)
    const hand = room.viewFor(2)?.you.hand.length
    room.disconnect('socket-2')

    expect(room.expireGrace(2)).toEqual([])
    expect(room.viewFor(2)?.you.hand.length).toBe(hand)
    expect(room.rejoin(tokens[2] ?? '', 'socket-2b').okay).toBe(true)
  })

  it('leave mid-match hands the seat to a bot for good', () => {
    const { room, tokens } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben', 'Cleo')
    begin(room)
    expect(room.leave('socket-1')).toEqual({
      seat: 1,
      events: [
        { type: 'seatLeft', seat: 1 },
        { type: 'botTookOver', seat: 1 },
      ],
    })
    expect(room.rejoin(tokens[1] ?? '', 'socket-1b')).toEqual({
      okay: false,
      error: 'invalid_session',
    })
    advanceTo(room, 1)
    expect(room.turnController()).toBe('bot')
  })

  it('leave in the lobby leaves a vacancy, as before', () => {
    const { room } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben', 'Cleo')
    expect(room.leave('socket-1')).toEqual({ seat: 1, events: [{ type: 'seatLeft', seat: 1 }] })
    expect(room.memberAt(1)?.status).toBe('left')
    expect(room.memberAt(1)?.standIn).toBe(false)
    const joined = room.join('Dan', 'socket-9')
    expect(joined.okay && joined.value.seat).toBe(1)
  })

  it('restart turns a departed human into a normal bot', () => {
    const { room } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben', 'Cleo')
    begin(room)
    room.leave('socket-2')
    playOut(room)

    expect(room.restart(0, 7).okay).toBe(true)
    const member = room.memberAt(2)
    expect(member).toMatchObject({ kind: 'bot', level: 'normal', standIn: false, status: 'active' })
    expect(BOT_NAMES).toContain(member?.name)
    expect(room.viewFor(2)?.you.hand).toHaveLength(7)
  })

  it('a stand-in seat stays reclaimable across a restart', () => {
    const { room, tokens } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben', 'Cleo')
    begin(room)
    room.disconnect('socket-2')
    playOut(room)

    expect(room.restart(0, 7).okay).toBe(true)
    expect(room.memberAt(2)?.kind).toBe('human')
    expect(room.rejoin(tokens[2] ?? '', 'socket-2b').okay).toBe(true)
  })

  it('a reaction after its window closed changes nothing', () => {
    const { room } = table({ ...DEFAULT_TABLE_RULES, liar: true }, 'Ana')
    room.addBot(0, 'normal')
    room.addBot(0, 'normal')
    begin(room)
    // Ana plays down to one card without calling, so the bots may accuse her.
    const silent = (seat: number): Move => {
      const moves = room.viewFor(seat)?.you.legalMoves ?? []
      return moves.find((m) => m.type === 'play') ?? humanMove(room, seat)
    }
    playUntil(room, () => room.exposedSeat() === 0, silent)
    expect(room.pendingReactions()).toContainEqual({ seat: 1, kind: 'callOut' })

    expect(room.move(0, { type: 'callUno' }).okay).toBe(true)
    const before = [room.viewFor(0), room.viewFor(1), room.viewFor(2)]
    expect(room.botReact(1, 'callOut')).toEqual([])
    expect([room.viewFor(0), room.viewFor(1), room.viewFor(2)]).toEqual(before)
  })

  it('a bot reaction that is still open is played', () => {
    const { room } = table({ ...DEFAULT_TABLE_RULES, liar: true }, 'Ana')
    room.addBot(0, 'normal')
    begin(room)
    const silent = (seat: number): Move => {
      const moves = room.viewFor(seat)?.you.legalMoves ?? []
      return moves.find((m) => m.type === 'play') ?? humanMove(room, seat)
    }
    playUntil(room, () => room.exposedSeat() === 0, silent)
    expect(room.botReact(1, 'callOut')).toContainEqual({ type: 'calledOut', by: 1, target: 0 })
  })

  it('every human leaving abandons the room', () => {
    const { room } = table(DEFAULT_TABLE_RULES, 'Ana', 'Ben')
    room.addBot(0, 'normal')
    begin(room)
    room.leave('socket-0')
    expect(room.abandoned).toBe(false)
    room.leave('socket-1')
    expect(room.abandoned).toBe(true)
  })

  it('the table stops while no human is connected', () => {
    const { room } = table({ ...DEFAULT_TABLE_RULES, liar: true }, 'Ana')
    room.addBot(0, 'hard')
    begin(room)
    advanceTo(room, 1)
    room.disconnect('socket-0')

    expect(room.turnController()).toBeNull()
    expect(room.pendingReactions()).toEqual([])
    const before = room.viewFor(0)
    expect(room.botStep()).toEqual([])
    expect(room.viewFor(0)).toEqual(before)
  })

  it('only a level that jumps in is offered a jump-in', () => {
    const { room } = table({ ...DEFAULT_TABLE_RULES, jumpIn: true }, 'Ana')
    room.addBot(0, 'normal')
    room.addBot(0, 'hard')
    begin(room)
    const offered = new Set<string>()
    // The engine offering seat 1 an off-turn play is what makes its absence meaningful.
    let engineOffered = false
    playUntil(room, () => {
      for (const r of room.pendingReactions()) offered.add(`${r.seat}:${r.kind}`)
      engineOffered ||=
        room.currentSeat !== 1 &&
        (room.viewFor(1)?.you.legalMoves ?? []).some((m) => m.type === 'play')
      return offered.has('2:jumpIn') && engineOffered
    })
    expect(offered.has('1:jumpIn')).toBe(false)
  })

  it('a disconnected seat is still a Seven-Zero target', () => {
    const { room } = table({ ...DEFAULT_TABLE_RULES, sevenZero: true }, 'Ana', 'Ben', 'Cleo')
    begin(room)
    room.disconnect('socket-1')
    let offered = false
    for (let i = 0; i < 2000 && room.phase === 'playing' && !offered; i++) {
      const seat = room.currentSeat ?? 0
      offered =
        seat !== 1 &&
        (room.viewFor(seat)?.you.legalMoves ?? []).some(
          (m): m is PlayMove => m.type === 'play' && m.swapWith === 1,
        )
      if (!offered) step(room)
    }
    expect(offered).toBe(true)
  })
})
