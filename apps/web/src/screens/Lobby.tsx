import type { TableRules } from '@uno/engine'
import { MAX_SEATS, type LobbyView, type TableConfiguration } from '@uno/protocol'
import { CardValues } from '../components/CardValues.js'
import { CopyButton } from '../components/CopyButton.js'
import { MatchSettings } from '../components/MatchSettings.js'
import { TableRulesPanel } from '../components/TableRulesPanel.js'
import { roomLink } from '../lib/room-url.js'
import { pigmentForSeat } from '../lib/palette.js'
import { useMessages } from '../i18n/index.js'

/**
 * The waiting room, and now the place the table is configured.
 *
 * Two things moved here from the home screen. The settings themselves, because this is
 * where the host is while there is still someone to wait for - and, more to the point,
 * where everybody who is about to play can see them. A guest used to be shown none of it:
 * `LobbyView` withheld the rules entirely, so a player discovered Seven-Zero when their
 * hand changed owner.
 *
 * Whether the host may still change anything is `lobby.configurable`, which the server
 * derives from the match having begun. It is presentation and nothing else - the server
 * checks the same condition again when `room:configure` arrives, because a host can press
 * Start and toggle a rule in the same breath and whichever lands second has to lose.
 */

type LobbyProps = {
  lobby: LobbyView
  mySeat: number
  onStart: () => void
  onLeave: () => void
  onConfigure: (changes: TableConfiguration) => void
}

export function Lobby({ lobby, mySeat, onStart, onLeave, onConfigure }: LobbyProps) {
  const t = useMessages()
  const isHost = mySeat === lobby.hostSeat
  /* The fallback is only reachable if the roster arrives without the host in it, which
     the server does not do - but it is still a noun dropped into a sentence, and it has
     to be the right noun in the right language. */
  const hostName = lobby.seats.find((seat) => seat.seat === lobby.hostSeat)?.name ?? t.lobby.theHost
  const emptySeats = Math.max(0, MAX_SEATS - lobby.seats.length)

  /* Not `canStart`. That counts filled seats, and a table with one player is exactly a
     table whose host has time to set the rules. */
  const mayConfigure = isHost && lobby.configurable
  const configureRules = (rules: TableRules) => {
    onConfigure({ rules })
  }
  const note = mayConfigure
    ? undefined
    : lobby.configurable
      ? t.config.setByHost(hostName)
      : t.config.lockedByDeal

  return (
    <main className="lobby">
      <div className="lobby-column">
        <div className="code-block">
          <span className="eyebrow">{t.lobby.gameCodeLabel}</span>
          <p className="code-display">{lobby.roomCode}</p>
          <p className="lobby-lede">{t.lobby.shareHint}</p>
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
                <span className="slot-who">
                  <span className="slot-name">{seat.name}</span>
                  <span className="slot-seat">{t.lobby.seatNumber(seat.seat + 1)}</span>
                </span>
                {status !== null && <span className="slot-status">{status}</span>}
                {seat.seat === lobby.hostSeat && <span className="host-tag">{t.lobby.host}</span>}
              </li>
            )
          })}
          {Array.from({ length: emptySeats }, (_, index) => (
            <li key={`empty-${String(index)}`} className="slot slot-empty">
              <span className="avatar avatar-empty">·</span>
              <span className="slot-who">
                <span className="slot-name">{t.lobby.waitingForPlayer}</span>
                <span className="slot-seat">{t.lobby.freeSeat}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Two separate reasons the game cannot start, said separately. "Nothing
            happens when I click" is the worst possible answer.

            At the foot of the column, the two controls on one line: the one that ends
            the waiting is filled, the one that leaves is outlined, and neither is at the
            bottom of a growing list of settings the way it used to be. */}
        <div className="lobby-actions">
          {isHost ? (
            <>
              <div className="lobby-start">
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
              <button type="button" className="btn" onClick={onLeave}>
                {t.lobby.leaveTable}
              </button>
            </>
          ) : (
            <>
              <p className="hint">{t.lobby.waitingForHost(hostName)}</p>
              <button type="button" className="btn" onClick={onLeave}>
                {t.lobby.leaveTable}
              </button>
            </>
          )}
        </div>
      </div>

      {/* The second column on a desktop and the tail of the single column on a phone,
          laid out the way the home screen's aside is. The settings went into the empty
          half of the page rather than making anything smaller, which is the lesson the
          card-theme controls taught this project once already. */}
      <div className="lobby-aside">
        <div className="lobby-aside-head">
          <span className="eyebrow">{t.config.tableSettings}</span>
          <h2>{t.config.tableRules}</h2>
        </div>

        <TableRulesPanel
          rules={lobby.rules}
          {...(mayConfigure ? { onChange: configureRules } : {})}
          {...(note === undefined ? {} : { note })}
        />

        <MatchSettings
          goal={lobby.goal}
          pace={lobby.pace}
          {...(mayConfigure ? { onChange: onConfigure } : {})}
        />

        {/* In full rather than behind a disclosure: the host is choosing a points target
            two panels up, and "how many rounds does 500 take" is the question the numbers
            answer. Its own scroll container on a narrow screen, so the panel that is pure
            reference cannot push the seats off the page. */}
        <div className="lobby-values">
          <CardValues />
        </div>
      </div>
    </main>
  )
}
