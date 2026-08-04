import type { PlayerView } from '@uno/protocol'
import { winsPhrase } from '../lib/phrase.js'

type GameOverProps = {
  view: PlayerView
  nameOf: (seat: number) => string
  isHost: boolean
  onRestart: () => void
  onLeave: () => void
}

export function GameOver({ view, nameOf, isHost, onRestart, onLeave }: GameOverProps) {
  const abandoned = view.winner === null

  /* Final counts come from fields that already exist. Nobody's actual cards are
     revealed, even after the game ends, so this needs no protocol change. */
  const standings = [
    { seat: view.you.seat, count: view.you.hand.length },
    ...view.opponents.map((opponent) => ({ seat: opponent.seat, count: opponent.handCount })),
  ].sort((a, b) => a.count - b.count)

  return (
    <div className="over-veil">
      <div className="over-card" role="dialog" aria-modal="true">
        {abandoned ? (
          <>
            <h2>Game abandoned</h2>
            <p className="hint">A game needs two players, so this one ends with no winner.</p>
          </>
        ) : (
          <>
            <h2>{winsPhrase(nameOf(view.winner ?? -1), view.winner === view.you.seat)}</h2>
            <ul className="standings">
              {standings.map((row) => (
                <li
                  key={row.seat}
                  className={row.count === 0 ? 'standing standing-won' : 'standing'}
                >
                  <span>{nameOf(row.seat)}</span>
                  <span className="standing-count">{row.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="over-actions">
          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={onRestart}>
              Play again
            </button>
          ) : (
            <p className="hint">Waiting for the host to deal again.</p>
          )}
          <button type="button" className="btn" onClick={onLeave}>
            Leave table
          </button>
        </div>
      </div>
    </div>
  )
}
