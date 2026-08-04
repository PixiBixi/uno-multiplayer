import { describe, expect, it } from 'vitest'
import { applyMove } from './reducer.js'
import { act, cid, handOf, num, seatOf, stateOf, wild } from './test-helpers.js'
import type { GameState, Move, RuleViolation } from './types.js'

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

describe('applyMove gate', () => {
  it('refuses to act on a finished game', () => {
    const state = stateOf({ phase: 'finished', winner: 1 })
    expect(failure(state, 0, { type: 'draw' })).toBe('game_finished')
  })

  it('refuses a seat whose turn it is not', () => {
    expect(failure(stateOf(), 1, { type: 'draw' })).toBe('not_your_turn')
  })

  it('refuses a non-active seat', () => {
    const state = stateOf({
      seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, [])],
    })
    expect(failure(state, 0, { type: 'draw' })).toBe('seat_not_active')
  })

  it('refuses a card that is not in hand', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])] })
    expect(failure(state, 0, { type: 'play', cardId: cid('ghost') })).toBe('illegal_move')
  })

  it('refuses an unplayable card held in hand', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'G', 3)]), seatOf(1, [])] })
    expect(failure(state, 0, { type: 'play', cardId: cid('a') })).toBe('illegal_move')
  })

  it('never mutates the state it is given', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])] })
    const before = structuredClone(state)
    apply(state, 0, { type: 'draw' })
    expect(state).toEqual(before)
  })
})

describe('callUno', () => {
  it('flags the seat and keeps the turn', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, [])],
    })
    const next = apply(state, 0, { type: 'callUno' })
    expect(next.seats[0]?.unoCalled).toBe(true)
    expect(next.currentSeat).toBe(0)
  })

  it('is refused with three cards in hand', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0), num('c', 'R', 7)]), seatOf(1, [])],
    })
    expect(failure(state, 0, { type: 'callUno' })).toBe('illegal_move')
  })
})

describe('draw', () => {
  it('adds one card to the hand and passes the turn', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, [])] })
    const next = apply(state, 0, { type: 'draw' })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.currentSeat).toBe(1)
    expect(next.drawPile).toHaveLength(1)
  })

  it('takes the topmost card of the pile', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, [])] })
    const top = state.drawPile[state.drawPile.length - 1]
    expect(handOf(apply(state, 0, { type: 'draw' }), 0)[0]).toEqual(top)
  })

  it('resets unoCalled on the seat that gains the turn', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [], { unoCalled: true })],
    })
    expect(apply(state, 0, { type: 'draw' }).seats[1]?.unoCalled).toBe(false)
  })

  it('recycles the discard pile when the draw pile is empty', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [],
      discardPile: [num('d1', 'R', 3), num('d2', 'G', 5), num('top', 'R', 7)],
    })
    const next = apply(state, 0, { type: 'draw' })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.discardPile.map((c) => c.id)).toEqual(['top'])
    expect(next.drawPile).toHaveLength(1)
  })

  it('caps the draw when nothing can be recycled', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [],
      discardPile: [num('top', 'R', 7)],
    })
    const next = apply(state, 0, { type: 'draw' })
    expect(handOf(next, 0)).toHaveLength(0)
    expect(next.currentSeat).toBe(1)
  })

  it('is not offered while a debt stands', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(failure(state, 0, { type: 'draw' })).toBe('illegal_move')
  })
})

describe('acceptDraw', () => {
  it('draws the whole debt, clears it and passes the turn', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [num('a', 'R', 3), num('b', 'G', 5), num('c', 'B', 7), num('d', 'Y', 0)],
      pendingDraw: { amount: 4, kind: 'wild4' },
    })
    const next = apply(state, 0, { type: 'acceptDraw' })
    expect(handOf(next, 0)).toHaveLength(4)
    expect(next.pendingDraw).toBeNull()
    expect(next.currentSeat).toBe(1)
  })

  it('caps at the cards available', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [])],
      drawPile: [num('a', 'R', 3)],
      discardPile: [num('top', 'R', 7)],
      pendingDraw: { amount: 6, kind: 'draw2' },
    })
    const next = apply(state, 0, { type: 'acceptDraw' })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.pendingDraw).toBeNull()
  })
})

describe('stacking', () => {
  it('raises a +2 debt with another +2 and passes it on', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'draw2', 'Y'), num('x', 'R', 3)]), seatOf(1, [])],
      pendingDraw: { amount: 2, kind: 'draw2' },
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.pendingDraw).toEqual({ amount: 4, kind: 'draw2' })
    expect(next.currentSeat).toBe(1)
  })

  it('raises a +4 debt with another +4', () => {
    const state = stateOf({
      seats: [seatOf(0, [wild('a', 'wild4'), num('x', 'R', 3)]), seatOf(1, [])],
      pendingDraw: { amount: 4, kind: 'wild4' },
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a'), chosenColor: 'B' })
    expect(next.pendingDraw).toEqual({ amount: 8, kind: 'wild4' })
    expect(next.currentColor).toBe('B')
  })

  it('refuses a +4 on a +2 debt', () => {
    const state = stateOf({
      seats: [seatOf(0, [wild('a', 'wild4')]), seatOf(1, [])],
      pendingDraw: { amount: 2, kind: 'draw2' },
    })
    expect(failure(state, 0, { type: 'play', cardId: cid('a'), chosenColor: 'B' })).toBe(
      'illegal_move',
    )
  })

  it('refuses a +2 on a +4 debt', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'draw2', 'R')]), seatOf(1, [])],
      pendingDraw: { amount: 4, kind: 'wild4' },
    })
    expect(failure(state, 0, { type: 'play', cardId: cid('a') })).toBe('illegal_move')
  })

  it('opens a debt from a fresh +2', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'draw2', 'R'), num('x', 'R', 3)]), seatOf(1, [])],
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.pendingDraw).toEqual({ amount: 2, kind: 'draw2' })
  })
})
