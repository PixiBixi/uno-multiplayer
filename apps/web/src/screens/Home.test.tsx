import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Home } from './Home.js'

const setup = (overrides: Partial<Parameters<typeof Home>[0]> = {}) => {
  const props = {
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    error: null,
    prefilledCode: null,
    ...overrides,
  }
  render(<Home {...props} />)
  return props
}

describe('Home', () => {
  it('will not create a game without a name', async () => {
    const { onCreate } = setup()
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('creates a game with a trimmed name', async () => {
    const { onCreate } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), '  Ana  ')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Ana', { kind: 'points', target: 500 }, null, {
      liar: false,
      sevenZero: false,
      jumpIn: false,
    })
  })

  it('switches the Liar call-out on', async () => {
    const { onCreate } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ana')
    await userEvent.click(screen.getByLabelText(/call out/i))
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Ana', { kind: 'points', target: 500 }, null, {
      liar: true,
      sevenZero: false,
      jumpIn: false,
    })
  })

  it('switches Seven-Zero on independently of the Liar call-out', async () => {
    // Two separate house rules, not one switch with two effects: a group may want
    // either, both, or neither.
    const { onCreate } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ana')
    await userEvent.click(screen.getByLabelText(/seven-zero/i))
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Ana', { kind: 'points', target: 500 }, null, {
      liar: false,
      sevenZero: true,
      jumpIn: false,
    })
  })

  it('switches jump-in on independently of the other two', async () => {
    const { onCreate } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ana')
    await userEvent.click(screen.getByLabelText(/jump-in/i))
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Ana', { kind: 'points', target: 500 }, null, {
      liar: false,
      sevenZero: false,
      jumpIn: true,
    })
  })

  it('caps the name at the protocol limit', async () => {
    setup()
    const field = screen.getByLabelText<HTMLInputElement>(/your name/i)
    await userEvent.type(field, 'x'.repeat(40))
    expect(field.value).toHaveLength(20)
  })

  it('joins with an uppercased code', async () => {
    const { onJoin } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ben')
    await userEvent.type(screen.getByLabelText(/game code/i), 'abc234')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(onJoin).toHaveBeenCalledWith('ABC234', 'Ben')
  })

  it('will not join on a short code', async () => {
    const { onJoin } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ben')
    await userEvent.type(screen.getByLabelText(/game code/i), 'ABC')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('will not join without a name, even with a valid code', async () => {
    const { onJoin } = setup()
    await userEvent.type(screen.getByLabelText(/game code/i), 'ABC234')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('prefills a code taken from the URL', () => {
    setup({ prefilledCode: 'K7QM2X' })
    expect(screen.getByLabelText<HTMLInputElement>(/game code/i).value).toBe('K7QM2X')
  })

  it('shows a server error as a live region', () => {
    setup({ error: 'That game already has four players.' })
    expect(screen.getByRole('alert').textContent).toContain('four players')
  })

  it('shows no alert when there is no error', () => {
    setup()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
