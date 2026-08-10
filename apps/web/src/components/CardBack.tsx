import { useId } from 'react'
import { CARD_THEME_SPEC, legibleInkOn, pigmentPaint, type CardTheme } from '../lib/card-themes.js'
import { INK } from '../lib/palette.js'
import { useCardTheme } from './CardThemeProvider.js'

/**
 * The draw pile follows the theme too. A themed hand beside an unthemed pile looks
 * like a rendering bug rather than a preference, and the back is on screen for the
 * whole game.
 *
 * The badge stays red in every theme. It is the one mark on the table that is not
 * telling you anything about the game state, so it is the one place a fixed brand
 * colour costs nothing.
 */
export function CardBack({ theme }: { theme?: CardTheme } = {}) {
  const chosen = useCardTheme()
  const glowId = `back-glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const spec = CARD_THEME_SPEC[theme ?? chosen]
  const badge = pigmentPaint('R')

  /* A filled-panel theme keeps the printed black back; a stroked one keeps its own
     stock, because paper stock with a black field would be neither. */
  const ground = spec.ground === 'pigment' ? INK : spec.ground
  const inset = spec.panel === 'stroke' ? spec.panelStroke / 2 : 0
  const panel = {
    x: 6 + inset,
    y: 6 + inset,
    width: 108 - inset * 2,
    height: 156 - inset * 2,
    rx: 7,
  }
  // On the oval it is cream on red, as it is printed. Without one, the word sits
  // straight on the ground and takes whichever of the theme's inks survives there.
  const wordInk = spec.oval === null ? legibleInkOn(spec, ground) : spec.light

  return (
    <svg
      viewBox="0 0 120 168"
      role="img"
      aria-label="Face-down card"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      fontFamily={spec.font}
    >
      {spec.glow !== null && (
        <defs>
          <filter id={glowId} filterUnits="userSpaceOnUse" x={0} y={0} width={120} height={168}>
            <feGaussianBlur stdDeviation={spec.glow.blur} />
          </filter>
        </defs>
      )}

      <rect x={0} y={0} width={120} height={168} rx={11} fill={spec.stock.css} />
      <rect
        {...panel}
        fill={ground.css}
        {...(spec.panel === 'stroke'
          ? { stroke: badge.css, strokeWidth: spec.panelStroke }
          : undefined)}
      />

      {spec.oval !== null && (
        <ellipse cx={60} cy={84} rx={50} ry={28} fill={badge.css} transform="rotate(-27 60 84)" />
      )}

      {spec.glow !== null && (
        <text
          x={60}
          y={84}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={30}
          fontWeight={600}
          fill={badge.css}
          transform="rotate(-27 60 84)"
          filter={`url(#${glowId})`}
          opacity={spec.glow.opacity}
        >
          UNO
        </text>
      )}

      <text
        x={60}
        y={84}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={30}
        fontWeight={600}
        fill={wordInk.css}
        transform="rotate(-27 60 84)"
        data-back-word=""
      >
        UNO
      </text>
    </svg>
  )
}
