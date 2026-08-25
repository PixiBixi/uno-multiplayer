import { buildDeck, takeFromTop } from './deck.js'
import { shuffle } from './rng.js'
import {
  DEFAULT_TABLE_RULES,
  err,
  ok,
  type Card,
  type GameState,
  type Result,
  type Seat,
  type TableRules,
} from './types.js'

export type InitError = 'too_few_players' | 'too_many_players' | 'no_number_card' | 'no_such_seat'

const HAND_SIZE = 7
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

export function initGame(options: {
  names: string[]
  seed: number
  /** Omitted means plain UNO, which is what every table played before options existed. */
  rules?: TableRules
  /**
   * Who plays first. Omitted means seat 0, which is what every deal did unconditionally
   * and is the bug that made this a parameter: seat 0 is whoever created the table, so
   * the host opened every round of every match.
   *
   * A seat and not a policy. The engine has no idea what a round number is, and rotating
   * the deal is a decision about a match rather than about a game - so the caller owns
   * it, and this stays the one place that says whether the seat is a real one.
   */
  firstSeat?: number
}): Result<GameState, InitError> {
  const { names, seed } = options
  const rules = options.rules ?? DEFAULT_TABLE_RULES
  if (names.length < MIN_PLAYERS) return err('too_few_players')
  if (names.length > MAX_PLAYERS) return err('too_many_players')

  /* Refused rather than clamped. A seat outside the table leaves `currentSeat` pointing at
     nothing, and `legalMoves` returns [] for a seat that does not exist - so the round
     would deal and then sit there with nobody able to move and no clock able to force
     one. A caller that computed the wrong seat should hear about it. */
  const firstSeat = options.firstSeat ?? 0
  if (!Number.isInteger(firstSeat) || firstSeat < 0 || firstSeat >= names.length) {
    return err('no_such_seat')
  }

  const shuffled = shuffle(buildDeck(), seed)
  let pile: Card[] = shuffled.items
  const seats: Seat[] = []

  for (const [index, name] of names.entries()) {
    const dealt = takeFromTop(pile, HAND_SIZE)
    pile = dealt.rest
    seats.push({
      index,
      name,
      status: 'active',
      hand: dealt.taken,
      unoCalled: false,
      vulnerable: false,
    })
  }

  // The starting card is the first number card from the top. Deterministic,
  // with no unbounded loop and no extra draw: action cards encountered before
  // it stay where they are in the pile.
  let startIndex = -1
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i]?.kind === 'number') {
      startIndex = i
      break
    }
  }
  const startingCard = pile[startIndex]
  if (startingCard === undefined || startingCard.kind !== 'number') {
    // Unreachable: 76 number cards against at most 28 dealt.
    return err('no_number_card')
  }
  const drawPile = [...pile.slice(0, startIndex), ...pile.slice(startIndex + 1)]

  return ok({
    seats,
    currentSeat: firstSeat,
    direction: 1,
    drawPile,
    discardPile: [startingCard],
    currentColor: startingCard.color,
    pendingDraw: null,
    drawnCard: null,
    rngState: shuffled.state,
    phase: 'playing',
    winner: null,
    rules,
  })
}
