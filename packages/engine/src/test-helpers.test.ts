import { describe, expect, it } from 'vitest'
import { handOf, num, seatOf, stateOf } from './test-helpers.js'

describe('stateOf', () => {
  it('produces a playable two-seat default', () => {
    const state = stateOf()
    expect(state.seats).toHaveLength(2)
    expect(state.currentSeat).toBe(0)
    expect(state.currentColor).toBe('R')
    expect(state.phase).toBe('playing')
  })

  it('accepts overrides', () => {
    const state = stateOf({ currentColor: 'B', direction: -1 })
    expect(state.currentColor).toBe('B')
    expect(state.direction).toBe(-1)
  })
})

describe('handOf', () => {
  it('returns the hand of the requested seat', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])] })
    expect(handOf(state, 0).map((c) => c.id)).toEqual(['a'])
  })

  it('returns an empty hand for an unknown seat', () => {
    expect(handOf(stateOf(), 9)).toEqual([])
  })
})
