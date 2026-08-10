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
