import { nextRandom } from '../rng.js'

export type BotLevel = 'easy' | 'normal' | 'hard'

/** Own turn, an off-turn reaction (call-out, late UNO), or a jump-in. */
export type DelayKind = 'turn' | 'reaction' | 'jumpIn'

type Spread = { mean: number; sd: number }

const RANGES: Record<DelayKind, { min: number; max: number }> = {
  turn: { min: 800, max: 3000 },
  reaction: { min: 2000, max: 10000 },
  jumpIn: { min: 1000, max: 3000 },
}

/* One row per level, so a new level is one line. A null jumpIn means the level never
   jumps in: asking for its delay is a caller bug, not a delay to invent. */
const SPREADS: Record<BotLevel, Record<DelayKind, Spread | null>> = {
  easy: { turn: { mean: 2200, sd: 500 }, reaction: { mean: 7000, sd: 1500 }, jumpIn: null },
  normal: { turn: { mean: 1800, sd: 500 }, reaction: { mean: 5000, sd: 1500 }, jumpIn: null },
  hard: {
    turn: { mean: 1400, sd: 500 },
    reaction: { mean: 3000, sd: 1500 },
    jumpIn: { mean: 1800, sd: 500 },
  },
}

/** Whether this level ever jumps in: the timing table is the one place that says so. */
export function jumpsIn(level: BotLevel): boolean {
  return SPREADS[level].jumpIn !== null
}

/** A human-paced delay: Gaussian around the level's mean, clamped to the kind's range. */
export function sampleDelayMs(
  level: BotLevel,
  kind: DelayKind,
  rng: number,
): { ms: number; rng: number } {
  const spread = SPREADS[level][kind]
  if (spread === null) throw new RangeError(`level ${level} has no ${kind} delay`)
  const a = nextRandom(rng)
  const b = nextRandom(a.state)
  // Box-Muller; 1 - u keeps the log argument in (0, 1].
  const z = Math.sqrt(-2 * Math.log(1 - a.value)) * Math.cos(2 * Math.PI * b.value)
  const { min, max } = RANGES[kind]
  const ms = Math.round(Math.min(max, Math.max(min, spread.mean + z * spread.sd)))
  return { ms, rng: b.state }
}
