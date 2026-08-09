import type { Color } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { Card } from './Card.js'
import { CardBack } from './CardBack.js'
import { COLOR_NAME, COLOR_VALUE } from '../lib/palette.js'

/** The same shape tokens the cards use, so the colour in play is readable
 *  without relying on hue. */
function ColourGlyph({ color }: { color: Color }) {
  const fill = 'var(--bone)'
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      {color === 'R' && <circle cx={12} cy={12} r={8} fill={fill} />}
      {color === 'G' && <path d="M12 3l9 16H3Z" fill={fill} />}
      {color === 'B' && <rect x={4} y={4} width={16} height={16} rx={2} fill={fill} />}
      {color === 'Y' && <path d="M12 2l10 10-10 10L2 12Z" fill={fill} />}
    </svg>
  )
}

function DirectionBadge({ direction }: { direction: 1 | -1 }) {
  return (
    <p className="dir-badge">
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={direction === -1 ? { transform: 'scaleX(-1)' } : undefined}
      >
        <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
        <path d="M20.5 4.5V10h-5.5" />
      </svg>
      {/* Named, not just drawn: an arrow alone is ambiguous at a glance, and the
          server has always carried `direction` — the interface used to ignore it. */}
      <span>{direction === 1 ? 'Clockwise' : 'Anticlockwise'}</span>
    </p>
  )
}

type CentreStackProps = {
  view: PlayerView
  /** Bumped once per draw. Used as a key so the pulse replays each time. */
  drawNonce?: number
}

export function CentreStack({ view, drawNonce = 0 }: CentreStackProps) {
  return (
    <div className="centre-stack">
      <div className="pile-group">
        {/* Keyed on the nonce so a new element mounts per draw and the CSS
            animation runs again. The class is withheld at nonce 0 so the pile
            does not pulse merely because the table just appeared. */}
        <div
          className={drawNonce > 0 ? 'pile pile-draw' : 'pile'}
          key={`draw-${String(drawNonce)}`}
        >
          <CardBack />
        </div>
        <p className="pile-label">{view.drawPileCount} left</p>
      </div>

      {/* Keyed by card id, not just present for its own sake: it forces React to
          remount this wrapper every time a new card lands, which is what makes
          the drop animation replay on each play and never on a draw, since a
          draw leaves the top card's id unchanged. */}
      <div className="pile pile-discard" key={view.discardTop.id}>
        <Card card={view.discardTop} />
      </div>

      <div className="pile-group">
        <span
          className="colour-orb"
          style={{
            background: COLOR_VALUE[view.currentColor],
            color: COLOR_VALUE[view.currentColor],
          }}
        >
          <ColourGlyph color={view.currentColor} />
        </span>
        {/* Named because a wild makes the colour in play diverge from the card
            everyone can see on the pile. */}
        <p className="pile-label">{COLOR_NAME[view.currentColor]} in play</p>
      </div>

      <DirectionBadge direction={view.direction} />

      {view.pendingDraw !== null && (
        <p className="debt-badge">
          <span className="debt-amount">+{view.pendingDraw.amount}</span> stacked
        </p>
      )}
    </div>
  )
}
