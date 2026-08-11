import { legalMoves, type GameState } from '@uno/engine'
import type { MatchProgress, PlayerView } from '@uno/protocol'

/**
 * Builds the view for ONE seat. Opponents are reduced to a card count, and the
 * draw pile to a length: hidden information never crosses the wire, which is
 * what makes it actually hidden rather than merely covered by a card-back image.
 *
 * Returns null when the seat or the discard top does not exist — the caller
 * simply sends nothing rather than guessing.
 */
type Deadlines = { turnDeadline: number | null; nextRoundDeadline: number | null }

export function redactFor(
  state: GameState,
  seatIndex: number,
  match: MatchProgress,
  deadlines: Deadlines = { turnDeadline: null, nextRoundDeadline: null },
): PlayerView | null {
  const seat = state.seats[seatIndex]
  const discardTop = state.discardPile[state.discardPile.length - 1]
  if (seat === undefined || discardTop === undefined) return null

  return {
    you: {
      seat: seatIndex,
      hand: [...seat.hand],
      legalMoves: legalMoves(state, seatIndex),
    },
    opponents: state.seats
      .filter((s) => s.index !== seatIndex)
      .map((s) => ({
        seat: s.index,
        name: s.name,
        handCount: s.hand.length,
        status: s.status,
      })),
    /* Read straight off the state the reducer is playing by, not passed in beside the
       deadlines: a `rules` argument threaded from `Room` could disagree with the game it
       describes, and a view that misreports the rules is worse than one that omits them. */
    rules: state.rules,
    discardTop,
    currentColor: state.currentColor,
    pendingDraw: state.pendingDraw,
    currentSeat: state.currentSeat,
    direction: state.direction,
    drawPileCount: state.drawPile.length,
    phase: state.phase,
    winner: state.winner,
    match,
    ...deadlines,
  }
}
