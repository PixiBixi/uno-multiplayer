export type Color = 'R' | 'G' | 'B' | 'Y'
export const COLORS: readonly Color[] = ['R', 'G', 'B', 'Y'] as const

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** Unique identifier for one card instance, e.g. `'7R#42'`. */
export type CardId = string & { readonly __brand: 'CardId' }

export type Card =
  | { id: CardId; kind: 'number'; color: Color; value: NumberValue }
  | { id: CardId; kind: 'skip' | 'reverse' | 'draw2'; color: Color }
  | { id: CardId; kind: 'wild' | 'wild4' }

export type WildCard = Extract<Card, { kind: 'wild' | 'wild4' }>
export type ColouredCard = Exclude<Card, WildCard>

/**
 * A type predicate rather than a boolean expression at each call site. Writing
 * `card.kind === 'wild' || card.kind === 'wild4'` inline does NOT narrow the
 * union in the branches that follow, so reading `card.color` afterwards fails to
 * compile — a trap this codebase walked into three separate times.
 */
export function isWild(card: Card): card is WildCard {
  return card.kind === 'wild' || card.kind === 'wild4'
}

export type SeatStatus = 'active' | 'disconnected' | 'left'

export type Seat = {
  index: number
  name: string
  status: SeatStatus
  hand: Card[]
  /** Reset to false at the start of each of this seat's turns. */
  unoCalled: boolean
  /**
   * Set when this seat reached one card without calling UNO, on a table that
   * opted into `liar`. Cleared when it calls UNO, when somebody calls it out, or
   * when its next turn ends.
   *
   * A field rather than a timer because the engine has no clock and `Room` is
   * deliberately timer-free. The window is measured in turns, which the engine
   * already counts.
   */
  vulnerable: boolean
}

/**
 * House rules a table may switch on, chosen by the host at creation. Off by
 * default: a group that wants plain UNO gets plain UNO.
 *
 * Lives here rather than beside `MatchPace` in the protocol, unlike the clock: a
 * time limit is a house setting the engine never sees, while these change what
 * the rules ARE, so the reducer has to read them — and the engine cannot import
 * the protocol.
 */
export type TableRules = {
  /** Forgetting UNO costs nothing unless somebody calls it out. */
  liar: boolean
  /**
   * A 7 swaps hands with a chosen player; a 0 passes every hand one seat along in
   * the current direction of play.
   */
  sevenZero: boolean
}

/** Plain UNO, which is what a host who picks nothing gets. */
export const DEFAULT_TABLE_RULES: TableRules = { liar: false, sevenZero: false }

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
  /** Which optional rules this table plays. Part of the state, so a game stays
   *  replayable from `(seed, rules, moves[])` alone. */
  rules: TableRules
}

/**
 * How a match ends. A one-round match is a single game, which is why there is no
 * separate 'single' variant: a mode meaning "stop after one round" is what a
 * one-round match already is.
 */
export type MatchGoal = { kind: 'points'; target: number } | { kind: 'rounds'; count: number }

/**
 * Match bookkeeping, deliberately outside GameState — a round has no business
 * knowing it belongs to a match, and the property tests that guard the round rules
 * should not have to carry match state through them.
 */
export type MatchState = {
  goal: MatchGoal
  /** Cumulative points, indexed by seat. */
  scores: number[]
  /** 1-based, and names the round about to be played. */
  round: number
}

export type Move =
  /**
   * `chosenColor` for a wild and `swapWith` for a 7 on a Seven-Zero table are the
   * same idea: a second decision the card demands, carried by the move rather than
   * asked for afterwards. `legalMoves` enumerates them, so neither is ever a
   * free-form value the reducer has to validate on its own.
   */
  | { type: 'play'; cardId: CardId; chosenColor?: Color; swapWith?: number }
  | { type: 'draw' }
  | { type: 'acceptDraw' }
  | { type: 'callUno' }
  /**
   * Accusing another seat of holding one card without having called UNO. The one
   * move that is legal off turn: an accusation you could only make on your own
   * turn would be useless.
   */
  | { type: 'callOut'; target: number }

export type RuleViolation = 'game_finished' | 'not_your_turn' | 'illegal_move' | 'seat_not_active'

export type Result<T, E> = { okay: true; value: T } | { okay: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ okay: true, value })
export const err = <E>(error: E): Result<never, E> => ({ okay: false, error })
