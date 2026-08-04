import type { Card as CardData, CardId } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Card, cardLabel } from './Card.js'

const id = (value: string) => value as CardId
const num = (value: 0 | 5 | 7): CardData => ({ id: id('c1'), kind: 'number', color: 'R', value })

describe('cardLabel', () => {
  it('names a number card by colour and value', () => {
    expect(cardLabel(num(7))).toBe('Red 7')
  })

  it('names each action card', () => {
    expect(cardLabel({ id: id('a'), kind: 'skip', color: 'G' })).toBe('Green skip')
    expect(cardLabel({ id: id('b'), kind: 'reverse', color: 'B' })).toBe('Blue reverse')
    expect(cardLabel({ id: id('c'), kind: 'draw2', color: 'Y' })).toBe('Yellow draw two')
    expect(cardLabel({ id: id('d'), kind: 'wild' })).toBe('Wild')
    expect(cardLabel({ id: id('e'), kind: 'wild4' })).toBe('Wild draw four')
  })
})

describe('Card', () => {
  it('renders a button labelled by the card', () => {
    render(<Card card={num(7)} onPlay={() => undefined} />)
    expect(screen.getByRole('button', { name: /red 7/i })).toBeTruthy()
  })

  it('calls onPlay when clicked', async () => {
    const onPlay = vi.fn()
    render(<Card card={num(7)} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('is disabled and says why when not playable', async () => {
    const onPlay = vi.fn()
    render(<Card card={num(7)} onPlay={onPlay} disabled />)
    const button = screen.getByRole('button')
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-label')).toMatch(/not playable/i)
    await userEvent.click(button)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('renders static markup with no button when no handler is given', () => {
    render(<Card card={num(7)} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: /red 7/i })).toBeTruthy()
  })

  it('carries a shape token so colour is never the only signal', () => {
    const { container } = render(<Card card={num(7)} />)
    expect(container.querySelectorAll('[data-token]').length).toBeGreaterThan(0)
  })

  it('gives each pigment a distinct shape token', () => {
    const tokenOf = (color: 'R' | 'G' | 'B' | 'Y') => {
      const { container } = render(<Card card={{ id: id('x'), kind: 'number', color, value: 5 }} />)
      return container.querySelector('[data-token]')?.getAttribute('data-token')
    }
    expect(new Set([tokenOf('R'), tokenOf('G'), tokenOf('B'), tokenOf('Y')]).size).toBe(4)
  })

  it('repeats the shape token so the card reads either way up', () => {
    const { container } = render(<Card card={num(7)} />)
    expect(container.querySelectorAll('[data-token]')).toHaveLength(2)
  })

  it('draws four quadrants on a wild', () => {
    const { container } = render(<Card card={{ id: id('w'), kind: 'wild' }} />)
    expect(container.querySelectorAll('[data-quadrant]')).toHaveLength(4)
  })

  it('keeps the +4 label inside the card', () => {
    const { container } = render(<Card card={{ id: id('w4'), kind: 'wild4' }} />)
    expect(container.querySelector('[data-plusfour]')?.getAttribute('y')).toBe('107')
  })

  it('centres every face glyph on the ellipse rather than guessing a baseline', () => {
    for (const card of [
      num(0),
      num(7),
      { id: id('d'), kind: 'draw2' as const, color: 'Y' as const },
    ]) {
      const { container } = render(<Card card={card} />)
      const glyph = container.querySelector('text[font-size="66"], text[font-size="46"]')
      expect(glyph?.getAttribute('dominant-baseline')).toBe('central')
      expect(glyph?.getAttribute('y')).toBe('84')
    }
  })
})
