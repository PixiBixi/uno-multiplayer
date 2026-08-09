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
