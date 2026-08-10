import { describe, expect, it } from 'vitest'
import { buildDeck } from './deck.js'
import { UNO_PENALTY, applyMove } from './reducer.js'
import { isIdentical, legalMoves } from './rules.js'
import { act, cid, handOf, num, seatOf, stateOf, wild } from './test-helpers.js'
import type { GameState, Move, TableRules } from './types.js'

/*
 * Jump-in. With `jumpIn` on, a card identical to the discard top — same colour AND
 * same value, or same colour and same kind — may be laid down out of turn, and play
 * continues from whoever laid it.
 *
 * It is the only rule in the game that inverts "only `currentSeat` can act" AND
 * moves `currentSeat`, so most of what is worth testing here is about the turn:
 * where it lands, whose turn was lost, and what the card then does from its new
 * seat.
 */

const PLAIN: TableRules = { liar: false, sevenZero: false, jumpIn: false }
const JUMP: TableRules = { liar: false, sevenZero: false, jumpIn: true }
/** Both, since a jumper landing on one card is exactly the Liar window's business. */
const WATCHED: TableRules = { liar: true, sevenZero: false, jumpIn: true }
const SEVEN_ZERO_JUMP: TableRules = { liar: false, sevenZero: true, jumpIn: true }

const apply = (state: GameState, seat: number, move: Move): GameState => {
  const result = applyMove(state, seat, move)
  if (!result.okay) throw new Error(`unexpected failure: ${result.error}`)
  return result.value
}

/** Enough to pay a penalty out of, since stateOf's default pile holds only two. */
const pile = () => [num('d1', 'G', 1), num('d2', 'G', 2), num('d3', 'G', 3), num('d4', 'G', 4)]

const ids = (state: GameState, seat: number): string[] => handOf(state, seat).map((c) => c.id)

/**
 * Seat 0 is on turn, the top is a red 7, and seat 1 holds its twin. Three seats, so
 * "the turn moves to the seat after the jumper" is a claim with content: seat 2 is
 * the one that loses its turn.
 */
const table = (over: Partial<GameState> = {}): GameState =>
  stateOf({
    rules: JUMP,
    drawPile: pile(),
    discardPile: [num('top', 'R', 7)],
    currentColor: 'R',
    seats: [
      seatOf(0, [num('a', 'R', 2), num('b', 'B', 3)]),
      /* Three cards, so a jump-in leaves two and the turn can be examined without
         the UNO penalty for landing on one getting in the way. */
      seatOf(1, [num('twin', 'R', 7), num('y', 'B', 6), num('y2', 'B', 5)]),
      seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
    ],
    ...over,
  })

describe('what the deck itself allows', () => {
  it('holds at most two identical cards, so at most one seat can ever jump a top', () => {
    /* Not a rule so much as the reason the rule is bounded: the twin of the top is
       in one place only. A jump-in chain longer than one is impossible, and two
       players cannot hold a jump-in against the same card — which is what the race
       between two jumpers, as it is usually imagined, would need. */
    const deck = buildDeck()
    for (const card of deck) {
      const copies = deck.filter((other) => isIdentical(other, card))
      expect(copies.length, `${card.id}`).toBeLessThanOrEqual(2)
    }
  })

  it('gives a 0 no twin at all, so a 0 can never be jumped', () => {
    // One 0 per colour in a UNO deck, against two of every other number.
    const deck = buildDeck()
    for (const card of deck.filter((c) => c.kind === 'number' && c.value === 0)) {
      expect(deck.filter((other) => isIdentical(other, card))).toHaveLength(1)
    }
  })
})

describe('what counts as identical', () => {
  it('matches a number on colour and value together', () => {
    expect(isIdentical(num('a', 'R', 7), num('b', 'R', 7))).toBe(true)
    expect(isIdentical(num('a', 'G', 7), num('b', 'R', 7))).toBe(false)
    expect(isIdentical(num('a', 'R', 8), num('b', 'R', 7))).toBe(false)
  })

  it('matches an action card on colour and kind together', () => {
    expect(isIdentical(act('a', 'skip', 'R'), act('b', 'skip', 'R'))).toBe(true)
    expect(isIdentical(act('a', 'skip', 'G'), act('b', 'skip', 'R'))).toBe(false)
    expect(isIdentical(act('a', 'reverse', 'R'), act('b', 'skip', 'R'))).toBe(false)
  })

  it('never matches a wild, in either position', () => {
    /* A wild has no colour, so matching on kind alone would make every wild
       identical to every other one — a wild4 answerable by a wild4 from anywhere
       round the table, which is not the rule and is chaos. */
    expect(isIdentical(wild('a', 'wild'), wild('b', 'wild'))).toBe(false)
    expect(isIdentical(wild('a', 'wild4'), wild('b', 'wild4'))).toBe(false)
    expect(isIdentical(num('a', 'R', 7), wild('b', 'wild'))).toBe(false)
    expect(isIdentical(wild('a', 'wild4'), num('b', 'R', 7))).toBe(false)
  })

  it('does not confuse a number with an action card of the same colour', () => {
    expect(isIdentical(num('a', 'R', 2), act('b', 'draw2', 'R'))).toBe(false)
    expect(isIdentical(act('a', 'draw2', 'R'), num('b', 'R', 2))).toBe(false)
  })
})

describe('a table that did not ask for jump-in', () => {
  it('offers an off-turn seat nothing, even holding the twin of the top', () => {
    expect(legalMoves(table({ rules: PLAIN }), 1)).toEqual([])
  })

  it('refuses the play as not that seat’s turn, the way it always did', () => {
    const result = applyMove(table({ rules: PLAIN }), 1, { type: 'play', cardId: cid('twin') })
    expect(result).toEqual({ okay: false, error: 'not_your_turn' })
  })
})

describe('what legalMoves offers an off-turn seat', () => {
  it('offers the identical card and nothing else at all', () => {
    /* Not the seat's other playable cards, not a draw, not a call of UNO. An
       off-turn seat gets call-outs and jump-ins; everything else still belongs to
       whoever holds the turn. */
    expect(legalMoves(table(), 1)).toEqual([{ type: 'play', cardId: cid('twin') }])
  })

  it('offers nothing to a seat holding no twin', () => {
    expect(legalMoves(table(), 2)).toEqual([])
  })

  it('offers nothing on a card of the right value in the wrong colour', () => {
    const state = table({
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [num('near', 'G', 7), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    expect(legalMoves(state, 1)).toEqual([])
  })

  it('offers nothing when the top is a wild, whatever the jumper holds', () => {
    const state = table({
      discardPile: [wild('top', 'wild')],
      currentColor: 'R',
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [wild('mine', 'wild'), wild('mine4', 'wild4')]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    expect(legalMoves(state, 1)).toEqual([])
  })

  it('still offers the seat on turn one move per card, and no duplicate for the twin', () => {
    /* A non-wild play always sets `currentColor` to its own colour, so a card
       identical to the top is already playable the ordinary way. Adding a jump-in
       for the seat on turn would put two indistinguishable moves in the view. */
    const state = table({ currentSeat: 1 })
    expect(legalMoves(state, 1)).toEqual([{ type: 'play', cardId: cid('twin') }, { type: 'draw' }])
  })

  it('offers nothing once the round is over', () => {
    expect(legalMoves(table({ phase: 'finished', winner: 0 }), 1)).toEqual([])
  })

  it('offers nothing to a seat that is not active', () => {
    const state = table({
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [num('twin', 'R', 7)], { status: 'disconnected' }),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    expect(legalMoves(state, 1)).toEqual([])
  })
})

describe('a pending draw closes the window entirely', () => {
  /* A stacked +2/+4 has strict same-type answer rules of its own. Letting a jump-in
     interleave would make "strictly same type" mean nothing, so the seat on turn is
     left with its pending-draw moves and nobody else has anything to say. */
  const stacked = (over: Partial<GameState> = {}): GameState =>
    table({
      discardPile: [act('top', 'draw2', 'R')],
      pendingDraw: { amount: 2, kind: 'draw2' },
      seats: [
        seatOf(0, [num('a', 'R', 2), num('b', 'B', 3), num('c', 'B', 4)]),
        seatOf(1, [num('y', 'B', 6), num('y2', 'B', 5)]),
        /* Seat 2 holds the twin, and is off turn both before the debt is settled and
           after — seat 0 accepting it hands the turn to seat 1. */
        seatOf(2, [act('twin', 'draw2', 'R'), num('z', 'Y', 9)]),
      ],
      ...over,
    })

  it('offers no jump-in to a seat holding the twin of the card that stacked it', () => {
    expect(legalMoves(stacked(), 2)).toEqual([])
  })

  it('refuses the play if it is attempted anyway', () => {
    expect(applyMove(stacked(), 2, { type: 'play', cardId: cid('twin') })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('leaves the seat on turn its pending-draw moves, and only those', () => {
    // Seat 0 holds nothing of the kind, so accepting the debt is all there is.
    expect(legalMoves(stacked(), 0)).toEqual([{ type: 'acceptDraw' }])
  })

  it('opens again once the debt is settled', () => {
    const settled = apply(stacked(), 0, { type: 'acceptDraw' })
    expect(settled.pendingDraw).toBeNull()
    expect(settled.currentSeat).toBe(1)
    expect(legalMoves(settled, 2)).toEqual([{ type: 'play', cardId: cid('twin') }])
  })
})

describe('where the turn goes', () => {
  it('hands the turn to the seat after the jumper, and the seat between loses it', () => {
    const next = apply(table(), 1, { type: 'play', cardId: cid('twin') })
    // Seat 0's turn simply never happened, which is the point of the rule.
    expect(next.currentSeat).toBe(2)
    expect(ids(next, 1)).toEqual(['y', 'y2'])
    expect(next.discardPile.map((c) => c.id)).toEqual(['top', 'twin'])
    expect(next.currentColor).toBe('R')
  })

  it('follows the direction of play, not the seat order', () => {
    const next = apply(table({ direction: -1 }), 1, { type: 'play', cardId: cid('twin') })
    expect(next.currentSeat).toBe(0)
  })

  it('skips inactive seats on the way, without reindexing anybody', () => {
    const state = table({
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [num('twin', 'R', 7), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9)], { status: 'left' }),
        seatOf(3, [num('v', 'Y', 8)]),
      ],
    })
    expect(apply(state, 1, { type: 'play', cardId: cid('twin') }).currentSeat).toBe(3)
  })

  it('clears the jumper’s UNO flag, because the jump-in IS their turn', () => {
    const state = table({
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [num('twin', 'R', 7), num('y', 'B', 6), num('y2', 'B', 5)], { unoCalled: true }),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    expect(apply(state, 1, { type: 'play', cardId: cid('twin') }).seats[1]?.unoCalled).toBe(false)
  })
})

describe('the card’s own effect, applied from the jumper’s seat', () => {
  it('makes a jumped skip skip the seat after the jumper', () => {
    const state = table({
      discardPile: [act('top', 'skip', 'R')],
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [act('twin', 'skip', 'R'), num('y', 'B', 6), num('y2', 'B', 5)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    // Two steps from the jumper: seat 2 loses the turn it had just been handed.
    expect(apply(state, 1, { type: 'play', cardId: cid('twin') }).currentSeat).toBe(0)
  })

  it('makes a jumped reverse turn the table round from the jumper', () => {
    const state = table({
      discardPile: [act('top', 'reverse', 'R')],
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [act('twin', 'reverse', 'R'), num('y', 'B', 6), num('y2', 'B', 5)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    const next = apply(state, 1, { type: 'play', cardId: cid('twin') })
    expect(next.direction).toBe(-1)
    expect(next.currentSeat).toBe(0)
  })

  it('makes a jumped reverse act as a skip at two active seats, keeping the turn', () => {
    const state = table({
      discardPile: [act('top', 'reverse', 'R')],
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [act('twin', 'reverse', 'R'), num('y', 'B', 6), num('y2', 'B', 5)]),
      ],
    })
    const next = apply(state, 1, { type: 'play', cardId: cid('twin') })
    expect(next.direction).toBe(1)
    // The official two-player rule: it comes straight back to whoever played it.
    expect(next.currentSeat).toBe(1)
  })

  it('stacks a jumped draw2 against the seat after the jumper', () => {
    const state = table({
      discardPile: [act('top', 'draw2', 'R')],
      pendingDraw: null,
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [act('twin', 'draw2', 'R'), num('y', 'B', 6), num('y2', 'B', 5)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    const next = apply(state, 1, { type: 'play', cardId: cid('twin') })
    expect(next.pendingDraw).toEqual({ amount: 2, kind: 'draw2' })
    expect(next.currentSeat).toBe(2)
  })

  it('offers a jumped 7 its swap targets on a Seven-Zero table', () => {
    /* The card's effect is the card's effect, whoever's turn it was. Reusing the
       same move builder is what keeps the two options from having to know about
       each other. */
    const state = table({ rules: SEVEN_ZERO_JUMP })
    expect(legalMoves(state, 1)).toEqual([
      { type: 'play', cardId: cid('twin'), swapWith: 0 },
      { type: 'play', cardId: cid('twin'), swapWith: 2 },
    ])

    const next = apply(state, 1, { type: 'play', cardId: cid('twin'), swapWith: 2 })
    expect(ids(next, 1)).toEqual(['z', 'w'])
    expect(ids(next, 2)).toEqual(['y', 'y2'])
  })

  it('refuses a jumped 7 aimed at a seat the table never offered', () => {
    const state = table({ rules: SEVEN_ZERO_JUMP })
    expect(applyMove(state, 1, { type: 'play', cardId: cid('twin'), swapWith: 1 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })
})

describe('a jumper who lands on one card', () => {
  const twoLeft = (rules: TableRules, over: Partial<GameState> = {}): GameState =>
    table({
      rules,
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [num('twin', 'R', 7), num('y', 'B', 6)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
      ...over,
    })

  it('pays the automatic penalty, since a jumper cannot call UNO', () => {
    /* An off-turn seat is offered call-outs and jump-ins and nothing else, so there
       is no moment at which a jumper could declare. Landing on one card by jumping
       in is therefore an uncalled UNO, and costs what one always costs. */
    const next = apply(twoLeft(JUMP), 1, { type: 'play', cardId: cid('twin') })
    expect(handOf(next, 1)).toHaveLength(1 + UNO_PENALTY)
  })

  it('is not covered by a declaration made on an earlier turn', () => {
    // The stale flag is cleared by the jump-in itself, which is that seat's turn.
    const state = twoLeft(JUMP, {
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [num('twin', 'R', 7), num('y', 'B', 6)], { unoCalled: true }),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    expect(handOf(apply(state, 1, { type: 'play', cardId: cid('twin') }), 1)).toHaveLength(
      1 + UNO_PENALTY,
    )
  })

  it('becomes vulnerable instead, on a Liar table', () => {
    const next = apply(twoLeft(WATCHED), 1, { type: 'play', cardId: cid('twin') })
    expect(handOf(next, 1)).toHaveLength(1)
    expect(next.seats[1]?.vulnerable).toBe(true)
  })

  it('can then be called out by anybody else, including the seat it jumped over', () => {
    const jumped = apply(twoLeft(WATCHED), 1, { type: 'play', cardId: cid('twin') })
    expect(legalMoves(jumped, 0)).toEqual([{ type: 'callOut', target: 1 }])
    const called = apply(jumped, 0, { type: 'callOut', target: 1 })
    expect(handOf(called, 1)).toHaveLength(1 + UNO_PENALTY)
    expect(called.seats[1]?.vulnerable).toBe(false)
  })
})

describe('the Liar window and a jump-in', () => {
  it('closes the jumper’s own window, because its turn has just ended', () => {
    /* The window is bounded by the end of the accused seat's NEXT turn, and a
       jump-in is a turn. Escaping an accusation by jumping in is the same escape as
       calling UNO on your own next turn: it costs the seat a card to take. */
    const state = table({
      rules: WATCHED,
      seats: [
        seatOf(0, [num('a', 'R', 2)]),
        seatOf(1, [num('twin', 'R', 7), num('y', 'B', 6), num('y2', 'B', 5)], {
          vulnerable: true,
        }),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    const next = apply(state, 1, { type: 'play', cardId: cid('twin') })
    expect(next.seats[1]?.vulnerable).toBe(false)
    expect(legalMoves(next, 0)).toEqual([])
  })

  it('leaves the skipped seat’s window open, since its turn never happened', () => {
    const state = table({
      rules: WATCHED,
      currentSeat: 2,
      seats: [
        seatOf(0, [num('a', 'R', 2)], { vulnerable: true }),
        seatOf(1, [num('twin', 'R', 7), num('y', 'B', 6), num('y2', 'B', 5)]),
        seatOf(2, [num('z', 'Y', 9), num('w', 'Y', 8)]),
      ],
    })
    // Seat 2 was on turn and seat 0 was next; the jump-in takes that turn away.
    const next = apply(state, 1, { type: 'play', cardId: cid('twin') })
    expect(next.seats[0]?.vulnerable).toBe(true)
    expect(legalMoves(next, 1)).toEqual([{ type: 'callOut', target: 0 }])
  })
})

describe('a jumper who empties their hand', () => {
  it('wins the round there and then', () => {
    const state = table({
      seats: [
        seatOf(0, [num('a', 'R', 2), num('b', 'B', 3)]),
        seatOf(1, [num('twin', 'R', 7)]),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    const next = apply(state, 1, { type: 'play', cardId: cid('twin') })
    expect(next.phase).toBe('finished')
    expect(next.winner).toBe(1)
    expect(handOf(next, 1)).toHaveLength(0)
  })

  it('wins with its last card even while vulnerable', () => {
    const state = table({
      rules: WATCHED,
      seats: [
        seatOf(0, [num('a', 'R', 2), num('b', 'B', 3)]),
        seatOf(1, [num('twin', 'R', 7)], { vulnerable: true }),
        seatOf(2, [num('z', 'Y', 9)]),
      ],
    })
    const next = apply(state, 1, { type: 'play', cardId: cid('twin') })
    expect(next.winner).toBe(1)
  })
})

describe('the race, as it can actually happen', () => {
  /* Two seats cannot hold a jump-in against the same top — the twin of a card is in
     one place only. What can race is the same seat asking twice, and a jump-in
     arriving beside the play of the seat whose turn it was. The server applies
     whichever it sees first; the loser is refused. */

  it('refuses the second attempt at the same jump-in', () => {
    const first = apply(table(), 1, { type: 'play', cardId: cid('twin') })
    expect(applyMove(first, 1, { type: 'play', cardId: cid('twin') })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('leaves the skipped seat refused as off turn once the jump has landed', () => {
    const first = apply(table(), 1, { type: 'play', cardId: cid('twin') })
    /* Seat 0 was on turn and its move arrived second. Play has moved to seat 2, so
       what seat 0 offers now is a jump-in or nothing — and it holds no twin. */
    expect(legalMoves(first, 0)).toEqual([])
    expect(applyMove(first, 0, { type: 'play', cardId: cid('a') })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('accepts the play instead when it is the one that arrives first', () => {
    /* Anticlockwise, so the turn lands on seat 2 and seat 1 is still off turn and
       still a candidate jumper — except that the top is a red 2 now, and the red 7
       it was about to jump with is an ordinary card again. */
    const played = apply(table({ direction: -1 }), 0, { type: 'play', cardId: cid('a') })
    expect(played.currentSeat).toBe(2)
    expect(legalMoves(played, 1)).toEqual([])
  })
})
