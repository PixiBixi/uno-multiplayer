export const ENGINE_VERSION = '0.1.0'

export { buildDeck, takeFromTop } from './deck.js'
export { MAX_PLAYERS, MIN_PLAYERS, initGame, type InitError } from './init.js'
export { UNO_PENALTY, applyMove } from './reducer.js'
export { activeCount, advance, isPlayable, legalMoves } from './rules.js'
export { nextInt, nextRandom, shuffle } from './rng.js'
export {
  COLORS,
  err,
  ok,
  type Card,
  type CardId,
  type Color,
  type GamePhase,
  type GameState,
  type Move,
  type NumberValue,
  type PendingDraw,
  type Result,
  type RuleViolation,
  type Seat,
  type SeatStatus,
} from './types.js'
