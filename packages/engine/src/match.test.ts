import { describe, expect, it } from 'vitest'
import { applyRound, cardPoints, matchWinners, roundPoints, startMatch } from './match.js'
import { act, num, seatOf, stateOf, wild } from './test-helpers.js'
import type { Card, MatchState, Seat } from './types.js'

/** A finished round, which is the only kind scoring looks at. */
const finished = (seats: Seat[], winner: number | null) =>
  stateOf({ seats, winner, phase: 'finished' })

describe('cardPoints', () => {
  it('scores a number card at its face value', () => {
    expect(cardPoints(num('a', 'R', 7))).toBe(7)
    expect(cardPoints(num('b', 'B', 0))).toBe(0)
  })

  it('scores skip, reverse and draw two at 20', () => {
    expect(cardPoints(act('c', 'skip', 'G'))).toBe(20)
    expect(cardPoints(act('d', 'reverse', 'Y'))).toBe(20)
    expect(cardPoints(act('e', 'draw2', 'R'))).toBe(20)
  })

  it('scores both wilds at 50', () => {
    expect(cardPoints(wild('f', 'wild'))).toBe(50)
    expect(cardPoints(wild('g', 'wild4'))).toBe(50)
  })
})

describe('roundPoints', () => {
  it('awards the losers’ remaining cards to the winner', () => {
    const game = finished(
      [
        seatOf(0, []),
        seatOf(1, [num('a', 'R', 7)]),
        seatOf(2, [wild('b', 'wild4'), act('c', 'skip', 'G')]),
      ],
      0,
    )
    // 7 + 50 + 20, all to seat 0.
    expect(roundPoints(game)).toEqual([77, 0, 0])
  })

  it('awards nothing when the round had no winner', () => {
    // Too few players left: inventing a score here would mean inventing a rule.
    const game = finished([seatOf(0, [wild('a', 'wild')]), seatOf(1, [])], null)
    expect(roundPoints(game)).toEqual([0, 0])
  })

  it('counts a seat that left, since its cards are out of play either way', () => {
    const game = finished([seatOf(0, []), seatOf(1, [num('a', 'B', 9)], { status: 'left' })], 0)
    expect(roundPoints(game)).toEqual([9, 0])
  })

  it('awards zero when the winner was the only seat holding cards', () => {
    expect(roundPoints(finished([seatOf(0, []), seatOf(1, [])], 0))).toEqual([0, 0])
  })
})

describe('applyRound', () => {
  const round = (): ReturnType<typeof finished> =>
    finished([seatOf(0, []), seatOf(1, [wild('a', 'wild')])], 0)

  it('accumulates onto the running totals and advances the round', () => {
    const next = applyRound(startMatch({ kind: 'points', target: 500 }, 2), round())
    expect(next.scores).toEqual([50, 0])
    expect(next.round).toBe(2)
  })

  it('does not mutate the match it was given', () => {
    const match = startMatch({ kind: 'points', target: 500 }, 2)
    applyRound(match, round())
    expect(match.scores).toEqual([0, 0])
    expect(match.round).toBe(1)
  })
})

describe('matchWinners in points mode', () => {
  const points = (scores: number[], target = 500): MatchState => ({
    goal: { kind: 'points', target },
    scores,
    round: 2,
  })

  it('continues while nobody has reached the target', () => {
    expect(matchWinners(points([499, 120]))).toBeNull()
  })

  it('ends when a seat reaches the target exactly', () => {
    expect(matchWinners(points([500, 120]))).toEqual([0])
  })

  it('ends when a seat overshoots the target', () => {
    expect(matchWinners(points([80, 613]))).toEqual([1])
  })
})

describe('matchWinners in rounds mode', () => {
  const rounds = (scores: number[], round: number, count = 3): MatchState => ({
    goal: { kind: 'rounds', count },
    scores,
    round,
  })

  it('continues while rounds remain', () => {
    // `round: 3` names the round about to be played, so a best-of-3 is not over.
    expect(matchWinners(rounds([200, 30], 3))).toBeNull()
  })

  it('ends after the last round, on the highest total', () => {
    expect(matchWinners(rounds([200, 330], 4))).toEqual([1])
  })

  it('reports every seat on a tied winning total', () => {
    // The official rules are silent here. A shared win beats an unbounded match.
    expect(matchWinners(rounds([200, 200, 90], 4))).toEqual([0, 1])
  })

  it('treats a one-round match as a single game', () => {
    expect(matchWinners(rounds([50, 0], 1, 1))).toBeNull()
    expect(matchWinners(rounds([50, 0], 2, 1))).toEqual([0])
  })
})

describe('startMatch', () => {
  it('starts every seat on zero', () => {
    const match = startMatch({ kind: 'rounds', count: 3 }, 4)
    expect(match.scores).toEqual([0, 0, 0, 0])
    expect(match.round).toBe(1)
  })
})

/* A guard, not a unit test: sortHand's "by value" order and a round's score are
   the same table, and they are only the same table while both read this function. */
describe('the scoring table is the engine’s', () => {
  it('is exported for the client to sort by', () => {
    const hand: Card[] = [num('a', 'R', 3), act('b', 'skip', 'G'), wild('c', 'wild4')]
    expect(hand.map(cardPoints)).toEqual([3, 20, 50])
  })
})
