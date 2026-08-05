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

/** `1 point`, `77 points`. */
export function pointsCount(count: number): string {
  return count === 1 ? '1 point' : `${String(count)} points`
}

/** `Ana`, `Ana and Ben`, `Ana, Ben and Cleo`. */
export function listPhrase(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}

/**
 * How a match finishes. Several names means a tie, which is only reachable in
 * rounds mode — the points target can only ever be crossed by the seat that just
 * won a round.
 */
export function matchResultPhrase(names: string[], youWon: boolean): string {
  if (names.length === 0) return 'The match ends with no winner'
  if (names.length === 1) return youWon ? 'You win the match' : `${names[0] ?? ''} wins the match`
  return youWon
    ? `You tie the match with ${listPhrase(names.filter((n) => n !== 'You'))}`
    : `${listPhrase(names)} tie the match`
}
