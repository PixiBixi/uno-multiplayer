import { EFFECT_DURATION_MS, type ActiveEffect } from '../lib/play-effects.js'
import { COLOR_VALUE } from '../lib/palette.js'

const LABEL: Record<ActiveEffect['kind'], string> = {
  wild4: '+4',
  wild: 'WILD',
  draw2: '+2',
  skip: 'SKIP',
  reverse: 'REVERSE',
  uno: 'UNO!',
}

const tint = (effect: ActiveEffect): string =>
  effect.color === undefined ? 'var(--red)' : COLOR_VALUE[effect.color]

/** Wild +4 gets the deck's own four-colour pinwheel instead of a single tint —
 *  it is the one card with no colour of its own until this moment. */
function flashBackground(effect: ActiveEffect): string {
  if (effect.kind === 'wild4') {
    return 'conic-gradient(from 0deg, var(--red), var(--yellow), var(--green), var(--blue), var(--red))'
  }
  return `radial-gradient(circle, ${tint(effect)}, transparent 70%)`
}

/**
 * Draws the transient bursts decided by `useTableEffects`. Purely presentational
 * — it holds no timing or bookkeeping of its own.
 *
 * Every fact it dramatises already appears in the accessible log this sits on
 * top of, so the whole layer is aria-hidden: nothing here is the only place a
 * piece of information exists.
 */
export function PlayEffects({ effects }: { effects: ActiveEffect[] }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      {effects.map((effect) => (
        <span
          key={`${effect.key}-flash`}
          className="fx-flash"
          style={{
            background: flashBackground(effect),
            animationDuration: `${String(EFFECT_DURATION_MS[effect.kind])}ms`,
          }}
        />
      ))}
      {effects.map((effect) => (
        <span
          key={`${effect.key}-label`}
          className={effect.kind === 'uno' ? 'fx-label fx-label-uno' : 'fx-label'}
          style={{
            color: tint(effect),
            animationDuration: `${String(EFFECT_DURATION_MS[effect.kind])}ms`,
          }}
        >
          {LABEL[effect.kind]}
        </span>
      ))}
    </div>
  )
}
