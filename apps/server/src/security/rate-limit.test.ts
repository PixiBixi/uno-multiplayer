import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit.js'

const controllableClock = () => {
  let current = 0
  return { now: () => current, advance: (ms: number) => (current += ms) }
}

describe('createRateLimiter', () => {
  it('allows up to capacity in a burst', () => {
    const clock = controllableClock()
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: clock.now })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('refills over time', () => {
    const clock = controllableClock()
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 2, now: clock.now })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    clock.advance(500)
    expect(limiter.allow('a')).toBe(true)
  })

  it('never refills above capacity', () => {
    const clock = controllableClock()
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 10, now: clock.now })
    clock.advance(60_000)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('tracks each key independently', () => {
    const clock = controllableClock()
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1, now: clock.now })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('b')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('releases a key on forget, so a disconnect does not leak memory', () => {
    const clock = controllableClock()
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 1, now: clock.now })
    limiter.allow('a')
    expect(limiter.size()).toBe(1)
    limiter.forget('a')
    expect(limiter.size()).toBe(0)
    expect(limiter.allow('a')).toBe(true)
  })

  it('tolerates a clock that does not move', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 5, now: () => 42 })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })
})
