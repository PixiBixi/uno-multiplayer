import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Seat } from './Seat.js'

const base = {
  name: 'Ben',
  handCount: 3,
  status: 'active' as const,
  isTurn: false,
  orientation: 'horizontal' as const,
  onCallOut: null,
}

describe('Seat', () => {
  it('shows the name and card count', () => {
    render(<Seat {...base} />)
    expect(screen.getByText('Ben')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders one card back per held card', () => {
    const { container } = render(<Seat {...base} handCount={4} />)
    expect(container.querySelectorAll('.fan-card')).toHaveLength(4)
  })

  it('caps the fan for a wide hand but still shows the true count', () => {
    const { container } = render(<Seat {...base} handCount={12} />)
    expect(container.querySelectorAll('.fan-card')).toHaveLength(6)
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('renders no card backs for an empty hand', () => {
    const { container } = render(<Seat {...base} handCount={0} />)
    expect(container.querySelectorAll('.fan-card')).toHaveLength(0)
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
    expect(screen.queryByRole('button', { name: /liar/i })).toBeNull()
  })

  it('calls out the seat when the button it was given is pressed', async () => {
    const onCallOut = vi.fn()
    render(<Seat {...base} handCount={1} onCallOut={onCallOut} />)
    await userEvent.click(screen.getByRole('button', { name: /liar/i }))
    expect(onCallOut).toHaveBeenCalledTimes(1)
  })

  it('names who is being accused, so the button is unambiguous to a screen reader', () => {
    render(<Seat {...base} handCount={1} onCallOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /liar/i }).getAttribute('aria-label')).toContain(
      'Ben',
    )
  })

  it('lays the fan out vertically for a side seat', () => {
    const { container } = render(<Seat {...base} orientation="vertical" />)
    expect(container.querySelector('.fan-vertical')).toBeTruthy()
  })
})
