import type { Card as CardData, CardId, Move } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOGUES, LocaleContext } from '../i18n/index.js'
import { Hand, movesForCard } from './Hand.js'
import type { SwapTarget } from './TargetPicker.js'

const id = (value: string) => value as CardId
const red7: CardData = { id: id('r7'), kind: 'number', color: 'R', value: 7 }
const blue3: CardData = { id: id('b3'), kind: 'number', color: 'B', value: 3 }
const wild: CardData = { id: id('w'), kind: 'wild' }

const wildOptions: Move[] = (['R', 'G', 'B', 'Y'] as const).map((chosenColor) => ({
  type: 'play',
  cardId: id('w'),
  chosenColor,
}))

const seats: SwapTarget[] = [
  { seat: 1, name: 'Ben', handCount: 4 },
  { seat: 2, name: 'Cleo', handCount: 1 },
]

/** What the server offers for a 7 at a three-seat Seven-Zero table. */
const swapOptions: Move[] = [1, 2].map((swapWith) => ({
  type: 'play',
  cardId: id('r7'),
  swapWith,
}))

describe('movesForCard', () => {
  it('finds the single move for a coloured card', () => {
    const moves: Move[] = [{ type: 'play', cardId: id('r7') }, { type: 'draw' }]
    expect(movesForCard(moves, id('r7'))).toEqual([{ type: 'play', cardId: id('r7') }])
  })

  it('finds all four colour options for a wild', () => {
    expect(movesForCard(wildOptions, id('w'))).toHaveLength(4)
  })

  it('returns nothing for a card with no legal move', () => {
    expect(movesForCard([{ type: 'draw' }], id('r7'))).toEqual([])
  })
})

describe('Hand', () => {
  it('renders every held card', () => {
    const { container } = render(
      <Hand cards={[red7, blue3]} legalMoves={[]} targets={seats} onPlay={vi.fn()} />,
    )
    // Scoped to the hand: the sort control contributes buttons of its own.
    expect(container.querySelectorAll('.hand-card')).toHaveLength(2)
  })

  it('disables a card that no legal move references', () => {
    render(
      <Hand
        cards={[red7, blue3]}
        legalMoves={[{ type: 'play', cardId: id('r7') }]}
        targets={seats}
        onPlay={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /red 7/i })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: /blue 3/i })).toHaveProperty('disabled', true)
  })

  it('plays a coloured card straight away', async () => {
    const onPlay = vi.fn()
    render(
      <Hand
        cards={[red7]}
        legalMoves={[{ type: 'play', cardId: id('r7') }]}
        targets={seats}
        onPlay={onPlay}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /red 7/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('r7') })
  })

  it('opens the colour picker for a wild instead of guessing', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[wild]} legalMoves={wildOptions} targets={seats} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    expect(onPlay).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /colour/i })).toBeTruthy()
  })

  it('plays the wild with the colour chosen', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[wild]} legalMoves={wildOptions} targets={seats} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    await userEvent.click(screen.getByRole('button', { name: /green/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('w'), chosenColor: 'G' })
  })

  it('asks whose hand to take when the server offered more than one target', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[red7]} legalMoves={swapOptions} targets={seats} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /red 7/i }))
    expect(onPlay).not.toHaveBeenCalled()

    // Named by seat and card count: taking a hand of one is a very different move
    // from taking a hand of four.
    const picker = screen.getByRole('dialog', { name: /whose hand/i })
    expect(picker.textContent).toContain('Ben, 4 cards')
    expect(picker.textContent).toContain('Cleo, 1 card')
  })

  it('plays the 7 with the target chosen, and nothing else', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[red7]} legalMoves={swapOptions} targets={seats} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /red 7/i }))
    await userEvent.click(screen.getByRole('button', { name: /cleo/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('r7'), swapWith: 2 })
  })

  it('swaps straight away when the server offered a single target', async () => {
    /* A two-player table: a 7 has exactly one possible target, so there is nothing
       to ask. It still swaps rather than quietly doing nothing. */
    const onPlay = vi.fn()
    const only: Move[] = [{ type: 'play', cardId: id('r7'), swapWith: 1 }]
    render(<Hand cards={[red7]} legalMoves={only} targets={seats} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /red 7/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('r7'), swapWith: 1 })
  })

  it('closes the picker without playing when cancelled', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[wild]} legalMoves={wildOptions} targets={seats} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onPlay).not.toHaveBeenCalled()
  })
})

describe('Hand sorting', () => {
  const mixed: CardData[] = [
    { id: id('y9'), kind: 'number', color: 'Y', value: 9 },
    { id: id('w4'), kind: 'wild4' },
    { id: id('r0'), kind: 'number', color: 'R', value: 0 },
    { id: id('gs'), kind: 'skip', color: 'G' },
  ]

  const labels = () =>
    screen
      .getAllByRole('button', { name: /red|green|blue|yellow|wild/i })
      .map((node) => node.getAttribute('aria-label'))

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('leaves the dealt order alone by default', () => {
    render(<Hand cards={mixed} legalMoves={[]} targets={seats} onPlay={vi.fn()} />)
    expect(screen.getByRole('button', { name: /as dealt/i })).toHaveProperty('ariaPressed', 'true')
    expect(labels()[0]).toMatch(/yellow 9/i)
  })

  it('groups by colour on request, wilds last', async () => {
    render(<Hand cards={mixed} legalMoves={[]} targets={seats} onPlay={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /by colour/i }))
    const order = labels()
    expect(order[0]).toMatch(/red 0/i)
    expect(order[order.length - 1]).toMatch(/wild/i)
  })

  it('orders by points on request, lightest first', async () => {
    render(<Hand cards={mixed} legalMoves={[]} targets={seats} onPlay={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /by value/i }))
    const order = labels()
    expect(order[0]).toMatch(/red 0/i)
    expect(order[1]).toMatch(/yellow 9/i)
    expect(order[2]).toMatch(/green skip/i)
    expect(order[3]).toMatch(/wild/i)
  })

  it('remembers the choice for the next hand', async () => {
    const { unmount } = render(
      <Hand cards={mixed} legalMoves={[]} targets={seats} onPlay={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /by colour/i }))
    unmount()

    render(<Hand cards={mixed} legalMoves={[]} targets={seats} onPlay={vi.fn()} />)
    expect(screen.getByRole('button', { name: /by colour/i })).toHaveProperty('ariaPressed', 'true')
  })

  it('keeps playability attached to the card, not to its position', async () => {
    render(
      <Hand
        cards={mixed}
        legalMoves={[{ type: 'play', cardId: id('gs') }]}
        targets={seats}
        onPlay={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /by colour/i }))
    expect(screen.getByRole('button', { name: /green skip/i })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: /red 0/i })).toHaveProperty('disabled', true)
  })

  it('offers no sort control for a single card', () => {
    render(<Hand cards={[red7]} legalMoves={[]} targets={seats} onPlay={vi.fn()} />)
    expect(screen.queryByRole('group', { name: /sort|trier/i })).toBeNull()
  })

  it('names the three modes in the player’s language, not in English', () => {
    /* The catalogue already carried these three; the control had its own hardcoded
       table beside them, so a French player was offered "By colour". A label that
       does not follow the chosen language is the same defect wherever it lives -
       `lib/` is not exempt because it has no JSX in it. */
    render(
      <LocaleContext.Provider
        value={{ locale: 'fr', messages: CATALOGUES.fr, setLocale: () => undefined }}
      >
        <Hand cards={mixed} legalMoves={[]} targets={seats} onPlay={vi.fn()} />
      </LocaleContext.Provider>,
    )
    const control = screen.getByRole('group', { name: CATALOGUES.fr.table.sortHand })
    expect(control.textContent).toContain('Distribuées')
    expect(control.textContent).toContain('Par couleur')
    expect(control.textContent).toContain('Par valeur')
    expect(control.textContent).not.toMatch(/by colour|as dealt/i)
  })
})
