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
    stats: [],
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

  it('offers no call-out unless the server put one in the view', () => {
    // The client evaluates no rule: a hand of one card next door means nothing to
    // it until the move arrives.
    setup(viewWith({ opponents: [{ seat: 1, name: 'Ben', handCount: 1, status: 'active' }] }))
    expect(screen.queryByRole('button', { name: /liar/i })).toBeNull()
  })

  it('puts a Liar button beside the opponent the server named, and only them', async () => {
    const { onPlay } = setup(
      viewWith({
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'callOut', target: 2 }] },
      }),
    )
    const buttons = screen.getAllByRole('button', { name: /liar/i })
    expect(buttons).toHaveLength(1)

    /* Beside Cleo, seat 2 — the second opponent in the view, which the layout puts
       at the north edge. A button under the wrong name accuses the wrong player. */
    const north = document.querySelector('.area-north')
    expect(north?.textContent).toContain('Cleo')
    expect(north?.contains(buttons[0] ?? null)).toBe(true)

    await userEvent.click(buttons[0] as HTMLElement)
    expect(onPlay).toHaveBeenCalledWith({ type: 'callOut', target: 2 })
  })

  it('offers one per vulnerable opponent', () => {
    setup(
      viewWith({
        you: {
          seat: 0,
          hand: [mine],
          legalMoves: [
            { type: 'callOut', target: 1 },
            { type: 'callOut', target: 3 },
          ],
        },
      }),
    )
    expect(screen.getAllByRole('button', { name: /liar/i })).toHaveLength(2)
  })

  it('says a jump-in is on offer only when the server offered a play off turn', async () => {
    /* The client evaluates nothing here either: it does not know what makes a card
       jumpable, only that a play arrived in a view where the turn belongs to somebody
       else. */
    const { onPlay } = setup(
      viewWith({
        currentSeat: 1,
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'play', cardId: mine.id }] },
      }),
    )
    expect(screen.getByText(/jump in/i)).toBeTruthy()

    // And the card is playable, which is the part that actually matters.
    await userEvent.click(screen.getByRole('button', { name: /red 5/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: mine.id })
  })

  it('says nothing about jumping in on your own turn', () => {
    setup(viewWith({ currentSeat: 0 }))
    expect(screen.queryByText(/jump in/i)).toBeNull()
  })

  it('says nothing about jumping in when no play was offered off turn', () => {
    setup(viewWith({ currentSeat: 1, you: { seat: 0, hand: [mine], legalMoves: [] } }))
    expect(screen.queryByText(/jump in/i)).toBeNull()
  })

  it('renders a swap picker from the moves the server offered, naming the seats', async () => {
    /* Straight through from the view: the client neither knows that a 7 swaps nor who
       a legal target is, only that two moves reference the same card. */
    const seven: Card = { id: 'seven' as CardId, kind: 'number', color: 'R', value: 7 }
    const { onPlay } = setup(
      viewWith({
        you: {
          seat: 0,
          hand: [seven],
          legalMoves: [
            { type: 'play', cardId: seven.id, swapWith: 1 },
            { type: 'play', cardId: seven.id, swapWith: 3 },
          ],
        },
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: /red 7/i }))

    const picker = screen.getByRole('dialog', { name: /whose hand/i })
    // Ben holds 4 and Dan holds 7 in this view; Cleo was never offered.
    expect(picker.textContent).toContain('Ben, 4 cards')
    expect(picker.textContent).toContain('Dan, 7 cards')
    expect(picker.textContent).not.toContain('Cleo')

    await userEvent.click(screen.getByRole('button', { name: /dan/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: seven.id, swapWith: 3 })
  })

  it('offers no swap picker when the server offered a plain play', () => {
    const seven: Card = { id: 'seven' as CardId, kind: 'number', color: 'R', value: 7 }
    setup(
      viewWith({
        you: { seat: 0, hand: [seven], legalMoves: [{ type: 'play', cardId: seven.id }] },
      }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
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
