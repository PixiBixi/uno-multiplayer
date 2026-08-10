import type { Color } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import {
  CARD_THEMES,
  CARD_THEME_SPEC,
  DEFAULT_CARD_THEME,
  cardPaints,
  nextCardTheme,
  pigmentPaint,
  type CardTheme,
  type CardThemeSpec,
} from './card-themes.js'
import { contrastRatio } from './contrast.js'

const COLORS: Color[] = ['R', 'G', 'B', 'Y']

/** Every key a theme must decide for itself. A missing one is a blank card face. */
const FIELDS: (keyof CardThemeSpec)[] = [
  'stock',
  'panel',
  'panelStroke',
  'ground',
  'oval',
  'light',
  'dark',
  'font',
  'numeral',
  'weight',
  'faceInk',
  'trimInk',
  'tokenInk',
  'tokenOutline',
  'wild',
  'wildPigment',
  'glow',
]

/**
 * `classic` is held to a lower bar than the other three, on purpose and in writing.
 *
 * It is the card every player already has — a pigment numeral on a bone oval — and
 * the requirement was that it look exactly as it does today. Its yellow numeral
 * measures 1.67:1, which is a property of the printed card and not of this change.
 * Writing the exemption down keeps a new theme from quietly joining it.
 */
const PRINTED_CARD: CardTheme[] = ['classic']
const CHOSEN: CardTheme[] = CARD_THEMES.filter((theme) => !PRINTED_CARD.includes(theme))

describe('the themes as data', () => {
  it('defaults to the card everybody already has', () => {
    expect(DEFAULT_CARD_THEME).toBe('classic')
    expect(CARD_THEMES[0]).toBe('classic')
  })

  it('gives every theme every field', () => {
    for (const theme of CARD_THEMES) {
      const spec = CARD_THEME_SPEC[theme]
      expect(Object.keys(spec).sort()).toEqual([...FIELDS].sort())
      for (const field of FIELDS) expect(spec[field]).not.toBeUndefined()
    }
  })

  it('makes no two themes the same card', () => {
    const shapes = CARD_THEMES.map((theme) => JSON.stringify(CARD_THEME_SPEC[theme]))
    expect(new Set(shapes).size).toBe(CARD_THEMES.length)
  })

  it('keeps a shape token in every theme, because colour is never the only signal', () => {
    for (const theme of CARD_THEMES) {
      for (const color of COLORS) {
        const paints = cardPaints(CARD_THEME_SPEC[theme], pigmentPaint(color))
        expect(paints.token.css.length).toBeGreaterThan(0)
        // A token painted in the ground it sits on is the same as no token at all.
        expect(paints.token.hex).not.toBe(paints.ground.hex)
      }
    }
  })

  it('cycles through every theme and comes back round', () => {
    const seen: CardTheme[] = [DEFAULT_CARD_THEME]
    let theme: CardTheme = DEFAULT_CARD_THEME
    for (let step = 0; step < CARD_THEMES.length - 1; step += 1) {
      theme = nextCardTheme(theme)
      seen.push(theme)
    }
    expect(seen).toEqual([...CARD_THEMES])
    expect(nextCardTheme(theme)).toBe(DEFAULT_CARD_THEME)
  })
})

describe('measured contrast', () => {
  it('clears 4.5:1 for the numeral on every colour of every chosen theme', () => {
    const failures: string[] = []
    for (const theme of CHOSEN) {
      for (const color of COLORS) {
        const paints = cardPaints(CARD_THEME_SPEC[theme], pigmentPaint(color))
        const ratio = contrastRatio(paints.face.hex, paints.faceGround.hex)
        if (ratio < 4.5) failures.push(`${theme}/${color} ${ratio.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  it('clears 3:1 for the shape token of every chosen theme, outline included', () => {
    const failures: string[] = []
    for (const theme of CHOSEN) {
      for (const color of COLORS) {
        const paints = cardPaints(CARD_THEME_SPEC[theme], pigmentPaint(color))
        const edge = paints.tokenEdge
        /* A pale pigment on pale stock is unreadable as a shape unless the theme
           edges it, which is why letterpress carries an outline and neon does not. */
        const ratio = Math.max(
          contrastRatio(paints.token.hex, paints.ground.hex),
          edge === null ? 0 : contrastRatio(edge.hex, paints.ground.hex),
        )
        if (ratio < 3) failures.push(`${theme}/${color} ${ratio.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  it('records what the printed card measures, so nobody assumes it passes', () => {
    const yellow = cardPaints(CARD_THEME_SPEC.classic, pigmentPaint('Y'))
    expect(contrastRatio(yellow.face.hex, yellow.faceGround.hex)).toBeLessThan(2)
  })

  it('keeps a wild legible in every theme', () => {
    for (const theme of CARD_THEMES) {
      const spec = CARD_THEME_SPEC[theme]
      const paints = cardPaints(spec, spec.wildPigment)
      // The +4 label sits inside the face, so it is the one that has to survive
      // whatever the theme put behind it.
      expect(contrastRatio(paints.legible.hex, paints.faceGround.hex)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives neon a numeral no weaker than any other theme, glow included', () => {
    /* The point of the whole exercise: neon was presented as the least legible of
       the four. It is now measured against the same ground as the rest, and its
       glow is an outer effect that never lands inside the glyph. */
    const neon = COLORS.map((color) => {
      const paints = cardPaints(CARD_THEME_SPEC.neon, pigmentPaint(color))
      return contrastRatio(paints.face.hex, paints.faceGround.hex)
    })
    const others = CARD_THEMES.filter((theme) => theme !== 'neon').flatMap((theme) =>
      COLORS.map((color) => {
        const paints = cardPaints(CARD_THEME_SPEC[theme], pigmentPaint(color))
        return contrastRatio(paints.face.hex, paints.faceGround.hex)
      }),
    )
    expect(Math.min(...neon)).toBeGreaterThanOrEqual(Math.min(...others))
  })
})
