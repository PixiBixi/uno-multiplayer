import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FeedEntry } from '../hooks/game-reducer.js'
import { ChatPanel } from './ChatPanel.js'

const nameOf = (seat: number) => ['Ana', 'Ben'][seat] ?? `Seat ${seat}`

const feed: FeedEntry[] = [
  { id: 1, kind: 'event', event: { type: 'unoCalled', seat: 1 } },
  { id: 2, kind: 'chat', seat: 1, name: 'Ben', text: 'close one' },
  { id: 3, kind: 'chat', seat: 0, name: 'Ana', text: 'not really' },
]

const setup = (overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) => {
  const props = { feed, mySeat: 0, nameOf, onSend: vi.fn(), ...overrides }
  render(<ChatPanel {...props} />)
  return props
}

describe('ChatPanel', () => {
  it('interleaves chat and system lines in one stream', () => {
    setup()
    expect(screen.getByText(/called UNO/i)).toBeTruthy()
    expect(screen.getByText('close one')).toBeTruthy()
  })

  it('marks system lines so they never read as speech', () => {
    const { container } = render(
      <ChatPanel feed={feed} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />,
    )
    expect(container.querySelectorAll('[data-system]')).toHaveLength(1)
  })

  it('attributes another player’s message', () => {
    setup()
    expect(screen.getByText('Ben')).toBeTruthy()
  })

  it('does not label your own messages with your name', () => {
    setup()
    expect(screen.queryByText('Ana')).toBeNull()
  })

  it('sends a trimmed message', async () => {
    const { onSend } = setup()
    await userEvent.type(screen.getByLabelText(/message the table/i), '  hello  ')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('hello')
  })

  it('refuses to send an empty message', async () => {
    const { onSend } = setup()
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears the field after sending', async () => {
    setup()
    const field = screen.getByLabelText<HTMLInputElement>(/message the table/i)
    await userEvent.type(field, 'hi{Enter}')
    expect(field.value).toBe('')
  })

  it('collapses and reopens', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }))
    expect(screen.queryByLabelText(/message the table/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /table/i }))
    expect(screen.getByLabelText(/message the table/i)).toBeTruthy()
  })

  it('counts only other people’s chat as unread while collapsed', async () => {
    const { rerender } = render(<ChatPanel feed={[]} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }))
    rerender(<ChatPanel feed={feed} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />)
    // One line from Ben; the UNO event and Ana's own line do not count.
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('does not steal focus when opened', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }))
    await userEvent.click(screen.getByRole('button', { name: /table/i }))
    expect(document.activeElement).not.toBe(screen.getByLabelText(/message the table/i))
  })
})
