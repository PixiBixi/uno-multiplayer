import type { MatchGoal } from '@uno/engine'
import {
  DEFAULT_TURN_SECONDS,
  MAX_POINTS_TARGET,
  MAX_ROUNDS,
  MAX_TURN_SECONDS,
  MIN_POINTS_TARGET,
  MIN_ROUNDS,
  MIN_TURN_SECONDS,
  type MatchPace,
} from '@uno/protocol'
import { useState } from 'react'
import { useMessages } from '../i18n/index.js'

/**
 * How the match ends and how fast it is played, for the host and for a guest.
 *
 * One component for both modes, for the same reason `TableRulesPanel` is: a guest must
 * see what they are about to play, and two copies of the same words drift. The read-only
 * side reuses `t.goalSummary`, which the end-of-match screen already renders, so there is
 * one sentence describing a goal in the whole client.
 *
 * Only the values that cannot be read back from the view are held in state: the inactive
 * goal variant's number, and the seconds to restore when Blazing is switched back on.
 * Everything visible comes from the view the server pushed, so a rejected change reverts
 * itself rather than leaving the screen disagreeing with the table.
 */

/* Offered as presets rather than a bare number field, because the interesting choice is
   the format, not the arithmetic. The field stays editable for anyone who wants 250. */
const POINT_PRESETS = [250, 500, 1000] as const
const ROUND_PRESETS = [1, 3, 5] as const
const TURN_PRESETS = [5, 10, 15, 30] as const

type MatchSettingsProps = {
  goal: MatchGoal
  pace: MatchPace
  /** Absent for a guest, and for the host once the deal has frozen the table. */
  onChange?: (changes: { goal?: MatchGoal; pace?: MatchPace }) => void
}

const clamp = (value: number, low: number, high: number): number =>
  Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : low

export function MatchSettings({ goal, pace, onChange }: MatchSettingsProps) {
  const t = useMessages()
  /* The variant not currently in play has no value on the wire, so switching format has
     to remember what the other one said. Seeded from the view so a host arriving at an
     already-configured table sees the number it holds. */
  const [target, setTarget] = useState(goal.kind === 'points' ? goal.target : 500)
  const [rounds, setRounds] = useState(goal.kind === 'rounds' ? goal.count : 3)
  const [turnSeconds, setTurnSeconds] = useState(pace?.turnSeconds ?? DEFAULT_TURN_SECONDS)

  if (onChange === undefined) {
    return (
      <fieldset className="goal-picker">
        <legend>{t.config.matchEnds}</legend>
        <p className="rule-state">
          <span>{t.goalSummary(goal)}</span>
        </p>
        <p className="rule-state">
          <span>{t.config.blazing}</span>
          <strong>
            {pace === null ? t.config.noClock : t.config.paceSummary(pace.turnSeconds)}
          </strong>
        </p>
      </fieldset>
    )
  }

  /* Clamped here as well as on the server, which remains the only authority — this only
     spares the player a round trip to learn that 0 rounds is not a match. */
  const setPoints = (value: number) => {
    setTarget(value)
    onChange({
      goal: { kind: 'points', target: clamp(value, MIN_POINTS_TARGET, MAX_POINTS_TARGET) },
    })
  }
  const setRoundCount = (value: number) => {
    setRounds(value)
    onChange({ goal: { kind: 'rounds', count: clamp(value, MIN_ROUNDS, MAX_ROUNDS) } })
  }
  const setSeconds = (value: number) => {
    setTurnSeconds(value)
    onChange({ pace: { turnSeconds: clamp(value, MIN_TURN_SECONDS, MAX_TURN_SECONDS) } })
  }

  return (
    <>
      <fieldset className="goal-picker">
        <legend>{t.config.matchEnds}</legend>
        <div className="segmented" role="group" aria-label={t.config.matchFormat}>
          <button
            type="button"
            className={goal.kind === 'points' ? 'seg seg-on' : 'seg'}
            aria-pressed={goal.kind === 'points'}
            onClick={() => {
              setPoints(target)
            }}
          >
            {t.config.firstToScore}
          </button>
          <button
            type="button"
            className={goal.kind === 'rounds' ? 'seg seg-on' : 'seg'}
            aria-pressed={goal.kind === 'rounds'}
            onClick={() => {
              setRoundCount(rounds)
            }}
          >
            {t.config.setRounds}
          </button>
        </div>

        {goal.kind === 'points' ? (
          <div className="goal-row">
            <label htmlFor="goal-target">{t.config.winningScore}</label>
            <input
              id="goal-target"
              type="number"
              inputMode="numeric"
              value={target}
              min={MIN_POINTS_TARGET}
              max={MAX_POINTS_TARGET}
              onChange={(event) => {
                setPoints(Number(event.target.value))
              }}
            />
            <span className="preset-row">
              {POINT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setPoints(preset)
                  }}
                >
                  {preset}
                </button>
              ))}
            </span>
          </div>
        ) : (
          <div className="goal-row">
            <label htmlFor="goal-rounds">{t.config.rounds}</label>
            <input
              id="goal-rounds"
              type="number"
              inputMode="numeric"
              value={rounds}
              min={MIN_ROUNDS}
              max={MAX_ROUNDS}
              onChange={(event) => {
                setRoundCount(Number(event.target.value))
              }}
            />
            <span className="preset-row">
              {ROUND_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setRoundCount(preset)
                  }}
                >
                  {preset === 1 ? t.config.singleGame : preset}
                </button>
              ))}
            </span>
          </div>
        )}
      </fieldset>

      <fieldset className="goal-picker">
        <legend>{t.config.blazing}</legend>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={pace !== null}
            onChange={(event) => {
              /* Null rather than an absent field: absent means "leave the clock alone",
                 and this is how a host takes it off the table. */
              onChange(
                event.target.checked
                  ? {
                      pace: {
                        turnSeconds: clamp(turnSeconds, MIN_TURN_SECONDS, MAX_TURN_SECONDS),
                      },
                    }
                  : { pace: null },
              )
            }}
          />
          <span>{t.config.clockOnEveryTurn}</span>
        </label>

        {pace !== null && (
          <>
            <div className="goal-row">
              <label htmlFor="turn-seconds">{t.config.secondsPerTurn}</label>
              <input
                id="turn-seconds"
                type="number"
                inputMode="numeric"
                value={turnSeconds}
                min={MIN_TURN_SECONDS}
                max={MAX_TURN_SECONDS}
                onChange={(event) => {
                  setSeconds(Number(event.target.value))
                }}
              />
              <span className="preset-row">
                {TURN_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setSeconds(preset)
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </span>
            </div>
            <p className="hint">{t.config.blazingHint}</p>
          </>
        )}
      </fieldset>
    </>
  )
}
