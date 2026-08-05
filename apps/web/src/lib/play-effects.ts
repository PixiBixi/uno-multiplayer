import type { Card, Color } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'

/** Card kinds dramatic enough to earn a table-wide burst, beyond the routine
 *  drop every card gets on the discard pile. */
export type CardEffectKind = 'wild4' | 'wild' | 'draw2' | 'skip' | 'reverse'

/** Everything that gets a burst on the overlay. A draw is deliberately absent:
 *  it pulses the draw pile instead, and CSS owns that timing. */
export type EffectKind = CardEffectKind | 'uno'

export type PlayEffect = { kind: CardEffectKind; color: Color }

/** A burst waiting on the overlay, tagged with a key so it can be cleared. */
export type ActiveEffect = { key: string; kind: EffectKind; color?: Color }

/** How long each burst stays on screen, in ms. Wild +4 lingers longest and is
 *  the one that shakes the table — the "impactant" one, by request. */
export const EFFECT_DURATION_MS: Record<EffectKind, number> = {
  wild4: 900,
  uno: 780,
  wild: 700,
  draw2: 650,
  reverse: 550,
  skip: 500,
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

/** What a feed event should trigger, if anything. */
export type FeedEffect = { overlay: 'uno' } | { pulse: 'draw' } | null

/**
 * Calling UNO and drawing are read from the `game:event` feed, not from the
 * view — the exact opposite of the card bursts above, and for a concrete reason:
 * `PlayerView` carries no `unoCalled` field at all, and a hand growing is
 * ambiguous on its own since a +2 grows it too. These events are safe to read
 * from the feed because each carries everything it needs; unlike the wild
 * colour, nothing has to be correlated with a separate message.
 */
export function effectForFeedEvent(event: GameEvent): FeedEffect {
  switch (event.type) {
    case 'unoCalled':
      return { overlay: 'uno' }
    // Both mean cards genuinely left the pile, so both pulse it. The penalty
    // keeps its toast as well; this is only the physical cue.
    case 'cardsDrawn':
    case 'unoPenalty':
      return { pulse: 'draw' }
    default:
      return null
  }
}
