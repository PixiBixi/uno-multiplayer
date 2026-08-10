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

export type InitError = 'too_few_players' | 'too_many_players' | 'no_number_card'

const HAND_SIZE = 7
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

export function initGame(options: {
  names: string[]
  seed: number
  /** Omitted means plain UNO, which is what every table played before options existed. */
  rules?: TableRules
}): Result<GameState, InitError> {
  const { names, seed } = options
  const rules = options.rules ?? DEFAULT_TABLE_RULES
  if (names.length < MIN_PLAYERS) return err('too_few_players')
  if (names.length > MAX_PLAYERS) return err('too_many_players')

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
    currentSeat: 0,
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
