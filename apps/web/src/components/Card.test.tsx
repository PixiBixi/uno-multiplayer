import type { Card as CardData, CardId } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { en } from '../i18n/en.js'
import { fr } from '../i18n/fr.js'
import { LocaleProvider } from '../i18n/LocaleProvider.js'
import { CARD_THEMES } from '../lib/card-themes.js'
import { Card, cardLabel } from './Card.js'

const id = (value: string) => value as CardId
const num = (value: 0 | 5 | 7): CardData => ({ id: id('c1'), kind: 'number', color: 'R', value })

/** Renders in French through the real provider, the way a French browser would. */
const inFrench = (node: React.ReactElement) => {
  window.localStorage.setItem('uno.pref.locale', 'fr')
  const result = render(<LocaleProvider>{node}</LocaleProvider>)
  window.localStorage.clear()
  return result
}

describe('cardLabel', () => {
  it('names a number card by colour and value', () => {
    expect(cardLabel(num(7), false, en)).toBe('Red 7')
  })

  it('names each action card', () => {
    expect(cardLabel({ id: id('a'), kind: 'skip', color: 'G' }, false, en)).toBe('Green skip')
    expect(cardLabel({ id: id('b'), kind: 'reverse', color: 'B' }, false, en)).toBe('Blue reverse')
    expect(cardLabel({ id: id('c'), kind: 'draw2', color: 'Y' }, false, en)).toBe('Yellow draw two')
    expect(cardLabel({ id: id('d'), kind: 'wild' }, false, en)).toBe('Wild')
    expect(cardLabel({ id: id('e'), kind: 'wild4' }, false, en)).toBe('Wild draw four')
  })

  it('names the card in the catalogue it is handed, not in the one it was written in', () => {
    /* The defect this replaced: `cardLabel` built the label from an English table in
       `lib/palette.ts`, so every card on a French table announced itself as "Red 7".
       It is on every card in a hand, on the discard pile and on both previews — the
       most-repeated string in the client, and the one that survived two sweeps. */
    expect(cardLabel(num(7), false, fr)).toBe('Rouge 7')
    expect(cardLabel({ id: id('a'), kind: 'skip', color: 'G' }, false, fr)).toBe('Passe vert')
    expect(cardLabel({ id: id('e'), kind: 'wild4' }, false, fr)).toBe('+4')
  })

  it('says a card is unplayable in each language’s own grammar', () => {
    // English appends a clause after a dash; French turns it into an adjective. A
    // shared suffix would have forced one of them to borrow the other's shape.
    expect(cardLabel(num(7), true, en)).toBe('Red 7 — not playable this turn')
    expect(cardLabel(num(7), true, fr)).toBe('Rouge 7, injouable ce tour-ci')
  })
})

describe('Card', () => {
  it('renders a button labelled by the card', () => {
    render(<Card card={num(7)} onPlay={() => undefined} />)
    expect(screen.getByRole('button', { name: /red 7/i })).toBeTruthy()
  })

  it('calls onPlay when clicked', async () => {
    const onPlay = vi.fn()
    render(<Card card={num(7)} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('is disabled and says why when not playable', async () => {
    const onPlay = vi.fn()
    render(<Card card={num(7)} onPlay={onPlay} disabled />)
    const button = screen.getByRole('button')
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-label')).toMatch(/not playable/i)
    await userEvent.click(button)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('renders static markup with no button when no handler is given', () => {
    render(<Card card={num(7)} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: /red 7/i })).toBeTruthy()
  })

  it('carries a shape token so colour is never the only signal', () => {
    const { container } = render(<Card card={num(7)} />)
    expect(container.querySelectorAll('[data-token]').length).toBeGreaterThan(0)
  })

  it('gives each pigment a distinct shape token', () => {
    const tokenOf = (color: 'R' | 'G' | 'B' | 'Y') => {
      const { container } = render(<Card card={{ id: id('x'), kind: 'number', color, value: 5 }} />)
      return container.querySelector('[data-token]')?.getAttribute('data-token')
    }
    expect(new Set([tokenOf('R'), tokenOf('G'), tokenOf('B'), tokenOf('Y')]).size).toBe(4)
  })

  it('repeats the shape token so the card reads either way up', () => {
    const { container } = render(<Card card={num(7)} />)
    expect(container.querySelectorAll('[data-token]')).toHaveLength(2)
  })

  it('draws four quadrants on a wild', () => {
    const { container } = render(<Card card={{ id: id('w'), kind: 'wild' }} />)
    expect(container.querySelectorAll('[data-quadrant]')).toHaveLength(4)
  })

  it('keeps the +4 label inside the card', () => {
    const { container } = render(<Card card={{ id: id('w4'), kind: 'wild4' }} />)
    expect(container.querySelector('[data-plusfour]')?.getAttribute('y')).toBe('107')
  })

  it('centres every face glyph on the ellipse rather than guessing a baseline', () => {
    for (const card of [
      num(0),
      num(7),
      { id: id('d'), kind: 'draw2' as const, color: 'Y' as const },
    ]) {
      const { container } = render(<Card card={card} />)
      const glyph = container.querySelector('text[font-size="66"], text[font-size="46"]')
      expect(glyph?.getAttribute('dominant-baseline')).toBe('central')
      expect(glyph?.getAttribute('y')).toBe('84')
    }
  })
})

describe('Card under each theme', () => {
  const wild4: CardData = { id: id('w4'), kind: 'wild4' }

  it('says exactly the same thing whatever the theme, because the label is game state', () => {
    /* A display preference must not change what a screen reader hears. "Red 7" is a
       fact about the game; the face it is drawn on is not. */
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe('Red 7')
    }
  })

  it('still says one thing per theme once the language is the other axis', () => {
    /* The label now depends on the language and must still not depend on the face.
       Two knobs, one of which is allowed to change this string and one of which is
       not — worth asserting together, since making the label translatable is exactly
       the change that could have coupled it to the theme by accident. */
    for (const theme of CARD_THEMES) {
      const { container } = inFrench(<Card card={num(7)} theme={theme} />)
      expect(container.querySelector('svg')?.getAttribute('aria-label'), theme).toBe('Rouge 7')
    }
  })

  it('keeps the unplayable note out of the theme’s reach too', () => {
    for (const theme of CARD_THEMES) {
      render(<Card card={wild4} theme={theme} onPlay={() => undefined} disabled />)
    }
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(CARD_THEMES.length)
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')).toBe('Wild draw four — not playable this turn')
    }
  })

  it('keeps it out of the theme’s reach in French too', () => {
    for (const theme of CARD_THEMES) {
      const { container } = inFrench(
        <Card card={wild4} theme={theme} onPlay={() => undefined} disabled />,
      )
      expect(container.querySelector('button')?.getAttribute('aria-label'), theme).toBe(
        '+4, injouable ce tour-ci',
      )
    }
  })

  it('carries both shape tokens in every theme', () => {
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      expect(container.querySelectorAll('[data-token]')).toHaveLength(2)
    }
  })

  it('gives a wild four colours in every theme', () => {
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={{ id: id('w'), kind: 'wild' }} theme={theme} />)
      expect(container.querySelectorAll('[data-quadrant]')).toHaveLength(4)
    }
  })

  it('draws a numeral in every theme', () => {
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      expect(container.querySelector('[data-numeral]')?.textContent).toBe('7')
    }
  })

  it('makes the flat numeral markedly bigger than the classic one', () => {
    const sizeOf = (theme: 'classic' | 'flat') => {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      return Number(container.querySelector('[data-numeral]')?.getAttribute('font-size'))
    }
    expect(sizeOf('flat') / sizeOf('classic')).toBeGreaterThan(1.35)
  })

  it('sets a serif face for letterpress and leaves the display face elsewhere', () => {
    const fontOf = (theme: 'classic' | 'letterpress') => {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      return container.querySelector('svg')?.getAttribute('font-family') ?? ''
    }
    expect(fontOf('letterpress')).toMatch(/georgia|serif/i)
    expect(fontOf('classic')).toBe('var(--display)')
  })

  it('glows on neon only, and outside the glyph rather than through it', () => {
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      const glow = container.querySelectorAll('[data-glow]')
      expect(glow).toHaveLength(theme === 'neon' ? 1 : 0)
      // The glow is a blurred copy behind the numeral. The numeral itself takes no
      // filter, which is what keeps the contrast measured above true of the glyph.
      expect(container.querySelector('[data-numeral]')?.getAttribute('filter')).toBeNull()
    }
  })

  it('draws the rotated oval on classic and on nothing else', () => {
    /* The oval is the classic card. A player who never touches this preference must
       see the face they saw yesterday, which is why classic is also the default. */
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      const oval = container.querySelector('ellipse')
      if (theme === 'classic') {
        expect(oval?.getAttribute('rx')).toBe('52')
        expect(oval?.getAttribute('transform')).toBe('rotate(-27 60 84)')
      } else {
        expect(oval).toBeNull()
      }
    }
  })

  it('outlines the panel rather than filling it where the theme says so', () => {
    const strokeOf = (theme: 'classic' | 'flat' | 'letterpress' | 'neon') => {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      return container.querySelector('[data-panel]')?.getAttribute('stroke')
    }
    expect(strokeOf('classic')).toBeNull()
    expect(strokeOf('flat')).toBeNull()
    expect(strokeOf('letterpress')).toBe('var(--red)')
    expect(strokeOf('neon')).toBe('var(--red)')
  })
})
