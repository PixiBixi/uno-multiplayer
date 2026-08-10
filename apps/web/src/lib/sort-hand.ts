import { cardPoints, isWild, type Card, type Color } from '@uno/engine'

export type HandSort = 'dealt' | 'colour' | 'value'

export const HAND_SORTS: readonly HandSort[] = ['dealt', 'colour', 'value'] as const

/* No label table here. `lib/` is pure and knows no language: a `Record<HandSort,
   string>` beside these three modes was a second catalogue that only ever spoke
   English, and it is what the control rendered. The words live in `i18n/`, and
   `Hand` maps a mode to one of them — so adding a fourth mode is a compile error
   in every catalogue rather than a blank on the table. */

/** Colour order matches the deck and the colour picker, so the eye learns one order. */
const COLOUR_RANK: Record<Color, number> = { R: 0, G: 1, B: 2, Y: 3 }

/** Wilds have no colour, so they sit after every coloured card. */
const NO_COLOUR = 4

/* "By value" sorts on the engine's own scoring — a number card is worth its face,
   an action card 20, a wild 50 — so the order means something in the game rather
   than being arbitrary, and the heaviest cards to shed end up together. It lives in
   the engine because it is also what settles a round. */

const colourRank = (card: Card): number => (isWild(card) ? NO_COLOUR : COLOUR_RANK[card.color])

/**
 * Returns a new array; the caller's hand is never reordered in place. Ties break
 * on the remaining keys and finally on id, so the result is fully deterministic —
 * a sort that shuffles equal cards on every re-render would be maddening to play
 * with.
 */
export function sortHand(cards: readonly Card[], mode: HandSort): Card[] {
  if (mode === 'dealt') return [...cards]

  const keys: ((card: Card) => number)[] =
    mode === 'colour' ? [colourRank, cardPoints] : [cardPoints, colourRank]

  return [...cards].sort((a, b) => {
    for (const key of keys) {
      const difference = key(a) - key(b)
      if (difference !== 0) return difference
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
