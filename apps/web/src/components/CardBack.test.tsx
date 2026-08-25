import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CARD_THEMES, CARD_THEME_SPEC, stockOf } from '../lib/card-themes.js'
import { INK } from '../lib/palette.js'
import { CardBack } from './CardBack.js'
import { CardThemeProvider } from './CardThemeProvider.js'

/**
 * The back was reported as "a blank pale rectangle" on one player's screen while
 * the fanned backs beside it drew correctly. The cause turned out to be a CSS
 * overlay left on the draw pile after its animation ended - measured in a real
 * browser, and guarded by an end-to-end test, because opacity on a pseudo-element
 * is not a thing jsdom has an opinion about.
 *
 * These are the cheap half of that guard: whatever the theme, the back has to draw
 * a badge and has to draw *something* over its stock. It is the property a screenshot
 * was standing in for, and it costs a millisecond.
 */

const backFor = (theme: (typeof CARD_THEMES)[number]) =>
  render(<CardBack theme={theme} />).container

describe('CardBack under every theme', () => {
  it('draws the UNO badge, whatever the face', () => {
    for (const theme of CARD_THEMES) {
      const word = backFor(theme).querySelector('[data-back-word]')
      expect(word?.textContent, theme).toBe('UNO')
    }
  })

  it('paints the badge shape in the brand red wherever a theme draws one', () => {
    /* The badge is the one mark on the table that says nothing about game state, so
       where it exists it keeps a fixed colour. A theme with the rotated oval prints
       it there; a stroked-panel theme puts the red in its border instead.

       Which themes those are is read out of the spec rather than listed, so a fifth
       theme is covered the day it is added. `flat` has neither an oval nor a stroke
       and so carries no red at all - it is the word alone on a dark panel. That is
       the current design and not a claim this test makes about it. */
    for (const theme of CARD_THEMES) {
      const spec = CARD_THEME_SPEC[theme]
      if (spec.oval === null && spec.panel !== 'stroke') continue
      const container = backFor(theme)
      const oval = container.querySelector('[data-back-badge]')?.getAttribute('fill') ?? null
      const border = container.querySelector('[data-back-panel]')?.getAttribute('stroke') ?? null
      expect([oval, border], theme).toContain('var(--red)')
    }
  })

  it('grounds a filled panel in something other than the stock it sits on', () => {
    /* The pale-rectangle report's other candidate explanation: a ground that
       collapses to the stock colour leaves the panel invisible and the card looks
       like blank paper. Only the filled-panel themes are held to this - letterpress
       and neon stroke their panel and deliberately ground it in their own stock,
       taking their edge from the red border instead. Read from the spec so a fifth
       theme lands on the right side of the line by itself. */
    for (const theme of CARD_THEMES) {
      const spec = CARD_THEME_SPEC[theme]
      if (spec.panel !== 'fill') continue
      /* Nor a face whose stock IS its pigment: it has no edge of its own by design - the
         card is one field and the gap between cards does the separating - so "the panel
         must differ from the stock it sits on" is a distinction that face does not draw.
         Read from the spec, not from a theme name, so a sixth face lands on the right
         side of the line by itself. What keeps it from being blank paper is the next
         test: something drawn over the stock still has to differ from it. */
      if (spec.stock === 'pigment') continue
      const container = backFor(theme)
      const stock = container.querySelector('[data-back-stock]')?.getAttribute('fill')
      const ground = container.querySelector('[data-back-panel]')?.getAttribute('fill')
      expect(ground, theme).toBeTruthy()
      expect(ground, theme).not.toBe(stock)
    }
  })

  it('never leaves the back as a bare sheet of stock', () => {
    /* What "blank and pale" looked like. The panel and the badge are both drawn over
       the stock, and at least one of them has to differ from it - letterpress
       deliberately grounds its panel in the same paper, and earns its contrast from
       the red border instead. */
    for (const theme of CARD_THEMES) {
      const container = backFor(theme)
      const stock = container.querySelector('[data-back-stock]')?.getAttribute('fill')
      const marks = [
        container.querySelector('[data-back-panel]')?.getAttribute('fill'),
        container.querySelector('[data-back-panel]')?.getAttribute('stroke'),
        container.querySelector('[data-back-badge]')?.getAttribute('fill'),
        container.querySelector('[data-back-word]')?.getAttribute('fill'),
      ].filter((paint): paint is string => paint !== null && paint !== undefined)

      expect(stock, theme).toBe(stockOf(CARD_THEME_SPEC[theme], INK).css)
      expect(
        marks.some((paint) => paint !== stock),
        theme,
      ).toBe(true)
    }
  })

  it('keeps the word off its own ground, so it cannot vanish into it', () => {
    for (const theme of CARD_THEMES) {
      const container = backFor(theme)
      const ink = container.querySelector('[data-back-word]')?.getAttribute('fill')
      const behind =
        container.querySelector('[data-back-badge]')?.getAttribute('fill') ??
        container.querySelector('[data-back-panel]')?.getAttribute('fill')
      expect(ink, theme).toBeTruthy()
      expect(ink, theme).not.toBe(behind)
    }
  })

  it('says the same thing to a screen reader whatever the face', () => {
    // The face is a preference; "face-down" is game state. The language is the other
    // axis and is asserted in `i18n/rendered-in-french.test.tsx`.
    for (const theme of CARD_THEMES) {
      const label = backFor(theme).querySelector('svg')?.getAttribute('aria-label')
      expect(label, theme).toBe('Face-down card')
    }
  })

  it('marks itself face-down in a way no language can change', () => {
    /* The leak test in `e2e/game.spec.ts` counts how many cards in a document are face
       *up*, and it used to do that by comparing the label to the English. A translated
       label would have made every card look face-up and the assertion pass for nothing,
       so the fact is carried by an attribute as well as by a word. */
    for (const theme of CARD_THEMES) {
      expect(backFor(theme).querySelector('svg[data-face-down]'), theme).not.toBeNull()
    }
  })
})

describe('CardBack and its provider', () => {
  it('draws a real card with no provider above it at all', () => {
    /* The context default is the shipping face and a setter that does nothing, so an
       error-boundary fallback or a stray render outside the tree still draws a card
       rather than an empty rectangle. Asserted on the word and the panel rather than
       on the oval badge: whether a face carries one is a property of the theme, and
       the default no longer does. */
    const { container } = render(<CardBack />)
    expect(container.querySelector('[data-back-word]')?.textContent).toBe('UNO')
    expect(container.querySelector('[data-back-panel]')).not.toBeNull()
  })

  it('follows the provider when no theme is passed', () => {
    window.localStorage.setItem('uno.pref.cardTheme', 'neon')
    const { container } = render(
      <CardThemeProvider>
        <CardBack />
      </CardThemeProvider>,
    )
    // Neon strokes its panel and draws no oval, unlike the classic default.
    expect(container.querySelector('[data-back-panel]')?.getAttribute('stroke')).toBe('var(--red)')
    expect(container.querySelector('[data-back-badge]')).toBeNull()
    window.localStorage.clear()
  })

  it('lets an explicit theme win over the provider, as the previews need', () => {
    window.localStorage.setItem('uno.pref.cardTheme', 'neon')
    const { container } = render(
      <CardThemeProvider>
        <CardBack theme="classic" />
      </CardThemeProvider>,
    )
    expect(container.querySelector('[data-back-badge]')).not.toBeNull()
    window.localStorage.clear()
  })
})
