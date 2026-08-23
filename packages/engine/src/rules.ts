import { COLORS, isWild, type Card, type GameState, type Move, type Seat } from './types.js'

export function isPlayable(card: Card, state: GameState): boolean {
  // An outstanding debt closes everything down: only the same type can raise,
  // whatever the current colour is.
  if (state.pendingDraw !== null) return card.kind === state.pendingDraw.kind

  const top = state.discardPile[state.discardPile.length - 1]
  if (top === undefined) return true

  switch (card.kind) {
    case 'wild':
    case 'wild4':
      return true
    case 'number':
      return (
        card.color === state.currentColor || (top.kind === 'number' && card.value === top.value)
      )
    case 'skip':
    case 'reverse':
    case 'draw2':
      return card.color === state.currentColor || top.kind === card.kind
  }
}

export function activeCount(state: GameState): number {
  return state.seats.filter((s) => s.status === 'active').length
}

/**
 * The active seat `steps` places further along in the current direction.
 * Inactive seats are skipped without reindexing - that is what lets a
 * disconnected player keep their place. Returns `from` when no other seat is
 * active.
 */
export function advance(state: GameState, from: number, steps: number): number {
  const size = state.seats.length
  // Only bail when nobody at all is active. With a single active seat, landing
  // on it is legitimate and terminates - the inner loop is bounded by `size`.
  if (activeCount(state) === 0) return from
  let index = from
  for (let step = 0; step < steps; step++) {
    for (let guard = 0; guard < size; guard++) {
      index = (index + state.direction + size) % size
      if (state.seats[index]?.status === 'active') break
    }
  }
  return index
}

/**
 * One call-out per seat currently open to one, or nothing at all on a table that
 * did not opt into `liar`.
 *
 * Only ever offered while the target really is vulnerable, which is what makes a
 * wrong accusation impossible rather than punishable: penalising a bad guess
 * punishes paying attention badly instead of rewarding paying attention well.
 *
 * The target has to be active. A seat that has left had its hand returned to the
 * pile, and drawing two into it would hand whoever goes out free points for cards
 * nobody is holding.
 */
function callOutMoves(state: GameState, seatIndex: number): Move[] {
  if (!state.rules.liar) return []
  return state.seats
    .filter((s) => s.index !== seatIndex && s.status === 'active' && s.vulnerable)
    .map((s) => ({ type: 'callOut', target: s.index }))
}

/**
 * Whom a 7 may take a hand from, on a table that opted into `sevenZero`.
 *
 * Active seats only. A seat that has left had its hand returned to the pile, so
 * swapping into it would hand somebody an empty hand and a free win; a seat that is
 * merely disconnected is holding its hand until the grace period runs out, and
 * giving it away would bring the player back to a hand chosen by an event they
 * never saw.
 */
function swapTargets(state: GameState, seatIndex: number): number[] {
  return state.seats
    .filter((s) => s.index !== seatIndex && s.status === 'active')
    .map((s) => s.index)
}

/**
 * Two cards a jump-in treats as the same card: same colour AND same value for
 * numbers, same colour and same kind for the action cards.
 *
 * Neither may be a wild. A wild has no colour, so every wild would match every
 * other one - which is not the rule, and would let a wild4 be answered by a wild4
 * from anywhere round the table.
 */
export function isIdentical(card: Card, top: Card): boolean {
  if (isWild(card) || isWild(top)) return false
  if (card.color !== top.color) return false
  if (card.kind === 'number') return top.kind === 'number' && card.value === top.value
  return card.kind === top.kind
}

/**
 * The moves for laying one card down: one per colour for a wild, one per swap
 * target for a 7 on a Seven-Zero table, and otherwise the single plain play.
 *
 * Enumerating the second decision as separate moves is what keeps the client free
 * of rules - it renders a picker from what it was offered - and leaves the reducer
 * with nothing to validate beyond "is this one of the moves I produced".
 */
function playMoves(state: GameState, seatIndex: number, card: Card, handSize: number): Move[] {
  if (isWild(card)) {
    return COLORS.map((chosenColor) => ({ type: 'play', cardId: card.id, chosenColor }))
  }

  /* No target on the card that empties the hand: the round ends there and no hand
     moves, so there is nothing to choose. Nor when nobody else is active, which
     would otherwise leave a hand of 7s with no legal card in it. */
  const swappable =
    state.rules.sevenZero && card.kind === 'number' && card.value === 7 && handSize > 1
  const targets = swappable ? swapTargets(state, seatIndex) : []
  if (targets.length === 0) return [{ type: 'play', cardId: card.id }]
  return targets.map((swapWith) => ({ type: 'play', cardId: card.id, swapWith }))
}

/**
 * What an off-turn seat may jump in with, on a table that opted into `jumpIn`.
 *
 * Nothing at all while a draw is pending. A stacked +2/+4 has its own strict
 * same-type answer rules, and letting a jump-in interleave would make "strictly
 * same type" mean nothing - so the seat on turn is left with its pending-draw
 * moves and nobody else has anything to say.
 *
 * Offered only off turn. On turn a card identical to the top is already playable
 * the ordinary way: a non-wild play always sets `currentColor` to its own colour,
 * so an identical card always matches the colour in play, and emitting it twice
 * would put two indistinguishable moves in front of the client.
 *
 * `playMoves` is reused rather than duplicated, which is what makes a jumped 7 on a
 * Seven-Zero table offer its targets exactly as it would have on the jumper's own
 * turn: the card's effect is the card's effect, whoever's turn it was.
 */
function jumpInMoves(state: GameState, seatIndex: number): Move[] {
  if (!state.rules.jumpIn || state.pendingDraw !== null) return []
  /* Nor while the seat on turn is deciding what to do with a card it has just drawn. The
     turn is still theirs and still unresolved, which is the same reason a pending draw
     closes jumping down - and a card laid on top mid-decision would leave them holding an
     offer against a top that has moved. */
  if (state.drawnCard !== null) return []
  const seat = state.seats[seatIndex]
  const top = state.discardPile[state.discardPile.length - 1]
  if (seat === undefined || top === undefined) return []

  const moves: Move[] = []
  for (const card of seat.hand) {
    if (!isIdentical(card, top)) continue
    moves.push(...playMoves(state, seatIndex, card, seat.hand.length))
  }
  return moves
}

/**
 * What the seat on turn may do with the card it has just drawn: lay that one card down,
 * and nothing else from its hand.
 *
 * Both conditions are restated rather than trusted. `drawnCard` is only ever set on a card
 * the seat holds and can play, so neither can fail - but this is the one field in the state
 * whose staleness would hand somebody a card they no longer own, and a gate that reads the
 * hand it is offering from cannot be wrong about that.
 */
function drawnCardMoves(state: GameState, seat: Seat): Move[] {
  const card = seat.hand.find((c) => c.id === state.drawnCard)
  if (card === undefined || !isPlayable(card, state)) return []
  return playMoves(state, seat.index, card, seat.hand.length)
}

export function legalMoves(state: GameState, seatIndex: number): Move[] {
  if (state.phase !== 'playing') return []
  const seat = state.seats[seatIndex]
  if (seat === undefined || seat.status !== 'active') return []

  /* This early return used to be unconditional: nobody but the seat on turn had
     anything to do. A call-out was the first exception and a jump-in is the second,
     so an off-turn seat gets exactly those two and nothing else. */
  const callOuts = callOutMoves(state, seatIndex)
  if (state.currentSeat !== seatIndex) return [...callOuts, ...jumpInMoves(state, seatIndex)]

  const moves: Move[] = []
  if (state.drawnCard !== null) {
    /* The sub-state: this seat drew a playable card and the turn is not over. Exactly that
       card, and a pass - not the rest of the hand, which would make drawing a free extra
       turn rather than the official rule. `playMoves` is reused, so a drawn wild asks for
       its colour and a drawn 7 for its target like any other. */
    moves.push(...drawnCardMoves(state, seat))
    moves.push({ type: 'pass' })
  } else {
    for (const card of seat.hand) {
      if (!isPlayable(card, state)) continue
      moves.push(...playMoves(state, seatIndex, card, seat.hand.length))
    }
    moves.push(state.pendingDraw !== null ? { type: 'acceptDraw' } : { type: 'draw' })
  }
  /* Two cards is the ordinary moment to call it, before playing down to one. A
     vulnerable seat gets the offer too: closing its own window on its next turn,
     before playing, is how it escapes an accusation. */
  if (!seat.unoCalled && (seat.hand.length === 2 || seat.vulnerable)) {
    moves.push({ type: 'callUno' })
  }
  return [...moves, ...callOuts]
}
