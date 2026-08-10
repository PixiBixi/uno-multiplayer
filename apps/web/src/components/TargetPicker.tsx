import type { Move } from '@uno/engine'
import { useEffect } from 'react'
import { useMessages } from '../i18n/index.js'

type PlayMove = Extract<Move, { type: 'play' }>

/**
 * What the picker needs about a seat it may take a hand from. Structurally what the
 * view's `opponents` already carry, so the table passes them straight through.
 */
export type SwapTarget = { seat: number; name: string; handCount: number }

type TargetPickerProps = {
  options: PlayMove[]
  targets: SwapTarget[]
  onChoose: (move: PlayMove) => void
  onCancel: () => void
}

/**
 * One button per legal move, exactly like ColourPicker — a 7 asking whose hand to
 * take is the same shape of decision as a wild asking for a colour, so it reuses
 * that shape rather than inventing a mechanism.
 *
 * The client evaluates nothing: whom you may swap with is whatever the server put in
 * this view, and choosing a target is choosing one of the moves it offered. A seat
 * the view knows nothing about is skipped rather than guessed at.
 */
export function TargetPicker({ options, targets, onChoose, onCancel }: TargetPickerProps) {
  const t = useMessages()
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="picker-veil">
      <div className="picker" role="dialog" aria-modal="true" aria-label={t.table.chooseSwapTarget}>
        <h2 className="picker-title">{t.table.chooseSwapTarget}</h2>
        <div className="picker-grid">
          {options.map((move) => {
            const target = targets.find((candidate) => candidate.seat === move.swapWith)
            if (target === undefined) return null
            return (
              <button
                key={target.seat}
                type="button"
                className="btn swap-target"
                onClick={() => onChoose(move)}
              >
                {t.table.swapTarget(target.name, target.handCount)}
              </button>
            )
          })}
        </div>
        <button type="button" className="btn" onClick={onCancel}>
          {t.table.cancel}
        </button>
      </div>
    </div>
  )
}
