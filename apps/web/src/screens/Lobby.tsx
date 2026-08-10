import { MAX_SEATS, type LobbyView } from '@uno/protocol'
import { CopyButton } from '../components/CopyButton.js'
import { roomLink } from '../lib/room-url.js'
import { pigmentForSeat } from '../lib/palette.js'
import { useMessages } from '../i18n/index.js'

type LobbyProps = {
  lobby: LobbyView
  mySeat: number
  onStart: () => void
  onLeave: () => void
}

export function Lobby({ lobby, mySeat, onStart, onLeave }: LobbyProps) {
  const t = useMessages()
  const isHost = mySeat === lobby.hostSeat
  /* The fallback is only reachable if the roster arrives without the host in it, which
     the server does not do — but it is still a noun dropped into a sentence, and it has
     to be the right noun in the right language. */
  const hostName = lobby.seats.find((seat) => seat.seat === lobby.hostSeat)?.name ?? t.lobby.theHost
  const emptySeats = Math.max(0, MAX_SEATS - lobby.seats.length)

  return (
    <main className="lobby">
      <div className="stack">
        <span className="eyebrow">{t.lobby.gameCodeLabel}</span>
        <p className="code-display">{lobby.roomCode}</p>
        <p className="hint">{t.lobby.shareHint}</p>
        {/* Both, because they suit different conversations: a code to read out
            loud, a link to paste where a code would just have to be retyped. */}
        <div className="copy-row">
          <CopyButton
            value={lobby.roomCode}
            label={t.lobby.copyCode}
            subject={t.lobby.codeCopied}
          />
          <CopyButton
            value={roomLink(lobby.roomCode)}
            label={t.lobby.copyLink}
            subject={t.lobby.linkCopied}
          />
        </div>
      </div>

      <ul className="roster">
        {lobby.seats.map((seat) => {
          const status =
            seat.status === 'disconnected'
              ? t.lobby.reconnecting
              : seat.status === 'left'
                ? t.lobby.left
                : null
          return (
            <li key={seat.seat} className={seat.status === 'active' ? 'slot' : 'slot slot-away'}>
              <span className="avatar" style={{ background: pigmentForSeat(seat.seat) }}>
                {seat.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{seat.name}</span>
              {status !== null && <span className="slot-status">{status}</span>}
              {seat.seat === lobby.hostSeat && <span className="host-tag">{t.lobby.host}</span>}
            </li>
          )
        })}
        {Array.from({ length: emptySeats }, (_, index) => (
          <li key={`empty-${String(index)}`} className="slot slot-empty">
            <span className="avatar avatar-empty">—</span>
            <span>{t.lobby.waitingForPlayer}</span>
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
            {t.lobby.startGame}
          </button>
          {!lobby.canStart && <p className="hint">{t.lobby.needTwo}</p>}
        </div>
      ) : (
        <p className="hint">{t.lobby.waitingForHost(hostName)}</p>
      )}

      <button type="button" className="btn" onClick={onLeave}>
        {t.lobby.leaveTable}
      </button>
    </main>
  )
}
