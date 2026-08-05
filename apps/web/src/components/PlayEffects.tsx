import type { Card, Color } from '@uno/engine'
import { useEffect, useRef, useState } from 'react'
import { EFFECT_DURATION_MS, effectForCard, type PlayEffect } from '../lib/play-effects.js'

type ActiveEffect = PlayEffect & { cardId: string }

const LABEL: Record<PlayEffect['kind'], string> = {
  wild4: '+4',
  wild: 'WILD',
  draw2: '+2',
  skip: 'SKIP',
  reverse: 'REVERSE',
}

const COLOR_VALUE: Record<Color, string> = {
  R: 'var(--red)',
  G: 'var(--green)',
  B: 'var(--blue)',
  Y: 'var(--yellow)',
}

/** Wild +4 gets the deck's own four-colour pinwheel instead of a single tint —
 *  it is the one card with no colour of its own until this moment. */
function flashBackground(effect: PlayEffect): string {
  if (effect.kind === 'wild4') {
    return 'conic-gradient(from 0deg, var(--red), var(--yellow), var(--green), var(--blue), var(--red))'
  }
  return `radial-gradient(circle, ${COLOR_VALUE[effect.color]}, transparent 70%)`
}

type PlayEffectsProps = {
  discardTop: Card
  currentColor: Color
  onShake?: (shaking: boolean) => void
}

/**
 * A decorative burst over the table for the cards worth making a fuss over.
 * Every fact it dramatises — who played what — already lives in the accessible
 * log this sits on top of, so the whole layer is aria-hidden: nothing here is
 * the only place a piece of information appears.
 */
export function PlayEffects({ discardTop, currentColor, onShake }: PlayEffectsProps) {
  const [active, setActive] = useState<ActiveEffect[]>([])
  // Starts pointed at whatever is already on top: the very first view a player
  // ever sees — including right after a reconnect — must not burst for a card
  // that landed moments or minutes ago.
  const lastSeenId = useRef(discardTop.id)

  useEffect(() => {
    if (discardTop.id === lastSeenId.current) return
    lastSeenId.current = discardTop.id
    const effect = effectForCard(discardTop, currentColor)
    if (effect === null) return

    const cardId = discardTop.id
    setActive((current) => [...current, { ...effect, cardId }])
    setTimeout(() => {
      setActive((current) => current.filter((item) => item.cardId !== cardId))
    }, EFFECT_DURATION_MS[effect.kind])
  }, [discardTop, currentColor])

  const shaking = active.some((effect) => effect.kind === 'wild4')
  useEffect(() => {
    onShake?.(shaking)
  }, [shaking, onShake])

  return (
    <div className="fx-layer" aria-hidden="true">
      {active.map((effect) => (
        <span
          key={effect.cardId}
          className="fx-flash"
          style={{
            background: flashBackground(effect),
            animationDuration: `${EFFECT_DURATION_MS[effect.kind]}ms`,
          }}
        />
      ))}
      {active.map((effect) => (
        <span
          key={effect.cardId}
          className="fx-label"
          style={{
            color: COLOR_VALUE[effect.color],
            animationDuration: `${EFFECT_DURATION_MS[effect.kind]}ms`,
          }}
        >
          {LABEL[effect.kind]}
        </span>
      ))}
    </div>
  )
}
