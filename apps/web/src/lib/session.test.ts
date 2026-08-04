import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, readSession, writeSession } from './session.js'

beforeEach(() => {
  window.localStorage.clear()
})

describe('session store', () => {
  it('returns null for a room it has never seen', () => {
    expect(readSession('ABC234')).toBeNull()
  })

  it('round-trips a token', () => {
    writeSession('ABC234', 'token-1')
    expect(readSession('ABC234')).toBe('token-1')
  })

  it('keeps rooms independent', () => {
    writeSession('ABC234', 'token-1')
    writeSession('XYZ789', 'token-2')
    expect(readSession('ABC234')).toBe('token-1')
    expect(readSession('XYZ789')).toBe('token-2')
  })

  it('is case-insensitive on the room code', () => {
    writeSession('ABC234', 'token-1')
    expect(readSession('abc234')).toBe('token-1')
  })

  it('clears one room without touching the others', () => {
    writeSession('ABC234', 'token-1')
    writeSession('XYZ789', 'token-2')
    clearSession('ABC234')
    expect(readSession('ABC234')).toBeNull()
    expect(readSession('XYZ789')).toBe('token-2')
  })

  it('namespaces and normalises the key it writes', () => {
    writeSession('abc234', 'token-1')
    expect(window.localStorage.getItem('uno.session.ABC234')).toBe('token-1')
  })

  it('degrades instead of throwing when storage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked')
      },
    })

    expect(() => writeSession('ABC234', 'token')).not.toThrow()
    expect(readSession('ABC234')).toBeNull()
    expect(() => clearSession('ABC234')).not.toThrow()

    if (original !== undefined) Object.defineProperty(window, 'localStorage', original)
  })
})
