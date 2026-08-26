import type { Card as CardData, CardId } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { en } from '../i18n/en.js'
import { fr } from '../i18n/fr.js'
import { LocaleProvider } from '../i18n/LocaleProvider.js'
import { CARD_THEMES, CARD_THEME_SPEC } from '../lib/card-themes.js'
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
       It is on every card in a hand, on the discard pile and on both previews - the
       most-repeated string in the client, and the one that survived two sweeps. */
    expect(cardLabel(num(7), false, fr)).toBe('Rouge 7')
    expect(cardLabel({ id: id('a'), kind: 'skip', color: 'G' }, false, fr)).toBe('Passe vert')
    expect(cardLabel({ id: id('e'), kind: 'wild4' }, false, fr)).toBe('+4')
  })

  it('says a card is unplayable in each language’s own grammar', () => {
    // English appends a clause after a dash; French turns it into an adjective. A
    // shared suffix would have forced one of them to borrow the other's shape.
    expect(cardLabel(num(7), true, en)).toBe('Red 7 - not playable this turn')
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

  /* At least one, which is the accessibility guarantee: colour is the rule in UNO, so it
     cannot also be the only way to read a card. How MANY there are depends on the face -
     a printed one mirrors its corner marks, a poster one cannot - and that count is
     asserted per layout further down. */
  /* At least one, which is the accessibility guarantee: colour is the rule in UNO, so it
     cannot also be the only way to read a card. How many depends on the face, and that
     count is asserted per layout further down. */
  it('always draws a shape token, so colour is never the only signal', () => {
    const { container } = render(<Card card={num(7)} />)
    expect(container.querySelectorAll('[data-token]').length).toBeGreaterThan(0)
  })

  it('draws four quadrants on a wild', () => {
    const { container } = render(<Card card={{ id: id('w'), kind: 'wild' }} />)
    expect(container.querySelectorAll('[data-quadrant]')).toHaveLength(4)
  })

  /* The viewBox is 120x168 and the +4 label sits INSIDE the face. Asserted as a bound
     rather than as one coordinate: every theme places it, and a theme that puts it a
     few units lower has not broken anything until it leaves the card. */
  it('keeps the +4 label inside the card, whatever the face', () => {
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={{ id: id('w4'), kind: 'wild4' }} theme={theme} />)
      const y = Number(container.querySelector('[data-plusfour]')?.getAttribute('y'))
      expect(y, theme).toBeGreaterThan(0)
      expect(y, theme).toBeLessThan(168)
    }
  })

  /* One design language per card. A printed face carries its corner marks twice, the
     second pair rotated about the centre so it reads either way up. The corner face
     carries them once: a poster numeral in one corner and printed trim in the next one
     along are two languages, and side by side at the same height they read as two marks
     competing rather than as one card. Not an overlap - measured, they cleared each other
     by eight units, and it still looked wrong. */
  it('mirrors the corner marks only on a face that is not already a poster', () => {
    for (const theme of CARD_THEMES) {
      const cornerFace = CARD_THEME_SPEC[theme].layout === 'corner'
      const { container } = render(<Card card={num(7)} theme={theme} />)
      // The size lives on the group that wraps them, so the group is what to look inside.
      const trim = container.querySelector('g[font-size="17"]')
      expect([...(trim?.querySelectorAll('text') ?? [])], `${theme} labels`).toHaveLength(
        cornerFace ? 1 : 2,
      )
      expect(container.querySelectorAll('[data-token]'), `${theme} tokens`).toHaveLength(
        cornerFace ? 1 : 2,
      )
    }
  })

  /* The bar of a skip poked out of its own ring: it ended 1 unit past the ring's centre
     line and a 9-unit round cap added 4.5 more, so both tips showed outside the circle.
     Asserted as containment rather than as coordinates - the cap is what made it visible,
     and a future nudge to the radius has to keep the arithmetic true. */
  it('keeps the skip bar inside its ring, cap included', () => {
    const { container } = render(
      <Card card={{ id: id('s'), kind: 'skip', color: 'G' }} theme="flat" />,
    )
    const ring = container.querySelector('circle')
    const bar = container.querySelector('line')
    const at = (node: Element | null, name: string) => Number(node?.getAttribute(name))
    const cx = at(ring, 'cx')
    const cy = at(ring, 'cy')
    const r = at(ring, 'r')
    const stroke = 9
    const tips: [number, number][] = [
      [at(bar, 'x1'), at(bar, 'y1')],
      [at(bar, 'x2'), at(bar, 'y2')],
    ]
    for (const [ax, ay] of tips) {
      const reach = Math.hypot(ax - cx, ay - cy) + stroke / 2
      expect(reach, 'bar tip plus its cap stays within the ring').toBeLessThanOrEqual(
        r + stroke / 2,
      )
    }
  })

  /* "+4" was printed twice on the poster face - once as the corner label, once under the
     wheel - which is the one card in the deck that can least afford to look uncertain. */
  it('says +4 once on the poster face, and drops the wheel that duplicated it', () => {
    const { container } = render(<Card card={{ id: id('w4'), kind: 'wild4' }} theme="poster" />)
    expect(container.querySelectorAll('[data-plusfour]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-quadrant]'), 'no centre wheel').toHaveLength(0)
  })

  /* A wild has no colour, so borrowing the red circle told the player something false
     about the one card whose colour is still a choice. */
  it('marks a wild with all four pigments rather than one of them', () => {
    for (const kind of ['wild', 'wild4'] as const) {
      const { container } = render(<Card card={{ id: id(kind), kind }} theme="poster" />)
      const token = container.querySelector('[data-token]')
      expect(token?.getAttribute('data-token'), kind).toBe('wild')
      expect(token?.querySelectorAll('rect'), kind).toHaveLength(4)
    }
  })

  /* The clipping, which was the actual defect behind two rounds of guessing at the marks. */
  it('keeps the corner numeral inside the card it is printed on', () => {
    for (const theme of CARD_THEMES) {
      if (CARD_THEME_SPEC[theme].layout !== 'corner') continue
      const { container } = render(<Card card={num(7)} theme={theme} />)
      const baseline = Number(container.querySelector('[data-numeral]')?.getAttribute('y'))
      expect(baseline, `${theme} baseline inside the 168-unit viewBox`).toBeLessThanOrEqual(168)
    }
  })

  /* The point of the original guard: the mark is placed against a declared anchor, not
     a guessed baseline. The corner face moves that anchor, so the assertion follows the
     theme's own `layout` instead of hard-coding the centred one. */
  it('anchors every face glyph where its layout says, never on a guessed baseline', () => {
    for (const theme of CARD_THEMES) {
      const cornerFace = CARD_THEME_SPEC[theme].layout === 'corner'
      for (const card of [
        num(0),
        num(7),
        { id: id('d'), kind: 'draw2' as const, color: 'Y' as const },
      ]) {
        const { container } = render(<Card card={card} theme={theme} />)
        const glyph = container.querySelector('[data-numeral]')
        expect(glyph?.getAttribute('dominant-baseline'), theme).toBe(
          cornerFace ? 'alphabetic' : 'central',
        )
        expect(glyph?.getAttribute('text-anchor'), theme).toBe(cornerFace ? 'start' : 'middle')
      }
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
       not - worth asserting together, since making the label translatable is exactly
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
      expect(button.getAttribute('aria-label')).toBe('Wild draw four - not playable this turn')
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

  it('carries a shape token in every theme, whatever the face does with it', () => {
    for (const theme of CARD_THEMES) {
      const { container } = render(<Card card={num(7)} theme={theme} />)
      expect(container.querySelectorAll('[data-token]').length, theme).toBeGreaterThan(0)
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
