import type { SeatStatus } from '@uno/engine'
import { CardBack } from './CardBack.js'
import { useMessages, type Messages } from '../i18n/index.js'

/** A fan wider than this stops communicating and starts costing layout. */
const MAX_FANNED = 6

/**
 * The note under a seat that is not playing. Built from the catalogue rather than
 * held as a `Record<SeatStatus, string>` of literals — which is exactly how these two
 * phrases survived a sweep for English: no JSX, no attribute, just a table read
 * through a variable.
 *
 * A switch rather than a lookup so a fifth `SeatStatus` fails the typecheck here
 * instead of rendering an empty note.
 */
const statusNote = (status: SeatStatus, t: Messages): string | null => {
  switch (status) {
    case 'active':
      return null
    /* Shared with the lobby roster: the same word for the same fact. */
    case 'disconnected':
      return t.lobby.reconnecting
    /* Not shared, unlike the line above. See `table.hasLeft` — a bare "left" is a
       direction when it sits next to a badge reading "Anticlockwise". */
    case 'left':
      return t.table.hasLeft
  }
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
  const statusText = statusNote(status, t)

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
        // Labelled with the name too: "Caught!" three times over is ambiguous to
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
