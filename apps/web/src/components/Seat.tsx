import type { SeatStatus } from '@uno/engine'
import { useMessages, type Messages } from '../i18n/index.js'
import { pigmentForSeat } from '../lib/palette.js'

/** A row wider than this stops communicating and starts costing layout. */
const MAX_FANNED = 6

/**
 * The note under a seat that is not playing. Built from the catalogue rather than
 * held as a `Record<SeatStatus, string>` of literals - which is exactly how these two
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
    /* Not shared, unlike the line above. See `table.hasLeft` - a bare "left" is a
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
  /** Which pigment marks this seat. Indexed by seat, never by position in the rail. */
  seat: number
  /**
   * Null unless the server offered a call-out against this seat. Null rather than
   * an optional prop so the caller has to say which it means: the whole point is
   * that the button exists only because a move arrived, never because the client
   * counted cards.
   */
  onCallOut: (() => void) | null
}

/**
 * One opponent, as a row in the rail down the left of the table.
 *
 * The fan of card backs around the felt is gone. It cost a third of the screen to say
 * a number the row now says in figures, and it put three players at three different
 * distances from the eye for no reason a player could name. What is left is what a
 * player actually reads off an opponent: who, how many, and whether they are catchable.
 */
export function Seat({ name, handCount, status, isTurn, seat, onCallOut }: SeatProps) {
  const t = useMessages()
  const shown = Math.min(handCount, MAX_FANNED)
  const statusText = statusNote(status, t)

  return (
    <div
      className={[
        'seat',
        isTurn ? 'seat-turn' : null,
        onCallOut !== null ? 'seat-exposed' : null,
        status === 'active' ? null : 'seat-away',
      ]
        .filter((token) => token !== null)
        .join(' ')}
      style={{ borderInlineStartColor: pigmentForSeat(seat) }}
    >
      <div className="seat-head">
        <span className="seat-name">{name}</span>
        {/* The count is the figure, not a word beside one: it is the single thing about
            an opponent that decides whether you play the +2 now or keep it. */}
        <span className="seat-count">{handCount}</span>
      </div>

      {/* Blocks rather than card faces: an opponent's hand is hidden, so drawing the
          backs at card size was spending the rail on a number already in figures above.
          Kept as a row because a shrinking row is read at a glance and a shrinking
          numeral is not. */}
      <div className="seat-backs" aria-hidden="true">
        {Array.from({ length: shown }, (_, index) => (
          <span className="seat-back" key={index} />
        ))}
      </div>

      {/* Turn state, presence and exposure are never colour-only. */}
      <p className="seat-notes">
        <span className={`presence presence-${status}`} aria-hidden="true" />
        {isTurn && <span className="seat-note">{t.table.theirTurn}</span>}
        {statusText !== null && <span className="seat-note">{statusText}</span>}
        {onCallOut !== null && <span className="seat-note">{t.table.openToCallOut}</span>}
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
