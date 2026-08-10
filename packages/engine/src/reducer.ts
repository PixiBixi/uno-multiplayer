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
  /* The target matters as much as the type. Comparing the type alone would let a
     call-out against a vulnerable seat authorise one against any seat, charging
     two cards to somebody who did nothing wrong. */
  if (a.type === 'callOut' && b.type === 'callOut') return a.target === b.target
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

/**
 * Closes the Liar window on one seat. Called out, called UNO, or simply out of
 * time — the three ways the window shuts all land here.
 */
function closeWindow(state: GameState, seatIndex: number): GameState {
  if (state.seats[seatIndex]?.vulnerable !== true) return state
  return {
    ...state,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, vulnerable: false } : s)),
  }
}

/** Opens one: this seat is holding a single card and never said so. */
function openWindow(state: GameState, seatIndex: number): GameState {
  return {
    ...state,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, vulnerable: true } : s)),
  }
}

/**
 * Ends `from`'s turn and hands it on.
 *
 * Closing the window here is the bound that makes the rule a game rather than a
 * trap: a seat stays open to an accusation until the end of its NEXT turn, which
 * is this moment, and not a second longer.
 */
function passTurn(state: GameState, from: number, steps: number): GameState {
  const closed = closeWindow(state, from)
  return beginTurn(closed, advance(closed, from, steps))
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

  /* This seat's turn is ending, so any window opened on an earlier turn closes —
     deliberately before a new one may open just below. The other order would let
     a seat that forgets UNO twice in a row escape the second one. */
  next = closeWindow(next, seatIndex)

  if (hand.length === 1 && !seat.unoCalled) {
    /* With `liar` on, forgetting costs nothing until somebody notices; the seat
       merely becomes open to an accusation. Without it the penalty is automatic,
       exactly as it always was. */
    next = state.rules.liar ? openWindow(next, seatIndex) : drawInto(next, seatIndex, UNO_PENALTY)
  }

  return ok(beginTurn(next, advance(next, seatIndex, steps)))
}

/**
 * The Liar call-out. Two cards for the target — the same UNO_PENALTY the
 * automatic rule charged, so switching the option on cannot make forgetting
 * cheaper or dearer — and nothing at all for the accuser.
 *
 * Whose turn it is never changes and no round ever ends here, which keeps the one
 * off-turn move in the game out of the turn-advance logic entirely.
 */
function applyCallOut(
  state: GameState,
  move: Extract<Move, { type: 'callOut' }>,
): Result<GameState, RuleViolation> {
  // Unreachable through the legalMoves gate, which only offers existing seats.
  if (state.seats[move.target] === undefined) return err('illegal_move')
  return ok(closeWindow(drawInto(state, move.target, UNO_PENALTY), move.target))
}

export function applyMove(
  state: GameState,
  seatIndex: number,
  move: Move,
): Result<GameState, RuleViolation> {
  if (state.phase !== 'playing') return err('game_finished')
  /* A call-out is exempt, and is the only move that is. Everything else still
     answers to whose turn it is, and is refused as such rather than as an
     illegal move, so the client can say which of the two went wrong. */
  if (state.currentSeat !== seatIndex && move.type !== 'callOut') return err('not_your_turn')
  const seat = state.seats[seatIndex]
  if (seat === undefined) return err('not_your_turn')
  if (seat.status !== 'active') return err('seat_not_active')

  // Single gate: a move is accepted only if it appears in legalMoves. No
  // per-case revalidation, so there is no way for what the client is offered to
  // diverge from what the server accepts.
  if (!legalMoves(state, seatIndex).some((m) => sameMove(m, move))) return err('illegal_move')

  switch (move.type) {
    case 'callUno':
      /* Calling it closes any window on this seat: a late call still counts, which
         is the escape a vulnerable seat has on its own next turn. */
      return ok({
        ...state,
        seats: state.seats.map((s) =>
          s.index === seatIndex ? { ...s, unoCalled: true, vulnerable: false } : s,
        ),
      })
    case 'draw': {
      const drawn = drawInto(state, seatIndex, 1)
      return ok(passTurn(drawn, seatIndex, 1))
    }
    case 'acceptDraw': {
      const debt = state.pendingDraw
      if (debt === null) return err('illegal_move')
      const drawn = drawInto({ ...state, pendingDraw: null }, seatIndex, debt.amount)
      return ok(passTurn(drawn, seatIndex, 1))
    }
    case 'play':
      return applyPlay(state, seatIndex, move)
    case 'callOut':
      return applyCallOut(state, move)
  }
}

/**
 * Hands the turn past seats that are not active. The absent player takes the
 * neutral action — swallow any debt, otherwise draw one — so the table never
 * stalls on someone who is gone. Bounded: it stops as soon as the turn stops
 * moving.
 */
export function skipDisconnectedTurn(state: GameState): GameState {
  if (state.phase !== 'playing') return state

  let next = state
  for (let guard = 0; guard <= state.seats.length; guard++) {
    const seat = next.seats[next.currentSeat]
    if (seat === undefined || seat.status === 'active') break

    const from = next.currentSeat
    const debt = next.pendingDraw
    next =
      debt !== null
        ? drawInto({ ...next, pendingDraw: null }, from, debt.amount)
        : drawInto(next, from, 1)

    // Their turn happened, however absently, so their window closes with it.
    next = closeWindow(next, from)
    const gaining = advance(next, from, 1)
    if (gaining === from) break
    next = beginTurn(next, gaining)
  }
  return next
}
