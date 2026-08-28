import { useMessages } from '../i18n/index.js'
import { pigmentForSeat } from '../lib/palette.js'

type TurnOrderProps = {
  /** Seats after the one on turn, in the order the server sent them. */
  seats: number[]
  nameOf: (seat: number) => string
}

/**
 * Who plays after the current seat, under the headline that says whose turn it is.
 *
 * The rail cannot answer this: it is in seat order, and it does not contain the reader,
 * who is very often the one who plays next. So the answer goes where the question is
 * asked - beside the headline - rather than as a badge somewhere in the column.
 *
 * "Up next", never "next player". The order is the server's reading of the seating and
 * a skip, a reverse, a +2 or a 7/0 rewrites it the moment it is played.
 *
 * Nothing at all when the list is empty, which is a table down to one active player:
 * an empty heading reads as a panel that failed to load.
 */
export function TurnOrder({ seats, nameOf }: TurnOrderProps) {
  const t = useMessages()
  if (seats.length === 0) return null

  return (
    <p className="up-next">
      <span className="eyebrow">{t.table.upNext}</span>
      {seats.map((seat) => (
        <span className="up-next-seat" key={seat}>
          {/* Same mark as the rail and the plates, indexed by seat number so a player
              keeps one colour wherever they appear. */}
          <span
            className="up-next-pigment"
            style={{ background: pigmentForSeat(seat) }}
            aria-hidden="true"
          />
          <span className="up-next-name">{nameOf(seat)}</span>
        </span>
      ))}
    </p>
  )
}
