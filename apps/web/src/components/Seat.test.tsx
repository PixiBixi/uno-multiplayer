import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Seat } from './Seat.js'

const base = {
  name: 'Ben',
  handCount: 3,
  status: 'active' as const,
  isTurn: false,
  seat: 1,
  onCallOut: null,
}

describe('Seat', () => {
  it('shows the name and card count', () => {
    render(<Seat {...base} />)
    expect(screen.getByText('Ben')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders one block per held card', () => {
    const { container } = render(<Seat {...base} handCount={4} />)
    expect(container.querySelectorAll('.seat-back')).toHaveLength(4)
  })

  it('caps the row for a wide hand but still shows the true count', () => {
    const { container } = render(<Seat {...base} handCount={12} />)
    expect(container.querySelectorAll('.seat-back')).toHaveLength(6)
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('renders no blocks for an empty hand', () => {
    const { container } = render(<Seat {...base} handCount={0} />)
    expect(container.querySelectorAll('.seat-back')).toHaveLength(0)
  })

  it('marks the active seat in text, not only in colour', () => {
    render(<Seat {...base} isTurn />)
    expect(screen.getByText(/their turn/i)).toBeTruthy()
  })

  it('says a seat is reconnecting', () => {
    render(<Seat {...base} status="disconnected" />)
    expect(screen.getByText(/reconnecting/i)).toBeTruthy()
  })

  it('says a seat has left', () => {
    render(<Seat {...base} status="left" />)
    expect(screen.getByText(/left the game/i)).toBeTruthy()
  })

  it('offers no call-out when it was not given one', () => {
    render(<Seat {...base} handCount={1} />)
    expect(screen.queryByRole('button', { name: /catch/i })).toBeNull()
  })

  it('calls out the seat when the button it was given is pressed', async () => {
    const onCallOut = vi.fn()
    render(<Seat {...base} handCount={1} onCallOut={onCallOut} />)
    await userEvent.click(screen.getByRole('button', { name: /catch/i }))
    expect(onCallOut).toHaveBeenCalledTimes(1)
  })

  it('names who is being called out, so the button is unambiguous to a screen reader', () => {
    render(<Seat {...base} handCount={1} onCallOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /catch/i }).getAttribute('aria-label')).toContain(
      'Ben',
    )
  })

  /* The rail is one column, so a seat no longer has an orientation. What replaced it
     is the pigment: the row is marked by the seat's own colour, indexed by seat number
     and never by position, which is the invariant that has already cost a player their
     whole view of a game once. */
  it('marks the row with the pigment of its own seat number', () => {
    const { container } = render(<Seat {...base} seat={2} />)
    const style = container.querySelector('.seat')?.getAttribute('style') ?? ''
    expect(style).toContain('--yellow')
  })
})
