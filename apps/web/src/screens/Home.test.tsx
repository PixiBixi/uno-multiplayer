import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CardThemeProvider } from '../components/CardThemeProvider.js'
import { CARD_THEMES } from '../lib/card-themes.js'
import { readCardTheme, writeCardTheme } from '../lib/preferences.js'
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

describe('the card theme previews', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  const setupThemes = () =>
    render(
      <CardThemeProvider>
        <Home onCreate={vi.fn()} onJoin={vi.fn()} error={null} prefilledCode={null} />
      </CardThemeProvider>,
    )

  it('offers one preview per theme, named for anyone who cannot see them', () => {
    setupThemes()
    for (const theme of CARD_THEMES) {
      expect(screen.getByRole('button', { name: new RegExp(theme, 'i') })).toBeTruthy()
    }
  })

  it('renders each preview with the real Card component, so it cannot drift', () => {
    /* A preview drawn any other way is a second implementation of the card, and the
       two would part company the first time either changed. Classic is the only
       theme with the rotated oval, and exactly one preview has one. */
    const { container } = setupThemes()
    const previews = container.querySelectorAll('.theme-swatch svg[role="img"]')
    expect(previews).toHaveLength(CARD_THEMES.length)
    expect(container.querySelectorAll('.theme-swatch ellipse')).toHaveLength(1)
  })

  it('keeps the previews out of the way of a screen reader', () => {
    // The button says which theme it is. The card inside would otherwise announce
    // itself as a Red 7, which is not what pressing it does.
    const { container } = setupThemes()
    for (const preview of container.querySelectorAll('.theme-swatch-card')) {
      expect(preview.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('writes the preference when a preview is picked', async () => {
    setupThemes()
    await userEvent.click(screen.getByRole('button', { name: /letterpress/i }))
    expect(readCardTheme()).toBe('letterpress')
    expect(screen.getByRole('button', { name: /letterpress/i }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('starts on whatever the player last chose', () => {
    writeCardTheme('neon')
    setupThemes()
    expect(screen.getByRole('button', { name: /neon/i }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /classic/i }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })
})
