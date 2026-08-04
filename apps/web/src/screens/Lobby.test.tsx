import type { LobbyView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Lobby } from './Lobby.js'

const lobbyWith = (names: string[], canStart = names.length >= 2): LobbyView => ({
  roomCode: 'K7QM2X',
  hostSeat: 0,
  seats: names.map((name, seat) => ({ seat, name, status: 'active' as const })),
  canStart,
})

const setup = (lobby: LobbyView, mySeat: number) => {
  const props = { lobby, mySeat, onStart: vi.fn(), onLeave: vi.fn() }
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
})
