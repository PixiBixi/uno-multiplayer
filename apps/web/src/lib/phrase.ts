/**
 * Second person needs a different verb form, and "1 cards" is the kind of detail
 * that makes an interface feel unfinished. Both live here so every surface reads
 * the same way.
 */

/** `You win` for your own seat, `Ana wins` for anybody else. */
export function winsPhrase(name: string, isYou: boolean): string {
  return isYou ? 'You win' : `${name} wins`
}

/** `1 card`, `3 cards`. */
export function cardCount(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`
}
