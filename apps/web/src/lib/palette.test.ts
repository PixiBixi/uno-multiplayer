import { COLORS } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { COLOR_NAME, COLOR_VALUE, SEAT_PIGMENT, pigmentForSeat } from './palette.js'

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

  it('does not open a seat in the same colour as the card next to it', () => {
    // Seat pigments deliberately run in a different order from the card colours:
    // a red avatar beside a red card reads as another card.
    expect(SEAT_PIGMENT[0]).toBe(COLOR_VALUE.R)
    expect(SEAT_PIGMENT[1]).not.toBe(COLOR_VALUE.G)
  })
})
