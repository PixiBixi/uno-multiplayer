import { describe, expect, it } from 'vitest'
import { cardCount, isBackPhrase, winsPhrase } from './phrase.js'

describe('winsPhrase', () => {
  it('conjugates the second person', () => {
    expect(winsPhrase('You', true)).toBe('You win')
  })

  it('conjugates the third person', () => {
    expect(winsPhrase('Ana', false)).toBe('Ana wins')
  })

  it('does not key off the name itself, so a player called You still reads right', () => {
    expect(winsPhrase('You', false)).toBe('You wins')
  })
})

describe('cardCount', () => {
  it('uses the singular for one', () => {
    expect(cardCount(1)).toBe('1 card')
  })

  it('uses the plural for anything else', () => {
    expect(cardCount(0)).toBe('0 cards')
    expect(cardCount(2)).toBe('2 cards')
    expect(cardCount(4)).toBe('4 cards')
  })
})

describe('isBackPhrase', () => {
  it('conjugates the second person', () => {
    expect(isBackPhrase('You', true)).toBe('You are back')
  })

  it('conjugates the third person', () => {
    expect(isBackPhrase('Ana', false)).toBe('Ana is back')
  })

  it('does not key off the name itself', () => {
    expect(isBackPhrase('You', false)).toBe('You is back')
  })
})
