import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { expectConservation } from './test-helpers.js'

const start = (names: string[], seed = 1) => {
  const r = initGame({ names, seed })
  if (!r.okay) throw new Error(r.error)
  return r.value
}

describe('initGame', () => {
  it('rejects fewer than two players', () => {
    expect(initGame({ names: ['Solo'], seed: 1 })).toEqual({
      okay: false,
      error: 'too_few_players',
    })
  })

  it('rejects more than four players', () => {
    expect(initGame({ names: ['a', 'b', 'c', 'd', 'e'], seed: 1 })).toEqual({
      okay: false,
      error: 'too_many_players',
    })
  })

  it('deals seven cards to every seat', () => {
    const state = start(['a', 'b', 'c', 'd'])
    for (const seat of state.seats) expect(seat.hand).toHaveLength(7)
  })

  it('conserves all 108 cards', () => {
    for (const count of [2, 3, 4]) {
      const names = ['a', 'b', 'c', 'd'].slice(0, count)
      expect(() => expectConservation(start(names))).not.toThrow()
    }
  })

  it('starts from a number card', () => {
    for (let seed = 0; seed < 200; seed++) {
      const state = start(['a', 'b'], seed)
      const top = state.discardPile[state.discardPile.length - 1]
      expect(top?.kind).toBe('number')
    }
  })

  it('sets currentColor to the starting card colour', () => {
    const state = start(['a', 'b'], 5)
    const top = state.discardPile[state.discardPile.length - 1]
    if (top?.kind !== 'number') throw new Error('expected a number card')
    expect(state.currentColor).toBe(top.color)
  })

  it('starts on seat 0, clockwise, with no debt', () => {
    const state = start(['a', 'b', 'c'])
    expect(state.currentSeat).toBe(0)
    expect(state.direction).toBe(1)
    expect(state.pendingDraw).toBeNull()
    expect(state.phase).toBe('playing')
    expect(state.winner).toBeNull()
  })

  it('marks every seat active with uno not called', () => {
    const state = start(['a', 'b', 'c'])
    expect(state.seats.map((s) => s.status)).toEqual(['active', 'active', 'active'])
    expect(state.seats.every((s) => !s.unoCalled)).toBe(true)
  })

  it('is reproducible from its seed', () => {
    expect(start(['a', 'b'], 4242)).toEqual(start(['a', 'b'], 4242))
  })

  it('produces different deals for different seeds', () => {
    expect(start(['a', 'b'], 1).seats[0]?.hand).not.toEqual(start(['a', 'b'], 2).seats[0]?.hand)
  })

  it('leaves exactly one card in the discard pile', () => {
    expect(start(['a', 'b', 'c', 'd']).discardPile).toHaveLength(1)
  })

  it('names the seats in the order given', () => {
    expect(start(['Ana', 'Ben', 'Cleo']).seats.map((s) => s.name)).toEqual(['Ana', 'Ben', 'Cleo'])
  })
})
