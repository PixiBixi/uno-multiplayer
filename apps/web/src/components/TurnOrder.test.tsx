import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TurnOrder } from './TurnOrder.js'

const nameOf = (seat: number): string => ['You', 'Ben', 'Cleo', 'Dan'][seat] ?? `Seat ${seat}`

describe('TurnOrder', () => {
  it('names the seats in the order it was given', () => {
    const { container } = render(<TurnOrder seats={[2, 3, 0]} nameOf={nameOf} />)
    const names = [...container.querySelectorAll('.up-next-name')].map((node) => node.textContent)
    expect(names).toEqual(['Cleo', 'Dan', 'You'])
  })

  it('marks each seat with its own pigment, indexed by seat and not by position', () => {
    const { container } = render(<TurnOrder seats={[2, 0]} nameOf={nameOf} />)
    const pigments = [...container.querySelectorAll('.up-next-pigment')].map(
      (node) => (node as HTMLElement).style.background,
    )
    expect(pigments).toEqual(['var(--yellow)', 'var(--red)'])
  })

  it('says "up next" rather than promising a next player', () => {
    render(<TurnOrder seats={[1]} nameOf={nameOf} />)
    expect(screen.getByText(/up next/i)).toBeTruthy()
    expect(screen.queryByText(/next player/i)).toBeNull()
  })

  it('renders nothing at all when nobody follows', () => {
    const { container } = render(<TurnOrder seats={[]} nameOf={nameOf} />)
    expect(container.querySelector('.up-next')).toBeNull()
  })
})
