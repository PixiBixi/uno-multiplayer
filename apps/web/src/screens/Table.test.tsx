import type { Card, CardId } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Table } from './Table.js'

const top: Card = { id: 'top' as CardId, kind: 'number', color: 'R', value: 3 }
const mine: Card = { id: 'mine' as CardId, kind: 'number', color: 'R', value: 5 }

const viewWith = (overrides: Partial<PlayerView> = {}): PlayerView => ({
  you: {
    seat: 0,
    hand: [mine],
    legalMoves: [{ type: 'play', cardId: mine.id }, { type: 'draw' }],
  },
  opponents: [
    { seat: 1, name: 'Ben', handCount: 4, status: 'active' },
    { seat: 2, name: 'Cleo', handCount: 2, status: 'active' },
    { seat: 3, name: 'Dan', handCount: 7, status: 'active' },
  ],
  discardTop: top,
  currentColor: 'R',
  pendingDraw: null,
  currentSeat: 0,
  direction: 1,
  drawPileCount: 20,
  phase: 'playing',
  winner: null,
  turnDeadline: null,
  nextRoundDeadline: null,
  match: {
    goal: DEFAULT_MATCH_GOAL,
    scores: [0, 0],
    round: 1,
    winners: null,
  },
  ...overrides,
})

const setup = (view: PlayerView) => {
  const props = {
    view,
    lobby: null,
    feed: [],
    toasts: [],
    onPlay: vi.fn(),
    onNextRound: vi.fn(),
    onRestart: vi.fn(),
    onLeave: vi.fn(),
    onSend: vi.fn(),
    onDismissToast: vi.fn(),
  }
  render(<Table {...props} />)
  return props
}

describe('Table', () => {
  it('shows every opponent', () => {
    setup(viewWith())
    for (const name of ['Ben', 'Cleo', 'Dan']) expect(screen.getByText(name)).toBeTruthy()
  })

  it('plays a card from your hand', async () => {
    const { onPlay } = setup(viewWith())
    await userEvent.click(screen.getByRole('button', { name: /red 5/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: mine.id })
  })

  it('draws when drawing is a legal move', async () => {
    const { onPlay } = setup(viewWith())
    await userEvent.click(screen.getByRole('button', { name: /draw card/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'draw' })
  })

  it('disables draw when it is not your turn', () => {
    setup(viewWith({ currentSeat: 1, you: { seat: 0, hand: [mine], legalMoves: [] } }))
    expect(screen.getByRole('button', { name: /draw card/i })).toHaveProperty('disabled', true)
  })

  it('offers UNO only when calling it is legal', () => {
    setup(viewWith())
    expect(screen.queryByRole('button', { name: /uno/i })).toBeNull()
  })

  it('shows the UNO control when the move is offered', async () => {
    const { onPlay } = setup(
      viewWith({ you: { seat: 0, hand: [mine, mine], legalMoves: [{ type: 'callUno' }] } }),
    )
    await userEvent.click(screen.getByRole('button', { name: /uno/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'callUno' })
  })

  it('labels the accept-draw control with what it costs', () => {
    setup(
      viewWith({
        pendingDraw: { amount: 4, kind: 'draw2' },
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'acceptDraw' }] },
      }),
    )
    expect(screen.getByRole('button', { name: /take 4/i })).toBeTruthy()
  })

  it('covers the table with the end screen once finished', () => {
    setup(viewWith({ phase: 'finished', winner: 1 }))
    expect(screen.getByRole('heading', { name: /wins/i })).toBeTruthy()
  })

  it('says whose turn it is in words', () => {
    setup(viewWith())
    expect(screen.getByText(/your turn/i)).toBeTruthy()
  })

  it('never puts an opponent’s card in the document', () => {
    const { container } = render(
      <Table
        view={viewWith()}
        lobby={null}
        feed={[]}
        toasts={[]}
        onPlay={vi.fn()}
        onNextRound={vi.fn()}
        onRestart={vi.fn()}
        onLeave={vi.fn()}
        onSend={vi.fn()}
        onDismissToast={vi.fn()}
      />,
    )
    // Opponent hands are face-down backs only; the sole named card is your own.
    const named = [...container.querySelectorAll('[role="img"]')].map((node) =>
      node.getAttribute('aria-label'),
    )
    expect(named.filter((label) => label === 'Face-down card').length).toBeGreaterThan(0)
    expect(named.filter((label) => label === 'Red 5')).toHaveLength(1)
  })
})
