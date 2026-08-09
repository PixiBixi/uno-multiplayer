import type { MatchGoal } from '@uno/engine'
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

/* Offered as presets rather than a bare number field, because the interesting
   choice is the format, not the arithmetic. The field stays editable underneath
   for anyone who wants 250. */
const POINT_PRESETS = [250, 500, 1000] as const
const ROUND_PRESETS = [1, 3, 5] as const
const TURN_PRESETS = [5, 10, 15, 30] as const

type HomeProps = {
  onCreate: (name: string, goal: MatchGoal, pace: MatchPace) => void
  onJoin: (roomCode: string, name: string) => void
  error: string | null
  prefilledCode: string | null
}

const clamp = (value: number, low: number, high: number): number =>
  Number.isFinite(value) ? Math.min(high, Math.max(low, Math.round(value))) : low

export function Home({ onCreate, onJoin, error, prefilledCode }: HomeProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(prefilledCode ?? '')
  const [goalKind, setGoalKind] = useState<MatchGoal['kind']>(DEFAULT_MATCH_GOAL.kind)
  const [target, setTarget] = useState(500)
  const [rounds, setRounds] = useState(3)
  const [blazing, setBlazing] = useState(false)
  const [turnSeconds, setTurnSeconds] = useState(DEFAULT_TURN_SECONDS)

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
    if (canCreate) onCreate(trimmedName, goal, pace)
  }
  const submitJoin = (event: FormEvent) => {
    event.preventDefault()
    if (canJoin) onJoin(normalisedCode, trimmedName)
  }

  return (
    <main className="home">
      <h1>UNO</h1>
      <p className="hint">Two to four players. Share the code and deal.</p>

      {error !== null && (
        <p className="banner banner-bad" role="alert">
          {error}
        </p>
      )}

      <form className="home-form" onSubmit={submitCreate}>
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          placeholder="Ana"
        />
        <fieldset className="goal-picker">
          <legend>How the match ends</legend>
          <div className="segmented" role="group" aria-label="Match format">
            <button
              type="button"
              className={goalKind === 'points' ? 'seg seg-on' : 'seg'}
              aria-pressed={goalKind === 'points'}
              onClick={() => {
                setGoalKind('points')
              }}
            >
              First to a score
            </button>
            <button
              type="button"
              className={goalKind === 'rounds' ? 'seg seg-on' : 'seg'}
              aria-pressed={goalKind === 'rounds'}
              onClick={() => {
                setGoalKind('rounds')
              }}
            >
              A set number of rounds
            </button>
          </div>

          {goalKind === 'points' ? (
            <div className="goal-row">
              <label htmlFor="goal-target">Winning score</label>
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
              <label htmlFor="goal-rounds">Rounds</label>
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
                    {preset === 1 ? 'Single game' : preset}
                  </button>
                ))}
              </span>
            </div>
          )}
        </fieldset>

        <fieldset className="goal-picker">
          <legend>Blazing</legend>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={blazing}
              onChange={(event) => {
                setBlazing(event.target.checked)
              }}
            />
            <span>Put a clock on every turn</span>
          </label>

          {blazing && (
            <>
              <div className="goal-row">
                <label htmlFor="turn-seconds">Seconds per turn</label>
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
              <p className="hint">
                Run out and you draw a card, even if you had one to play. Rounds deal themselves
                five seconds after the last one ends.
              </p>
            </>
          )}
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={!canCreate}>
          Create a game
        </button>
      </form>

      <div className="home-divider">
        <span>or join one</span>
      </div>

      <form className="home-form" onSubmit={submitJoin}>
        <label htmlFor="room-code">Game code</label>
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
          Join game
        </button>
      </form>
    </main>
  )
}
