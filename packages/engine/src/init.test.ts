import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { expectConservation } from './test-helpers.js'

const start = (names: string[], seed = 1) => {
  const r = initGame({ names, seed })
  if (!r.okay) throw new Error(r.error)
  return r.value
}

const ok = (result: ReturnType<typeof initGame>) => {
  if (!result.okay) throw new Error(result.error)
  return result.value
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

describe('who starts', () => {
  /* It was seat 0, hard-coded, on every deal of every match - and seat 0 is whoever
     created the table. Measured before the fix: 5000 deals out of 5000. The engine has no
     idea what a round number is, so it takes the seat and the caller owns the policy. */
  it('starts on seat 0 when nobody says otherwise', () => {
    const game = ok(initGame({ names: ['a', 'b', 'c'], seed: 1 }))
    expect(game.currentSeat).toBe(0)
  })

  it('starts wherever it is told to', () => {
    for (const firstSeat of [0, 1, 2]) {
      const game = ok(initGame({ names: ['a', 'b', 'c'], seed: 1, firstSeat }))
      expect(game.currentSeat).toBe(firstSeat)
    }
  })

  /* A seat outside the table would leave `currentSeat` pointing at nothing: `legalMoves`
     returns [] for a seat that does not exist, so the round would deal and then sit there
     with nobody able to move and no clock able to force one. */
  it('refuses a seat that is not at the table', () => {
    for (const firstSeat of [-1, 3, 1.5, Number.NaN]) {
      expect(initGame({ names: ['a', 'b', 'c'], seed: 1, firstSeat }).okay, String(firstSeat)).toBe(
        false,
      )
    }
  })

  it('deals the same cards whoever starts, so the seat is not a second shuffle', () => {
    const first = ok(initGame({ names: ['a', 'b', 'c'], seed: 7, firstSeat: 0 }))
    const second = ok(initGame({ names: ['a', 'b', 'c'], seed: 7, firstSeat: 2 }))
    expect(second.seats.map((seat) => seat.hand)).toEqual(first.seats.map((seat) => seat.hand))
    expect(second.discardPile).toEqual(first.discardPile)
  })
})
