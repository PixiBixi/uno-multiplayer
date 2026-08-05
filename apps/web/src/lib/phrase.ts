/**
 * Second person needs a different verb form, and "1 cards" is the kind of detail
 * that makes an interface feel unfinished. Both live here so every surface reads
 * the same way.
 */

/** `You win` for your own seat, `Ana wins` for anybody else. */
export function winsPhrase(name: string, isYou: boolean): string {
  return isYou ? 'You win' : `${name} wins`
}

/**
 * `You are back` / `Ana is back`.
 *
 * These two are the only verbs in the log that need this. Every other line uses
 * a past tense — played, drew, called, forgot, lost, left — which reads the same
 * in the second and third person.
 */
export function isBackPhrase(name: string, isYou: boolean): string {
  return isYou ? 'You are back' : `${name} is back`
}

/** `1 card`, `3 cards`. */
export function cardCount(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`
}
