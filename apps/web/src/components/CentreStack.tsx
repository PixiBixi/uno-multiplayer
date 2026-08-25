import type { Color } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { Card } from './Card.js'
import { CardBack } from './CardBack.js'
import { COLOR_VALUE } from '../lib/palette.js'
import { useMessages } from '../i18n/index.js'

/** The same shape tokens the cards use, so the colour in play is readable
 *  without relying on hue. */
function ColourGlyph({ color, size = 20 }: { color: Color; size?: number }) {
  const fill = 'currentColor'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {color === 'R' && <circle cx={12} cy={12} r={8} fill={fill} />}
      {color === 'G' && <path d="M12 3l9 16H3Z" fill={fill} />}
      {color === 'B' && <rect x={4} y={4} width={16} height={16} fill={fill} />}
      {color === 'Y' && <path d="M12 2l10 10-10 10L2 12Z" fill={fill} />}
    </svg>
  )
}

function DirectionArrow({ direction }: { direction: 1 | -1 }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={direction === -1 ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M4 12h14" />
      <path d="m13 7 5 5-5 5" />
    </svg>
  )
}

/**
 * The colour in play, as a band across the whole width of the table rather than an orb
 * beside the pile.
 *
 * It is the single most consequential fact on the screen - after a wild it is the only
 * thing that says what may be played, and it diverges from the card everyone can see -
 * so it gets the one element on the page that cannot be missed or mistaken for
 * decoration. The direction rides along on the right because it is the other fact that
 * belongs to the table rather than to a player.
 */
export function ColourBand({ view }: { view: PlayerView }) {
  const t = useMessages()
  const colour = COLOR_VALUE[view.currentColor]
  return (
    <div className="colour-band" style={{ background: colour }} data-colour={view.currentColor}>
      <p className="colour-band-name">
        <ColourGlyph color={view.currentColor} size={24} />
        <span>{t.table.inPlay(t.colour(view.currentColor))}</span>
      </p>
      <p className="colour-band-dir">
        <DirectionArrow direction={view.direction} />
        {/* Named, not just drawn: an arrow alone is ambiguous at a glance, and the
            server has always carried `direction` - the interface used to ignore it. */}
        <span>{view.direction === 1 ? t.table.clockwise : t.table.anticlockwise}</span>
      </p>
    </div>
  )
}

type CentreStackProps = {
  view: PlayerView
  /** Bumped once per draw. Used as a key so the pulse replays each time. */
  drawNonce?: number
}

/**
 * The two piles, side by side and large. The colour orb and the direction badge moved
 * out into `ColourBand`; what is left here is the physical middle of the table.
 */
export function CentreStack({ view, drawNonce = 0 }: CentreStackProps) {
  const t = useMessages()
  return (
    <div className="centre-stack">
      {/* Keyed by card id, not just present for its own sake: it forces React to
          remount this wrapper every time a new card lands, which is what makes
          the drop animation replay on each play and never on a draw, since a
          draw leaves the top card's id unchanged. */}
      <div className="pile-group">
        <div className="pile pile-discard" key={view.discardTop.id}>
          <Card card={view.discardTop} />
        </div>
        <p className="pile-label">{t.table.discardPile}</p>
      </div>

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
        <p className="pile-label">{t.table.left(view.drawPileCount)}</p>
      </div>

      {/* One string, not a styled figure with a word beside it. Splitting the badge
          into a span and a trailing noun fixed the word order at English's: French
          would still have read "+6 en attente", but only because the number happens
          to come first there too, and the next language would have found out the hard
          way. The tabular figures now come from `.debt-badge` itself. */}
      {view.pendingDraw !== null && (
        <p className="debt-badge">{t.table.stacked(view.pendingDraw.amount)}</p>
      )}
    </div>
  )
}
