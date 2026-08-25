import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ColourModeProvider, useColourMode, useSetColourMode } from './ColourModeProvider.js'
import { COLOUR_MODES, readColourMode } from '../lib/preferences.js'

function Harness() {
  const mode = useColourMode()
  const setMode = useSetColourMode()
  return (
    <>
      <span data-mode="">{mode}</span>
      {COLOUR_MODES.map((option) => (
        <button key={option} type="button" onClick={() => setMode(option)}>
          {option}
        </button>
      ))}
    </>
  )
}

const setup = () =>
  render(
    <ColourModeProvider>
      <Harness />
    </ColourModeProvider>,
  )

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  document.documentElement.style.removeProperty('color-scheme')
})

describe('ColourModeProvider', () => {
  /* The palettes are keyed on `data-theme` in `tokens.css`, so this attribute IS the
     feature: a provider that holds the mode in state and never writes it leaves the page
     painted by the media query while the chips claim otherwise. */
  it('marks the document with an explicit choice', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  /* Removed, not set to "system". The media query is the fallback, and an attribute that
     matches neither palette while still being present is a trap for the next selector
     written against it. */
  it('takes the mark off again for the system default', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    await userEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  /* Native controls and scrollbars follow `color-scheme`, not the custom properties: a
     page forced to ink still drew light scrollbars without this. */
  it('tells the browser which scheme its own chrome should use', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('')
  })

  it('remembers the choice across a remount', async () => {
    const first = setup()
    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(readColourMode()).toBe('dark')
    first.unmount()

    setup()
    expect(screen.getByText('dark', { selector: '[data-mode]' })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
