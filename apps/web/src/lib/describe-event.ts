import type { GameEvent } from '@uno/protocol'
import type { Messages } from '../i18n/messages.js'

/**
 * Turns a server event into a line a player understands, in their language.
 *
 * Each case picks a whole sentence from the catalogue rather than assembling one
 * from fragments. Assembling here would bake English word order into every
 * translation: "Ana played a Red 7" and "Ana a posé Rouge 7" do not decompose the
 * same way, and neither does a plural or a conjugation.
 *
 * `mySeat` is passed rather than inferred from the name, so the second person
 * gets the right verb without string-matching a display name.
 */
/**
 * Whose line this is, or null for one that belongs to the table rather than to a person.
 *
 * The log used to be a column of identical grey lines. A pigment down the left edge is
 * the same device the seat rail and the roster use, and it is what lets a player find
 * "what did Ben just do" without reading four sentences - but `describeEvent` returns a
 * sentence, so the seat has to be read off the event itself. A switch rather than a
 * lookup: a new event type fails the typecheck here instead of quietly rendering grey.
 */
export function seatOfEvent(event: GameEvent): number | null {
  switch (event.type) {
    case 'cardPlayed':
    case 'cardsDrawn':
    case 'unoCalled':
    case 'unoPenalty':
    case 'handsSwapped':
    case 'jumpedIn':
    case 'turnPassed':
    case 'seatDisconnected':
    case 'seatReconnected':
    case 'seatLeft':
    case 'turnTimedOut':
      return event.seat
    /* The accuser, not the accused: it is their line, and the penalty arrives as its own
       `unoPenalty` event against the target right after. */
    case 'calledOut':
      return event.by
    case 'roundEnded':
      return event.winner
    case 'matchEnded':
      return event.winners[0] ?? null
    /* Nobody's in particular: the table's own. */
    case 'handsRotated':
    case 'roundStarted':
    case 'gameRestarted':
      return null
  }
}

export function describeEvent(
  event: GameEvent,
  nameOf: (seat: number) => string,
  mySeat: number,
  messages: Messages,
): string {
  const m = messages.event
  switch (event.type) {
    case 'cardPlayed':
      return m.cardPlayed(nameOf(event.seat), event.seat === mySeat, event.card)
    case 'cardsDrawn':
      return m.cardsDrawn(nameOf(event.seat), event.seat === mySeat, event.count)
    case 'unoCalled':
      return m.unoCalled(nameOf(event.seat), event.seat === mySeat)
    case 'unoPenalty':
      return m.unoPenalty(nameOf(event.seat), event.seat === mySeat, event.count)
    case 'calledOut':
      return m.calledOut(
        nameOf(event.by),
        event.by === mySeat,
        nameOf(event.target),
        event.target === mySeat,
      )
    case 'handsSwapped':
      return m.handsSwapped(
        nameOf(event.seat),
        event.seat === mySeat,
        nameOf(event.with),
        event.with === mySeat,
      )
    case 'jumpedIn':
      return m.jumpedIn(nameOf(event.seat), event.seat === mySeat)
    case 'turnPassed':
      return m.turnPassed(nameOf(event.seat), event.seat === mySeat)
    case 'handsRotated':
      // A direction, not a 1 or a -1: the sentence has to name which way, and each
      // language spells that out for itself.
      return m.handsRotated(event.direction === 1)
    case 'seatDisconnected':
      return m.seatDisconnected(nameOf(event.seat))
    case 'seatReconnected':
      return m.seatReconnected(nameOf(event.seat), event.seat === mySeat)
    case 'seatLeft':
      return m.seatLeft(nameOf(event.seat))
    case 'turnTimedOut':
      return m.turnTimedOut(nameOf(event.seat), event.seat === mySeat)
    case 'roundEnded': {
      if (event.winner === null) return m.roundAbandoned()
      return m.roundWon(
        nameOf(event.winner),
        event.winner === mySeat,
        event.awarded[event.winner] ?? 0,
      )
    }
    case 'matchEnded':
      return m.matchResult(
        event.winners.map((seat) => nameOf(seat)),
        event.winners.includes(mySeat),
      )
    case 'roundStarted':
      return m.roundStarted(event.round)
    case 'gameRestarted':
      return m.gameRestarted()
  }
}
