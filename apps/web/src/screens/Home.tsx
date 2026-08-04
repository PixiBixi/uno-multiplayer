import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '@uno/protocol'
import { useState, type FormEvent } from 'react'

type HomeProps = {
  onCreate: (name: string) => void
  onJoin: (roomCode: string, name: string) => void
  error: string | null
  prefilledCode: string | null
}

export function Home({ onCreate, onJoin, error, prefilledCode }: HomeProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(prefilledCode ?? '')

  const trimmedName = name.trim()
  const normalisedCode = code.trim().toUpperCase()
  const canCreate = trimmedName.length > 0
  const canJoin = canCreate && normalisedCode.length === ROOM_CODE_LENGTH

  /* Mirrors the protocol schemas so feedback is immediate. The server remains the
     only authority — this just spares a round trip to learn the obvious. */
  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    if (canCreate) onCreate(trimmedName)
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
