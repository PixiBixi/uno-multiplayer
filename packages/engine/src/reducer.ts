import { takeFromTop } from './deck.js'
import { shuffle } from './rng.js'
import { activeCount, advance, isPlayable, legalMoves } from './rules.js'
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
    /* Every field of the second decision, not just the card. Ignoring `swapWith`
       would make two different swap targets look like the same move, so a 7 offered
       against one seat would authorise taking any seat's hand. */
    return a.cardId === b.cardId && a.chosenColor === b.chosenColor && a.swapWith === b.swapWith
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

/**
 * The card a one-card draw actually added, or null when the pile could not pay it.
 *
 * Read by comparing hand sizes rather than by trusting the pile: `drawInto` caps a draw at
 * what is available instead of inventing cards, and taking the last card of the hand
 * unconditionally would name a card the seat was already holding.
 */
function justDrawn(before: GameState, after: GameState, seatIndex: number): Card | null {
  const hand = after.seats[seatIndex]?.hand
  const held = before.seats[seatIndex]?.hand.length ?? 0
  if (hand === undefined || hand.length <= held) return null
  return hand[hand.length - 1] ?? null
}

/**
 * Hands the turn to a seat and clears its UNO flag.
 *
 * The single place a turn begins, which is what makes it the single place the drawn-card
 * offer is cleared. Every turn change in the game funnels through here - a pass, a play, a
 * jump-in, a seat being skipped for being absent - so no caller has to remember, and a
 * stale offer cannot survive one.
 */
function beginTurn(state: GameState, seatIndex: number): GameState {
  return {
    ...state,
    currentSeat: seatIndex,
    drawnCard: null,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, unoCalled: false } : s)),
  }
}

/**
 * Closes the Liar window on one seat. Called out, called UNO, or simply out of
 * time - the three ways the window shuts all land here.
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
 * Seven-Zero: a 7 exchanges two hands outright. Nothing is created or destroyed,
 * so the 108-card invariant is untouched by construction.
 */
function swapHands(state: GameState, a: number, b: number): GameState {
  const first = state.seats[a]
  const second = state.seats[b]
  if (first === undefined || second === undefined || a === b) return state
  return {
    ...state,
    seats: state.seats.map((s) => {
      if (s.index === a) return { ...s, hand: second.hand }
      if (s.index === b) return { ...s, hand: first.hand }
      return s
    }),
  }
}

/**
 * Seven-Zero: a 0 passes every hand one seat along, following `direction` - so a
 * reverse played earlier in the round changes where the hands go.
 *
 * Active seats only, and `advance` is a rotation of exactly those, which makes the
 * mapping a bijection: every active hand lands on exactly one active seat. Anyone
 * absent keeps what they are holding, for the same reason they cannot be a swap
 * target.
 */
function rotateHands(state: GameState): GameState {
  const incoming = new Map<number, Card[]>()
  for (const seat of state.seats) {
    if (seat.status !== 'active') continue
    incoming.set(advance(state, seat.index, 1), seat.hand)
  }
  return {
    ...state,
    seats: state.seats.map((s) => {
      const hand = incoming.get(s.index)
      return hand === undefined ? s : { ...s, hand }
    }),
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

  /* Victory on an empty hand. Checked before the penalty - the two cases are
     mutually exclusive, zero cards versus exactly one - and before the Seven-Zero
     effect below, so the first empty hand wins unconditionally. A 7 that could swap
     the win away would make the card unplayable as a last card, which is a trap
     rather than a rule. */
  if (hand.length === 0) {
    // No beginTurn on this path, so the drawn-card offer is cleared by hand: a round that
    // has ended must not describe a card anybody may still lay down.
    return ok({ ...next, drawnCard: null, phase: 'finished', winner: seatIndex })
  }

  /* Seven-Zero. The seats whose hands moved, empty when none did: a 7 with no
     target offered because nobody else is active, or a 0 at a table with a single
     active seat, both leave every hand where it was. */
  let permuted: number[] = []
  if (state.rules.sevenZero && card.kind === 'number') {
    if (card.value === 7 && move.swapWith !== undefined) {
      next = swapHands(next, seatIndex, move.swapWith)
      permuted = [seatIndex, move.swapWith]
    } else if (card.value === 0 && activeCount(next) > 1) {
      next = rotateHands(next)
      permuted = next.seats.filter((s) => s.status === 'active').map((s) => s.index)
    }
  }

  /* This seat's turn is ending, so any window opened on an earlier turn closes -
     deliberately before a new one may open just below. The other order would let
     a seat that forgets UNO twice in a row escape the second one. */
  next = closeWindow(next, seatIndex)

  if (permuted.length === 0) {
    if (hand.length === 1 && !seat.unoCalled) {
      /* With `liar` on, forgetting costs nothing until somebody notices; the seat
         merely becomes open to an accusation. Without it the penalty is automatic,
         exactly as it always was. */
      next = state.rules.liar ? openWindow(next, seatIndex) : drawInto(next, seatIndex, UNO_PENALTY)
    }
  } else if (state.rules.liar) {
    /* Hands moved, so who owes the table an UNO is re-decided from what each seat
       now holds: one card uncalled opens a window, anything else shuts one, because
       being accused of holding a card you no longer hold is a bug and not a rule.
       Recomputed rather than penalised, and only on a Liar table: the automatic
       penalty punishes an omission, and after a permutation nobody is holding the
       hand they held when the turn began. A window is the fair instrument here
       precisely because it is escapable - call UNO on your own next turn. */
    for (const index of permuted) {
      const moved = next.seats[index]
      if (moved === undefined) continue
      next =
        moved.hand.length === 1 && !moved.unoCalled
          ? openWindow(next, index)
          : closeWindow(next, index)
    }
  }

  return ok(beginTurn(next, advance(next, seatIndex, steps)))
}

/**
 * The Liar call-out. Two cards for the target - the same UNO_PENALTY the
 * automatic rule charged, so switching the option on cannot make forgetting
 * cheaper or dearer - and nothing at all for the accuser.
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

/**
 * Which moves an off-turn seat is even allowed to attempt.
 *
 * A call-out and a late UNO always, and a play only on a table that opted into
 * `jumpIn`. Whether the seat really is vulnerable, or the play really is a jump-in, is
 * left to the single `legalMoves` gate below - which is why a bad one comes back as
 * `illegal_move` rather than `not_your_turn`: each is a category of legal off-turn
 * move, so refusing it for being off turn would name the wrong reason.
 */
function mayActOffTurn(state: GameState, move: Move): boolean {
  if (move.type === 'callOut' || move.type === 'callUno') return true
  return move.type === 'play' && state.rules.jumpIn
}

export function applyMove(
  state: GameState,
  seatIndex: number,
  move: Move,
): Result<GameState, RuleViolation> {
  if (state.phase !== 'playing') return err('game_finished')
  /* A call-out and a jump-in are the two exemptions, and the only two. Everything
     else still answers to whose turn it is, and is refused as such rather than as an
     illegal move, so the client can say which of the two went wrong. */
  if (state.currentSeat !== seatIndex && !mayActOffTurn(state, move)) return err('not_your_turn')
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
      const card = justDrawn(state, drawn, seatIndex)
      /* The official rule: a playable drawn card may be laid down, so the turn is not
         over. Only when there is genuinely a choice - an unplayable card, or a pile that
         could not pay the draw at all, ends the turn exactly as it always did, with no
         sub-state and nothing for the player to dismiss. */
      if (state.rules.playDrawnCard && card !== null && isPlayable(card, drawn)) {
        return ok({ ...drawn, drawnCard: card.id })
      }
      return ok(passTurn(drawn, seatIndex, 1))
    }
    /* Declining the card just drawn. Nothing but the turn changes, and `passTurn` clears
       the offer along with the Liar window, since this is a turn ending like any other. */
    case 'pass':
      return ok(passTurn(state, seatIndex, 1))
    case 'acceptDraw': {
      const debt = state.pendingDraw
      if (debt === null) return err('illegal_move')
      const drawn = drawInto({ ...state, pendingDraw: null }, seatIndex, debt.amount)
      return ok(passTurn(drawn, seatIndex, 1))
    }
    case 'play':
      /* A jump-in IS the jumper's turn, so it begins here - after the gate, which
         has to read the state as it really was, or an off-turn seat would be offered
         every move the seat on turn had.

         Beginning it clears `unoCalled`, which is the whole point: a jumper cannot
         declare BEFORE jumping, so a declaration made on an earlier turn must not cover
         a card laid down on this one. Landing on one card by jumping in is an uncalled
         UNO - a window the jumper may still shut late, or two cards on a plain table. */
      return applyPlay(
        state.currentSeat === seatIndex ? state : beginTurn(state, seatIndex),
        seatIndex,
        move,
      )
    case 'callOut':
      return applyCallOut(state, move)
  }
}

/**
 * Hands the turn past seats that are not active. The absent player takes the
 * neutral action - swallow any debt, otherwise draw one - so the table never
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

    /* Their turn happened, however absently, so their window closes with it - and any
       drawn-card offer goes too, cleared here rather than left to `beginTurn` below
       because the loop can break without reaching it when nobody else is active. */
    next = closeWindow({ ...next, drawnCard: null }, from)
    const gaining = advance(next, from, 1)
    if (gaining === from) break
    next = beginTurn(next, gaining)
  }
  return next
}
