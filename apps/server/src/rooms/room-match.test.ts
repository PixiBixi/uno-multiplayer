import { DEFAULT_MATCH_GOAL, type GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const seated = (goal = DEFAULT_MATCH_GOAL, ...names: string[]) => {
  const room = new Room('ABC234', 42, goal)
  names.forEach((name, index) => {
    const joined = room.join(name, `socket-${String(index)}`)
    if (!joined.okay) throw new Error(joined.error)
  })
  return room
}

/**
 * Plays greedily until the round ends, returning the events. Uses the room's own
 * view of what is legal, so it can never ask for a move the engine would refuse.
 */
const playRound = (room: Room): GameEvent[] => {
  const events: GameEvent[] = []
  for (let turn = 0; turn < 800; turn += 1) {
    const view = room.viewFor(0)
    if (view === null || view.phase === 'finished') break
    const seat = view.currentSeat
    const state = room.viewFor(seat)
    if (state === null) break
    const moves = state.you.legalMoves
    const move =
      moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) break
    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)
    events.push(...result.value)
  }
  return events
}

describe('a match of several rounds', () => {
  it('reports the round result with what it paid out', () => {
    const room = seated({ kind: 'rounds', count: 3 }, 'Ana', 'Ben')
    expect(room.start(0).okay).toBe(true)

    const ended = playRound(room).find((event) => event.type === 'roundEnded')
    if (ended?.type !== 'roundEnded') throw new Error('the round never ended')

    // Everything the losers still held went to whoever went out.
    const total = ended.awarded.reduce((sum, points) => sum + points, 0)
    expect(ended.awarded.filter((points) => points > 0)).toHaveLength(1)
    expect(ended.scores).toEqual(ended.awarded)
    expect(total).toBeGreaterThan(0)
  })

  it('carries the standings into the next round', () => {
    const room = seated({ kind: 'rounds', count: 3 }, 'Ana', 'Ben')
    room.start(0)
    playRound(room)

    const after = room.viewFor(0)?.match.scores ?? []
    expect(room.nextRound(0, 99).okay).toBe(true)

    const carried = room.viewFor(0)?.match
    expect(carried?.scores).toEqual(after)
    expect(carried?.round).toBe(2)
    // A fresh deal, not a resumed one.
    expect(room.viewFor(0)?.you.hand).toHaveLength(7)
  })

  it('resets the standings on a new match, which is why it is a separate action', () => {
    const room = seated({ kind: 'rounds', count: 3 }, 'Ana', 'Ben')
    room.start(0)
    playRound(room)
    expect(room.viewFor(0)?.match.scores.some((score) => score > 0)).toBe(true)

    expect(room.restart(0, 99).okay).toBe(true)
    expect(room.viewFor(0)?.match.scores).toEqual([0, 0])
    expect(room.viewFor(0)?.match.round).toBe(1)
  })

  it('ends a one-round match after its only round', () => {
    const room = seated({ kind: 'rounds', count: 1 }, 'Ana', 'Ben')
    room.start(0)
    const events = playRound(room)

    expect(events.some((event) => event.type === 'matchEnded')).toBe(true)
    expect(room.matchOver).toBe(true)
    expect(room.viewFor(0)?.match.winners).not.toBeNull()
  })

  it('refuses another round once the match is decided', () => {
    const room = seated({ kind: 'rounds', count: 1 }, 'Ana', 'Ben')
    room.start(0)
    playRound(room)
    expect(room.nextRound(0, 99)).toEqual({ okay: false, error: 'match_over' })
  })

  it('refuses another round while one is still being played', () => {
    const room = seated({ kind: 'rounds', count: 3 }, 'Ana', 'Ben')
    room.start(0)
    expect(room.nextRound(0, 99)).toEqual({ okay: false, error: 'round_in_progress' })
  })

  it('refuses another round from a guest', () => {
    const room = seated({ kind: 'rounds', count: 3 }, 'Ana', 'Ben')
    room.start(0)
    playRound(room)
    expect(room.nextRound(1, 99)).toEqual({ okay: false, error: 'not_host' })
  })

  it('keeps playing while nobody has met a points target', () => {
    // 2000 is the ceiling, so one round cannot possibly reach it.
    const room = seated({ kind: 'points', target: 2000 }, 'Ana', 'Ben')
    room.start(0)
    const events = playRound(room)

    expect(events.some((event) => event.type === 'roundEnded')).toBe(true)
    expect(events.some((event) => event.type === 'matchEnded')).toBe(false)
    expect(room.matchOver).toBe(false)
  })

  it('tells everyone the goal from the lobby, before a card is dealt', () => {
    const room = seated({ kind: 'points', target: 250 }, 'Ana', 'Ben')
    expect(room.lobbyView().goal).toEqual({ kind: 'points', target: 250 })
  })
})

describe('seat numbering across a match', () => {
  /* The regression this guards: dealing only to the seats still present renumbered
     the engine, so a member seat index stopped addressing the same player and the
     highest-numbered one got no view at all. Scores are indexed by seat, so this
     has to hold for the standings to mean anything. */
  it('gives every present player a view when a seat was lost before the deal', () => {
    const room = seated(DEFAULT_MATCH_GOAL, 'Ana', 'Ben', 'Cleo')
    room.disconnect('socket-1')
    room.expireGrace(1)

    expect(room.start(0).okay).toBe(true)

    expect(room.viewFor(0)?.you.seat).toBe(0)
    expect(room.viewFor(2)?.you.seat).toBe(2)
    expect(room.viewFor(2)?.you.hand).toHaveLength(7)
    // The departed seat is present but holds nothing, so it scores nothing.
    expect(room.viewFor(1)?.you.hand).toEqual([])
  })

  it('sizes the standings to every seat, so a departed player keeps their total', () => {
    const room = seated(DEFAULT_MATCH_GOAL, 'Ana', 'Ben', 'Cleo')
    room.disconnect('socket-1')
    room.expireGrace(1)
    room.start(0)

    expect(room.viewFor(0)?.match.scores).toHaveLength(3)
  })

  it('does not start the turn on a seat that is not there', () => {
    const room = seated(DEFAULT_MATCH_GOAL, 'Ana', 'Ben', 'Cleo')
    // Seat 0 is where a deal always starts, and it is the one that is gone.
    room.disconnect('socket-0')
    room.expireGrace(0)
    expect(room.start(1).okay).toBe(true)

    const view = room.viewFor(1)
    expect(view?.currentSeat).not.toBe(0)
  })
})
