import type { GameEvent, SeatStats } from '@uno/protocol'

/**
 * Match statistics, counted from the event feed rather than from bookkeeping of
 * their own.
 *
 * The feed is already the single description of everything that happened, and it
 * is derived from the game state rather than hand-written, so a tally taken from
 * it cannot claim something the game did not do. Adding a second set of counters
 * updated alongside the rules would be a second thing to keep in step.
 *
 * Pure, so the whole thing is testable without a room, a socket or a clock.
 */
export const emptyStats = (): SeatStats => ({
  cardsPlayed: 0,
  wild4Played: 0,
  draw2Played: 0,
  cardsDrawn: 0,
  unoCalls: 0,
  unoPenalties: 0,
  timeouts: 0,
  roundsWon: 0,
})

export const emptyStatsFor = (seatCount: number): SeatStats[] =>
  Array.from({ length: seatCount }, () => emptyStats())

/** Returns a new table; the one passed in is left alone. */
export function tally(stats: SeatStats[], events: GameEvent[]): SeatStats[] {
  const next = stats.map((seat) => ({ ...seat }))

  const at = (seat: number): SeatStats | undefined => next[seat]

  for (const event of events) {
    switch (event.type) {
      case 'cardPlayed': {
        const seat = at(event.seat)
        if (seat === undefined) break
        seat.cardsPlayed += 1
        if (event.card.kind === 'wild4') seat.wild4Played += 1
        if (event.card.kind === 'draw2') seat.draw2Played += 1
        break
      }
      case 'cardsDrawn': {
        const seat = at(event.seat)
        // Counted as cards, not as draws: taking four from a stacked wild is the
        // thing worth remembering, not that it happened once.
        if (seat !== undefined) seat.cardsDrawn += event.count
        break
      }
      case 'unoPenalty': {
        const seat = at(event.seat)
        if (seat === undefined) break
        seat.unoPenalties += 1
        seat.cardsDrawn += event.count
        break
      }
      case 'unoCalled': {
        const seat = at(event.seat)
        if (seat !== undefined) seat.unoCalls += 1
        break
      }
      case 'turnTimedOut': {
        const seat = at(event.seat)
        if (seat !== undefined) seat.timeouts += 1
        break
      }
      case 'roundEnded': {
        if (event.winner === null) break
        const seat = at(event.winner)
        if (seat !== undefined) seat.roundsWon += 1
        break
      }
      /* Nothing of its own to count: the two cards arrive as `unoPenalty` against
         the target, which is already counted above, and spotting a forgotten UNO
         is not one of the things this scoreboard keeps. */
      case 'calledOut':
        break
      /* Nor these. Hands moving is not a card played or a card drawn — the deck is
         merely rearranged — and a "hands taken" column would be a statistic about
         one optional rule rather than about the game. */
      case 'handsSwapped':
      case 'handsRotated':
        break
      // Nothing to count: presence changes and deals are not anybody's doing.
      case 'seatDisconnected':
      case 'seatReconnected':
      case 'seatLeft':
      case 'roundStarted':
      case 'matchEnded':
      case 'gameRestarted':
        break
    }
  }

  return next
}
