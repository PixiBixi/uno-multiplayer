import { COLORS, type Card, type CardId, type NumberValue } from './types.js'

/**
 * Official composition: per colour one 0, two of each 1-9, two skips, two
 * reverses, two draw-2s (25 cards), so 100, plus 4 wilds and 4 wild-4s = 108.
 * The top of the pile is the END of the array.
 */
export function buildDeck(): Card[] {
  const cards: Card[] = []
  let counter = 0
  const id = (label: string): CardId => `${label}#${++counter}` as CardId

  for (const color of COLORS) {
    cards.push({ id: id(`0${color}`), kind: 'number', color, value: 0 })
    for (let v = 1; v <= 9; v++) {
      const value = v as NumberValue
      cards.push({ id: id(`${v}${color}`), kind: 'number', color, value })
      cards.push({ id: id(`${v}${color}`), kind: 'number', color, value })
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      cards.push({ id: id(`${kind}${color}`), kind, color })
      cards.push({ id: id(`${kind}${color}`), kind, color })
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ id: id('W'), kind: 'wild' })
  for (let i = 0; i < 4; i++) cards.push({ id: id('D4W'), kind: 'wild4' })

  return cards
}

/**
 * Takes `count` cards off the top (end of the array), the first result being
 * the topmost. Caps at what is available: never an `undefined` hole in the
 * returned array.
 */
export function takeFromTop(pile: readonly Card[], count: number): { taken: Card[]; rest: Card[] } {
  const n = Math.min(count, pile.length)
  const rest = pile.slice(0, pile.length - n)
  const taken = pile.slice(pile.length - n).reverse()
  return { taken, rest }
}
