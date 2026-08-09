import { MAX_SEATS, type LobbyView } from '@uno/protocol'
import type { SeatStatus } from '@uno/engine'
import { CopyButton } from '../components/CopyButton.js'
import { roomLink } from '../lib/room-url.js'
import { pigmentForSeat } from '../lib/palette.js'

const STATUS_LABEL: Record<SeatStatus, string | null> = {
  active: null,
  disconnected: 'reconnecting…',
  left: 'left',
}

type LobbyProps = {
  lobby: LobbyView
  mySeat: number
  onStart: () => void
  onLeave: () => void
}

export function Lobby({ lobby, mySeat, onStart, onLeave }: LobbyProps) {
  const isHost = mySeat === lobby.hostSeat
  const hostName = lobby.seats.find((seat) => seat.seat === lobby.hostSeat)?.name ?? 'the host'
  const emptySeats = Math.max(0, MAX_SEATS - lobby.seats.length)

  return (
    <main className="lobby">
      <div className="stack">
        <span className="eyebrow">Game code</span>
        <p className="code-display">{lobby.roomCode}</p>
        <p className="hint">Share this with the people you want to play.</p>
        {/* Both, because they suit different conversations: a code to read out
            loud, a link to paste where a code would just have to be retyped. */}
        <div className="copy-row">
          <CopyButton value={lobby.roomCode} label="Copy code" subject="Game code" />
          <CopyButton value={roomLink(lobby.roomCode)} label="Copy link" subject="Invite link" />
        </div>
      </div>

      <ul className="roster">
        {lobby.seats.map((seat) => {
          const status = STATUS_LABEL[seat.status]
          return (
            <li key={seat.seat} className={seat.status === 'active' ? 'slot' : 'slot slot-away'}>
              <span className="avatar" style={{ background: pigmentForSeat(seat.seat) }}>
                {seat.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{seat.name}</span>
              {status !== null && <span className="slot-status">{status}</span>}
              {seat.seat === lobby.hostSeat && <span className="host-tag">Host</span>}
            </li>
          )
        })}
        {Array.from({ length: emptySeats }, (_, index) => (
          <li key={`empty-${String(index)}`} className="slot slot-empty">
            <span className="avatar avatar-empty">—</span>
            <span>Waiting for a player…</span>
          </li>
        ))}
      </ul>

      {/* Two separate reasons the game cannot start, said separately. "Nothing
          happens when I click" is the worst possible answer. */}
      {isHost ? (
        <div className="stack">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onStart}
            disabled={!lobby.canStart}
          >
            Start game
          </button>
          {!lobby.canStart && <p className="hint">A game needs at least two players.</p>}
        </div>
      ) : (
        <p className="hint">Waiting for {hostName} to start the game.</p>
      )}

      <button type="button" className="btn" onClick={onLeave}>
        Leave table
      </button>
    </main>
  )
}
