import { COLORS, type Card, type CardId, type NumberValue } from './types.js'

/**
 * Composition officielle : par couleur un 0, deux de chaque 1-9, deux skip,
 * deux reverse, deux +2 (25 cartes), soit 100, plus 4 jokers et 4 +4 = 108.
 * Le dessus de la pioche est la FIN du tableau.
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
 * Prélève `count` cartes sur le dessus (fin du tableau), la première du
 * résultat étant la plus haute. Plafonne au disponible : jamais de trou
 * `undefined` dans le tableau retourné.
 */
export function takeFromTop(pile: readonly Card[], count: number): { taken: Card[]; rest: Card[] } {
  const n = Math.min(count, pile.length)
  const rest = pile.slice(0, pile.length - n)
  const taken = pile.slice(pile.length - n).reverse()
  return { taken, rest }
}
