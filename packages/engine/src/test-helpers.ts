import { DEFAULT_TABLE_RULES } from './types.js'
import type { Card, CardId, Color, GameState, NumberValue, Seat } from './types.js'

/** Every card present in the state, for the conservation invariant. */
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
  vulnerable: false,
  ...over,
})

/** Arbitrary, possibly invalid state, to exercise one rule in isolation. */
export const stateOf = (over: Partial<GameState> = {}): GameState => ({
  seats: [seatOf(0, []), seatOf(1, [])],
  currentSeat: 0,
  direction: 1,
  drawPile: [num('draw-1', 'G', 3), num('draw-2', 'B', 5)],
  discardPile: [num('top-1', 'R', 7)],
  currentColor: 'R',
  pendingDraw: null,
  drawnCard: null,
  rngState: 1,
  phase: 'playing',
  winner: null,
  rules: DEFAULT_TABLE_RULES,
  ...over,
})

export const handOf = (state: GameState, index: number): Card[] => state.seats[index]?.hand ?? []
