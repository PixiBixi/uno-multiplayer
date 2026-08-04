import type { CardId, Move } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColourPicker } from './ColourPicker.js'

const id = (value: string) => value as CardId
const options = (['R', 'G', 'B', 'Y'] as const).map(
  (chosenColor): Extract<Move, { type: 'play' }> => ({
    type: 'play',
    cardId: id('w'),
    chosenColor,
  }),
)

describe('ColourPicker', () => {
  it('offers only the colours the server allows', () => {
    render(<ColourPicker options={options.slice(0, 2)} onChoose={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /red|green|blue|yellow/i })).toHaveLength(2)
  })

  it('names each colour in text, not only by swatch', () => {
    render(<ColourPicker options={options} onChoose={vi.fn()} onCancel={vi.fn()} />)
    for (const name of [/red/i, /green/i, /blue/i, /yellow/i]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('returns the exact move it was given', async () => {
    const onChoose = vi.fn()
    render(<ColourPicker options={options} onChoose={onChoose} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /yellow/i }))
    expect(onChoose).toHaveBeenCalledWith(options[3])
  })

  it('cancels on Escape', async () => {
    const onCancel = vi.fn()
    render(<ColourPicker options={options} onChoose={vi.fn()} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('is a labelled modal dialog', () => {
    render(<ColourPicker options={options} onChoose={vi.fn()} onCancel={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: /colour/i })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})
