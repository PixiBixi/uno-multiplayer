import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COLORS } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import {
  BONE,
  COLOR_HEX,
  COLOR_NAME,
  COLOR_VALUE,
  INK,
  SEAT_PIGMENT,
  pigmentForSeat,
} from './palette.js'

describe('the palette', () => {
  it('names every colour the engine has', () => {
    // Adding a colour to the engine must not leave the interface with a blank.
    for (const color of COLORS) {
      expect(COLOR_NAME[color]).toBeTruthy()
      expect(COLOR_VALUE[color]).toMatch(/^var\(--/)
    }
  })

  it('has a distinct name and swatch per colour', () => {
    expect(new Set(Object.values(COLOR_NAME)).size).toBe(COLORS.length)
    expect(new Set(Object.values(COLOR_VALUE)).size).toBe(COLORS.length)
  })

  it('gives every one of the four seats its own colour', () => {
    const used = [0, 1, 2, 3].map((seat) => pigmentForSeat(seat))
    expect(new Set(used).size).toBe(4)
  })

  it('wraps rather than returning nothing for an out-of-range seat', () => {
    expect(pigmentForSeat(4)).toBe(pigmentForSeat(0))
    expect(pigmentForSeat(9)).toBe(SEAT_PIGMENT[1])
  })

  it('keeps its hex values identical to the tokens the browser actually paints', () => {
    /* The second representation exists so a theme can compute a contrast ratio
       without a browser. It is only safe while it agrees with the stylesheet, and
       nothing else would notice if it stopped: the page would still render the CSS
       variable and the test asserting the ratio would be measuring a colour nobody
       sees. Read from disk by path — `?raw` is intercepted by Vite's CSS plugin. */
    const tokens = readFileSync(resolve(process.cwd(), 'apps/web/src/styles/tokens.css'), 'utf8')
    const declared = (name: string): string => {
      const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8});`).exec(tokens)
      expect(match, `--${name} is not declared in tokens.css`).not.toBeNull()
      return (match?.[1] ?? '').toLowerCase()
    }

    expect(tokens.length).toBeGreaterThan(500)
    expect(COLOR_HEX.R).toBe(declared('red'))
    expect(COLOR_HEX.G).toBe(declared('green'))
    expect(COLOR_HEX.B).toBe(declared('blue'))
    expect(COLOR_HEX.Y).toBe(declared('yellow'))
    expect(BONE.hex).toBe(declared('bone'))
    expect(INK.hex).toBe(declared('ink'))
  })

  it('covers every engine colour in hex as well as in var form', () => {
    for (const color of COLORS) expect(COLOR_HEX[color]).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(Object.values(COLOR_HEX)).size).toBe(COLORS.length)
  })

  it('does not open a seat in the same colour as the card next to it', () => {
    // Seat pigments deliberately run in a different order from the card colours:
    // a red avatar beside a red card reads as another card.
    expect(SEAT_PIGMENT[0]).toBe(COLOR_VALUE.R)
    expect(SEAT_PIGMENT[1]).not.toBe(COLOR_VALUE.G)
  })
})
