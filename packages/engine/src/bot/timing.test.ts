import { describe, expect, it } from 'vitest'
import { sampleDelayMs, type BotLevel, type DelayKind } from './timing.js'

const BOUNDS: Record<DelayKind, [number, number]> = {
  turn: [800, 3000],
  reaction: [2000, 10000],
  jumpIn: [1000, 3000],
}
const LEVELS: BotLevel[] = ['easy', 'normal', 'hard']

function samples(level: BotLevel, kind: DelayKind, n: number): number[] {
  const out: number[] = []
  let rng = 12345
  for (let i = 0; i < n; i++) {
    const s = sampleDelayMs(level, kind, rng)
    out.push(s.ms)
    rng = s.rng
  }
  return out
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

describe('sampleDelayMs', () => {
  it('stays inside each range', () => {
    for (const level of LEVELS) {
      for (const kind of ['turn', 'reaction', 'jumpIn'] as const) {
        if (kind === 'jumpIn' && level !== 'hard') continue
        const [min, max] = BOUNDS[kind]
        for (const ms of samples(level, kind, 10_000)) {
          expect(ms).toBeGreaterThanOrEqual(min)
          expect(ms).toBeLessThanOrEqual(max)
        }
      }
    }
  })

  it('means are ordered by level', () => {
    const easy = mean(samples('easy', 'reaction', 10_000))
    const normal = mean(samples('normal', 'reaction', 10_000))
    const hard = mean(samples('hard', 'reaction', 10_000))
    expect(easy).toBeGreaterThan(normal)
    expect(normal).toBeGreaterThan(hard)
    expect(Math.abs(easy - 7000)).toBeLessThan(300)
    expect(Math.abs(normal - 5000)).toBeLessThan(300)
    expect(Math.abs(hard - 3000)).toBeLessThan(300)
  })

  it('jumpIn is refused below hard', () => {
    expect(() => sampleDelayMs('normal', 'jumpIn', 1)).toThrow(RangeError)
    expect(() => sampleDelayMs('easy', 'jumpIn', 1)).toThrow(RangeError)
  })

  it('is deterministic', () => {
    const a = sampleDelayMs('hard', 'turn', 99)
    expect(sampleDelayMs('hard', 'turn', 99)).toEqual(a)
    expect(a.rng).not.toBe(99)
  })
})
