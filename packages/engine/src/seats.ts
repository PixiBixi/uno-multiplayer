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

  if (next.phase === 'playing' && activeCount(next) < 2) {
    return { ...next, phase: 'finished', winner: null }
  }

  if (next.phase === 'playing' && next.currentSeat === seatIndex) {
    const gaining = advance(next, seatIndex, 1)
    next = {
      ...next,
      currentSeat: gaining,
      seats: next.seats.map((s) => (s.index === gaining ? { ...s, unoCalled: false } : s)),
    }
  }
  return next
}
