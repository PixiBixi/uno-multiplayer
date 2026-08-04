export type Color = 'R' | 'G' | 'B' | 'Y'
export const COLORS: readonly Color[] = ['R', 'G', 'B', 'Y'] as const

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Identifiant unique d'une instance de carte, ex. `'7R#42'`. */
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
  /** Remis à false au début de chaque tour de ce siège. */
  unoCalled: boolean
}

/**
 * Dette de pioche en cours. `kind` reprend littéralement le `kind` de la carte,
 * ce qui fait de la règle « strictement même type » une simple égalité.
 */
export type PendingDraw = { amount: number; kind: 'draw2' | 'wild4' }

export type GamePhase = 'playing' | 'finished'

export type GameState = {
  seats: Seat[]
  currentSeat: number
  direction: 1 | -1
  /** Le dessus de la pioche est le DERNIER élément. */
  drawPile: Card[]
  /** Le dessus de la défausse est le DERNIER élément. */
  discardPile: Card[]
  /** Distinct de la couleur de la carte du dessus : après un joker, elle diverge. */
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
