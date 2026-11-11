/**
 * mulberry32 in purely functional form: the generator state is a value, never a
 * hidden variable. A game is therefore fully replayable from its seed alone,
 * which makes tests deterministic and lets a production bug be reproduced from
 * the logs.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0
  let r = next
  r = Math.imul(r ^ (r >>> 15), r | 1)
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296
  return { value, state: next }
}

export function nextInt(state: number, maxExclusive: number): { value: number; state: number } {
  const r = nextRandom(state)
  return { value: Math.floor(r.value * maxExclusive), state: r.state }
}

function nextDeckInt(state: DeckState, maxExclusive: number): { value: number; state: DeckState } {
  const r = nextDeckRandom(state)
  return { value: Math.floor(r.value * maxExclusive), state: r.state }
}

/**
 * The deck's stream: sfc32, four 32-bit words. mulberry32 above keeps the bots and
 * timings; the deck needs a state too wide to enumerate from a player's own hand,
 * which a 32-bit one is (2^32 shuffles is minutes of brute force).
 */
export type DeckState = readonly [number, number, number, number]

/** 128 bits from the server's CSPRNG in play, a plain number in tests and replays. */
export type DeckSeed = number | DeckState

export function nextDeckRandom(state: DeckState): { value: number; state: DeckState } {
  let [a, b, c, d] = state
  let t = (a + b) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  d = (d + 1) | 0
  t = (t + d) | 0
  c = (c + t) | 0
  return { value: (t >>> 0) / 4294967296, state: [a, b, c, d] }
}

/** Expands a numeric seed with splitmix32, then runs sfc32's recommended warm-up. */
export function deckState(seed: DeckSeed): DeckState {
  let state: DeckState
  if (typeof seed === 'number') {
    let s = seed | 0
    const words: number[] = []
    for (let i = 0; i < 4; i++) {
      s = (s + 0x9e3779b9) | 0
      let z = s
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
      words.push((z ^ (z >>> 16)) | 0)
    }
    state = [words[0] ?? 0, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0]
  } else {
    state = [seed[0] | 0, seed[1] | 0, seed[2] | 0, seed[3] | 0]
  }
  for (let i = 0; i < 12; i++) state = nextDeckRandom(state).state
  return state
}

/**
 * Fisher-Yates on a copy: the input is never modified. This is a hard rule of
 * the engine - shuffling a module-level array in place would strip cards from
 * the deck on every game.
 */
export function shuffle<T>(
  input: readonly T[],
  state: DeckState,
): { items: T[]; state: DeckState } {
  const items = [...input]
  let s = state
  for (let i = items.length - 1; i > 0; i--) {
    const r = nextDeckInt(s, i + 1)
    s = r.state
    const a = items[i]
    const b = items[r.value]
    if (a === undefined || b === undefined) continue
    items[i] = b
    items[r.value] = a
  }
  return { items, state: s }
}
