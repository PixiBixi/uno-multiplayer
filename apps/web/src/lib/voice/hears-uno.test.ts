import { describe, expect, it } from 'vitest'
import { hearsUno } from './hears-uno.js'

describe('hearsUno', () => {
  it('hears the word itself, however it is punctuated or cased', () => {
    expect(hearsUno('Uno!', 'fr')).toBe(true)
    expect(hearsUno('uno', 'en')).toBe(true)
    expect(hearsUno('  UNO  ', 'en')).toBe(true)
  })

  it('hears what a recogniser returns instead of the word', () => {
    expect(hearsUno('ou no', 'fr')).toBe(true)
    expect(hearsUno('juno', 'fr')).toBe(true)
    expect(hearsUno('u no', 'en')).toBe(true)
    expect(hearsUno('oono', 'en')).toBe(true)
  })

  it('drops accents a recogniser may add', () => {
    expect(hearsUno('ünó', 'fr')).toBe(true)
  })

  it('finds the word inside a longer transcript', () => {
    expect(hearsUno('attends uno voila', 'fr')).toBe(true)
  })

  it('never hears "you know", the filler that would rebuild the bug', () => {
    expect(hearsUno('you know', 'en')).toBe(false)
    expect(hearsUno('you know what I mean', 'en')).toBe(false)
  })

  it('needs the whole word, not a fragment of a longer one', () => {
    expect(hearsUno('unoriginal', 'en')).toBe(false)
    expect(hearsUno('unanimous', 'en')).toBe(false)
  })

  it('does not hear French words that merely start the same way', () => {
    expect(hearsUno('un os', 'fr')).toBe(false)
    expect(hearsUno('une carte', 'fr')).toBe(false)
  })

  it('hears nothing in nothing', () => {
    expect(hearsUno('', 'fr')).toBe(false)
    expect(hearsUno('   ', 'en')).toBe(false)
  })
})
