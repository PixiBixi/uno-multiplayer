import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from './CopyButton.js'

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.useRealTimers()
})

const setup = () => render(<CopyButton value="8A242X" label="Copy code" subject="Game code" />)

describe('CopyButton', () => {
  it('puts the value on the clipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    stubClipboard(writeText)
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(writeText).toHaveBeenCalledWith('8A242X')
  })

  it('confirms the copy to a screen reader', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(await screen.findByText('Game code copied')).toBeTruthy()
  })

  it('keeps its label through the confirmation', async () => {
    // A label that renames itself to "Copied" stops matching what a voice-control
    // user says to press it, so the icon carries the change instead.
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    await screen.findByText('Game code copied')
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy()
  })

  it('says so visibly when the copy fails', async () => {
    // Nothing stubbed: jsdom offers neither path, as an insecure context would.
    setup()

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(await screen.findByText(/select it by hand/i)).toBeTruthy()
  })

  it('returns to its resting state after a moment', async () => {
    vi.useFakeTimers()
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    setup()

    /* fireEvent rather than userEvent: userEvent awaits its own internal delays,
       which never elapse under fake timers, so the pair deadlocks. */
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    // Zero milliseconds, purely to let the clipboard promise settle.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Game code copied')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.queryByText('Game code copied')).toBeNull()
  })
})
