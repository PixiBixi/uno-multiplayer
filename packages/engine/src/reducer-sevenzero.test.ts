import { describe, expect, it } from 'vitest'
import { UNO_PENALTY, applyMove } from './reducer.js'
import { legalMoves } from './rules.js'
import { act, allCards, cid, handOf, num, seatOf, stateOf } from './test-helpers.js'
import type { GameState, Move, TableRules } from './types.js'

/*
 * Seven-Zero. With `sevenZero` on, two number cards gain an effect: a 7 swaps
 * hands with a player of the mover's choice, and a 0 passes every hand one seat
 * along in the current direction of play.
 *
 * Choosing whom to swap with is a second decision after playing a card, exactly
 * like choosing a colour after a wild, and it reuses that shape: legalMoves emits
 * one `play` per legal target, so the client renders a picker and evaluates no
 * rule of its own.
 */

const PLAIN: TableRules = { liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false }
const SEVEN_ZERO: TableRules = { liar: false, sevenZero: true, jumpIn: false, playDrawnCard: false }
/** Both options at once, which is the only way a swap can open an UNO window. */
const WATCHED: TableRules = { liar: true, sevenZero: true, jumpIn: false, playDrawnCard: false }

const apply = (state: GameState, seat: number, move: Move): GameState => {
  const result = applyMove(state, seat, move)
  if (!result.okay) throw new Error(`unexpected failure: ${result.error}`)
  return result.value
}

/** Enough to pay a penalty out of, since stateOf's default pile holds only two. */
const pile = () => [num('d1', 'G', 1), num('d2', 'G', 2), num('d3', 'G', 3), num('d4', 'G', 4)]

const ids = (state: GameState, seat: number): string[] => handOf(state, seat).map((c) => c.id)

const plays = (state: GameState, seat: number): Move[] =>
  legalMoves(state, seat).filter((move) => move.type === 'play')

describe('a table that did not ask for Seven-Zero', () => {
  it('treats a 7 as an ordinary number card', () => {
    const state = stateOf({
      rules: PLAIN,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
      ],
    })
    // No second decision offered, so nothing to pick and nothing to validate.
    expect(plays(state, 0)).toEqual([
      { type: 'play', cardId: cid('a') },
      { type: 'play', cardId: cid('b') },
      { type: 'play', cardId: cid('c') },
    ])

    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(ids(next, 0)).toEqual(['b', 'c'])
    expect(ids(next, 1)).toEqual(['x', 'y'])
  })

  it('treats a 0 as an ordinary number card', () => {
    const state = stateOf({
      rules: PLAIN,
      seats: [
        seatOf(0, [num('a', 'R', 0), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
      ],
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(ids(next, 0)).toEqual(['b', 'c'])
    expect(ids(next, 1)).toEqual(['x', 'y'])
  })
})

describe('what legalMoves offers for a 7', () => {
  const threeSeats = (over: Partial<GameState> = {}): GameState =>
    stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
      ...over,
    })

  it('emits one move per legal target, the way a wild emits one per colour', () => {
    expect(plays(threeSeats(), 0)).toEqual([
      { type: 'play', cardId: cid('a'), swapWith: 1 },
      { type: 'play', cardId: cid('a'), swapWith: 2 },
      { type: 'play', cardId: cid('b') },
      { type: 'play', cardId: cid('c') },
    ])
  })

  it('never offers a swap with yourself', () => {
    for (const move of plays(threeSeats(), 0)) {
      if (move.type === 'play') expect(move.swapWith).not.toBe(0)
    }
  })

  it('offers exactly one target at two players, so a 7 always swaps', () => {
    /* Not made a no-op with one possible target: that would silently change what
       the card is worth at a two-player table. */
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
      ],
    })
    expect(plays(state, 0)).toEqual([
      { type: 'play', cardId: cid('a'), swapWith: 1 },
      { type: 'play', cardId: cid('b') },
      { type: 'play', cardId: cid('c') },
    ])
  })

  it('never offers a seat that has left', () => {
    // Its hand went back into the pile, so swapping into it would hand somebody
    // an empty hand and a free win.
    const state = threeSeats({
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [], { status: 'left' }),
      ],
    })
    expect(plays(state, 0)).toEqual([
      { type: 'play', cardId: cid('a'), swapWith: 1 },
      { type: 'play', cardId: cid('b') },
      { type: 'play', cardId: cid('c') },
    ])
  })

  it('never offers a seat that is merely disconnected', () => {
    /* Their hand is held for them until the grace period runs out. Handing it to
       somebody else while they are away would bring them back to a hand chosen by
       an event they never saw. */
    const state = threeSeats({
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9)], { status: 'disconnected' }),
      ],
    })
    expect(plays(state, 0)).toEqual([
      { type: 'play', cardId: cid('a'), swapWith: 1 },
      { type: 'play', cardId: cid('b') },
      { type: 'play', cardId: cid('c') },
    ])
  })

  it('falls back to a plain play when no other seat is active', () => {
    // Otherwise a hand of nothing but 7s would have no legal card in it at all.
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5)], { status: 'disconnected' }),
      ],
    })
    expect(plays(state, 0)).toContainEqual({ type: 'play', cardId: cid('a') })
  })

  it('offers no target for the 7 that empties the hand', () => {
    // The round ends on the empty hand, so there is no second decision to take.
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [seatOf(0, [num('a', 'R', 7)]), seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)])],
    })
    expect(plays(state, 0)).toEqual([{ type: 'play', cardId: cid('a') }])
  })
})

describe('playing a 7', () => {
  const table = (): GameState =>
    stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
      drawPile: pile(),
    })

  it('exchanges the two hands and leaves every other seat alone', () => {
    const next = apply(table(), 0, { type: 'play', cardId: cid('a'), swapWith: 2 })
    expect(ids(next, 0)).toEqual(['z', 'w'])
    expect(ids(next, 2)).toEqual(['b', 'c'])
    expect(ids(next, 1)).toEqual(['x', 'y'])
  })

  it('conserves every card, since hands are permuted and nothing is created', () => {
    const before = table()
    const after = apply(before, 0, { type: 'play', cardId: cid('a'), swapWith: 1 })
    expect(
      allCards(after)
        .map((card) => card.id)
        .sort(),
    ).toEqual(
      allCards(before)
        .map((card) => card.id)
        .sort(),
    )
  })

  it('hands the turn on by the ordinary single step', () => {
    const next = apply(table(), 0, { type: 'play', cardId: cid('a'), swapWith: 2 })
    expect(next.currentSeat).toBe(1)
    expect(next.direction).toBe(1)
    expect(next.currentColor).toBe('R')
  })

  it('refuses a swap with a seat the table never offered', () => {
    /* The mutation this guards: comparing only the card id in sameMove would let a
       move against one seat authorise a swap with any seat, including one that has
       left and is holding nothing. */
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [], { status: 'left' }),
      ],
    })
    expect(applyMove(state, 0, { type: 'play', cardId: cid('a'), swapWith: 2 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('refuses a swap with a seat that does not exist', () => {
    expect(applyMove(table(), 0, { type: 'play', cardId: cid('a'), swapWith: 9 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('refuses the same 7 played with no target at all', () => {
    // A target is part of the move, exactly as a colour is part of playing a wild.
    expect(applyMove(table(), 0, { type: 'play', cardId: cid('a') })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('wins the round when it is the last card, without moving a hand', () => {
    /* First empty hand wins, unconditionally. A 7 that swapped the win away would
       make the card unplayable as a last card, which is a trap rather than a rule. */
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [seatOf(0, [num('a', 'R', 7)]), seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)])],
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.phase).toBe('finished')
    expect(next.winner).toBe(0)
    expect(ids(next, 0)).toEqual([])
    expect(ids(next, 1)).toEqual(['x', 'y'])
  })
})

describe('playing a 0', () => {
  const threeSeats = (over: Partial<GameState> = {}): GameState =>
    stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 0), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
      drawPile: pile(),
      ...over,
    })

  it('passes every hand one seat along, in the direction of play', () => {
    const next = apply(threeSeats(), 0, { type: 'play', cardId: cid('a') })
    expect(ids(next, 1)).toEqual(['b', 'c'])
    expect(ids(next, 2)).toEqual(['x', 'y'])
    expect(ids(next, 0)).toEqual(['z', 'w'])
  })

  it('follows the direction, so a reverse played first sends hands the other way', () => {
    /* The interaction worth a test of its own: the rotation reads `direction`, and
       a reverse changes it before the 0 is ever played. */
    const state = threeSeats({
      seats: [
        seatOf(0, [act('r', 'reverse', 'R'), num('b', 'R', 2), num('e', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [num('a', 'R', 0), num('w', 'Y', 8)]),
      ],
    })
    const reversed = apply(state, 0, { type: 'play', cardId: cid('r') })
    expect(reversed.direction).toBe(-1)
    expect(reversed.currentSeat).toBe(2)

    const next = apply(reversed, 2, { type: 'play', cardId: cid('a') })
    // Anticlockwise: seat 2's hand lands on seat 1, seat 1's on seat 0.
    expect(ids(next, 1)).toEqual(['w'])
    expect(ids(next, 0)).toEqual(['x', 'y'])
    expect(ids(next, 2)).toEqual(['b', 'e'])
  })

  it('is a swap at two players, which is what rotating two hands means', () => {
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 0), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
      ],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(ids(next, 0)).toEqual(['x', 'y'])
    expect(ids(next, 1)).toEqual(['b', 'c'])
  })

  it('leaves a seat that is not active out of it, hand included', () => {
    const state = threeSeats({
      seats: [
        seatOf(0, [num('a', 'R', 0), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)], { status: 'disconnected' }),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(ids(next, 1)).toEqual(['x', 'y'])
    // The two active seats exchange, since they are the whole cycle.
    expect(ids(next, 2)).toEqual(['b', 'c'])
    expect(ids(next, 0)).toEqual(['z', 'w'])
  })

  it('needs no second decision, so it is offered as a plain play', () => {
    expect(plays(threeSeats(), 0)).toContainEqual({ type: 'play', cardId: cid('a') })
  })

  it('wins the round when it is the last card, without moving a hand', () => {
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 0)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.phase).toBe('finished')
    expect(ids(next, 1)).toEqual(['x', 'y'])
    expect(ids(next, 2)).toEqual(['z'])
  })

  it('conserves every card', () => {
    const before = threeSeats()
    const after = apply(before, 0, { type: 'play', cardId: cid('a') })
    expect(
      allCards(after)
        .map((card) => card.id)
        .sort(),
    ).toEqual(
      allCards(before)
        .map((card) => card.id)
        .sort(),
    )
  })
})

describe('a swap and the UNO window', () => {
  it('leaves a seat handed a single card open to an accusation', () => {
    /* The rule is about HOLDING one card uncalled, and a swap is another way to get
       there. The seat escapes it the ordinary way: call UNO on its own next turn,
       before playing. */
    const state = stateOf({
      rules: WATCHED,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5)]),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a'), swapWith: 2 })
    // Seat 2 received two cards, seat 0 gave two away - neither is on one card.
    expect(next.seats[0]?.vulnerable).toBe(false)
    expect(next.seats[2]?.vulnerable).toBe(false)

    const onOne = apply(state, 0, { type: 'play', cardId: cid('a'), swapWith: 1 })
    // Seat 0 took a hand of one card, and seat 1 took a hand of two.
    expect(ids(onOne, 0)).toEqual(['x'])
    expect(onOne.seats[0]?.vulnerable).toBe(true)
    expect(onOne.seats[1]?.vulnerable).toBe(false)
  })

  it('opens it on the seat that was handed the single card, not only the mover', () => {
    const state = stateOf({
      rules: WATCHED,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6), num('v', 'B', 7)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a'), swapWith: 1 })
    // Seat 1 was handed seat 0's single remaining card.
    expect(ids(next, 1)).toEqual(['b'])
    expect(next.seats[1]?.vulnerable).toBe(true)
    // And any other seat may say so, off turn.
    expect(legalMoves(next, 2)).toContainEqual({ type: 'callOut', target: 1 })
  })

  it('closes a window on a seat whose hand grew past one card', () => {
    // Being accused of holding one card you no longer hold is not a rule, it is a bug.
    const state = stateOf({
      rules: WATCHED,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5)], { vulnerable: true }),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a'), swapWith: 1 })
    expect(ids(next, 1)).toEqual(['b', 'c'])
    expect(next.seats[1]?.vulnerable).toBe(false)
  })

  it('opens one on every seat a rotation leaves holding a single card', () => {
    const state = stateOf({
      rules: WATCHED,
      seats: [
        seatOf(0, [num('a', 'R', 0), num('b', 'R', 2)]),
        seatOf(1, [num('x', 'B', 5)]),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    // Seat 0 kept one card and passed it on; seat 2 received it.
    expect(ids(next, 1)).toEqual(['b'])
    expect(ids(next, 2)).toEqual(['x'])
    expect(next.seats[1]?.vulnerable).toBe(true)
    expect(next.seats[2]?.vulnerable).toBe(true)
    expect(next.seats[0]?.vulnerable).toBe(false)
  })

  it('charges nothing on a table without the Liar option', () => {
    /* The automatic penalty punishes an omission, and after a permutation nobody is
       holding the hand they held when the turn began - the mover least of all. */
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2), num('c', 'R', 3)]),
        seatOf(1, [num('x', 'B', 5)]),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a'), swapWith: 1 })
    expect(ids(next, 0)).toEqual(['x'])
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.drawPile).toHaveLength(pile().length)
  })

  it('still charges an ordinary forgotten UNO, since no hand moved', () => {
    // The 7 is playable but a plain card is played instead: the option changes
    // nothing about the rest of the game.
    const state = stateOf({
      rules: SEVEN_ZERO,
      seats: [
        seatOf(0, [num('a', 'R', 7), num('b', 'R', 2)]),
        seatOf(1, [num('x', 'B', 5), num('y', 'B', 6)]),
      ],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('b') })
    expect(handOf(next, 0)).toHaveLength(1 + UNO_PENALTY)
  })
})
