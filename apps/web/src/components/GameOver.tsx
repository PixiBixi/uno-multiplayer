import type { PlayerView, SeatStats } from '@uno/protocol'
import { pigmentForSeat } from '../lib/palette.js'
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
      <div
        className={awards.length > 0 ? 'over-card over-card-wide' : 'over-card'}
        role="dialog"
        aria-modal="true"
      >
        <div className="over-main">
          <div className="pigment-strip" aria-hidden="true">
            <span style={{ background: 'var(--red)' }} />
            <span style={{ background: 'var(--blue)' }} />
            <span style={{ background: 'var(--yellow)' }} />
            <span style={{ background: 'var(--green)' }} />
          </div>

          <span className="over-eyebrow">{goalLine}</span>

          {matchOver ? (
            <h2 className="over-title">
              {t.event.matchResult(
                winners.map((seat) => nameOf(seat)),
                winners.includes(view.you.seat),
              )}
            </h2>
          ) : abandoned ? (
            <>
              <h2 className="over-title">{t.over.roundAbandoned}</h2>
              <p className="over-lede">{t.over.needsTwo}</p>
            </>
          ) : (
            <h2 className="over-title">
              {t.over.winsRound(nameOf(view.winner ?? -1), view.winner === view.you.seat)}
            </h2>
          )}

          {/* A table, not a list of pills: a rank, the seat's own pigment, the name and
              the figure, ruled off from each other. The two heavy rules are what make it
              read as a result rather than as a summary. */}
          <ol className="standings">
            {standings.map((row, index) => (
              <li
                key={row.seat}
                className={winners.includes(row.seat) ? 'standing standing-won' : 'standing'}
              >
                <span className="standing-rank">{index + 1}</span>
                <span
                  className="standing-pigment"
                  style={{ background: pigmentForSeat(row.seat) }}
                  aria-hidden="true"
                />
                <span className="standing-name">{nameOf(row.seat)}</span>
                <span className="standing-count">{row.score}</span>
              </li>
            ))}
          </ol>

          {dealingIn !== null && (
            <p className="over-lede" role="status">
              {t.over.dealsIn(dealingIn)}
            </p>
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
              <p className="over-lede">
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

        {awards.length > 0 && (
          <div className="over-aside">
            <span className="over-eyebrow">{t.over.awardsTitle}</span>
            <ul className="awards">
              {awards.map((award, index) => (
                <li
                  className="award"
                  key={award.title}
                  style={{ borderInlineStartColor: pigmentForSeat(index) }}
                >
                  <span className="award-title">{award.title}</span>
                  <span className="award-line">
                    <span className="award-holder">{award.holder}</span>
                    <span className="award-value">{award.value}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

type Award = { title: string; holder: string; value: number }

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
    /* The figure is its own field rather than a parenthesis inside the name: it is set
       in the seat's pigment and at its own size, which a string cannot carry. */
    return [{ title: candidate.title, holder: names.join(' & '), value }]
  })
}
