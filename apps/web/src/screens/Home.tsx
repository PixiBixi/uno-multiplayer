import type { MatchGoal, TableRules } from '@uno/engine'
import type { MatchPace } from '@uno/protocol'
import {
  DEFAULT_MATCH_GOAL,
  MAX_POINTS_TARGET,
  MAX_ROUNDS,
  MAX_NAME_LENGTH,
  MIN_POINTS_TARGET,
  MIN_ROUNDS,
  DEFAULT_TURN_SECONDS,
  MAX_TURN_SECONDS,
  MIN_TURN_SECONDS,
  ROOM_CODE_LENGTH,
} from '@uno/protocol'
import { useState, type FormEvent } from 'react'
import { CardValues } from '../components/CardValues.js'
import { LOCALES, LOCALE_NAME, useLocale, useMessages, useSetLocale } from '../i18n/index.js'

/* Offered as presets rather than a bare number field, because the interesting
   choice is the format, not the arithmetic. The field stays editable underneath
   for anyone who wants 250. */
const POINT_PRESETS = [250, 500, 1000] as const
const ROUND_PRESETS = [1, 3, 5] as const
const TURN_PRESETS = [5, 10, 15, 30] as const

type HomeProps = {
  onCreate: (name: string, goal: MatchGoal, pace: MatchPace, rules: TableRules) => void
  onJoin: (roomCode: string, name: string) => void
  error: string | null
  prefilledCode: string | null
}

const clamp = (value: number, low: number, high: number): number =>
  Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : low

export function Home({ onCreate, onJoin, error, prefilledCode }: HomeProps) {
  const t = useMessages()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const [name, setName] = useState('')
  const [code, setCode] = useState(prefilledCode ?? '')
  const [goalKind, setGoalKind] = useState<MatchGoal['kind']>(DEFAULT_MATCH_GOAL.kind)
  const [target, setTarget] = useState(500)
  const [rounds, setRounds] = useState(3)
  const [blazing, setBlazing] = useState(false)
  const [turnSeconds, setTurnSeconds] = useState(DEFAULT_TURN_SECONDS)
  const [liar, setLiar] = useState(false)

  const rules: TableRules = { liar }

  const pace: MatchPace = blazing
    ? { turnSeconds: clamp(turnSeconds, MIN_TURN_SECONDS, MAX_TURN_SECONDS) }
    : null

  /* Clamped here as well as on the server. The server is still the authority; this
     only spares the player a round trip to learn that 0 rounds is not a match. */
  const goal: MatchGoal =
    goalKind === 'points'
      ? { kind: 'points', target: clamp(target, MIN_POINTS_TARGET, MAX_POINTS_TARGET) }
      : { kind: 'rounds', count: clamp(rounds, MIN_ROUNDS, MAX_ROUNDS) }

  const trimmedName = name.trim()
  const normalisedCode = code.trim().toUpperCase()
  const canCreate = trimmedName.length > 0
  const canJoin = canCreate && normalisedCode.length === ROOM_CODE_LENGTH

  /* Mirrors the protocol schemas so feedback is immediate. The server remains the
     only authority — this just spares a round trip to learn the obvious. */
  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    if (canCreate) onCreate(trimmedName, goal, pace, rules)
  }
  const submitJoin = (event: FormEvent) => {
    event.preventDefault()
    if (canJoin) onJoin(normalisedCode, trimmedName)
  }

  return (
    <main className="home">
      <div className="home-column">
        <h1>UNO</h1>
        <p className="hint">{t.home.tagline}</p>

        {error !== null && (
          <p className="banner banner-bad" role="alert">
            {error}
          </p>
        )}

        <form className="home-form" onSubmit={submitCreate}>
          <label htmlFor="player-name">{t.home.yourName}</label>
          <input
            id="player-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            placeholder={t.home.namePlaceholder}
          />
          <fieldset className="goal-picker">
            <legend>{t.home.matchEnds}</legend>
            <div className="segmented" role="group" aria-label="Match format">
              <button
                type="button"
                className={goalKind === 'points' ? 'seg seg-on' : 'seg'}
                aria-pressed={goalKind === 'points'}
                onClick={() => {
                  setGoalKind('points')
                }}
              >
                {t.home.firstToScore}
              </button>
              <button
                type="button"
                className={goalKind === 'rounds' ? 'seg seg-on' : 'seg'}
                aria-pressed={goalKind === 'rounds'}
                onClick={() => {
                  setGoalKind('rounds')
                }}
              >
                {t.home.setRounds}
              </button>
            </div>

            {goalKind === 'points' ? (
              <div className="goal-row">
                <label htmlFor="goal-target">{t.home.winningScore}</label>
                <input
                  id="goal-target"
                  type="number"
                  inputMode="numeric"
                  value={target}
                  min={MIN_POINTS_TARGET}
                  max={MAX_POINTS_TARGET}
                  onChange={(event) => {
                    setTarget(Number(event.target.value))
                  }}
                />
                <span className="preset-row">
                  {POINT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="chip"
                      onClick={() => {
                        setTarget(preset)
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </span>
              </div>
            ) : (
              <div className="goal-row">
                <label htmlFor="goal-rounds">{t.home.rounds}</label>
                <input
                  id="goal-rounds"
                  type="number"
                  inputMode="numeric"
                  value={rounds}
                  min={MIN_ROUNDS}
                  max={MAX_ROUNDS}
                  onChange={(event) => {
                    setRounds(Number(event.target.value))
                  }}
                />
                <span className="preset-row">
                  {ROUND_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="chip"
                      onClick={() => {
                        setRounds(preset)
                      }}
                    >
                      {preset === 1 ? t.home.singleGame : preset}
                    </button>
                  ))}
                </span>
              </div>
            )}
          </fieldset>

          <fieldset className="goal-picker">
            <legend>{t.home.blazing}</legend>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={blazing}
                onChange={(event) => {
                  setBlazing(event.target.checked)
                }}
              />
              <span>{t.home.clockOnEveryTurn}</span>
            </label>

            {blazing && (
              <>
                <div className="goal-row">
                  <label htmlFor="turn-seconds">{t.home.secondsPerTurn}</label>
                  <input
                    id="turn-seconds"
                    type="number"
                    inputMode="numeric"
                    value={turnSeconds}
                    min={MIN_TURN_SECONDS}
                    max={MAX_TURN_SECONDS}
                    onChange={(event) => {
                      setTurnSeconds(Number(event.target.value))
                    }}
                  />
                  <span className="preset-row">
                    {TURN_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="chip"
                        onClick={() => {
                          setTurnSeconds(preset)
                        }}
                      >
                        {preset}
                      </button>
                    ))}
                  </span>
                </div>
                <p className="hint">{t.home.blazingHint}</p>
              </>
            )}
          </fieldset>

          <fieldset className="goal-picker">
            <legend>{t.home.tableRules}</legend>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={liar}
                onChange={(event) => {
                  setLiar(event.target.checked)
                }}
              />
              <span>{t.home.liar}</span>
            </label>
            {/* Shown whether it is on or off: the interesting question is what the
                option does, which you need answered before deciding. */}
            <p className="hint">{t.home.liarHint}</p>
          </fieldset>

          <button type="submit" className="btn btn-primary" disabled={!canCreate}>
            {t.home.createGame}
          </button>
        </form>

        <div className="home-divider">
          <span>{t.home.orJoin}</span>
        </div>

        <form className="home-form" onSubmit={submitJoin}>
          <label htmlFor="room-code">{t.home.gameCode}</label>
          <input
            id="room-code"
            className="code-input"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            placeholder="K7QM2X"
          />
          <button type="submit" className="btn" disabled={!canJoin}>
            {t.home.joinGame}
          </button>
        </form>
        <div className="lang-row">
          <span className="hint">{t.home.language}</span>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === locale ? 'chip chip-on' : 'chip'}
              aria-pressed={option === locale}
              lang={option}
              onClick={() => {
                setLocale(option)
              }}
            >
              {LOCALE_NAME[option]}
            </button>
          ))}
        </div>
      </div>

      <CardValues />
    </main>
  )
}
