import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KONAMI, useKonami } from './useKonami.js'

const press = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

const type = (keys: readonly string[]): void => {
  for (const key of keys) press(key)
}

describe('useKonami', () => {
  it('fires on the sequence', () => {
    const onUnlock = vi.fn()
    renderHook(() => useKonami(onUnlock))
    type(KONAMI)
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('ignores the case of the two letters, since shift is easy to hold', () => {
    const onUnlock = vi.fn()
    renderHook(() => useKonami(onUnlock))
    type([...KONAMI.slice(0, -2), 'B', 'A'])
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('stays quiet on a partial sequence', () => {
    const onUnlock = vi.fn()
    renderHook(() => useKonami(onUnlock))
    type(KONAMI.slice(0, -1))
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('survives a wrong key by restarting rather than jamming', () => {
    const onUnlock = vi.fn()
    renderHook(() => useKonami(onUnlock))
    press('x')
    type(KONAMI)
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('restarts cleanly mid-sequence when the wrong key arrives', () => {
    const onUnlock = vi.fn()
    renderHook(() => useKonami(onUnlock))
    type(KONAMI.slice(0, 4))
    press('x')
    type(KONAMI)
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('fires again on a second run of the sequence', () => {
    const onUnlock = vi.fn()
    renderHook(() => useKonami(onUnlock))
    type(KONAMI)
    type(KONAMI)
    expect(onUnlock).toHaveBeenCalledTimes(2)
  })

  it('stops listening once unmounted', () => {
    const onUnlock = vi.fn()
    const { unmount } = renderHook(() => useKonami(onUnlock))
    unmount()
    type(KONAMI)
    expect(onUnlock).not.toHaveBeenCalled()
  })
})
