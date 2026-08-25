import { DEFAULT_TABLE_RULES, type Card as CardData, type CardId } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CentreStack, ColourBand } from './CentreStack.js'

const top: CardData = { id: 'top' as CardId, kind: 'number', color: 'B', value: 7 }

const viewWith = (overrides: Partial<PlayerView> = {}): PlayerView => ({
  you: { seat: 0, hand: [], legalMoves: [] },
  opponents: [],
  rules: DEFAULT_TABLE_RULES,
  discardTop: top,
  currentColor: 'B',
  pendingDraw: null,
  currentSeat: 0,
  direction: 1,
  drawPileCount: 34,
  phase: 'playing',
  winner: null,
  turnDeadline: null,
  nextRoundDeadline: null,
  match: {
    goal: DEFAULT_MATCH_GOAL,
    scores: [0, 0],
    round: 1,
    winners: null,
    stats: [],
  },
  ...overrides,
})

describe('CentreStack', () => {
  it('shows how many cards are left to draw', () => {
    render(<CentreStack view={viewWith()} />)
    expect(screen.getByText(/34 left/)).toBeTruthy()
  })

  it('shows the discard top', () => {
    render(<CentreStack view={viewWith()} />)
    expect(screen.getByRole('img', { name: /blue 7/i })).toBeTruthy()
  })

  it('shows a stacked draw debt when one is live', () => {
    render(<CentreStack view={viewWith({ pendingDraw: { amount: 6, kind: 'draw2' } })} />)
    expect(screen.getByText(/\+6/)).toBeTruthy()
    expect(screen.getByText(/stacked/i)).toBeTruthy()
  })

  it('shows no debt badge when none stands', () => {
    render(<CentreStack view={viewWith()} />)
    expect(screen.queryByText(/stacked/i)).toBeNull()
  })
})

describe('ColourBand', () => {
  it('names the direction of play in words', () => {
    render(<ColourBand view={viewWith()} />)
    expect(screen.getByText(/clockwise/i)).toBeTruthy()
  })

  it('names the reversed direction', () => {
    render(<ColourBand view={viewWith({ direction: -1 })} />)
    expect(screen.getByText(/anticlockwise/i)).toBeTruthy()
  })

  it('names the colour in play, since a wild makes it diverge from the top card', () => {
    render(<ColourBand view={viewWith({ currentColor: 'G' })} />)
    expect(screen.getByText(/green in play/i)).toBeTruthy()
  })

  /* Cream on three pigments, ink on the fourth. Yellow measures 1.7:1 under cream, so
     the band carries the colour as data and lets CSS pick the ink - the same decision
     the card faces make, and the reason this is asserted rather than assumed. */
  it('marks which pigment it is carrying, so the ink can be chosen against it', () => {
    const { container } = render(<ColourBand view={viewWith({ currentColor: 'Y' })} />)
    expect(container.querySelector('.colour-band')?.getAttribute('data-colour')).toBe('Y')
  })
})
