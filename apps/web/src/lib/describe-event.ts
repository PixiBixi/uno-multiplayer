import type { Card, Color } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'

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
 */
export function describeEvent(event: GameEvent, nameOf: (seat: number) => string): string {
  switch (event.type) {
    case 'cardPlayed':
      return `${nameOf(event.seat)} played a ${cardName(event.card)}`
    case 'cardsDrawn':
      return event.count === 1
        ? `${nameOf(event.seat)} drew a card`
        : `${nameOf(event.seat)} drew ${event.count} cards`
    case 'unoCalled':
      return `${nameOf(event.seat)} called UNO`
    case 'unoPenalty':
      return `${nameOf(event.seat)} forgot to call UNO and drew ${event.count}`
    case 'seatDisconnected':
      return `${nameOf(event.seat)} lost connection`
    case 'seatReconnected':
      return `${nameOf(event.seat)} is back`
    case 'seatLeft':
      return `${nameOf(event.seat)} left the game`
    case 'gameOver':
      return event.winner === null
        ? 'Game abandoned — not enough players'
        : `${nameOf(event.winner)} wins`
    case 'gameRestarted':
      return 'A new game was dealt'
  }
}
