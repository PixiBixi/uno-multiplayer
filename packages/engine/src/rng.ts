/**
 * mulberry32 sous forme purement fonctionnelle : l'état du générateur est une
 * valeur, jamais une variable cachée. Une partie est ainsi intégralement
 * rejouable depuis sa seule graine, ce qui rend les tests déterministes et
 * permet de reproduire un bug de production depuis les logs.
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
 * Fisher-Yates sur une copie : l'entrée n'est jamais modifiée. C'est un point
 * dur du moteur — un mélange en place sur un tableau de module amputerait le
 * paquet à chaque partie.
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
