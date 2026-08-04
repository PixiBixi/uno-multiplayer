import { takeFromTop } from './deck.js'
import { shuffle } from './rng.js'
import { activeCount, advance, legalMoves } from './rules.js'
import {
  err,
  ok,
  type Card,
  type GameState,
  type Move,
  type Result,
  type RuleViolation,
} from './types.js'

export const UNO_PENALTY = 2

function sameMove(a: Move, b: Move): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'play' && b.type === 'play') {
    return a.cardId === b.cardId && a.chosenColor === b.chosenColor
  }
  return true
}

/**
 * Draws `count` cards for a seat, recycling the discard pile when the draw pile
 * runs dry. If even recycling is not enough, the draw is capped at what is
 * available rather than producing `undefined` holes.
 */
function drawInto(state: GameState, seatIndex: number, count: number): GameState {
  let drawPile = state.drawPile
  let discardPile = state.discardPile
  let rngState = state.rngState
  const drawn: Card[] = []

  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      const top = discardPile[discardPile.length - 1]
      const recyclable = discardPile.slice(0, -1)
      if (top === undefined || recyclable.length === 0) break
      const reshuffled = shuffle(recyclable, rngState)
      drawPile = reshuffled.items
      rngState = reshuffled.state
      discardPile = [top]
    }
    const { taken, rest } = takeFromTop(drawPile, 1)
    const card = taken[0]
    if (card === undefined) break
    drawPile = rest
    drawn.push(card)
  }

  if (drawn.length === 0) return { ...state, drawPile, discardPile, rngState }

  return {
    ...state,
    drawPile,
    discardPile,
    rngState,
    seats: state.seats.map((s) =>
      s.index === seatIndex ? { ...s, hand: [...s.hand, ...drawn] } : s,
    ),
  }
}

/** Hands the turn to a seat and clears its UNO flag. */
function beginTurn(state: GameState, seatIndex: number): GameState {
  return {
    ...state,
    currentSeat: seatIndex,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, unoCalled: false } : s)),
  }
}

function applyPlay(
  state: GameState,
  seatIndex: number,
  move: Extract<Move, { type: 'play' }>,
): Result<GameState, RuleViolation> {
  const seat = state.seats[seatIndex]
  if (seat === undefined) return err('not_your_turn')
  const card = seat.hand.find((c) => c.id === move.cardId)
  if (card === undefined) return err('illegal_move')

  const hand = seat.hand.filter((c) => c.id !== move.cardId)
  let next: GameState = {
    ...state,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, hand } : s)),
    discardPile: [...state.discardPile, card],
  }

  let steps = 1
  switch (card.kind) {
    case 'number':
      next = { ...next, currentColor: card.color }
      break
    case 'skip':
      next = { ...next, currentColor: card.color }
      steps = 2
      break
    case 'reverse':
      next = { ...next, currentColor: card.color }
      // With two active players a reverse acts as a skip: the turn comes back
      // to whoever played it (official rule).
      if (activeCount(next) === 2) steps = 2
      else next = { ...next, direction: next.direction === 1 ? -1 : 1 }
      break
    case 'draw2':
      next = {
        ...next,
        currentColor: card.color,
        pendingDraw: { amount: (state.pendingDraw?.amount ?? 0) + 2, kind: 'draw2' },
      }
      break
    case 'wild':
      if (move.chosenColor === undefined) return err('illegal_move')
      next = { ...next, currentColor: move.chosenColor }
      break
    case 'wild4':
      if (move.chosenColor === undefined) return err('illegal_move')
      next = {
        ...next,
        currentColor: move.chosenColor,
        pendingDraw: { amount: (state.pendingDraw?.amount ?? 0) + 4, kind: 'wild4' },
      }
      break
  }

  // Victory on an empty hand. Checked before the penalty: the two cases are
  // mutually exclusive (zero cards versus exactly one).
  if (hand.length === 0) return ok({ ...next, phase: 'finished', winner: seatIndex })

  // Going down to a single card without calling UNO costs two cards.
  if (hand.length === 1 && !seat.unoCalled) next = drawInto(next, seatIndex, UNO_PENALTY)

  return ok(beginTurn(next, advance(next, seatIndex, steps)))
}

export function applyMove(
  state: GameState,
  seatIndex: number,
  move: Move,
): Result<GameState, RuleViolation> {
  if (state.phase !== 'playing') return err('game_finished')
  if (state.currentSeat !== seatIndex) return err('not_your_turn')
  const seat = state.seats[seatIndex]
  if (seat === undefined) return err('not_your_turn')
  if (seat.status !== 'active') return err('seat_not_active')

  // Single gate: a move is accepted only if it appears in legalMoves. No
  // per-case revalidation, so there is no way for what the client is offered to
  // diverge from what the server accepts.
  if (!legalMoves(state, seatIndex).some((m) => sameMove(m, move))) return err('illegal_move')

  switch (move.type) {
    case 'callUno':
      return ok({
        ...state,
        seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, unoCalled: true } : s)),
      })
    case 'draw': {
      const drawn = drawInto(state, seatIndex, 1)
      return ok(beginTurn(drawn, advance(drawn, seatIndex, 1)))
    }
    case 'acceptDraw': {
      const debt = state.pendingDraw
      if (debt === null) return err('illegal_move')
      const drawn = drawInto({ ...state, pendingDraw: null }, seatIndex, debt.amount)
      return ok(beginTurn(drawn, advance(drawn, seatIndex, 1)))
    }
    case 'play':
      return applyPlay(state, seatIndex, move)
  }
}
