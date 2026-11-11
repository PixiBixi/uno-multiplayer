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

  it('drops keys whose bucket has refilled, so keys nobody forgets cannot pile up', () => {
    const clock = controllableClock()
    // Full again 2 s after its last use.
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: clock.now })
    for (let i = 0; i < 1000; i++) limiter.allow(`ip-${i}`)
    expect(limiter.size()).toBe(1000)
    clock.advance(2_000)
    limiter.allow('late')
    expect(limiter.size()).toBe(1)
  })

  it('keeps a key whose bucket is still refilling, so a sweep never resets a limit', () => {
    const clock = controllableClock()
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 1, now: clock.now })
    limiter.allow('a')
    limiter.allow('a')
    clock.advance(1_999)
    limiter.allow('b')
    expect(limiter.size()).toBe(2)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('tolerates a clock that does not move', () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 5, now: () => 42 })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })
})
