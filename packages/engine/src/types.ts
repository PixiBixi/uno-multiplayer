export type Color = 'R' | 'G' | 'B' | 'Y'
export const COLORS: readonly Color[] = ['R', 'G', 'B', 'Y'] as const

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Unique identifier for one card instance, e.g. `'7R#42'`. */
export type CardId = string & { readonly __brand: 'CardId' }

export type Card =
  | { id: CardId; kind: 'number'; color: Color; value: NumberValue }
  | { id: CardId; kind: 'skip' | 'reverse' | 'draw2'; color: Color }
  | { id: CardId; kind: 'wild' | 'wild4' }

export type SeatStatus = 'active' | 'disconnected' | 'left'

export type Seat = {
  index: number
  name: string
  status: SeatStatus
  hand: Card[]
  /** Reset to false at the start of each of this seat's turns. */
  unoCalled: boolean
}

/**
 * Outstanding draw debt. `kind` mirrors the card's own `kind`, which turns the
 * "strictly same type" rule into a plain equality check.
 */
export type PendingDraw = { amount: number; kind: 'draw2' | 'wild4' }

export type GamePhase = 'playing' | 'finished'

export type GameState = {
  seats: Seat[]
  currentSeat: number
  direction: 1 | -1
  /** The top of the draw pile is the LAST element. */
  drawPile: Card[]
  /** The top of the discard pile is the LAST element. */
  discardPile: Card[]
  /** Distinct from the top card's colour: after a wild the two diverge. */
  currentColor: Color
  pendingDraw: PendingDraw | null
  rngState: number
  phase: GamePhase
  winner: number | null
}

export type Move =
  | { type: 'play'; cardId: CardId; chosenColor?: Color }
  | { type: 'draw' }
  | { type: 'acceptDraw' }
  | { type: 'callUno' }

export type RuleViolation = 'game_finished' | 'not_your_turn' | 'illegal_move' | 'seat_not_active'

export type Result<T, E> = { okay: true; value: T } | { okay: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ okay: true, value })
export const err = <E>(error: E): Result<never, E> => ({ okay: false, error })
