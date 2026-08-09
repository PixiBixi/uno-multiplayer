import type { PlayerView, SeatStats } from '@uno/protocol'
import { useCountdown } from '../hooks/useCountdown.js'
import { useMessages } from '../i18n/index.js'
import type { Messages } from '../i18n/messages.js'

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
  const t = useMessages()
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

  /* Only at the end of a match. Between rounds the standings are what people are
     reading, and a table of trivia underneath would bury them. */
  const awards = matchOver ? pickAwards(match.stats, seats, nameOf, t) : []

  const goalLine =
    match.goal.kind === 'points'
      ? t.over.firstTo(match.goal.target)
      : t.over.roundOf(Math.min(match.round, match.goal.count), match.goal.count)

  return (
    <div className="over-veil">
      <div className="over-card" role="dialog" aria-modal="true">
        {matchOver ? (
          <h2>
            {t.event.matchResult(
              winners.map((seat) => nameOf(seat)),
              winners.includes(view.you.seat),
            )}
          </h2>
        ) : abandoned ? (
          <>
            <h2>{t.over.roundAbandoned}</h2>
            <p className="hint">{t.over.needsTwo}</p>
          </>
        ) : (
          <h2>{t.over.winsRound(nameOf(view.winner ?? -1), view.winner === view.you.seat)}</h2>
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
            {t.over.dealsIn(dealingIn)}
          </p>
        )}

        {awards.length > 0 && (
          <ul className="awards">
            {awards.map((award) => (
              <li className="award" key={award.title}>
                <span className="award-title">{award.title}</span>
                <span className="award-holder">{award.holder}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="over-actions">
          {isHost ? (
            <>
              {!matchOver && (
                <button type="button" className="btn btn-primary" onClick={onNextRound}>
                  {t.over.nextRound}
                </button>
              )}
              <button
                type="button"
                className={matchOver ? 'btn btn-primary' : 'btn'}
                onClick={onRestart}
              >
                {t.over.newMatch}
              </button>
            </>
          ) : (
            <p className="hint">
              {matchOver
                ? t.over.waitingNewMatch
                : dealingIn !== null
                  ? t.over.dealsItself
                  : t.over.waitingNextRound}
            </p>
          )}
          <button type="button" className="btn" onClick={onLeave}>
            {t.lobby.leaveTable}
          </button>
        </div>
      </div>
    </div>
  )
}

type Award = { title: string; holder: string }

/**
 * The handful of things worth saying out loud at the end of a match.
 *
 * Only awards somebody actually earned: a "most Wild Draw Fours" line reading
 * zero is noise, and a leader board of nothing is worse than no leader board. A
 * tie names everyone rather than picking arbitrarily, because arbitrary is
 * exactly what people argue about.
 */
function pickAwards(
  stats: SeatStats[],
  seats: number[],
  nameOf: (seat: number) => string,
  t: Messages,
): Award[] {
  const leadersOf = (pick: (seat: SeatStats) => number): { names: string[]; value: number } => {
    const scored = seats.map((seat) => ({
      seat,
      value: pick(stats[seat] ?? ({} as SeatStats)) ?? 0,
    }))
    const best = Math.max(0, ...scored.map((row) => row.value))
    return {
      value: best,
      names: scored.filter((row) => row.value === best).map((row) => nameOf(row.seat)),
    }
  }

  const candidates: { title: string; pick: (seat: SeatStats) => number; suffix: string }[] = [
    { title: t.over.awards.mostWild4, pick: (s) => s.wild4Played, suffix: '' },
    { title: t.over.awards.mostDrawn, pick: (s) => s.cardsDrawn, suffix: '' },
    { title: t.over.awards.forgotUno, pick: (s) => s.unoPenalties, suffix: '' },
    { title: t.over.awards.ranOutOfTime, pick: (s) => s.timeouts, suffix: '' },
    { title: t.over.awards.mostPlayed, pick: (s) => s.cardsPlayed, suffix: '' },
  ]

  return candidates.flatMap((candidate) => {
    const { names, value } = leadersOf(candidate.pick)
    if (value === 0) return []
    // Everybody level means nobody stood out, which is not an award.
    if (names.length === seats.length) return []
    return [{ title: candidate.title, holder: `${names.join(' & ')} (${String(value)})` }]
  })
}
