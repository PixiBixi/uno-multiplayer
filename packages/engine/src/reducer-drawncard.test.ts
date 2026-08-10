import { describe, expect, it } from 'vitest'
import { applyMove, skipDisconnectedTurn } from './reducer.js'
import { legalMoves } from './rules.js'
import { markSeatLeft, setSeatStatus } from './seats.js'
import { act, cid, handOf, num, seatOf, stateOf, wild } from './test-helpers.js'
import {
  DEFAULT_TABLE_RULES,
  type CardId,
  type GameState,
  type Move,
  type RuleViolation,
  type TableRules,
} from './types.js'

/*
 * Playing the card you just drew: the official rule, and the one table option that
 * is on by default.
 *
 * Every row of the spec's decision table has a test here. The property harness in
 * invariants.test.ts covers conservation and termination with the option on and off;
 * what only unit tests can say is WHICH moves are offered and where the turn lands,
 * and the Seven-Zero work is the precedent — swapping with a departed seat conserved
 * the deck perfectly well and only a unit test refused it.
 */

const ON: TableRules = { liar: false, sevenZero: false, jumpIn: false, playDrawnCard: true }
const OFF: TableRules = { liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false }
const WATCHED: TableRules = { liar: true, sevenZero: false, jumpIn: false, playDrawnCard: true }
const JUMPING: TableRules = { liar: false, sevenZero: false, jumpIn: true, playDrawnCard: true }
const SEVEN_ZERO: TableRules = {
  liar: false,
  sevenZero: true,
  jumpIn: false,
  playDrawnCard: true,
}

const apply = (state: GameState, seat: number, move: Move): GameState => {
  const r = applyMove(state, seat, move)
  if (!r.okay) throw new Error(`unexpected failure: ${r.error}`)
  return r.value
}

const failure = (state: GameState, seat: number, move: Move): RuleViolation => {
  const r = applyMove(state, seat, move)
  if (r.okay) throw new Error('expected a failure')
  return r.error
}

const playsOf = (state: GameState, seat: number): CardId[] =>
  legalMoves(state, seat)
    .filter((move) => move.type === 'play')
    .map((move) => move.cardId)

/**
 * A table where the seat on turn draws a known card. The last element of the draw
 * pile is what `drawInto` takes, so the test chooses it rather than hoping.
 */
const about = (drawn: ReturnType<typeof num>, rules: TableRules = ON, hand = [num('h', 'G', 3)]) =>
  stateOf({
    seats: [seatOf(0, hand), seatOf(1, [num('other', 'B', 4)])],
    drawPile: [num('buried', 'Y', 9), drawn],
    discardPile: [num('top', 'R', 7)],
    currentColor: 'R',
    rules,
  })

describe('the option itself', () => {
  it('is on by default, unlike the three house rules beside it', () => {
    expect(DEFAULT_TABLE_RULES.playDrawnCard).toBe(true)
  })

  it('leaves no drawn card on a freshly built state', () => {
    expect(stateOf().drawnCard).toBeNull()
  })
})

describe('drawing a playable card', () => {
  it('keeps the turn and records what was drawn', () => {
    const next = apply(about(num('d', 'R', 5)), 0, { type: 'draw' })
    expect(next.currentSeat).toBe(0)
    expect(next.drawnCard).toBe(cid('d'))
    expect(handOf(next, 0).map((c) => c.id)).toContain(cid('d'))
  })

  it('offers the drawn card and a pass, and nothing else from the hand', () => {
    /* The row that keeps this from becoming a different game. Offering the rest of
       the hand would make drawing a free extra turn. */
    const next = apply(about(num('d', 'R', 5), ON, [num('h', 'R', 3)]), 0, { type: 'draw' })
    expect(playsOf(next, 0)).toEqual([cid('d')])
    expect(legalMoves(next, 0).some((move) => move.type === 'pass')).toBe(true)
    // And not another draw: one voluntary draw per turn, which is the rule.
    expect(legalMoves(next, 0).some((move) => move.type === 'draw')).toBe(false)
  })

  it('refuses a play of any other card in the hand', () => {
    const next = apply(about(num('d', 'R', 5), ON, [num('h', 'R', 3)]), 0, { type: 'draw' })
    expect(failure(next, 0, { type: 'play', cardId: cid('h') })).toBe('illegal_move')
  })

  it('plays the drawn card, which ends the turn and clears the record of it', () => {
    const drawn = apply(about(num('d', 'R', 5)), 0, { type: 'draw' })
    const played = apply(drawn, 0, { type: 'play', cardId: cid('d') })
    expect(played.discardPile[played.discardPile.length - 1]?.id).toBe(cid('d'))
    expect(played.currentSeat).toBe(1)
    expect(played.drawnCard).toBeNull()
    expect(handOf(played, 0).map((c) => c.id)).not.toContain(cid('d'))
  })

  it('applies the drawn card’s own effect, exactly as any other play would', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, []), seatOf(2, [])],
      drawPile: [num('buried', 'Y', 9), act('skip', 'skip', 'R')],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    const played = apply(drawn, 0, { type: 'play', cardId: cid('skip') })
    // A drawn skip skips: seat 1 loses its turn.
    expect(played.currentSeat).toBe(2)
  })

  it('offers one play per colour for a drawn wild, like any other wild', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, [])],
      drawPile: [num('buried', 'Y', 9), wild('w', 'wild')],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    const colours = legalMoves(drawn, 0)
      .filter((move) => move.type === 'play')
      .map((move) => move.chosenColor)
    expect(colours).toEqual(['R', 'G', 'B', 'Y'])
    expect(apply(drawn, 0, { type: 'play', cardId: cid('w'), chosenColor: 'B' }).currentColor).toBe(
      'B',
    )
  })

  it('offers a drawn 7 its swap targets on a Seven-Zero table', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, [num('x', 'B', 4)]), seatOf(2, [])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 7)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: SEVEN_ZERO,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    const targets = legalMoves(drawn, 0)
      .filter((move) => move.type === 'play')
      .map((move) => move.swapWith)
    expect(targets).toEqual([1, 2])
  })
})

describe('drawing an unplayable card', () => {
  it('ends the turn at once, with no sub-state to dismiss', () => {
    /* A choice only appears when there is one. This is the row that keeps the option
       from costing a click on every draw. */
    const next = apply(about(num('d', 'G', 5)), 0, { type: 'draw' })
    expect(next.currentSeat).toBe(1)
    expect(next.drawnCard).toBeNull()
    expect(legalMoves(next, 0)).toEqual([])
  })

  it('ends the turn when the pile could not pay the draw at all', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, [])],
      drawPile: [],
      discardPile: [num('top', 'R', 7)],
      rules: ON,
    })
    const next = apply(state, 0, { type: 'draw' })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.currentSeat).toBe(1)
    expect(next.drawnCard).toBeNull()
  })
})

describe('a penalty is not a draw', () => {
  it('grants nothing after acceptDraw, even when what arrived is playable', () => {
    /* Taking a stacked +2 or +4 is a penalty. The official rules do not let you play
       out of one, and the cards arriving happen to include playable ones almost every
       time — which is exactly why this needs saying. */
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, [])],
      drawPile: [num('a', 'R', 5), num('b', 'R', 2)],
      discardPile: [act('top', 'draw2', 'R')],
      currentColor: 'R',
      pendingDraw: { amount: 2, kind: 'draw2' },
      rules: ON,
    })
    const next = apply(state, 0, { type: 'acceptDraw' })
    expect(handOf(next, 0)).toHaveLength(3)
    expect(next.drawnCard).toBeNull()
    expect(next.currentSeat).toBe(1)
  })
})

describe('passing', () => {
  it('ends the turn and clears the drawn card', () => {
    const drawn = apply(about(num('d', 'R', 5)), 0, { type: 'draw' })
    const passed = apply(drawn, 0, { type: 'pass' })
    expect(passed.currentSeat).toBe(1)
    expect(passed.drawnCard).toBeNull()
    // The card stays where it landed: passing declines to play it, not to hold it.
    expect(handOf(passed, 0).map((c) => c.id)).toContain(cid('d'))
  })

  it('is refused when there is nothing to pass on', () => {
    /* Drawing is what ends a turn without the option; passing has to be the thing
       that ends one WITH it, and nothing more. A seat that has not drawn still has to
       play or draw. */
    expect(failure(about(num('d', 'R', 5)), 0, { type: 'pass' })).toBe('illegal_move')
  })

  it('is refused off turn', () => {
    const drawn = apply(about(num('d', 'R', 5)), 0, { type: 'draw' })
    expect(failure(drawn, 1, { type: 'pass' })).toBe('not_your_turn')
  })

  it('closes the Liar window on the seat that passes, like any other turn ending', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)], { vulnerable: true }), seatOf(1, [])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: WATCHED,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    expect(apply(drawn, 0, { type: 'pass' }).seats[0]?.vulnerable).toBe(false)
  })
})

describe('calling UNO in the sub-state', () => {
  it('stays legal: the seat is on turn and has not played', () => {
    /* Drawing to two cards and then playing to one is an ordinary way to reach one
       card, so the declaration has to be available in between. */
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'R', 3)]), seatOf(1, [])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    expect(handOf(drawn, 0)).toHaveLength(2)
    expect(legalMoves(drawn, 0).some((move) => move.type === 'callUno')).toBe(true)

    const called = apply(drawn, 0, { type: 'callUno' })
    // And it neither ends the turn nor forgets what was drawn.
    expect(called.currentSeat).toBe(0)
    expect(called.drawnCard).toBe(cid('d'))
    expect(playsOf(called, 0)).toEqual([cid('d')])
  })
})

describe('no jump-in while the turn is unresolved', () => {
  it('offers an off-turn seat nothing, even holding the twin of the top card', () => {
    /* The same reasoning that forbids jumping a pending draw: the turn is still
       theirs and not yet resolved. */
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, [num('twin', 'R', 7)])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: JUMPING,
    })
    // Offered before the draw, which is what makes the refusal below mean something.
    expect(playsOf(state, 1)).toEqual([cid('twin')])

    const drawn = apply(state, 0, { type: 'draw' })
    expect(playsOf(drawn, 1)).toEqual([])
    expect(failure(drawn, 1, { type: 'play', cardId: cid('twin') })).toBe('illegal_move')
  })
})

describe('the drawn card is cleared on every turn change', () => {
  it('clears when the round ends on the drawn card itself', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [num('x', 'B', 4)])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    const played = apply(drawn, 0, { type: 'play', cardId: cid('d') })
    expect(played.phase).toBe('finished')
    expect(played.winner).toBe(0)
    expect(played.drawnCard).toBeNull()
  })

  it('clears when the seat holding the offer disconnects and its turn is taken over', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, []), seatOf(2, [])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    const gone = skipDisconnectedTurn(setSeatStatus(drawn, 0, 'disconnected'))
    expect(gone.currentSeat).toBe(1)
    expect(gone.drawnCard).toBeNull()
    expect(legalMoves(gone, 1).some((move) => move.type === 'draw')).toBe(true)
  })

  it('clears when the seat holding the offer leaves for good', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, []), seatOf(2, [])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    const left = markSeatLeft(drawn, 0)
    expect(left.currentSeat).toBe(1)
    expect(left.drawnCard).toBeNull()
  })

  it('clears when the round is abandoned for want of a second player', () => {
    /* A stale value on a state nobody can act on is still a lie about the state, and the
       round is over the moment a second seat cannot be found. */
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, [])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    const abandoned = markSeatLeft(drawn, 0)
    expect(abandoned.phase).toBe('finished')
    expect(abandoned.drawnCard).toBeNull()
  })

  it('clears when nobody at all is left to take the turn over', () => {
    /* The one path that never reaches `beginTurn`: `skipDisconnectedTurn` breaks out of its
       loop when the turn cannot move, which happens when no seat is active. Deleting the
       clearing there fails nothing else in the suite — every other route through that
       function ends in `beginTurn`, which clears the field for free. */
    const state = stateOf({
      seats: [seatOf(0, [num('h', 'G', 3)]), seatOf(1, []), seatOf(2, [])],
      drawPile: [num('buried', 'Y', 9), num('d', 'R', 5)],
      discardPile: [num('top', 'R', 7)],
      currentColor: 'R',
      rules: ON,
    })
    const drawn = apply(state, 0, { type: 'draw' })
    expect(drawn.drawnCard).toBe(cid('d'))

    let gone = setSeatStatus(drawn, 0, 'disconnected')
    gone = setSeatStatus(gone, 1, 'disconnected')
    gone = setSeatStatus(gone, 2, 'disconnected')
    const skipped = skipDisconnectedTurn(gone)

    // The turn could not move, and the offer went anyway.
    expect(skipped.currentSeat).toBe(0)
    expect(skipped.drawnCard).toBeNull()
  })

  it('leaves a fresh turn with an ordinary set of moves, never a stale offer', () => {
    const drawn = apply(about(num('d', 'R', 5)), 0, { type: 'draw' })
    const passed = apply(drawn, 0, { type: 'pass' })
    expect(passed.drawnCard).toBeNull()
    expect(legalMoves(passed, 1).some((move) => move.type === 'draw')).toBe(true)
    expect(legalMoves(passed, 1).some((move) => move.type === 'pass')).toBe(false)
  })
})

describe('with the option switched off', () => {
  it('ends the turn on a voluntary draw, exactly as the table used to', () => {
    const next = apply(about(num('d', 'R', 5), OFF), 0, { type: 'draw' })
    expect(next.currentSeat).toBe(1)
    expect(next.drawnCard).toBeNull()
  })

  it('never offers a pass', () => {
    const next = apply(about(num('d', 'R', 5), OFF), 0, { type: 'draw' })
    expect(legalMoves(next, 1).some((move) => move.type === 'pass')).toBe(false)
    expect(failure(next, 1, { type: 'pass' })).toBe('illegal_move')
  })
})
