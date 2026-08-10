import type { Color } from '@uno/engine'

/**
 * The one place a colour becomes a word or a swatch.
 *
 * These tables existed in four files each. Nothing guarded them, so renaming a
 * colour or reordering the seat pigments meant editing four places and getting a
 * self-contradicting interface — the picker saying "Blue" while the discard pile
 * said something else — if one was missed, with no test to notice. It is the same
 * failure the card-scoring table caused before it moved into the engine.
 */
export const COLOR_NAME: Record<Color, string> = {
  R: 'Red',
  G: 'Green',
  B: 'Blue',
  Y: 'Yellow',
}

export const COLOR_VALUE: Record<Color, string> = {
  R: 'var(--red)',
  G: 'var(--green)',
  B: 'var(--blue)',
  Y: 'var(--yellow)',
}

/**
 * The same pigments as values rather than as custom properties.
 *
 * Rendering still goes through `COLOR_VALUE`, so `tokens.css` stays the one place
 * a colour is defined. These exist because a card theme has to *decide* something
 * from a colour — whether a numeral reads better in cream or in ink on this
 * pigment — and a decision cannot be made from the string "var(--red)". No
 * browser is running when that choice is computed, and none is running in the test
 * that asserts the contrast it produces.
 *
 * Two representations of one fact is exactly the duplication this file exists to
 * prevent, so `palette.test.ts` parses `tokens.css` and fails if they drift.
 */
export const COLOR_HEX: Record<Color, string> = {
  R: '#d2321e',
  G: '#1e9e4a',
  B: '#1565b8',
  Y: '#f0b310',
}

/** The card stock and the ink printed on it, in the same two forms. */
export const BONE = { css: 'var(--bone)', hex: '#f5f1e8' }
export const INK = { css: 'var(--ink)', hex: '#14100e' }

/**
 * Seat colours, indexed by `seat % 4`. Deliberately a different order from the
 * card colours: next to a red card, a red avatar reads as a card.
 */
export const SEAT_PIGMENT: readonly string[] = [
  'var(--red)',
  'var(--blue)',
  'var(--yellow)',
  'var(--green)',
]

export const pigmentForSeat = (seat: number): string =>
  SEAT_PIGMENT[seat % SEAT_PIGMENT.length] ?? 'var(--panel-edge)'
