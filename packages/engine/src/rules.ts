import { COLORS, type Card, type GameState, type Move } from './types.js'

export function isPlayable(card: Card, state: GameState): boolean {
  // Une dette en cours ferme tout : seul le même type peut renchérir, quelle
  // que soit la couleur en cours.
  if (state.pendingDraw !== null) return card.kind === state.pendingDraw.kind

  const top = state.discardPile[state.discardPile.length - 1]
  if (top === undefined) return true

  switch (card.kind) {
    case 'wild':
    case 'wild4':
      return true
    case 'number':
      return (
        card.color === state.currentColor || (top.kind === 'number' && card.value === top.value)
      )
    case 'skip':
    case 'reverse':
    case 'draw2':
      return card.color === state.currentColor || top.kind === card.kind
  }
}

export function activeCount(state: GameState): number {
  return state.seats.filter((s) => s.status === 'active').length
}

/**
 * Siège actif situé `steps` crans plus loin dans le sens courant. Les sièges
 * non actifs sont sautés sans réindexation — c'est ce qui permet à un joueur
 * déconnecté de garder sa place. Si aucun autre siège n'est actif, retourne
 * `from`.
 */
export function advance(state: GameState, from: number, steps: number): number {
  const size = state.seats.length
  if (activeCount(state) <= 1) return from
  let index = from
  for (let step = 0; step < steps; step++) {
    for (let guard = 0; guard < size; guard++) {
      index = (index + state.direction + size) % size
      if (state.seats[index]?.status === 'active') break
    }
  }
  return index
}

export function legalMoves(state: GameState, seatIndex: number): Move[] {
  if (state.phase !== 'playing') return []
  if (state.currentSeat !== seatIndex) return []
  const seat = state.seats[seatIndex]
  if (seat === undefined || seat.status !== 'active') return []

  const moves: Move[] = []
  for (const card of seat.hand) {
    if (!isPlayable(card, state)) continue
    if (card.kind === 'wild' || card.kind === 'wild4') {
      // Un coup par couleur : choisir une couleur devient choisir un coup, il
      // n'y a donc aucune saisie libre à valider côté serveur.
      for (const chosenColor of COLORS) moves.push({ type: 'play', cardId: card.id, chosenColor })
    } else {
      moves.push({ type: 'play', cardId: card.id })
    }
  }

  moves.push(state.pendingDraw !== null ? { type: 'acceptDraw' } : { type: 'draw' })
  if (!seat.unoCalled && seat.hand.length === 2) moves.push({ type: 'callUno' })
  return moves
}
