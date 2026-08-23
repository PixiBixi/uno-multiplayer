import { describe, expect, it } from 'vitest'
import { UNO_PENALTY, applyMove } from './reducer.js'
import { legalMoves } from './rules.js'
import { cid, handOf, num, seatOf, stateOf } from './test-helpers.js'
import type { GameState, Move, TableRules } from './types.js'

/*
 * The Liar call-out. With `liar` on, forgetting to call UNO costs nothing unless
 * somebody notices: a seat that reaches one card uncalled becomes VULNERABLE, and
 * any other active seat may call it out - the one move in the game that is legal
 * when it is not your turn.
 */

const LIAR: TableRules = { liar: true, sevenZero: false, jumpIn: false, playDrawnCard: false }

const apply = (state: GameState, seat: number, move: Move): GameState => {
  const result = applyMove(state, seat, move)
  if (!result.okay) throw new Error(`unexpected failure: ${result.error}`)
  return result.value
}

/** Enough to pay a penalty out of, since stateOf's default pile holds only two. */
const pile = () => [num('d1', 'G', 1), num('d2', 'G', 2), num('d3', 'G', 3), num('d4', 'G', 4)]

describe('a plain table is untouched', () => {
  it('still penalises a forgotten UNO automatically', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, [])],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(handOf(next, 0)).toHaveLength(1 + UNO_PENALTY)
    expect(next.seats[0]?.vulnerable).toBe(false)
  })

  it('offers no call-out at all, so the option is genuinely opt-in', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3)], { vulnerable: true }), seatOf(1, [num('b', 'R', 5)])],
    })
    expect(legalMoves(state, 1)).toEqual([])
    /* Refused as illegal rather than as out of turn: a call-out is exempt from the
       turn check by design, so what rejects it here is that the table never offers
       the move at all. */
    expect(applyMove(state, 1, { type: 'callOut', target: 0 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })
})

describe('the window opens', () => {
  it('costs nothing on the spot and leaves the seat vulnerable instead', () => {
    const state = stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, [])],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(handOf(next, 0).map((c) => c.id)).toEqual(['b'])
    expect(next.seats[0]?.vulnerable).toBe(true)
  })

  it('does not open when UNO was called first', () => {
    const state = stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, [])],
      drawPile: pile(),
    })
    const called = apply(state, 0, { type: 'callUno' })
    const next = apply(called, 0, { type: 'play', cardId: cid('a') })
    expect(handOf(next, 0).map((c) => c.id)).toEqual(['b'])
    expect(next.seats[0]?.vulnerable).toBe(false)
  })

  it('does not open on the winning card', () => {
    const state = stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.phase).toBe('finished')
    expect(next.seats[0]?.vulnerable).toBe(false)
  })
})

describe('what legalMoves offers off turn', () => {
  const twoSeats = () =>
    stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3)], { vulnerable: true }), seatOf(1, [num('b', 'R', 5)])],
      currentSeat: 0,
      drawPile: pile(),
    })

  it('gives an off-turn seat the call-out and nothing else', () => {
    expect(legalMoves(twoSeats(), 1)).toEqual([{ type: 'callOut', target: 0 }])
  })

  it('still refuses an off-turn play, and says why', () => {
    expect(applyMove(twoSeats(), 1, { type: 'play', cardId: cid('b') })).toEqual({
      okay: false,
      error: 'not_your_turn',
    })
  })

  it('never lets a seat call itself out', () => {
    expect(legalMoves(twoSeats(), 0).some((move) => move.type === 'callOut')).toBe(false)
  })

  it('offers it to the seat on turn as well, alongside its own moves', () => {
    const state = stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3)], { vulnerable: true }), seatOf(1, [num('b', 'R', 5)])],
      currentSeat: 1,
      drawPile: pile(),
    })
    const moves = legalMoves(state, 1)
    expect(moves).toContainEqual({ type: 'callOut', target: 0 })
    expect(moves).toContainEqual({ type: 'play', cardId: cid('b') })
  })

  it('offers nothing against a seat that is not vulnerable', () => {
    const state = stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [num('b', 'R', 5)])],
      currentSeat: 0,
    })
    expect(legalMoves(state, 1)).toEqual([])
  })

  it('offers nothing against a seat that has left', () => {
    // Its hand went back to the pile; drawing two into it would hand the next
    // winner free points for cards nobody is holding.
    const state = stateOf({
      rules: LIAR,
      seats: [
        seatOf(0, [], { vulnerable: true, status: 'left' }),
        seatOf(1, [num('b', 'R', 5)]),
        seatOf(2, [num('c', 'R', 6)]),
      ],
      currentSeat: 1,
    })
    expect(legalMoves(state, 2).some((move) => move.type === 'callOut')).toBe(false)
  })

  it('offers nothing to a caller who is not active', () => {
    const state = stateOf({
      rules: LIAR,
      seats: [
        seatOf(0, [num('a', 'R', 3)], { vulnerable: true }),
        seatOf(1, [num('b', 'R', 5)], { status: 'disconnected' }),
        seatOf(2, [num('c', 'R', 6)]),
      ],
      currentSeat: 0,
    })
    expect(legalMoves(state, 1)).toEqual([])
  })
})

describe('calling it out', () => {
  const table = () =>
    stateOf({
      rules: LIAR,
      seats: [
        seatOf(0, [num('a', 'R', 3)], { vulnerable: true }),
        seatOf(1, [num('b', 'R', 5)]),
        seatOf(2, [num('c', 'R', 6)]),
      ],
      currentSeat: 0,
      drawPile: pile(),
    })

  it('costs the target the same two cards the automatic penalty did', () => {
    const next = apply(table(), 1, { type: 'callOut', target: 0 })
    expect(handOf(next, 0)).toHaveLength(1 + UNO_PENALTY)
  })

  it('costs the caller nothing', () => {
    const next = apply(table(), 1, { type: 'callOut', target: 0 })
    expect(handOf(next, 1).map((c) => c.id)).toEqual(['b'])
  })

  it('leaves whose turn it is alone, and never ends the round', () => {
    const next = apply(table(), 1, { type: 'callOut', target: 0 })
    expect(next.currentSeat).toBe(0)
    expect(next.direction).toBe(1)
    expect(next.phase).toBe('playing')
    expect(next.winner).toBeNull()
  })

  it('closes the window, so the same seat cannot be charged twice', () => {
    const next = apply(table(), 1, { type: 'callOut', target: 0 })
    expect(next.seats[0]?.vulnerable).toBe(false)
    expect(applyMove(next, 2, { type: 'callOut', target: 0 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('refuses a call-out against a seat that is not vulnerable', () => {
    // The wrong accusation cannot be made at all, which is why there is no
    // penalty for making one.
    expect(applyMove(table(), 0, { type: 'callOut', target: 1 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('refuses a call-out naming a seat other than the vulnerable one', () => {
    /* The target has to be compared, not just the move type: matching on type
       alone would accept this and charge the wrong player two cards. */
    const next = applyMove(table(), 1, { type: 'callOut', target: 2 })
    expect(next).toEqual({ okay: false, error: 'illegal_move' })
  })

  it('refuses a call-out against a seat that does not exist', () => {
    expect(applyMove(table(), 1, { type: 'callOut', target: 9 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('refuses one once the round is over', () => {
    const finished = { ...table(), phase: 'finished' as const, winner: 1 }
    expect(applyMove(finished, 1, { type: 'callOut', target: 0 })).toEqual({
      okay: false,
      error: 'game_finished',
    })
  })
})

describe('the window closes', () => {
  /** Seat 0 plays down to one uncalled, so it is vulnerable and seat 1 is on turn. */
  const opened = (): GameState => {
    const state = stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, [num('x', 'R', 9)])],
      drawPile: pile(),
    })
    return apply(state, 0, { type: 'play', cardId: cid('a') })
  }

  it('at the end of the vulnerable seat’s next turn, not before', () => {
    const afterOpen = opened()
    expect(afterOpen.seats[0]?.vulnerable).toBe(true)

    // Seat 1 hands the turn back without touching the window.
    const back = apply(afterOpen, 1, { type: 'draw' })
    expect(back.currentSeat).toBe(0)
    expect(back.seats[0]?.vulnerable).toBe(true)

    // Seat 0's own turn ends: the accusation is out of time.
    const closed = apply(back, 0, { type: 'draw' })
    expect(closed.seats[0]?.vulnerable).toBe(false)
    expect(applyMove(closed, 1, { type: 'callOut', target: 0 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('when the seat calls UNO on its own next turn, before playing', () => {
    const back = apply(opened(), 1, { type: 'draw' })
    expect(legalMoves(back, 0)).toContainEqual({ type: 'callUno' })

    const called = apply(back, 0, { type: 'callUno' })
    expect(called.seats[0]?.vulnerable).toBe(false)
    expect(applyMove(called, 1, { type: 'callOut', target: 0 })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
  })

  it('but a fresh forgetting re-opens it rather than being swallowed', () => {
    /* Already vulnerable, and plays down to one again on the turn that closes the
       old window. The close therefore has to happen BEFORE the new opening: the
       other order would leave a seat that forgot UNO immune to being called. */
    const state = stateOf({
      rules: LIAR,
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)], { vulnerable: true }), seatOf(1, [])],
      drawPile: pile(),
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.seats[0]?.vulnerable).toBe(true)
  })
})
