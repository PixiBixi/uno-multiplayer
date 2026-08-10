import type { Card as CardData, CardId, Move } from '@uno/engine'
import { useState } from 'react'
import { useMessages, type Messages } from '../i18n/index.js'
import { readHandSort, writeHandSort } from '../lib/preferences.js'
import { HAND_SORTS, sortHand, type HandSort } from '../lib/sort-hand.js'
import { Card } from './Card.js'
import { ColourPicker } from './ColourPicker.js'
import { TargetPicker, type SwapTarget } from './TargetPicker.js'

type PlayMove = Extract<Move, { type: 'play' }>

/**
 * One sort mode to one catalogue entry. `Record` rather than a switch so a fifth
 * mode fails the typecheck here as well as in both catalogues, instead of quietly
 * rendering a button with nothing on it.
 */
const sortLabel = (t: Messages): Record<HandSort, string> => ({
  dealt: t.table.sortDealt,
  colour: t.table.sortColour,
  value: t.table.sortValue,
})

/**
 * A card is playable if and only if a legal move references it. The client never
 * evaluates a rule of its own.
 */
export function movesForCard(legalMoves: Move[], cardId: CardId): PlayMove[] {
  return legalMoves.filter(
    (move): move is PlayMove => move.type === 'play' && move.cardId === cardId,
  )
}

type HandProps = {
  cards: CardData[]
  legalMoves: Move[]
  onPlay: (move: Move) => void
  /**
   * The seats a Seven-Zero swap could take a hand from, for naming them in the
   * picker. Required rather than optional so a table that forgets to pass them is a
   * compile error and not a dialog full of blanks.
   */
  targets: SwapTarget[]
}

export function Hand({ cards, legalMoves, onPlay, targets }: HandProps) {
  const t = useMessages()
  const label = sortLabel(t)
  const [pending, setPending] = useState<PlayMove[] | null>(null)
  const [sort, setSort] = useState<HandSort>(() => readHandSort())

  const choose = (options: PlayMove[]) => {
    const only = options[0]
    if (only === undefined) return
    /* One option means no choice to make — an ordinary card, or a 7 at a table where
       exactly one other seat could take the hand, which the spec is explicit about:
       it swaps rather than quietly doing nothing. */
    if (options.length === 1) onPlay(only)
    else setPending(options)
  }

  const pick = (mode: HandSort) => {
    setSort(mode)
    writeHandSort(mode)
  }

  /* Presentation only: the server is sent a cardId, so the order a hand is drawn
     in has no bearing on the protocol. */
  const ordered = sortHand(cards, sort)

  return (
    <>
      {cards.length > 1 && (
        <div className="sort-control" role="group" aria-label={t.table.sortHand}>
          {HAND_SORTS.map((mode) => (
            <button
              key={mode}
              type="button"
              className="sort-btn"
              aria-pressed={sort === mode}
              onClick={() => {
                pick(mode)
              }}
            >
              {label[mode]}
            </button>
          ))}
        </div>
      )}

      <div className="hand">
        {ordered.map((card) => {
          const options = movesForCard(legalMoves, card.id)
          return (
            <div className="hand-card" key={card.id}>
              <Card
                card={card}
                disabled={options.length === 0}
                onPlay={() => {
                  choose(options)
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Which second decision it is comes from the moves themselves: a wild's
          options carry a colour, a 7's carry a seat. Nothing else has to be known. */}
      {pending !== null &&
        (pending[0]?.swapWith === undefined ? (
          <ColourPicker
            options={pending}
            onChoose={(move) => {
              setPending(null)
              onPlay(move)
            }}
            onCancel={() => {
              setPending(null)
            }}
          />
        ) : (
          <TargetPicker
            options={pending}
            targets={targets}
            onChoose={(move) => {
              setPending(null)
              onPlay(move)
            }}
            onCancel={() => {
              setPending(null)
            }}
          />
        ))}
    </>
  )
}
