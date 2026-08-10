import type { Card } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'

export type SoundName =
  | 'play'
  | 'draw'
  | 'draw2'
  | 'wild'
  | 'wild4'
  | 'skip'
  | 'reverse'
  | 'uno'
  | 'roundWon'
  | 'roundOver'
  | 'matchWon'
  | 'matchOver'
  | 'yourTurn'
  | 'timedOut'

/**
 * Which sound a played card makes. Unlike the visual burst — which reads the view
 * because it needs the colour chosen for a wild, and the feed cannot be trusted
 * to have caught up — sound depends only on the card's kind. That is what lets
 * every cue here come from one source, the feed, and stay testable without a
 * browser or an AudioContext.
 */
export function soundForCard(card: Card): SoundName {
  switch (card.kind) {
    case 'draw2':
      return 'draw2'
    case 'wild4':
      return 'wild4'
    case 'wild':
      return 'wild'
    case 'skip':
      return 'skip'
    case 'reverse':
      return 'reverse'
    case 'number':
      return 'play'
  }
}

/**
 * `mySeat` is passed rather than inferred, for the same reason describeEvent takes
 * it: winning and watching someone else win are different events to the person
 * hearing them, and a sound that cannot tell them apart congratulates the loser.
 */
export function soundForEvent(event: GameEvent, mySeat: number): SoundName | null {
  switch (event.type) {
    case 'cardPlayed':
      return soundForCard(event.card)
    case 'cardsDrawn':
    case 'unoPenalty':
      return 'draw'
    /* A call-out shares the cue of the call it punishes rather than getting one of
       its own: the two belong to a single rule, and the cards it costs already
       arrive separately as a draw. */
    case 'unoCalled':
    case 'calledOut':
      return 'uno'
    case 'turnTimedOut':
      /* Sounded for everyone, not only the seat it happened to: at speed the
         table needs to hear that play moved on without a card being chosen. */
      return 'timedOut'
    case 'roundEnded':
      return event.winner === mySeat ? 'roundWon' : 'roundOver'
    case 'matchEnded':
      // A shared win still counts as yours.
      return event.winners.includes(mySeat) ? 'matchWon' : 'matchOver'
    // Deliberately silent: a seat connecting, leaving, or a new deal are changes
    // the log already reports, and a noise for each would be chatter.
    case 'seatDisconnected':
    case 'seatReconnected':
    case 'seatLeft':
    case 'roundStarted':
    case 'gameRestarted':
      return null
  }
}

/**
 * The cues for one batch of new events, in order.
 *
 * A match ending arrives as roundEnded immediately followed by matchEnded, and
 * playing both would stack two endings on top of each other. The bigger one wins.
 */
export function soundsForEvents(events: GameEvent[], mySeat: number): SoundName[] {
  const endsMatch = events.some((event) => event.type === 'matchEnded')
  return events
    .map((event) => soundForEvent(event, mySeat))
    .filter((name): name is SoundName => name !== null)
    .filter((name) => !(endsMatch && (name === 'roundOver' || name === 'roundWon')))
}
