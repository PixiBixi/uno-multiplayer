import type { SeatStatus } from '@uno/engine'
import { CardBack } from './CardBack.js'
import { useMessages } from '../i18n/index.js'

/** A fan wider than this stops communicating and starts costing layout. */
const MAX_FANNED = 6

const STATUS_TEXT: Record<SeatStatus, string | null> = {
  active: null,
  disconnected: 'reconnecting…',
  left: 'left the game',
}

type SeatProps = {
  name: string
  handCount: number
  status: SeatStatus
  isTurn: boolean
  orientation: 'horizontal' | 'vertical'
  /**
   * Null unless the server offered a call-out against this seat. Null rather than
   * an optional prop so the caller has to say which it means: the whole point is
   * that the button exists only because a move arrived, never because the client
   * counted cards.
   */
  onCallOut: (() => void) | null
}

export function Seat({ name, handCount, status, isTurn, orientation, onCallOut }: SeatProps) {
  const t = useMessages()
  const shown = Math.min(handCount, MAX_FANNED)
  const statusText = STATUS_TEXT[status]

  return (
    <div className="seat">
      <div className={`fan fan-${orientation}`}>
        {Array.from({ length: shown }, (_, index) => (
          <div key={index} className="fan-card">
            <CardBack />
          </div>
        ))}
      </div>
      <p className={isTurn ? 'plate plate-turn' : 'plate'}>
        <span className={`presence presence-${status}`} aria-hidden="true" />
        <span>{name}</span>
        <span className="plate-count">{handCount}</span>
        {/* Turn state and presence are never colour-only. */}
        {isTurn && <span className="plate-note">{t.table.theirTurn}</span>}
        {statusText !== null && <span className="plate-note">{statusText}</span>}
      </p>
      {onCallOut !== null && (
        // Labelled with the name too: "Liar!" three times over is ambiguous to
        // anyone who cannot see which seat it sits under.
        <button
          type="button"
          className="btn btn-liar"
          aria-label={t.table.callOutOn(name)}
          onClick={onCallOut}
        >
          {t.table.callOut}
        </button>
      )}
    </div>
  )
}
