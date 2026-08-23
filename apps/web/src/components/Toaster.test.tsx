import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Toast } from '../hooks/game-reducer.js'
import { TOAST_MS, Toaster } from './Toaster.js'

const toast = (over: Partial<Toast> = {}): Toast => ({
  id: 1,
  tone: 'info',
  title: 'Round over',
  detail: 'The points go to whoever went out.',
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/* `fireEvent` rather than `userEvent` here: userEvent drives its own pointer timeline,
   which under fake timers has to be advanced by hand and hangs the test when it is not.
   The claim being made is only that the close button calls back, and a plain click is
   the honest way to make it. */

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

describe('Toaster', () => {
  it('dismisses a toast on its own once the timer runs out', () => {
    const onDismiss = vi.fn()
    render(<Toaster toasts={[toast()]} onDismiss={onDismiss} />)

    tick(TOAST_MS.info - 1)
    expect(onDismiss).not.toHaveBeenCalled()

    tick(1)
    expect(onDismiss).toHaveBeenCalledWith(1)
  })

  it('gives a warning longer than a note, because a warning is worth reading', () => {
    const onDismiss = vi.fn()
    render(<Toaster toasts={[toast({ tone: 'bad' })]} onDismiss={onDismiss} />)

    tick(TOAST_MS.info)
    expect(onDismiss).not.toHaveBeenCalled()

    tick(TOAST_MS.bad - TOAST_MS.info)
    expect(onDismiss).toHaveBeenCalledWith(1)
  })

  /*
   * The one that matters. The table re-renders on every view the server pushes - several
   * times a turn - and each render may hand this component a fresh `onDismiss`. If the
   * countdown lives in an effect that depends on that function, every re-render restarts
   * it and a toast on a busy table never disappears at all: exactly the complaint this
   * feature answers, reintroduced by a plausible-looking dependency array.
   */
  it('keeps counting across re-renders that hand it a new onDismiss', () => {
    const first = vi.fn()
    const { rerender } = render(<Toaster toasts={[toast()]} onDismiss={first} />)

    tick(TOAST_MS.info - 100)

    const second = vi.fn()
    rerender(<Toaster toasts={[toast()]} onDismiss={second} />)
    tick(100)

    // Whichever identity it fired, it fired on time rather than starting over.
    expect(first.mock.calls.length + second.mock.calls.length).toBe(1)
  })

  it('still closes on the button, without waiting', () => {
    const onDismiss = vi.fn()
    render(<Toaster toasts={[toast()]} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByRole('button', { name: /Round over/ }))
    expect(onDismiss).toHaveBeenCalledWith(1)
  })

  it('drops a pending timer when the toast goes away', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toaster toasts={[toast()]} onDismiss={onDismiss} />)

    rerender(<Toaster toasts={[]} onDismiss={onDismiss} />)
    tick(TOAST_MS.info * 2)

    // A timer surviving its toast would dismiss an id that no longer exists, and on a
    // recycled id it would close somebody else's message.
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('times each toast from its own arrival, not from the first', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toaster toasts={[toast()]} onDismiss={onDismiss} />)

    tick(TOAST_MS.info - 100)
    rerender(
      <Toaster toasts={[toast(), toast({ id: 2, title: 'Next round' })]} onDismiss={onDismiss} />,
    )

    tick(100)
    expect(onDismiss).toHaveBeenCalledWith(1)
    expect(onDismiss).not.toHaveBeenCalledWith(2)

    tick(TOAST_MS.info - 100)
    expect(onDismiss).toHaveBeenCalledWith(2)
  })
})
