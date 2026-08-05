import type { Card, Color } from '@uno/engine'

/** Card kinds dramatic enough to earn a table-wide burst, beyond the routine
 *  drop every card gets on the discard pile. */
export type EffectKind = 'wild4' | 'wild' | 'draw2' | 'skip' | 'reverse'

export type PlayEffect = { kind: EffectKind; color: Color }

/** How long each burst stays on screen, in ms. Wild +4 lingers longest and is
 *  the one that shakes the table — the "impactant" one, by request. */
export const EFFECT_DURATION_MS: Record<EffectKind, number> = {
  wild4: 900,
  wild: 700,
  draw2: 650,
  skip: 500,
  reverse: 550,
}

/**
 * Decides the burst for a card that just landed on the discard pile, or `null`
 * for a plain number — nothing dramatic happens for those beyond the routine
 * drop.
 *
 * Takes the view's own post-move `currentColor` rather than the card's colour,
 * and deliberately has no dependency on the separate `game:event` feed: wild
 * and wild4 carry no colour of their own in the engine's `Card` type, and the
 * feed is delivered as its own socket message with no ordering guarantee
 * relative to the view that carries the chosen colour. `currentColor` on THIS
 * view is always right by construction — the reducer sets it to the card's own
 * colour for skip/reverse/draw2, and to the chosen colour for a wild, in the
 * same update that placed the card — so one field serves every kind.
 */
export function effectForCard(card: Card, currentColor: Color): PlayEffect | null {
  switch (card.kind) {
    case 'wild4':
    case 'wild':
    case 'skip':
    case 'reverse':
    case 'draw2':
      return { kind: card.kind, color: currentColor }
    case 'number':
      return null
  }
}
