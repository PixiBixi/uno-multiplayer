import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CALL_UNO_KEY, useCallUnoKey } from './useCallUnoKey.js'

const press = (key: string, init: KeyboardEventInit = {}): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

/** Dispatched from the element rather than from window, so the event carries a real target. */
const pressInto = (element: Element, key: string): void => {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

const mounted = <T extends HTMLElement>(element: T): T => {
  document.body.append(element)
  return element
}

describe('useCallUnoKey', () => {
  it('calls on the key while the move is armed', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    press(CALL_UNO_KEY)
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('ignores the case, since shift is easy to hold', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    press(CALL_UNO_KEY.toUpperCase())
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('stays quiet while the move is not armed', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: false, onCall }))
    press(CALL_UNO_KEY)
    expect(onCall).not.toHaveBeenCalled()
  })

  /* The chat sits on the same screen as the table, so without this every message
     containing the letter calls UNO once per keystroke. */
  it('stays quiet while typing in a text field', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    pressInto(mounted(document.createElement('input')), CALL_UNO_KEY)
    expect(onCall).not.toHaveBeenCalled()
  })

  it('stays quiet while typing in a textarea', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    pressInto(mounted(document.createElement('textarea')), CALL_UNO_KEY)
    expect(onCall).not.toHaveBeenCalled()
  })

  it('stays quiet inside an editable element, which is a text field without being one', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    const editable = mounted(document.createElement('div'))
    editable.setAttribute('contenteditable', 'true')
    pressInto(editable, CALL_UNO_KEY)
    expect(onCall).not.toHaveBeenCalled()
  })

  /* An IME composes a word one keystroke at a time and commits it later. Those
     keystrokes are the composition, not a shortcut. */
  it('stays quiet mid-composition', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    press(CALL_UNO_KEY, { isComposing: true })
    expect(onCall).not.toHaveBeenCalled()
  })

  it.each([
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
    ['altKey', { altKey: true }],
  ])('leaves the combination with %s to the browser', (_label, modifier) => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    press(CALL_UNO_KEY, modifier)
    expect(onCall).not.toHaveBeenCalled()
  })

  it('ignores every other key', () => {
    const onCall = vi.fn()
    renderHook(() => useCallUnoKey({ armed: true, onCall }))
    press('k')
    expect(onCall).not.toHaveBeenCalled()
  })

  /* Held in a ref rather than in the dependency list: re-arming on every render of
     the table must not detach and reattach the listener. */
  it('calls the newest callback rather than the one it mounted with', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ onCall }) => useCallUnoKey({ armed: true, onCall }), {
      initialProps: { onCall: first },
    })
    rerender({ onCall: second })
    press(CALL_UNO_KEY)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('follows a seat that becomes armed between renders', () => {
    const onCall = vi.fn()
    const { rerender } = renderHook(({ armed }) => useCallUnoKey({ armed, onCall }), {
      initialProps: { armed: false },
    })
    press(CALL_UNO_KEY)
    rerender({ armed: true })
    press(CALL_UNO_KEY)
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('stops listening once unmounted', () => {
    const onCall = vi.fn()
    const { unmount } = renderHook(() => useCallUnoKey({ armed: true, onCall }))
    unmount()
    press(CALL_UNO_KEY)
    expect(onCall).not.toHaveBeenCalled()
  })
})
