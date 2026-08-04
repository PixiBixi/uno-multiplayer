import { beforeEach, describe, expect, it } from 'vitest'
import { readHandSort, writeHandSort } from './preferences.js'

beforeEach(() => {
  window.localStorage.clear()
})

describe('hand sort preference', () => {
  it('defaults to the order the server dealt', () => {
    expect(readHandSort()).toBe('dealt')
  })

  it('round-trips a choice', () => {
    writeHandSort('colour')
    expect(readHandSort()).toBe('colour')
  })

  it('ignores a stored value that is not a known mode', () => {
    window.localStorage.setItem('uno.pref.handSort', 'sideways')
    expect(readHandSort()).toBe('dealt')
  })

  it('keeps its key out of the session namespace', () => {
    writeHandSort('value')
    expect(window.localStorage.getItem('uno.pref.handSort')).toBe('value')
    expect(window.localStorage.getItem('uno.session.value')).toBeNull()
  })

  it('degrades instead of throwing when storage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked')
      },
    })

    expect(() => writeHandSort('colour')).not.toThrow()
    expect(readHandSort()).toBe('dealt')

    if (original !== undefined) Object.defineProperty(window, 'localStorage', original)
  })
})
