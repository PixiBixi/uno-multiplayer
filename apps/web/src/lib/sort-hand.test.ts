import type { Card, CardId, Color, NumberValue } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { cardPoints, sortHand } from './sort-hand.js'

const num = (id: string, color: Color, value: NumberValue): Card => ({
  id: id as CardId,
  kind: 'number',
  color,
  value,
})
const act = (id: string, kind: 'skip' | 'reverse' | 'draw2', color: Color): Card => ({
  id: id as CardId,
  kind,
  color,
})
const wild = (id: string, kind: 'wild' | 'wild4'): Card => ({ id: id as CardId, kind })

const ids = (cards: Card[]) => cards.map((card) => card.id)

describe('cardPoints', () => {
  it('scores a number card at its face value', () => {
    expect(cardPoints(num('a', 'R', 0))).toBe(0)
    expect(cardPoints(num('b', 'R', 9))).toBe(9)
  })

  it('scores every action card at 20', () => {
    expect(cardPoints(act('a', 'skip', 'R'))).toBe(20)
    expect(cardPoints(act('b', 'reverse', 'G'))).toBe(20)
    expect(cardPoints(act('c', 'draw2', 'B'))).toBe(20)
  })

  it('scores both wilds at 50', () => {
    expect(cardPoints(wild('a', 'wild'))).toBe(50)
    expect(cardPoints(wild('b', 'wild4'))).toBe(50)
  })
})

describe("sortHand('dealt')", () => {
  it('keeps the order the server sent', () => {
    const hand = [num('c', 'Y', 9), num('a', 'R', 1), wild('w', 'wild')]
    expect(ids(sortHand(hand, 'dealt'))).toEqual(['c', 'a', 'w'])
  })
})

describe("sortHand('colour')", () => {
  it('groups by colour in deck order, wilds last', () => {
    const hand = [wild('w', 'wild4'), num('y', 'Y', 1), num('r', 'R', 1), num('b', 'B', 1)]
    expect(ids(sortHand(hand, 'colour'))).toEqual(['r', 'b', 'y', 'w'])
  })

  it('orders within a colour by value', () => {
    const hand = [act('s', 'skip', 'R'), num('r9', 'R', 9), num('r0', 'R', 0)]
    expect(ids(sortHand(hand, 'colour'))).toEqual(['r0', 'r9', 's'])
  })
})

describe("sortHand('value')", () => {
  it('orders by points, lightest first', () => {
    const hand = [wild('w', 'wild'), act('s', 'skip', 'R'), num('n', 'B', 4)]
    expect(ids(sortHand(hand, 'value'))).toEqual(['n', 's', 'w'])
  })

  it('breaks ties on colour so equal cards sit together', () => {
    const hand = [num('y5', 'Y', 5), num('r5', 'R', 5), num('g5', 'G', 5)]
    expect(ids(sortHand(hand, 'value'))).toEqual(['r5', 'g5', 'y5'])
  })
})

describe('sortHand invariants', () => {
  const hand = [
    num('r7', 'R', 7),
    wild('w4', 'wild4'),
    act('gs', 'skip', 'G'),
    num('b0', 'B', 0),
    num('y7', 'Y', 7),
    wild('w', 'wild'),
  ]

  it('never mutates the hand it is given', () => {
    const before = ids(hand)
    for (const mode of ['dealt', 'colour', 'value'] as const) sortHand(hand, mode)
    expect(ids(hand)).toEqual(before)
  })

  it('keeps every card exactly once, whatever the mode', () => {
    for (const mode of ['dealt', 'colour', 'value'] as const) {
      expect(ids(sortHand(hand, mode)).sort()).toEqual(ids(hand).sort())
    }
  })

  it('is deterministic, so a re-render cannot reshuffle equal cards', () => {
    for (const mode of ['colour', 'value'] as const) {
      expect(ids(sortHand(hand, mode))).toEqual(ids(sortHand([...hand].reverse(), mode)))
    }
  })

  it('handles an empty hand', () => {
    expect(sortHand([], 'colour')).toEqual([])
  })
})
