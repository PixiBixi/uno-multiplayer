import type { Card, CardId } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { EFFECT_DURATION_MS, effectForCard } from './play-effects.js'

const id = (value: string) => value as CardId
const wild4: Card = { id: id('w4'), kind: 'wild4' }
const wild: Card = { id: id('w'), kind: 'wild' }
const draw2: Card = { id: id('d2'), kind: 'draw2', color: 'B' }
const skip: Card = { id: id('sk'), kind: 'skip', color: 'G' }
const reverse: Card = { id: id('rv'), kind: 'reverse', color: 'Y' }
const number: Card = { id: id('n7'), kind: 'number', color: 'R', value: 7 }

describe('effectForCard', () => {
  it('gives wild4 the colour just chosen, since the card carries none of its own', () => {
    expect(effectForCard(wild4, 'G')).toEqual({ kind: 'wild4', color: 'G' })
  })

  it('gives wild the colour just chosen too', () => {
    expect(effectForCard(wild, 'Y')).toEqual({ kind: 'wild', color: 'Y' })
  })

  it('agrees with the card’s own colour for draw2, skip and reverse', () => {
    // currentColor is passed as something else on purpose: the view always
    // carries the card's own colour by the time it lands, so a real caller
    // would never see them disagree — but the function must still read the
    // colour it is GIVEN, not reach for the card, to stay correct for wilds.
    expect(effectForCard(draw2, 'B')).toEqual({ kind: 'draw2', color: 'B' })
    expect(effectForCard(skip, 'G')).toEqual({ kind: 'skip', color: 'G' })
    expect(effectForCard(reverse, 'Y')).toEqual({ kind: 'reverse', color: 'Y' })
  })

  it('has no effect for a plain number card', () => {
    expect(effectForCard(number, 'R')).toBeNull()
  })
})

describe('EFFECT_DURATION_MS', () => {
  it('gives wild4 the longest stage time of all — the one asked to make a fuss over', () => {
    const rest = Object.entries(EFFECT_DURATION_MS)
      .filter(([kind]) => kind !== 'wild4')
      .map(([, ms]) => ms)
    expect(EFFECT_DURATION_MS.wild4).toBeGreaterThan(Math.max(...rest))
  })

  it('gives every kind a positive duration', () => {
    for (const ms of Object.values(EFFECT_DURATION_MS)) expect(ms).toBeGreaterThan(0)
  })
})
