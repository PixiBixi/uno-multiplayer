import { describe, expect, it } from 'vitest'
import { initGame } from '../init.js'
import { num, stateOf } from '../test-helpers.js'
import type { GameState, Move } from '../types.js'
import { EMPTY_HISTORY, botViewFor, recordMove, unseenCards } from './view.js'

function dealt(): GameState {
  const init = initGame({ names: ['a', 'b', 'c', 'd'], seed: 11 })
  if (!init.okay) throw new Error(init.error)
  return init.value
}

describe('botViewFor', () => {
  it('botViewFor never carries another hand', () => {
    const state = dealt()
    const json = JSON.stringify(botViewFor(state, 0, EMPTY_HISTORY))
    const hidden = [...state.seats.slice(1).flatMap((s) => s.hand), ...state.drawPile]
    expect(hidden.length).toBeGreaterThan(0)
    // Quoted so '7R#4' is not found inside '7R#42'.
    for (const card of hidden) expect(json).not.toContain(`"${card.id}"`)
    for (const card of state.seats[0]?.hand ?? []) expect(json).toContain(`"${card.id}"`)
  })

  it('carries the public state and the seat counts', () => {
    const state = dealt()
    const view = botViewFor(state, 2, EMPTY_HISTORY)
    expect(view.seat).toBe(2)
    expect(view.hand).toEqual(state.seats[2]?.hand)
    expect(view.discardPile).toEqual(state.discardPile)
    expect(view.drawPileCount).toBe(state.drawPile.length)
    expect(view.seats.map((s) => s.handCount)).toEqual([7, 7, 7, 7])
    expect(view.history).toBe(EMPTY_HISTORY)
  })
})

describe('recordMove', () => {
  it('recordMove notes a voluntary draw with the colour in play', () => {
    const before = stateOf({ currentColor: 'R', pendingDraw: null })
    const after = recordMove(EMPTY_HISTORY, before, 2, { type: 'draw' })
    expect(after.drawnOn).toEqual([{ seat: 2, color: 'R' }])
    expect(EMPTY_HISTORY.drawnOn).toEqual([])
  })

  it('recordMove ignores acceptDraw and plays', () => {
    const before = stateOf({ currentColor: 'R', pendingDraw: null })
    const moves: Move[] = [{ type: 'acceptDraw' }, { type: 'play', cardId: num('x', 'R', 1).id }]
    for (const move of moves)
      expect(recordMove(EMPTY_HISTORY, before, 2, move)).toEqual(EMPTY_HISTORY)
  })

  it('ignores a draw that pays a pending debt', () => {
    const before = stateOf({ currentColor: 'R', pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(recordMove(EMPTY_HISTORY, before, 2, { type: 'draw' })).toEqual(EMPTY_HISTORY)
  })
})

describe('unseenCards', () => {
  it('unseenCards is the deck minus hand minus discard', () => {
    const view = botViewFor(dealt(), 1, EMPTY_HISTORY)
    const unseen = unseenCards(view)
    expect(unseen).toHaveLength(108 - view.hand.length - view.discardPile.length)
    const seen = new Set([...view.hand, ...view.discardPile].map((c) => c.id))
    expect(unseen.filter((c) => seen.has(c.id))).toEqual([])
  })
})
