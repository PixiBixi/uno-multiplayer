import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/* App mounts a socket, so the client is stubbed. What this asserts is the shell:
   with nothing pushed from a server, the player lands on the home screen. */
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}))

const { App } = await import('./App.js')

describe('App', () => {
  it('starts on the home screen', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /uno/i })).toBeTruthy()
    expect(screen.getByLabelText(/your name/i)).toBeTruthy()
  })

  it('offers both creating and joining', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /create a game/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /join game/i })).toBeTruthy()
  })
})
