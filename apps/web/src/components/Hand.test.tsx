import type { Card as CardData, CardId, Move } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Hand, movesForCard } from './Hand.js'

const id = (value: string) => value as CardId
const red7: CardData = { id: id('r7'), kind: 'number', color: 'R', value: 7 }
const blue3: CardData = { id: id('b3'), kind: 'number', color: 'B', value: 3 }
const wild: CardData = { id: id('w'), kind: 'wild' }

const wildOptions: Move[] = (['R', 'G', 'B', 'Y'] as const).map((chosenColor) => ({
  type: 'play',
  cardId: id('w'),
  chosenColor,
}))

describe('movesForCard', () => {
  it('finds the single move for a coloured card', () => {
    const moves: Move[] = [{ type: 'play', cardId: id('r7') }, { type: 'draw' }]
    expect(movesForCard(moves, id('r7'))).toEqual([{ type: 'play', cardId: id('r7') }])
  })

  it('finds all four colour options for a wild', () => {
    expect(movesForCard(wildOptions, id('w'))).toHaveLength(4)
  })

  it('returns nothing for a card with no legal move', () => {
    expect(movesForCard([{ type: 'draw' }], id('r7'))).toEqual([])
  })
})

describe('Hand', () => {
  it('renders every held card', () => {
    render(<Hand cards={[red7, blue3]} legalMoves={[]} onPlay={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('disables a card that no legal move references', () => {
    render(
      <Hand
        cards={[red7, blue3]}
        legalMoves={[{ type: 'play', cardId: id('r7') }]}
        onPlay={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /red 7/i })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: /blue 3/i })).toHaveProperty('disabled', true)
  })

  it('plays a coloured card straight away', async () => {
    const onPlay = vi.fn()
    render(
      <Hand cards={[red7]} legalMoves={[{ type: 'play', cardId: id('r7') }]} onPlay={onPlay} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /red 7/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('r7') })
  })

  it('opens the colour picker for a wild instead of guessing', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[wild]} legalMoves={wildOptions} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    expect(onPlay).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /colour/i })).toBeTruthy()
  })

  it('plays the wild with the colour chosen', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[wild]} legalMoves={wildOptions} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    await userEvent.click(screen.getByRole('button', { name: /green/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('w'), chosenColor: 'G' })
  })

  it('closes the picker without playing when cancelled', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[wild]} legalMoves={wildOptions} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onPlay).not.toHaveBeenCalled()
  })
})
