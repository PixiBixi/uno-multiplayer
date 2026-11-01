import { cardPoints } from '../match.js'
import { nextInt, nextRandom } from '../rng.js'
import { COLORS, isWild, type Card, type Color, type Move } from '../types.js'
import type { BotLevel } from './timing.js'
import { unseenCards, type BotView } from './view.js'

export type ReactionKind = 'callOut' | 'lateUno' | 'jumpIn'

type Choice = { move: Move | null; rng: number }
type PlayMove = Extract<Move, { type: 'play' }>

/** What a level adds on top of Normal: the colour it names, and which playable cards it considers. */
type Style = {
  colour: (view: BotView) => Color
  narrow: (view: BotView, cards: Card[]) => Card[]
}

const isPlay = (m: Move): m is PlayMove => m.type === 'play'

/** Coloured cards of each colour in the hand, wilds left out. */
function colourCounts(hand: Card[]): Record<Color, number> {
  const counts: Record<Color, number> = { R: 0, G: 0, B: 0, Y: 0 }
  for (const card of hand) if (!isWild(card)) counts[card.color]++
  return counts
}

/** Ties go to the first in `COLORS`, so the choice never depends on hand order. */
function mostHeldColour(hand: Card[]): Color {
  const counts = colourCounts(hand)
  return COLORS.reduce((best, c) => (counts[c] > counts[best] ? c : best))
}

function handCount(view: BotView, seat: number): number {
  return view.seats.find((s) => s.index === seat)?.handCount ?? 0
}

/** The seat after this one in the direction of play, as `turnOrder` would put first. */
function nextSeat(view: BotView): number | null {
  const size = view.seats.length
  for (let step = 1; step < size; step++) {
    const index = (((view.seat + step * view.direction) % size) + size) % size
    if (view.seats[index]?.status === 'active') return index
  }
  return null
}

function nextHoldsFewest(view: BotView): boolean {
  const next = nextSeat(view)
  if (next === null) return false
  const fewest = Math.min(
    ...view.seats
      .filter((s) => s.index !== view.seat && s.status === 'active')
      .map((s) => s.handCount),
  )
  return handCount(view, next) <= fewest
}

/** Settles a card's second decision: the style's colour, or the smallest hand to swap. */
function settle(view: BotView, style: Style, plays: PlayMove[]): PlayMove | undefined {
  const first = plays[0]
  if (first === undefined) return undefined
  if (first.chosenColor !== undefined) {
    const colour = style.colour(view)
    return plays.find((m) => m.chosenColor === colour) ?? first
  }
  if (first.swapWith === undefined) return first
  const target = (m: PlayMove): number => handCount(view, m.swapWith ?? view.seat)
  return plays.reduce((best, m) => (target(m) < target(best) ? m : best))
}

function cardOf(view: BotView, move: PlayMove): Card | undefined {
  return view.hand.find((c) => c.id === move.cardId)
}

/** On-turn moves only: a call-out or a late UNO is a reaction, offered separately. */
function onTurnMoves(view: BotView): Move[] {
  if (view.currentSeat !== view.seat) return []
  return view.legalMoves.filter((m) => m.type !== 'callOut')
}

function easyMove(view: BotView, rng: number): Choice {
  const moves = onTurnMoves(view)
  let r = rng
  if (moves.some((m) => m.type === 'callUno')) {
    const coin = nextRandom(r)
    r = coin.state
    if (coin.value < 0.5) return { move: { type: 'callUno' }, rng: r }
  }
  const plays = moves.filter(isPlay)
  const pass = moves.find((m) => m.type === 'pass')
  if (view.drawnCard !== null && pass !== undefined) {
    const coin = nextRandom(r)
    r = coin.state
    if (coin.value < 0.5 || plays.length === 0) return { move: pass, rng: r }
  }
  // Easy draws only when it has no play: drawing at will makes rounds unbounded.
  const pool = plays.length > 0 ? plays : moves.filter((m) => m.type !== 'callUno')
  if (pool.length === 0) return { move: null, rng: r }
  const pick = nextInt(r, pool.length)
  return { move: pool[pick.value] ?? null, rng: pick.state }
}

/** The drawn-card sub-state: lay it, unless it is a wild the hand can do without. */
function normalDrawnCard(view: BotView, style: Style, moves: Move[]): Move | null {
  const plays = moves.filter(isPlay)
  const pass = moves.find((m) => m.type === 'pass') ?? null
  const first = plays[0]
  const drawn = first === undefined ? undefined : cardOf(view, first)
  if (drawn === undefined) return pass
  const holdsColour = view.hand.some(
    (c) => c.id !== drawn.id && !isWild(c) && c.color === view.currentColor,
  )
  if (isWild(drawn) && holdsColour) return pass
  return settle(view, style, plays) ?? pass
}

/** Highest points first, then the colour held most, so the colour in play stays ours. */
function bestColouredCard(view: BotView, cards: Card[]): Card | undefined {
  const counts = colourCounts(view.hand)
  const weight = (c: Card): number => (isWild(c) ? 0 : counts[c.color])
  return cards.reduce<Card | undefined>((best, c) => {
    if (best === undefined) return c
    const diff = cardPoints(c) - cardPoints(best)
    if (diff !== 0) return diff > 0 ? c : best
    return weight(c) > weight(best) ? c : best
  }, undefined)
}

function normalPlay(view: BotView, style: Style, plays: PlayMove[]): Move | null {
  const playable = [...new Set(plays.map((m) => m.cardId))]
    .map((id) => view.hand.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined)
  const cards = style.narrow(view, playable)
  const coloured = cards.filter((c) => !isWild(c))
  const actions = coloured.filter((c) => c.kind !== 'number')
  const pool = nextHoldsFewest(view) && actions.length > 0 ? actions : coloured
  const card = bestColouredCard(view, pool) ?? cards[0]
  if (card === undefined) return null
  return (
    settle(
      view,
      style,
      plays.filter((m) => m.cardId === card.id),
    ) ?? null
  )
}

function normalMove(view: BotView, style: Style, rng: number): Choice {
  const moves = onTurnMoves(view)
  if (moves.length === 0) return { move: null, rng }
  const uno = moves.find((m) => m.type === 'callUno')
  if (uno !== undefined) return { move: uno, rng }
  if (view.drawnCard !== null) return { move: normalDrawnCard(view, style, moves), rng }
  const played = normalPlay(view, style, moves.filter(isPlay))
  if (played !== null) return { move: played, rng }
  const draw = moves.find((m) => m.type === 'draw' || m.type === 'acceptDraw') ?? null
  return { move: draw, rng }
}

const NORMAL: Style = {
  colour: (view) => mostHeldColour(view.hand),
  narrow: (_view, cards) => cards,
}

/** Colours the next seat drew on rather than play: it likely holds none of them. */
function lackedByNext(view: BotView): Set<Color> {
  const next = nextSeat(view)
  return new Set(view.history.drawnOn.filter((d) => d.seat === next).map((d) => d.color))
}

/* Names the most-held colour, skipping one with 2 or fewer unseen cards while another
   held colour has more, and preferring a colour the next seat drew on. */
function hardColour(view: BotView): Color {
  const held = colourCounts(view.hand)
  const unseen: Record<Color, number> = { R: 0, G: 0, B: 0, Y: 0 }
  for (const c of unseenCards(view)) if (!isWild(c)) unseen[c.color]++
  const heldColours = COLORS.filter((c) => held[c] > 0)
  const viable = heldColours.filter(
    (c) => unseen[c] > 2 || !heldColours.some((o) => unseen[o] > unseen[c]),
  )
  const lacked = lackedByNext(view)
  const preferred = viable.filter((c) => lacked.has(c))
  const pool = preferred.length > 0 ? preferred : viable
  if (pool.length === 0) return mostHeldColour(view.hand)
  return pool.reduce((best, c) => (held[c] > held[best] ? c : best))
}

/** The seat a 0 takes its new hand from: the one before it in the direction of play. */
function previousSeat(view: BotView): number | null {
  return nextSeat({ ...view, direction: view.direction === 1 ? -1 : 1 })
}

/** Plays a card whose colour the next seat lacks, when it holds one. */
function keepLackedColour(view: BotView, cards: Card[]): Card[] {
  const lacked = lackedByNext(view)
  const matching = cards.filter((c) => !isWild(c) && lacked.has(c.color))
  return matching.length > 0 ? matching : cards
}

function hardNarrow(view: BotView, cards: Card[]): Card[] {
  const opponentNearOut = view.seats.some(
    (s) => s.index !== view.seat && s.status === 'active' && s.handCount <= 3,
  )
  const plain = cards.filter((c) => c.kind === 'number' || c.kind === 'wild')
  // Hold +2, +4, skip and reverse for when an opponent is close to going out.
  const pool = !opponentNearOut && plain.some((c) => c.kind === 'number') ? plain : cards
  if (view.rules.sevenZero) {
    const zeros = pool.filter((c) => c.kind === 'number' && c.value === 0)
    const from = previousSeat(view)
    if (zeros.length > 0 && from !== null && handCount(view, from) < view.hand.length) return zeros
  }
  return keepLackedColour(view, pool)
}

const HARD: Style = { colour: hardColour, narrow: hardNarrow }

/** The seat's own turn. Never null when legalMoves holds an on-turn move. */
export function botMove(view: BotView, level: BotLevel, rng: number): Choice {
  switch (level) {
    case 'easy':
      return easyMove(view, rng)
    case 'normal':
      return normalMove(view, NORMAL, rng)
    case 'hard':
      return normalMove(view, HARD, rng)
  }
}

/* Jumping in clears a declaration, so a two-card hand would land on one it cannot call
   in time on a plain table. A Liar table only charges it if somebody notices. */
function hardJumpIn(view: BotView): Move | null {
  if (view.currentSeat === view.seat) return null
  const plays = view.legalMoves.filter(isPlay)
  if (plays.length === 0) return null
  if (view.hand.length === 2 && !view.rules.liar) return null
  const first = plays[0]
  return (
    settle(
      view,
      HARD,
      plays.filter((m) => m.cardId === first?.cardId),
    ) ?? null
  )
}

/** A seat still exposed after its turn may close its own window off turn. */
function lateUnoOffered(view: BotView): boolean {
  return view.currentSeat !== view.seat && view.legalMoves.some((m) => m.type === 'callUno')
}

/** Which off-turn reactions are legal for this seat right now. */
export function availableReactions(view: BotView): ReactionKind[] {
  const offTurn = view.currentSeat !== view.seat
  const kinds: ReactionKind[] = []
  if (view.legalMoves.some((m) => m.type === 'callOut')) kinds.push('callOut')
  if (lateUnoOffered(view)) kinds.push('lateUno')
  if (offTurn && view.legalMoves.some(isPlay)) kinds.push('jumpIn')
  return kinds
}

/** An off-turn move of that kind, or null to let the moment pass. */
export function botReaction(
  view: BotView,
  level: BotLevel,
  kind: ReactionKind,
  rng: number,
): Choice {
  switch (kind) {
    case 'callOut': {
      const callOut = view.legalMoves.find((m) => m.type === 'callOut')
      if (callOut === undefined) return { move: null, rng }
      if (level !== 'easy') return { move: callOut, rng }
      const coin = nextRandom(rng)
      return { move: coin.value < 0.5 ? callOut : null, rng: coin.state }
    }
    case 'lateUno':
      return { move: lateUnoOffered(view) ? { type: 'callUno' } : null, rng }
    case 'jumpIn':
      return { move: level === 'hard' ? hardJumpIn(view) : null, rng }
  }
}
