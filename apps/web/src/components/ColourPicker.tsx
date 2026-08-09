import type { Color, Move } from '@uno/engine'
import { useEffect } from 'react'
import { COLOR_NAME, COLOR_VALUE } from '../lib/palette.js'
import { useMessages } from '../i18n/index.js'

type PlayMove = Extract<Move, { type: 'play' }>

function Glyph({ color }: { color: Color }) {
  const fill = 'currentColor'
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
      {color === 'R' && <circle cx={12} cy={12} r={8} fill={fill} />}
      {color === 'G' && <path d="M12 3l9 16H3Z" fill={fill} />}
      {color === 'B' && <rect x={4} y={4} width={16} height={16} rx={2} fill={fill} />}
      {color === 'Y' && <path d="M12 2l10 10-10 10L2 12Z" fill={fill} />}
    </svg>
  )
}

type ColourPickerProps = {
  options: PlayMove[]
  onChoose: (move: PlayMove) => void
  onCancel: () => void
}

/**
 * Four buttons, one per legal move. The prototype used `prompt()`: cancelling it
 * threw, and typing `Z` locked the game forever. Choosing a colour here is
 * choosing a move, so there is nothing to validate.
 */
export function ColourPicker({ options, onChoose, onCancel }: ColourPickerProps) {
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
      <div className="picker" role="dialog" aria-modal="true" aria-label="Choose the new colour">
        <h2 className="picker-title">{t.table.chooseColour}</h2>
        <div className="picker-grid">
          {options.map((move) => {
            const color = move.chosenColor
            if (color === undefined) return null
            return (
              <button
                key={color}
                type="button"
                className="swatch"
                style={{ background: COLOR_VALUE[color] }}
                onClick={() => onChoose(move)}
              >
                <Glyph color={color} />
                {COLOR_NAME[color]}
              </button>
            )
          })}
        </div>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
