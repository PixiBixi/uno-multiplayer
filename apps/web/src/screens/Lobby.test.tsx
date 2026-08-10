import { DEFAULT_TABLE_RULES } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type LobbyView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readRoomCodeFromUrl } from '../lib/room-url.js'
import { Lobby } from './Lobby.js'

const lobbyWith = (names: string[], canStart = names.length >= 2): LobbyView => ({
  roomCode: 'K7QM2X',
  hostSeat: 0,
  seats: names.map((name, seat) => ({ seat, name, status: 'active' as const })),
  canStart,
  goal: DEFAULT_MATCH_GOAL,
  pace: null,
  rules: DEFAULT_TABLE_RULES,
  configurable: true,
})

const setup = (lobby: LobbyView, mySeat: number) => {
  const props = { lobby, mySeat, onStart: vi.fn(), onLeave: vi.fn(), onConfigure: vi.fn() }
  render(<Lobby {...props} />)
  return props
}

describe('Lobby', () => {
  it('shows the game code', () => {
    setup(lobbyWith(['Ana', 'Ben']), 0)
    expect(screen.getByText('K7QM2X')).toBeTruthy()
  })

  it('lists every seated player', () => {
    setup(lobbyWith(['Ana', 'Ben', 'Cleo']), 0)
    for (const name of ['Ana', 'Ben', 'Cleo']) expect(screen.getByText(name)).toBeTruthy()
  })

  it('shows the remaining empty seats', () => {
    setup(lobbyWith(['Ana', 'Ben']), 0)
    expect(screen.getAllByText(/waiting for a player/i)).toHaveLength(2)
  })

  it('shows no empty seats at four players', () => {
    setup(lobbyWith(['Ana', 'Ben', 'Cleo', 'Dan']), 0)
    expect(screen.queryByText(/waiting for a player/i)).toBeNull()
  })

  it('marks the host', () => {
    setup(lobbyWith(['Ana', 'Ben']), 1)
    expect(screen.getByText(/^host$/i)).toBeTruthy()
  })

  it('lets the host start once two players are seated', async () => {
    const { onStart } = setup(lobbyWith(['Ana', 'Ben']), 0)
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('tells the host they need another player', () => {
    setup(lobbyWith(['Ana'], false), 0)
    expect(screen.getByRole('button', { name: /start/i })).toHaveProperty('disabled', true)
    expect(screen.getByText(/at least two/i)).toBeTruthy()
  })

  it('tells a guest who they are waiting for', () => {
    setup(lobbyWith(['Ana', 'Ben']), 1)
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
    expect(screen.getByText(/waiting for ana/i)).toBeTruthy()
  })

  it('can leave', async () => {
    const { onLeave } = setup(lobbyWith(['Ana', 'Ben']), 1)
    await userEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('greys out a seat that dropped and says so in words', () => {
    const lobby = lobbyWith(['Ana', 'Ben'])
    const seats = [...lobby.seats]
    seats[1] = { seat: 1, name: 'Ben', status: 'disconnected' }
    setup({ ...lobby, seats }, 0)
    expect(screen.getByText(/reconnecting/i)).toBeTruthy()
  })

  describe('the table configuration', () => {
    /** The state a read-only panel reports for the rule whose label matches. */
    const stateOf = (label: RegExp): string | undefined =>
      [...document.querySelectorAll('.rule-state')]
        .find((row) => label.test(row.textContent ?? ''))
        ?.querySelector('strong')?.textContent ?? undefined

    it('shows a guest the rules they are about to play by', () => {
      /* The defect this feature exists for: a guest used to learn about Seven-Zero when
         their hand changed owner. Every rule is named, and its state is a word rather
         than only a control they cannot reach. */
      const lobby = lobbyWith(['Ana', 'Ben'])
      setup(
        { ...lobby, rules: { liar: true, sevenZero: true, jumpIn: false, playDrawnCard: true } },
        1,
      )

      expect(stateOf(/seven-zero/i)).toBe('on')
      expect(stateOf(/jump-in/i)).toBe('off')
      expect(stateOf(/call out/i)).toBe('on')
      expect(stateOf(/drawn card/i)).toBe('on')
    })

    it('gives a guest nothing to emit with', () => {
      const { onConfigure } = setup(lobbyWith(['Ana', 'Ben']), 1)
      // Not a disabled control: none at all, so there is nothing for a stray click or a
      // scripted event to reach.
      expect(screen.queryAllByRole('checkbox')).toEqual([])
      expect(screen.queryByLabelText(/winning score/i)).toBeNull()
      expect(onConfigure).not.toHaveBeenCalled()
    })

    it('shows a guest how the match ends and whether there is a clock', () => {
      const lobby = lobbyWith(['Ana', 'Ben'])
      setup({ ...lobby, goal: { kind: 'rounds', count: 3 }, pace: { turnSeconds: 20 } }, 1)
      expect(screen.getByText(/best of 3/i)).toBeTruthy()
      expect(screen.getByText(/20 seconds per turn/i)).toBeTruthy()
    })

    it('says a table with no clock has no clock, rather than saying nothing', () => {
      setup(lobbyWith(['Ana', 'Ben']), 1)
      expect(screen.getByText(/no clock/i)).toBeTruthy()
    })

    it('lets the host toggle a rule, sending the other three unchanged', async () => {
      /* The whole rules object, not the one flag: the server replaces that field
         wholesale, so a lone flag would reset the other three to their defaults. */
      const lobby = lobbyWith(['Ana', 'Ben'])
      const { onConfigure } = setup(
        { ...lobby, rules: { liar: true, sevenZero: false, jumpIn: false, playDrawnCard: false } },
        0,
      )
      /* By role and name, not by label text: a rule's explanation carries the rule's
         name in its own accessible name too, which is deliberate — four identical
         summaries would announce identically — and makes a bare label lookup ambiguous. */
      await userEvent.click(screen.getByRole('checkbox', { name: /seven-zero/i }))
      expect(onConfigure).toHaveBeenCalledWith({
        rules: { liar: true, sevenZero: true, jumpIn: false, playDrawnCard: false },
      })
    })

    it('sends only the field the host touched', async () => {
      const { onConfigure } = setup(lobbyWith(['Ana', 'Ben']), 0)
      await userEvent.click(screen.getByRole('button', { name: /set number of rounds/i }))
      expect(onConfigure).toHaveBeenCalledWith({ goal: { kind: 'rounds', count: 3 } })
      // No goal echoed back beside it, and no rules: an absent field is what tells the
      // server to leave that one alone.
      expect(onConfigure.mock.calls[0]?.[0]).not.toHaveProperty('rules')
      expect(onConfigure.mock.calls[0]?.[0]).not.toHaveProperty('pace')
    })

    it('takes the clock off the table with an explicit null rather than by omission', async () => {
      const lobby = lobbyWith(['Ana', 'Ben'])
      const { onConfigure } = setup({ ...lobby, pace: { turnSeconds: 15 } }, 0)
      await userEvent.click(screen.getByRole('checkbox', { name: /clock on every turn/i }))
      expect(onConfigure).toHaveBeenCalledWith({ pace: null })
    })

    it('renders the host controls from the view, so a refused change reverts itself', () => {
      /* Controlled by the lobby view rather than by local state: the server is the
         authority, and a switch holding its own opinion would keep showing a rule the
         server never accepted. */
      const lobby = lobbyWith(['Ana', 'Ben'])
      setup({ ...lobby, rules: { ...DEFAULT_TABLE_RULES, jumpIn: true } }, 0)
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /jump-in/i }).checked).toBe(
        true,
      )
      expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /seven-zero/i }).checked).toBe(
        false,
      )
    })

    it('takes the host controls away once the cards are dealt', () => {
      /* Presentation only — the server refuses a late change whatever the screen shows —
         but a control that cannot work must not be on offer. Driven by `configurable`,
         which the server derives from the match having begun, NOT from `canStart`. */
      const lobby = lobbyWith(['Ana', 'Ben'])
      setup({ ...lobby, configurable: false }, 0)
      expect(screen.queryAllByRole('checkbox')).toEqual([])
      expect(screen.getByText(/cards are dealt/i)).toBeTruthy()
    })

    it('keeps the host controls in a room that cannot start yet', () => {
      /* The other half of the same distinction: one player at the table cannot deal, and
         has every reason to be setting the rules while waiting for the second. */
      setup(lobbyWith(['Ana'], false), 0)
      expect(screen.getByRole('checkbox', { name: /seven-zero/i })).toBeTruthy()
    })

    it('explains each rule behind its own disclosure rather than four paragraphs at once', () => {
      const { container } = { container: document.body }
      setup(lobbyWith(['Ana', 'Ben']), 0)
      const disclosures = container.querySelectorAll('.rule-why')
      expect(disclosures).toHaveLength(4)
      for (const disclosure of disclosures) {
        expect(disclosure.querySelector('summary')?.getAttribute('aria-label')).toBeTruthy()
        expect((disclosure as HTMLDetailsElement).open).toBe(false)
      }
    })

    it('shows the points table in full, not behind a click', () => {
      setup(lobbyWith(['Ana', 'Ben']), 1)
      expect(screen.getByText(/what the cards are worth/i)).toBeTruthy()
      expect(screen.getByText(/draw two/i)).toBeTruthy()
    })
  })

  describe('sharing the table', () => {
    const clipboard: string[] = []

    beforeEach(() => {
      clipboard.length = 0
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: (text: string) => {
            clipboard.push(text)
            return Promise.resolve()
          },
        },
        configurable: true,
      })
    })

    afterEach(() => {
      Reflect.deleteProperty(navigator, 'clipboard')
    })

    it('copies the bare code, for reading out loud', async () => {
      setup(lobbyWith(['Ana', 'Ben']), 0)
      await userEvent.click(screen.getByRole('button', { name: /copy code/i }))
      expect(clipboard).toEqual(['K7QM2X'])
    })

    it('copies a link that carries the code, not just the current address', async () => {
      setup(lobbyWith(['Ana', 'Ben']), 0)
      await userEvent.click(screen.getByRole('button', { name: /copy link/i }))
      // The whole point of the link: whoever opens it arrives at this table.
      expect(readRoomCodeFromUrl(new URL(clipboard[0] ?? '').search)).toBe('K7QM2X')
    })

    it('offers both to a guest too, so any player can pull in the fourth', async () => {
      setup(lobbyWith(['Ana', 'Ben']), 1)
      await userEvent.click(screen.getByRole('button', { name: /copy link/i }))
      expect(clipboard).toHaveLength(1)
    })
  })
})
