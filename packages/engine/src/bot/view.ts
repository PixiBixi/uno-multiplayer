import { buildDeck } from '../deck.js'
import { legalMoves } from '../rules.js'
import type {
  Card,
  CardId,
  Color,
  GameState,
  Move,
  PendingDraw,
  SeatStatus,
  TableRules,
} from '../types.js'

/** A voluntary draw while `color` was current: the seat likely holds none of it. */
export type DrawnOn = { seat: number; color: Color }

/** What a bot remembers of the round beyond the public state. */
export type RoundHistory = { drawnOn: DrawnOn[] }

export const EMPTY_HISTORY: RoundHistory = { drawnOn: [] }

/** Only a voluntary draw says anything about a hand; paying a debt does not. */
export function recordMove(
  history: RoundHistory,
  before: GameState,
  seat: number,
  move: Move,
): RoundHistory {
  if (move.type !== 'draw' || before.pendingDraw !== null) return history
  return { drawnOn: [...history.drawnOn, { seat, color: before.currentColor }] }
}

/** Everything one seat may know: its own hand and the public table, never another hand. */
export type BotView = {
  seat: number
  hand: Card[]
  legalMoves: Move[]
  /** Public: every card in it was played face up. */
  discardPile: Card[]
  currentColor: Color
  pendingDraw: PendingDraw | null
  drawnCard: CardId | null
  currentSeat: number
  direction: 1 | -1
  rules: TableRules
  seats: {
    index: number
    handCount: number
    status: SeatStatus
    unoCalled: boolean
    vulnerable: boolean
  }[]
  drawPileCount: number
  history: RoundHistory
}

export function botViewFor(state: GameState, seat: number, history: RoundHistory): BotView {
  return {
    seat,
    hand: state.seats[seat]?.hand ?? [],
    legalMoves: legalMoves(state, seat),
    discardPile: state.discardPile,
    currentColor: state.currentColor,
    pendingDraw: state.pendingDraw,
    drawnCard: state.currentSeat === seat ? state.drawnCard : null,
    currentSeat: state.currentSeat,
    direction: state.direction,
    rules: state.rules,
    seats: state.seats.map((s) => ({
      index: s.index,
      handCount: s.hand.length,
      status: s.status,
      unoCalled: s.unoCalled,
      vulnerable: s.vulnerable,
    })),
    drawPileCount: state.drawPile.length,
    history,
  }
}

/** Cards this seat has not seen: in another hand or in the draw pile. */
export function unseenCards(view: BotView): Card[] {
  const seen = new Set<CardId>([...view.hand, ...view.discardPile].map((c) => c.id))
  return buildDeck().filter((c) => !seen.has(c.id))
}
