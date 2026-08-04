import { describe, expect, it } from 'vitest'
import { buildDeck, takeFromTop } from './deck.js'
import type { Card } from './types.js'

const countBy = (cards: readonly Card[], kind: Card['kind']) =>
  cards.filter((c) => c.kind === kind).length

describe('buildDeck', () => {
  it('builds exactly 108 cards', () => {
    expect(buildDeck()).toHaveLength(108)
  })

  it('gives every card a distinct id', () => {
    const ids = buildDeck().map((c) => c.id)
    expect(new Set(ids).size).toBe(108)
  })

  it('matches the official composition', () => {
    const deck = buildDeck()
    expect(countBy(deck, 'number')).toBe(76)
    expect(countBy(deck, 'skip')).toBe(8)
    expect(countBy(deck, 'reverse')).toBe(8)
    expect(countBy(deck, 'draw2')).toBe(8)
    expect(countBy(deck, 'wild')).toBe(4)
    expect(countBy(deck, 'wild4')).toBe(4)
  })

  it('has one zero and two of each 1-9 per colour', () => {
    const deck = buildDeck()
    const reds = deck.filter((c) => c.kind === 'number' && c.color === 'R')
    expect(reds.filter((c) => c.kind === 'number' && c.value === 0)).toHaveLength(1)
    for (let v = 1; v <= 9; v++) {
      expect(reds.filter((c) => c.kind === 'number' && c.value === v)).toHaveLength(2)
    }
  })

  it('returns a fresh array on every call', () => {
    const a = buildDeck()
    a.pop()
    expect(buildDeck()).toHaveLength(108)
  })
})

describe('takeFromTop', () => {
  it('takes from the end of the pile', () => {
    const deck = buildDeck()
    const top = deck[deck.length - 1]
    const { taken, rest } = takeFromTop(deck, 1)
    expect(taken).toEqual([top])
    expect(rest).toHaveLength(107)
  })

  it('takes several cards, topmost first', () => {
    const deck = buildDeck()
    const { taken } = takeFromTop(deck, 3)
    expect(taken[0]).toEqual(deck[107])
    expect(taken[1]).toEqual(deck[106])
    expect(taken[2]).toEqual(deck[105])
  })

  it('caps at what is available instead of returning undefined holes', () => {
    const { taken, rest } = takeFromTop(buildDeck().slice(0, 2), 5)
    expect(taken).toHaveLength(2)
    expect(rest).toHaveLength(0)
  })

  it('does not mutate its input', () => {
    const deck = buildDeck()
    takeFromTop(deck, 10)
    expect(deck).toHaveLength(108)
  })
})
