import { buildDeck, takeFromTop } from './deck.js'
import { shuffle } from './rng.js'
import { err, ok, type Card, type GameState, type Result, type Seat } from './types.js'

export type InitError = 'too_few_players' | 'too_many_players' | 'no_number_card'

const HAND_SIZE = 7
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4

export function initGame(options: { names: string[]; seed: number }): Result<GameState, InitError> {
  const { names, seed } = options
  if (names.length < MIN_PLAYERS) return err('too_few_players')
  if (names.length > MAX_PLAYERS) return err('too_many_players')

  const shuffled = shuffle(buildDeck(), seed)
  let pile: Card[] = shuffled.items
  const seats: Seat[] = []

  for (const [index, name] of names.entries()) {
    const dealt = takeFromTop(pile, HAND_SIZE)
    pile = dealt.rest
    seats.push({ index, name, status: 'active', hand: dealt.taken, unoCalled: false })
  }

  // La carte de départ est la première carte numérique en partant du dessus.
  // Déterministe, sans boucle non bornée ni tirage supplémentaire : les cartes
  // action rencontrées avant elle restent en place dans la pioche.
  let startIndex = -1
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i]?.kind === 'number') {
      startIndex = i
      break
    }
  }
  const startingCard = pile[startIndex]
  if (startingCard === undefined || startingCard.kind !== 'number') {
    // Inatteignable : 76 cartes numériques pour au plus 28 distribuées.
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
    rngState: shuffled.state,
    phase: 'playing',
    winner: null,
  })
}
