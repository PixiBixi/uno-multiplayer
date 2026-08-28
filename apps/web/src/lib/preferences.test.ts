import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CARD_THEME } from './card-themes.js'
import {
  COLOUR_MODES,
  readColourMode,
  readKonamiUnlocked,
  readShoutCloudAllowed,
  writeColourMode,
  writeKonamiUnlocked,
  writeShoutCloudAllowed,
} from './preferences.js'
import { readCardTheme, readHandSort, writeCardTheme, writeHandSort } from './preferences.js'

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

describe('card theme preference', () => {
  it('defaults to the card everybody already has', () => {
    expect(readCardTheme()).toBe(DEFAULT_CARD_THEME)
  })

  it('round-trips a choice', () => {
    writeCardTheme('letterpress')
    expect(readCardTheme()).toBe('letterpress')
  })

  it('falls back to the default on a stored value that is not a theme', () => {
    /* Not a blank card: an unknown theme has no spec, and a face built from
       `undefined` renders nothing at all. The mute flag guards the same way for the
       same reason. */
    window.localStorage.setItem('uno.pref.cardTheme', 'holographic')
    expect(readCardTheme()).toBe(DEFAULT_CARD_THEME)
  })

  it('keeps its key out of the session namespace', () => {
    writeCardTheme('neon')
    expect(window.localStorage.getItem('uno.pref.cardTheme')).toBe('neon')
    expect(window.localStorage.getItem('uno.session.cardTheme')).toBeNull()
  })

  it('degrades instead of throwing when storage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked')
      },
    })

    expect(() => writeCardTheme('neon')).not.toThrow()
    expect(readCardTheme()).toBe(DEFAULT_CARD_THEME)

    if (original !== undefined) Object.defineProperty(window, 'localStorage', original)
  })
})

describe('colour mode preference', () => {
  it('follows the system until somebody says otherwise', () => {
    expect(readColourMode()).toBe('system')
  })

  it('remembers an explicit choice', () => {
    writeColourMode('dark')
    expect(readColourMode()).toBe('dark')
    writeColourMode('light')
    expect(readColourMode()).toBe('light')
  })

  /* Same reasoning as the card face: a value with no palette behind it would paint the
     page from `undefined`, and here that is the whole page rather than one card. */
  it('falls back to the system on a stored value that is not a mode', () => {
    window.localStorage.setItem('uno.pref.colourMode', 'sepia')
    expect(readColourMode()).toBe('system')
  })

  it('offers exactly the three modes, system included', () => {
    expect([...COLOUR_MODES]).toEqual(['system', 'light', 'dark'])
  })

  /* Blocked at the property, the way the two tests above do it: a browser set to refuse
     storage throws on ACCESS to `localStorage`, not on the call, so stubbing the method
     tests a failure mode that does not exist. */
  it('degrades instead of throwing when storage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked')
      },
    })

    expect(() => writeColourMode('dark')).not.toThrow()
    expect(readColourMode()).toBe('system')

    if (original !== undefined) Object.defineProperty(window, 'localStorage', original)
  })
})

describe('the hidden face unlock', () => {
  it('starts locked', () => {
    expect(readKonamiUnlocked()).toBe(false)
  })

  it('remembers being found', () => {
    writeKonamiUnlocked(true)
    expect(readKonamiUnlocked()).toBe(true)
  })

  it('treats anything but the exact string as locked', () => {
    window.localStorage.setItem('uno.pref.konami', 'yes')
    expect(readKonamiUnlocked()).toBe(false)
  })
})

describe('shout cloud consent', () => {
  it('is off until it is turned on', () => {
    window.localStorage.clear()
    expect(readShoutCloudAllowed()).toBe(false)
  })

  it('round-trips a yes', () => {
    writeShoutCloudAllowed(true)
    expect(readShoutCloudAllowed()).toBe(true)
  })

  it('round-trips a no', () => {
    writeShoutCloudAllowed(true)
    writeShoutCloudAllowed(false)
    expect(readShoutCloudAllowed()).toBe(false)
  })

  it('treats a corrupted value as no rather than as consent', () => {
    window.localStorage.setItem('uno.pref.shoutCloud', 'yes')
    expect(readShoutCloudAllowed()).toBe(false)
  })
})
