import { describe, expect, it } from 'vitest'
import { nextInt, nextRandom, shuffle } from './rng.js'

describe('nextRandom', () => {
  it('returns a value in [0, 1)', () => {
    let state = 42
    for (let i = 0; i < 1000; i++) {
      const r = nextRandom(state)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(1)
      state = r.state
    }
  })

  it('is deterministic for a given state', () => {
    expect(nextRandom(7)).toEqual(nextRandom(7))
  })

  it('advances the state', () => {
    expect(nextRandom(7).state).not.toBe(7)
  })
})

describe('nextInt', () => {
  it('stays within bounds', () => {
    let state = 1
    for (let i = 0; i < 1000; i++) {
      const r = nextInt(state, 5)
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(5)
      state = r.state
    }
  })
})

describe('shuffle', () => {
  it('does not mutate its input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5])
    expect(() => shuffle(input, 99)).not.toThrow()
    expect(input).toEqual([1, 2, 3, 4, 5])
  })

  it('preserves every element exactly once', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const { items } = shuffle(input, 12345)
    expect([...items].sort((a, b) => a - b)).toEqual(input)
  })

  it('produces the same order for the same seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], 777).items).toEqual(shuffle([1, 2, 3, 4, 5], 777).items)
  })

  it('produces a different order for a different seed', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1).items
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2).items
    expect(a).not.toEqual(b)
  })
})
