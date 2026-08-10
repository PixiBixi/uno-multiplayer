import { shuffle } from './rng.js'
import { activeCount, advance } from './rules.js'
import type { GameState, SeatStatus } from './types.js'

export function setSeatStatus(state: GameState, seatIndex: number, status: SeatStatus): GameState {
  if (state.seats[seatIndex] === undefined) return state
  return {
    ...state,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, status } : s)),
  }
}

/**
 * A player leaving for good: their hand goes back into the draw pile, shuffled,
 * so the 108-card invariant still holds. Below two active seats there is no game
 * left to play and it is aborted with no winner.
 */
export function markSeatLeft(state: GameState, seatIndex: number): GameState {
  const seat = state.seats[seatIndex]
  if (seat === undefined || seat.status === 'left') return state

  const reshuffled = shuffle([...state.drawPile, ...seat.hand], state.rngState)
  let next: GameState = {
    ...state,
    drawPile: reshuffled.items,
    rngState: reshuffled.state,
    seats: state.seats.map((s) =>
      s.index === seatIndex
        ? /* Any Liar window goes with the hand. Nobody could accuse a seat that has
             left — legalMoves only offers active targets — but leaving the flag set
             on an empty hand is a lie about the state. */
          { ...s, hand: [], status: 'left' as const, vulnerable: false }
        : s,
    ),
  }

  /* A round that is over describes nothing anybody may still lay down, so the drawn-card
     offer goes with it. Cleared on both paths below and on neither of the ones above: a
     seat leaving while somebody ELSE is deciding what to do with a card they drew must not
     cancel their decision — that turn is still theirs, and taking the offer away would put
     their whole hand back in front of them. */
  if (next.phase === 'playing' && activeCount(next) < 2) {
    return { ...next, drawnCard: null, phase: 'finished', winner: null }
  }

  if (next.phase === 'playing' && next.currentSeat === seatIndex) {
    const gaining = advance(next, seatIndex, 1)
    next = {
      ...next,
      currentSeat: gaining,
      // Their hand has gone back to the pile, so whatever they drew is not theirs to play.
      drawnCard: null,
      seats: next.seats.map((s) => (s.index === gaining ? { ...s, unoCalled: false } : s)),
    }
  }
  return next
}
