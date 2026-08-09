import type { PlayerView } from '@uno/protocol'
import { useCountdown } from '../hooks/useCountdown.js'
import { matchResultPhrase, pointsCount, winsPhrase } from '../lib/phrase.js'

type GameOverProps = {
  view: PlayerView
  nameOf: (seat: number) => string
  isHost: boolean
  onNextRound: () => void
  onRestart: () => void
  onLeave: () => void
}

/**
 * Shown between rounds as well as at the end of a match, because those are now two
 * different moments. The heading says which one this is, and the action offered
 * follows: another round while the match runs, a whole new match once it is over.
 */
export function GameOver({ view, nameOf, isHost, onNextRound, onRestart, onLeave }: GameOverProps) {
  const { match } = view
  // Only ever set on a Blazing table, where the next round deals itself.
  const dealingIn = useCountdown(view.nextRoundDeadline)
  const winners = match.winners ?? []
  const matchOver = match.winners !== null
  const abandoned = view.winner === null

  const seats = [view.you.seat, ...view.opponents.map((opponent) => opponent.seat)]

  /* Ordered by score, then by seat so a level table does not reshuffle itself
     between rounds for no reason. */
  const standings = seats
    .map((seat) => ({ seat, score: match.scores[seat] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat)

  const goalLine =
    match.goal.kind === 'points'
      ? `First to ${pointsCount(match.goal.target)}`
      : `Round ${String(Math.min(match.round, match.goal.count))} of ${String(match.goal.count)}`

  return (
    <div className="over-veil">
      <div className="over-card" role="dialog" aria-modal="true">
        {matchOver ? (
          <h2>
            {matchResultPhrase(
              winners.map((seat) => nameOf(seat)),
              winners.includes(view.you.seat),
            )}
          </h2>
        ) : abandoned ? (
          <>
            <h2>Round abandoned</h2>
            <p className="hint">A game needs two players, so this one ends with no winner.</p>
          </>
        ) : (
          <h2>{winsPhrase(nameOf(view.winner ?? -1), view.winner === view.you.seat)} the round</h2>
        )}

        <p className="eyebrow">{goalLine}</p>

        <ul className="standings">
          {standings.map((row) => (
            <li
              key={row.seat}
              className={winners.includes(row.seat) ? 'standing standing-won' : 'standing'}
            >
              <span>{nameOf(row.seat)}</span>
              <span className="standing-count">{row.score}</span>
            </li>
          ))}
        </ul>

        {dealingIn !== null && (
          <p className="hint" role="status">
            Next round deals in <b>{dealingIn}</b>…
          </p>
        )}

        <div className="over-actions">
          {isHost ? (
            <>
              {!matchOver && (
                <button type="button" className="btn btn-primary" onClick={onNextRound}>
                  Next round
                </button>
              )}
              <button
                type="button"
                className={matchOver ? 'btn btn-primary' : 'btn'}
                onClick={onRestart}
              >
                New match
              </button>
            </>
          ) : (
            <p className="hint">
              {matchOver
                ? 'Waiting for the host to start a new match.'
                : dealingIn !== null
                  ? 'The next round starts on its own.'
                  : 'Waiting for the host to deal the next round.'}
            </p>
          )}
          <button type="button" className="btn" onClick={onLeave}>
            Leave table
          </button>
        </div>
      </div>
    </div>
  )
}
