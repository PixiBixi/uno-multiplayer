import type { SeatStatus } from '@uno/engine'
import { CardBack } from './CardBack.js'

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
}

export function Seat({ name, handCount, status, isTurn, orientation }: SeatProps) {
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
        {isTurn && <span className="plate-note">their turn</span>}
        {statusText !== null && <span className="plate-note">{statusText}</span>}
      </p>
    </div>
  )
}
