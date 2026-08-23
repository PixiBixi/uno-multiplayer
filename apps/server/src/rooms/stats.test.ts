import { DEFAULT_MATCH_GOAL, type GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'
import { emptyStatsFor, tally } from './stats.js'

const card = (kind: 'number' | 'wild4' | 'draw2') =>
  kind === 'number'
    ? ({ id: 'n', kind: 'number', color: 'R', value: 5 } as const)
    : kind === 'wild4'
      ? ({ id: 'w', kind: 'wild4' } as const)
      : ({ id: 'd', kind: 'draw2', color: 'G' } as const)

describe('tally', () => {
  const two = () => emptyStatsFor(2)

  it('counts a played card, and singles out the ones worth bragging about', () => {
    const stats = tally(two(), [
      { type: 'cardPlayed', seat: 0, card: card('number') },
      { type: 'cardPlayed', seat: 0, card: card('wild4') },
      { type: 'cardPlayed', seat: 0, card: card('draw2') },
    ] as GameEvent[])

    expect(stats[0]?.cardsPlayed).toBe(3)
    expect(stats[0]?.wild4Played).toBe(1)
    expect(stats[0]?.draw2Played).toBe(1)
  })

  it('counts drawn CARDS rather than draws', () => {
    // Taking four off a stacked wild is the thing worth remembering, not that
    // one draw happened.
    const stats = tally(two(), [{ type: 'cardsDrawn', seat: 1, count: 4 }])
    expect(stats[1]?.cardsDrawn).toBe(4)
  })

  it('counts a UNO penalty as both a forgetting and the cards it cost', () => {
    const stats = tally(two(), [{ type: 'unoPenalty', seat: 1, count: 2 }])
    expect(stats[1]?.unoPenalties).toBe(1)
    expect(stats[1]?.cardsDrawn).toBe(2)
  })

  it('counts calls, timeouts and rounds won', () => {
    const stats = tally(two(), [
      { type: 'unoCalled', seat: 0 },
      { type: 'turnTimedOut', seat: 1 },
      { type: 'roundEnded', winner: 0, awarded: [30, 0], scores: [30, 0] },
    ])
    expect(stats[0]?.unoCalls).toBe(1)
    expect(stats[1]?.timeouts).toBe(1)
    expect(stats[0]?.roundsWon).toBe(1)
  })

  it('credits nobody for an abandoned round', () => {
    const stats = tally(two(), [
      { type: 'roundEnded', winner: null, awarded: [0, 0], scores: [0, 0] },
    ])
    expect(stats.map((seat) => seat.roundsWon)).toEqual([0, 0])
  })

  it('ignores an event about a seat that does not exist', () => {
    // A view can outlive the seat it describes; counting into thin air would
    // throw rather than simply not count.
    expect(() => tally(two(), [{ type: 'unoCalled', seat: 9 }])).not.toThrow()
  })

  it('does not mutate what it was given', () => {
    const before = two()
    tally(before, [{ type: 'unoCalled', seat: 0 }])
    expect(before[0]?.unoCalls).toBe(0)
  })
})

describe('the room tallies everything it reports', () => {
  /**
   * The guard that matters. A room produces events from eight different methods,
   * and every one has to pass through the same recording funnel - miss one and
   * the statistics under-count silently. Rather than trusting that, this replays
   * the events the room actually returned and checks the totals agree.
   */
  it('agrees with an independent tally of the events it returned', () => {
    const room = new Room('ABC234', 42, { kind: 'rounds', count: 3 })
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.join('Cleo', 'socket-2')
    room.start(0)

    const seen: GameEvent[] = []
    for (let turn = 0; turn < 800; turn += 1) {
      const seat = room.currentSeat
      if (seat === null || room.viewFor(seat)?.phase !== 'playing') break
      const moves = room.viewFor(seat)?.you.legalMoves ?? []
      const move =
        moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
      if (move === undefined) break
      const result = room.move(seat, move)
      if (!result.okay) throw new Error(result.error)
      seen.push(...result.value)
    }

    // A round that actually happened, or the comparison proves nothing.
    expect(seen.length).toBeGreaterThan(10)
    expect(seen.some((event) => event.type === 'roundEnded')).toBe(true)

    expect(room.viewFor(0)?.match.stats).toEqual(tally(emptyStatsFor(3), seen))
  })

  it('counts a forced turn against the seat the clock played for', () => {
    const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL, { turnSeconds: 10 })
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.start(0)

    const seat = room.currentSeat ?? 0
    room.forceTurnMove()

    expect(room.viewFor(0)?.match.stats[seat]?.timeouts).toBe(1)
  })

  it('starts a new match from nothing', () => {
    const room = new Room('ABC234', 42, { kind: 'rounds', count: 3 })
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.start(0)

    const seat = room.currentSeat ?? 0
    const moves = room.viewFor(seat)?.you.legalMoves ?? []
    const play = moves.find((move) => move.type === 'play')
    if (play !== undefined) room.move(seat, play)
    expect(room.viewFor(0)?.match.stats.some((s) => s.cardsPlayed > 0)).toBe(true)

    room.disconnect('socket-1')
    room.expireGrace(1)
    room.join('Cleo', 'socket-2')

    // The old tally described a different match.
    const restarted = new Room('ABC234', 42, { kind: 'rounds', count: 3 })
    restarted.join('Ana', 's0')
    restarted.join('Ben', 's1')
    restarted.start(0)
    expect(restarted.viewFor(0)?.match.stats.every((s) => s.cardsPlayed === 0)).toBe(true)
  })
})
