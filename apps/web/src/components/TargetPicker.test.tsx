import type { CardId, Move } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TargetPicker, type SwapTarget } from './TargetPicker.js'

const id = (value: string) => value as CardId

const options = [1, 2].map((swapWith): Extract<Move, { type: 'play' }> => ({
  type: 'play',
  cardId: id('r7'),
  swapWith,
}))

const targets: SwapTarget[] = [
  { seat: 1, name: 'Ben', handCount: 4 },
  { seat: 2, name: 'Cleo', handCount: 1 },
]

describe('TargetPicker', () => {
  it('offers only the seats the server allows', () => {
    // The client evaluates nothing: a seat with no move against it is not a choice,
    // however plausible a target it looks.
    render(
      <TargetPicker
        options={options.slice(0, 1)}
        targets={targets}
        onChoose={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('button', { name: /ben|cleo/i })).toHaveLength(1)
  })

  it('names each seat and says how many cards taking it would cost', () => {
    render(
      <TargetPicker options={options} targets={targets} onChoose={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Ben, 4 cards' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cleo, 1 card' })).toBeTruthy()
  })

  it('returns the exact move it was given', async () => {
    const onChoose = vi.fn()
    render(
      <TargetPicker options={options} targets={targets} onChoose={onChoose} onCancel={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /cleo/i }))
    expect(onChoose).toHaveBeenCalledWith(options[1])
  })

  it('skips a target the view knows nothing about rather than guessing a name', () => {
    render(
      <TargetPicker
        options={[{ type: 'play', cardId: id('r7'), swapWith: 3 }]}
        targets={targets}
        onChoose={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryAllByRole('button', { name: /ben|cleo/i })).toHaveLength(0)
  })

  it('cancels on Escape', async () => {
    const onCancel = vi.fn()
    render(
      <TargetPicker options={options} targets={targets} onChoose={vi.fn()} onCancel={onCancel} />,
    )
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('is a labelled modal dialog', () => {
    render(
      <TargetPicker options={options} targets={targets} onChoose={vi.fn()} onCancel={vi.fn()} />,
    )
    const dialog = screen.getByRole('dialog', { name: /whose hand/i })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
