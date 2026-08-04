import type { Card, CardId, Color, GameState, NumberValue, Seat } from './types.js'

/** Toutes les cartes présentes dans l'état, pour l'invariant de conservation. */
export function allCards(state: GameState): Card[] {
  return [...state.seats.flatMap((s) => s.hand), ...state.drawPile, ...state.discardPile]
}

export function expectConservation(state: GameState): void {
  const cards = allCards(state)
  if (cards.length !== 108) {
    throw new Error(`expected 108 cards, found ${cards.length}`)
  }
  const ids = new Set(cards.map((c) => c.id))
  if (ids.size !== 108) {
    throw new Error(`expected 108 distinct ids, found ${ids.size}`)
  }
}

export const cid = (s: string): CardId => s as CardId

export const num = (id: string, color: Color, value: NumberValue): Card => ({
  id: cid(id),
  kind: 'number',
  color,
  value,
})

export const act = (id: string, kind: 'skip' | 'reverse' | 'draw2', color: Color): Card => ({
  id: cid(id),
  kind,
  color,
})

export const wild = (id: string, kind: 'wild' | 'wild4'): Card => ({ id: cid(id), kind })

export const seatOf = (index: number, hand: Card[], over: Partial<Seat> = {}): Seat => ({
  index,
  name: `p${index}`,
  status: 'active',
  hand,
  unoCalled: false,
  ...over,
})

/** État arbitraire, éventuellement invalide, pour tester une règle isolément. */
export const stateOf = (over: Partial<GameState> = {}): GameState => ({
  seats: [seatOf(0, []), seatOf(1, [])],
  currentSeat: 0,
  direction: 1,
  drawPile: [num('draw-1', 'G', 3), num('draw-2', 'B', 5)],
  discardPile: [num('top-1', 'R', 7)],
  currentColor: 'R',
  pendingDraw: null,
  rngState: 1,
  phase: 'playing',
  winner: null,
  ...over,
})

export const handOf = (state: GameState, index: number): Card[] => state.seats[index]?.hand ?? []
