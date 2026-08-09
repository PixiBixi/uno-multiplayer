import type { Card, CardId } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { CATALOGUES, LOCALES, detectLocale } from './index.js'
import type { Messages } from './messages.js'

const num = (value: 0 | 7): Card => ({ id: 'n' as CardId, kind: 'number', color: 'R', value })
const wild4: Card = { id: 'w' as CardId, kind: 'wild4' }

/** Every leaf of a catalogue, as dotted paths, so two can be compared. */
const leaves = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('the catalogues', () => {
  it('cover exactly the same keys', () => {
    // A missing key is a blank in the interface, and TypeScript only catches it
    // while the shape is a type rather than a Record with optional members.
    const [first, ...rest] = LOCALES.map((locale) => leaves(CATALOGUES[locale]).sort())
    for (const other of rest) expect(other).toEqual(first)
  })

  it('leave nothing empty', () => {
    for (const locale of LOCALES) {
      const messages: Messages = CATALOGUES[locale]
      const flat = (value: unknown): unknown[] =>
        typeof value === 'object' && value !== null ? Object.values(value).flatMap(flat) : [value]
      for (const entry of flat(messages)) {
        if (typeof entry === 'string') expect(entry.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('grammar each language owns', () => {
  it('conjugates a round win in the second person, differently per language', () => {
    // English changes the verb ending; French changes the whole stem. A shared
    // template with a name hole could not express both.
    expect(CATALOGUES.en.event.roundWon('Ana', true, 30)).toContain('You win')
    expect(CATALOGUES.en.event.roundWon('Ana', false, 30)).toContain('Ana wins')
    expect(CATALOGUES.fr.event.roundWon('Ana', true, 30)).toContain('Tu gagnes')
    expect(CATALOGUES.fr.event.roundWon('Ana', false, 30)).toContain('Ana gagne')
  })

  it('pluralises by each language’s own rule, which differ at zero and one', () => {
    expect(CATALOGUES.en.count.cards(0)).toBe('0 cards')
    expect(CATALOGUES.en.count.cards(1)).toBe('1 card')
    expect(CATALOGUES.en.count.cards(2)).toBe('2 cards')

    // French keeps the singular at zero, where English does not.
    expect(CATALOGUES.fr.count.cards(0)).toBe('0 carte')
    expect(CATALOGUES.fr.count.cards(1)).toBe('1 carte')
    expect(CATALOGUES.fr.count.cards(2)).toBe('2 cartes')
  })

  it('joins a list with each language’s own conjunction', () => {
    expect(CATALOGUES.en.count.list(['Ana', 'Ben', 'Cleo'])).toBe('Ana, Ben and Cleo')
    expect(CATALOGUES.fr.count.list(['Ana', 'Ben', 'Cleo'])).toBe('Ana, Ben et Cleo')
  })

  it('names cards in the language, not in English with a translated colour', () => {
    expect(CATALOGUES.en.card(num(7))).toBe('Red 7')
    expect(CATALOGUES.fr.card(num(7))).toBe('Rouge 7')
    expect(CATALOGUES.en.card(wild4)).toBe('Wild draw four')
    expect(CATALOGUES.fr.card(wild4)).toBe('+4')
  })

  it('describes a played card as a whole sentence per language', () => {
    // Not "{name} played a {card}" with the card slotted in: French puts the verb
    // in the perfect and needs no article here.
    expect(CATALOGUES.en.event.cardPlayed('Ana', num(7))).toBe('Ana played a Red 7')
    expect(CATALOGUES.fr.event.cardPlayed('Ana', num(7))).toBe('Ana a posé Rouge 7')
  })

  it('covers every error code in both languages', () => {
    const codes = Object.keys(CATALOGUES.en.error).sort()
    expect(Object.keys(CATALOGUES.fr.error).sort()).toEqual(codes)
    expect(codes.length).toBeGreaterThan(10)
  })
})

describe('detectLocale', () => {
  it('prefers what was stored', () => {
    window.localStorage.setItem('uno.pref.locale', 'fr')
    expect(detectLocale()).toBe('fr')
    window.localStorage.clear()
  })

  it('ignores a stored value that is not a locale', () => {
    window.localStorage.setItem('uno.pref.locale', 'klingon')
    expect(LOCALES).toContain(detectLocale())
    window.localStorage.clear()
  })

  it('falls back to a locale that exists', () => {
    window.localStorage.clear()
    expect(LOCALES).toContain(detectLocale())
  })
})
