import { DEFAULT_TABLE_RULES, type Card, type CardId } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardThemeProvider } from '../components/CardThemeProvider.js'
import { CARD_THEMES, DEFAULT_CARD_THEME } from '../lib/card-themes.js'
import { readCardTheme } from '../lib/preferences.js'
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
  rules: DEFAULT_TABLE_RULES,
  discardTop: top,
  currentColor: 'R',
  pendingDraw: null,
  currentSeat: 0,
  direction: 1,
  turnOrder: [1, 2, 3],
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

const idleVoice = {
  status: 'idle' as const,
  peers: [],
  streams: {},
  speaking: {},
  connectionStates: {},
  muted: false,
  join: () => Promise.resolve(),
  leave: () => {},
  toggleMute: () => {},
}

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
    voice: idleVoice,
  }
  render(<Table {...props} />)
  return props
}

describe('Table', () => {
  it('shows every opponent', () => {
    setup(viewWith())
    /* Scoped to the rail: a name is now on screen twice, once here and once in the
       up-next queue, so an unscoped getByText is ambiguous. */
    const railNames = [...document.querySelectorAll('.seat-name')].map((node) => node.textContent)
    for (const name of ['Ben', 'Cleo', 'Dan']) expect(railNames).toContain(name)
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

  /* A missclick guard, not a layout preference. `callUno` becomes legal in the middle of a
     turn, so a button rendered before the turn-ending control slides that control out from
     under the cursor - and the cost is a drawn card nobody asked for, under a clock. The
     rule this asserts is general: nothing conditional may precede something permanent. */
  it('never puts the UNO control before the control that ends the turn', () => {
    const { container } = { container: document.body }
    setup(
      viewWith({
        you: {
          seat: 0,
          hand: [mine, mine],
          legalMoves: [{ type: 'draw' }, { type: 'callUno' }],
        },
      }),
    )
    const buttons = [...container.querySelectorAll('.controls .btn')]
    const uno = buttons.findIndex((node) => node.classList.contains('btn-uno'))
    expect(uno, 'the UNO control is rendered').toBeGreaterThan(-1)
    expect(uno, 'it comes after the turn-ending control').toBeGreaterThan(0)
  })

  it('offers no call-out unless the server put one in the view', () => {
    // The client evaluates no rule: a hand of one card next door means nothing to
    // it until the move arrives.
    setup(viewWith({ opponents: [{ seat: 1, name: 'Ben', handCount: 1, status: 'active' }] }))
    expect(screen.queryByRole('button', { name: /catch/i })).toBeNull()
  })

  it('puts a call-out button beside the opponent the server named, and only them', async () => {
    const { onPlay } = setup(
      viewWith({
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'callOut', target: 2 }] },
      }),
    )
    const buttons = screen.getAllByRole('button', { name: /catch/i })
    expect(buttons).toHaveLength(1)

    /* Beside Cleo, seat 2 - the second row of the rail. A button under the wrong name
       accuses the wrong player, so the assertion is that the button and the name are in
       the SAME row, not merely both on screen. */
    const row = [...document.querySelectorAll('.seat')].find((seat) =>
      seat.textContent?.includes('Cleo'),
    )
    expect(row?.contains(buttons[0] ?? null)).toBe(true)

    await userEvent.click(buttons[0] as HTMLElement)
    expect(onPlay).toHaveBeenCalledWith({ type: 'callOut', target: 2 })
  })

  /*
   * The button existed and was missed for entire games, because a control beside a seat
   * reads as decoration. The seat itself has to change, so the eye goes to the person.
   */
  it('marks the seat a call-out is available against', () => {
    setup(
      viewWith({
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'callOut', target: 2 }] },
      }),
    )
    const marked = [...document.querySelectorAll('.seat-exposed')]
    expect(marked).toHaveLength(1)
    expect(marked[0]?.textContent).toContain('Cleo')
    // Never colour alone: the row says so in words as well.
    expect(marked[0]?.textContent?.toLowerCase()).toContain('call-out')
  })

  it('marks nobody when no call-out is on offer', () => {
    setup(viewWith({ opponents: [{ seat: 1, name: 'Ben', handCount: 1, status: 'active' }] }))
    expect(document.querySelectorAll('.plate-exposed')).toHaveLength(0)
  })

  /*
   * Told to the exposed player too, because calling UNO is how the rules let you out of
   * it and the control is right there, whoever's turn it is. Derived rather than sent:
   * `callUno` is offered at two cards or while vulnerable, so at ONE card its presence
   * can only mean vulnerable.
   */
  it('warns you when you are the one open to a call-out', () => {
    setup(viewWith({ you: { seat: 0, hand: [mine], legalMoves: [{ type: 'callUno' }] } }))
    expect(screen.getByRole('alert').textContent?.toLowerCase()).toContain('one card')
  })

  it('does not warn you at two cards, where calling UNO is merely the ordinary moment', () => {
    setup(viewWith({ you: { seat: 0, hand: [mine, mine], legalMoves: [{ type: 'callUno' }] } }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /* The window opens as your own turn ends, so every moment you are accusable is
     somebody else's turn. A control that only appeared on your turn was an escape you
     could not reach while it mattered. */
  it('keeps the UNO control while it is somebody else’s turn', async () => {
    const { onPlay } = setup(
      viewWith({
        currentSeat: 1,
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'callUno' }] },
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: /uno/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'callUno' })
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
    expect(screen.getAllByRole('button', { name: /catch/i })).toHaveLength(2)
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

  it('offers an End turn control, not a dead Draw button, once a card has been drawn', async () => {
    /* The whole client-side risk of the sub-state: a seat that has drawn sees Draw go dead,
       and without something in its place concludes the table has hung. The control exists
       because the server put a `pass` in this view and for no other reason. */
    const { onPlay } = setup(
      viewWith({
        you: {
          seat: 0,
          hand: [mine],
          legalMoves: [{ type: 'play', cardId: mine.id }, { type: 'pass' }],
        },
      }),
    )
    expect(screen.queryByRole('button', { name: /draw card/i })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /end turn/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'pass' })
  })

  it('says which two things are on offer while a drawn card is being decided', () => {
    setup(
      viewWith({
        you: {
          seat: 0,
          hand: [mine],
          legalMoves: [{ type: 'play', cardId: mine.id }, { type: 'pass' }],
        },
      }),
    )
    expect(screen.getByText(/play the card you drew/i)).toBeTruthy()
  })

  it('says nothing about a drawn card when no pass was offered', () => {
    setup(viewWith())
    expect(screen.queryByText(/play the card you drew/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /end turn/i })).toBeNull()
    expect(screen.getByRole('button', { name: /draw card/i })).toBeTruthy()
  })

  it('keeps the debt button ahead of the pass, since accepting a draw grants neither', () => {
    /* Belt and braces on an impossible view: `acceptDraw` and `pass` can never both be
       offered, since taking a penalty is not a draw and grants no decision. If they ever
       were, the debt is the thing that has to be settled. */
    setup(
      viewWith({
        pendingDraw: { amount: 4, kind: 'wild4' },
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'acceptDraw' }, { type: 'pass' }] },
      }),
    )
    expect(screen.getByRole('button', { name: /take 4/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /end turn/i })).toBeNull()
  })

  it('still offers UNO beside the End turn control, which stays legal after a draw', () => {
    setup(
      viewWith({
        you: {
          seat: 0,
          hand: [mine, top],
          legalMoves: [{ type: 'play', cardId: mine.id }, { type: 'pass' }, { type: 'callUno' }],
        },
      }),
    )
    expect(screen.getByRole('button', { name: /uno/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /end turn/i })).toBeTruthy()
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
        voice={idleVoice}
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

describe('the card theme cycler', () => {
  const withProvider = () => {
    render(
      <CardThemeProvider>
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
          voice={idleVoice}
        />
      </CardThemeProvider>,
    )
  }

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('sits beside the mute toggle rather than among the moves', () => {
    /* Both are settings. The controls row holds the things a player reaches for with
       a clock running, and a card face is not one of them. */
    const { container } = render(
      <CardThemeProvider>
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
          voice={idleVoice}
        />
      </CardThemeProvider>,
    )
    /* The masthead, not the controls row. Same rule as before the relayout: a card face
       is a setting, and it must not sit among the buttons a player reaches for with a
       clock running. */
    expect(container.querySelector('.controls .theme-cycler')).toBeNull()
    expect(container.querySelector('.table-bar .theme-cycler')).not.toBeNull()
  })

  it('steps to the next theme and remembers it', async () => {
    withProvider()
    const cycler = screen.getByRole('button', { name: /card theme/i })
    expect(cycler.getAttribute('aria-label')).toBe('Card theme: Poster')

    await userEvent.click(cycler)
    expect(cycler.getAttribute('aria-label')).toBe('Card theme: Classic')
    expect(readCardTheme()).toBe('classic')
  })

  it('comes back round to the default after the last theme', async () => {
    withProvider()
    const cycler = screen.getByRole('button', { name: /card theme/i })
    for (let step = 0; step < CARD_THEMES.length; step += 1) await userEvent.click(cycler)
    expect(readCardTheme()).toBe(DEFAULT_CARD_THEME)
  })

  it('repaints the cards on screen, not only the button', async () => {
    // The point of the control. A cycler that stores a preference the hand does not
    // read is a cycler that appears broken.
    const { container } = render(
      <CardThemeProvider>
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
          voice={idleVoice}
        />
      </CardThemeProvider>,
    )
    // The poster default draws no oval; the printed card one step along draws one on
    // every card. Either direction proves the same thing: the hand repainted.
    expect(container.querySelectorAll('ellipse')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: /card theme/i }))
    expect(container.querySelectorAll('ellipse').length).toBeGreaterThan(0)
  })
})

describe('whose turn it is', () => {
  const headline = () => document.querySelector('.turn-headline')

  it('inks the headline into a slab when the turn is yours', () => {
    setup(viewWith())
    expect(headline()?.className).toContain('turn-headline-mine')
  })

  it("leaves the headline bare and marks the seat when the turn is somebody else's", () => {
    setup(viewWith({ currentSeat: 1, you: { seat: 0, hand: [mine], legalMoves: [] } }))
    expect(headline()?.className).not.toContain('turn-headline-mine')
    expect(document.querySelector('.turn-headline-pigment')).toBeTruthy()
  })

  it('lights the south bar only on your own turn', () => {
    setup(viewWith())
    expect(document.querySelector('.table-south')?.className).toContain('south-live')
  })

  it("leaves the south bar unlit on somebody else's turn", () => {
    setup(viewWith({ currentSeat: 1, you: { seat: 0, hand: [mine], legalMoves: [] } }))
    expect(document.querySelector('.table-south')?.className).not.toContain('south-live')
  })

  it('says who is up next, in the order the view sent', () => {
    setup(viewWith({ currentSeat: 3, turnOrder: [0, 1, 2] }))
    const names = [...document.querySelectorAll('.up-next-name')].map((node) => node.textContent)
    expect(names).toEqual(['You', 'Ben', 'Cleo'])
  })

  it('names you in the queue, since the rail never does', () => {
    setup(viewWith({ currentSeat: 1, turnOrder: [2, 3, 0] }))
    const names = [...document.querySelectorAll('.up-next-name')].map((node) => node.textContent)
    expect(names).toEqual(['Cleo', 'Dan', 'You'])
  })

  it('renders no queue on a table down to one active player', () => {
    setup(viewWith({ turnOrder: [] }))
    expect(document.querySelector('.up-next')).toBeNull()
  })
})
