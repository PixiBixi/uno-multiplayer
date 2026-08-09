import type { Card, Color } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'
import { cardCount, isBackPhrase, matchResultPhrase, pointsCount, winsPhrase } from './phrase.js'

const COLOR_NAME: Record<Color, string> = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' }

function cardName(card: Card): string {
  switch (card.kind) {
    case 'number':
      return `${COLOR_NAME[card.color]} ${card.value}`
    case 'skip':
      return `${COLOR_NAME[card.color]} skip`
    case 'reverse':
      return `${COLOR_NAME[card.color]} reverse`
    case 'draw2':
      return `${COLOR_NAME[card.color]} draw two`
    case 'wild':
      return 'Wild'
    case 'wild4':
      return 'Wild draw four'
  }
}

/**
 * Turns a server event into a line a player understands. Written from the
 * player's side of the screen: names, not seat indices, wherever one is known.
 *
 * `mySeat` is passed rather than inferred from the name, so the second person
 * gets the right verb without string-matching "You".
 */
export function describeEvent(
  event: GameEvent,
  nameOf: (seat: number) => string,
  mySeat: number,
): string {
  switch (event.type) {
    case 'cardPlayed':
      return `${nameOf(event.seat)} played a ${cardName(event.card)}`
    case 'cardsDrawn':
      return event.count === 1
        ? `${nameOf(event.seat)} drew a card`
        : `${nameOf(event.seat)} drew ${cardCount(event.count)}`
    case 'unoCalled':
      return `${nameOf(event.seat)} called UNO`
    case 'unoPenalty':
      return `${nameOf(event.seat)} forgot to call UNO and drew ${cardCount(event.count)}`
    case 'seatDisconnected':
      return `${nameOf(event.seat)} lost connection`
    case 'seatReconnected':
      return isBackPhrase(nameOf(event.seat), event.seat === mySeat)
    case 'seatLeft':
      return `${nameOf(event.seat)} left the game`
    case 'roundEnded': {
      if (event.winner === null) return 'Round abandoned — not enough players'
      const won = winsPhrase(nameOf(event.winner), event.winner === mySeat)
      const awarded = event.awarded[event.winner] ?? 0
      return `${won} the round, +${pointsCount(awarded)}`
    }
    case 'matchEnded':
      return matchResultPhrase(
        event.winners.map((seat) => nameOf(seat)),
        event.winners.includes(mySeat),
      )
    case 'roundStarted':
      return `Round ${String(event.round)} dealt`
    case 'turnTimedOut':
      return event.seat === mySeat ? 'You ran out of time' : `${nameOf(event.seat)} ran out of time`
    case 'gameRestarted':
      return 'A new match was dealt'
  }
}
