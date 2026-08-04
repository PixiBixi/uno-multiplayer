import { COLORS, type Card, type GameState, type Move } from './types.js'

export function isPlayable(card: Card, state: GameState): boolean {
  // An outstanding debt closes everything down: only the same type can raise,
  // whatever the current colour is.
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
 * The active seat `steps` places further along in the current direction.
 * Inactive seats are skipped without reindexing — that is what lets a
 * disconnected player keep their place. Returns `from` when no other seat is
 * active.
 */
export function advance(state: GameState, from: number, steps: number): number {
  const size = state.seats.length
  // Only bail when nobody at all is active. With a single active seat, landing
  // on it is legitimate and terminates — the inner loop is bounded by `size`.
  if (activeCount(state) === 0) return from
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
      // One move per colour: picking a colour becomes picking a move, so there
      // is no free-form input for the server to validate.
      for (const chosenColor of COLORS) moves.push({ type: 'play', cardId: card.id, chosenColor })
    } else {
      moves.push({ type: 'play', cardId: card.id })
    }
  }

  moves.push(state.pendingDraw !== null ? { type: 'acceptDraw' } : { type: 'draw' })
  if (!seat.unoCalled && seat.hand.length === 2) moves.push({ type: 'callUno' })
  return moves
}
