import type { Card as CardData, CardId, Move } from '@uno/engine'
import { useState } from 'react'
import { readHandSort, writeHandSort } from '../lib/preferences.js'
import { HAND_SORTS, SORT_LABEL, sortHand, type HandSort } from '../lib/sort-hand.js'
import { Card } from './Card.js'
import { ColourPicker } from './ColourPicker.js'

type PlayMove = Extract<Move, { type: 'play' }>

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
}

export function Hand({ cards, legalMoves, onPlay }: HandProps) {
  const [pending, setPending] = useState<PlayMove[] | null>(null)
  const [sort, setSort] = useState<HandSort>(() => readHandSort())

  const choose = (options: PlayMove[]) => {
    const only = options[0]
    if (only === undefined) return
    // One option means no choice to make; several means a wild needs a colour.
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
        <div className="sort-control" role="group" aria-label="Sort your hand">
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
              {SORT_LABEL[mode]}
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

      {pending !== null && (
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
      )}
    </>
  )
}
