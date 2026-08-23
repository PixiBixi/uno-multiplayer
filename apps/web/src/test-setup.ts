import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Testing Library's automatic cleanup only registers itself when Vitest globals
 * are enabled. They are not - tests import describe/it/expect explicitly - so
 * unmounting is wired here. Without it, renders pile up in the same document and
 * queries start finding several matches.
 */
afterEach(() => {
  cleanup()
})

/**
 * This jsdom environment ships no Storage at all: `window.localStorage` is
 * undefined even though the document has a real origin. The app already degrades
 * gracefully when storage throws, but the happy path still needs testing, so a
 * minimal in-memory Storage stands in.
 */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, String(value))
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
    clear: () => {
      entries.clear()
    },
  }
}

if (typeof window !== 'undefined' && window.localStorage === undefined) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: createMemoryStorage(),
  })
}
