import type { Card, GameState, MatchGoal, MatchState } from './types.js'

/**
 * Official Mattel scoring. Kept here rather than in the client that first needed
 * it: it is a rule, and a second copy of a scoring table is a second thing to get
 * wrong.
 */
export function cardPoints(card: Card): number {
  switch (card.kind) {
    case 'number':
      return card.value
    case 'skip':
    case 'reverse':
    case 'draw2':
      return 20
    case 'wild':
    case 'wild4':
      return 50
  }
}

export function startMatch(goal: MatchGoal, seatCount: number): MatchState {
  return { goal, scores: Array.from({ length: seatCount }, () => 0), round: 1 }
}

/**
 * What each seat earns for a finished round: everything left in the other hands
 * goes to the winner, and nothing goes to anybody else.
 *
 * A round with no winner awards nothing. That happens when too few players remain
 * to continue, and there is no official rule for scoring a round nobody finished —
 * so this invents none.
 *
 * A seat that left still has its remaining cards counted. They are out of play
 * either way, and the winner earned them by going out first.
 */
export function roundPoints(game: GameState): number[] {
  const zeros = game.seats.map(() => 0)
  if (game.winner === null) return zeros

  const total = game.seats
    .filter((seat) => seat.index !== game.winner)
    .flatMap((seat) => seat.hand)
    .reduce((sum, card) => sum + cardPoints(card), 0)

  return zeros.map((_, index) => (index === game.winner ? total : 0))
}

/** Returns a new match; the one passed in is left alone. */
export function applyRound(match: MatchState, game: GameState): MatchState {
  const awarded = roundPoints(game)
  return {
    goal: match.goal,
    scores: match.scores.map((score, seat) => score + (awarded[seat] ?? 0)),
    round: match.round + 1,
  }
}

/**
 * Every seat holding the winning total, or `null` while the match continues.
 *
 * An array in both modes even though `points` can only ever produce one winner —
 * only the round winner scores, so only one seat can cross the target in a given
 * round. One shape for both modes beats a union the callers must narrow.
 */
export function matchWinners(match: MatchState): number[] | null {
  const best = Math.max(...match.scores)

  if (match.goal.kind === 'points') {
    if (best < match.goal.target) return null
    return leadersOn(match.scores, best)
  }

  // `round` is the round about to be played, so the match is over once it would
  // exceed the count.
  if (match.round <= match.goal.count) return null
  return leadersOn(match.scores, best)
}

function leadersOn(scores: number[], best: number): number[] {
  return scores.flatMap((score, seat) => (score === best ? [seat] : []))
}
