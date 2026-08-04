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

/**
 * Fisher-Yates on a copy: the input is never modified. This is a hard rule of
 * the engine — shuffling a module-level array in place would strip cards from
 * the deck on every game.
 */
export function shuffle<T>(input: readonly T[], state: number): { items: T[]; state: number } {
  const items = [...input]
  let s = state
  for (let i = items.length - 1; i > 0; i--) {
    const r = nextInt(s, i + 1)
    s = r.state
    const a = items[i]
    const b = items[r.value]
    if (a === undefined || b === undefined) continue
    items[i] = b
    items[r.value] = a
  }
  return { items, state: s }
}
