export const ENGINE_VERSION = '0.1.0'

export { buildDeck, takeFromTop } from './deck.js'
export { MAX_PLAYERS, MIN_PLAYERS, initGame, type InitError } from './init.js'
export { UNO_PENALTY, applyMove, skipDisconnectedTurn } from './reducer.js'
export { activeCount, advance, isPlayable, legalMoves } from './rules.js'
export { applyRound, cardPoints, matchWinners, roundPoints, startMatch } from './match.js'
export { markSeatLeft, setSeatStatus } from './seats.js'
export { nextInt, nextRandom, shuffle } from './rng.js'
export {
  COLORS,
  err,
  isWild,
  ok,
  type Card,
  type CardId,
  type Color,
  type ColouredCard,
  type GamePhase,
  type GameState,
  type MatchGoal,
  type MatchState,
  type Move,
  type NumberValue,
  type PendingDraw,
  type Result,
  type RuleViolation,
  type Seat,
  type SeatStatus,
  type WildCard,
} from './types.js'
