import { describe, expect, it } from 'vitest'
import { readRoomCodeFromUrl, writeRoomCodeToUrl } from './room-url.js'

describe('readRoomCodeFromUrl', () => {
  it('reads a well-formed code', () => {
    expect(readRoomCodeFromUrl('?room=ABC234')).toBe('ABC234')
  })

  it('uppercases the code', () => {
    expect(readRoomCodeFromUrl('?room=abc234')).toBe('ABC234')
  })

  it('returns null when absent', () => {
    expect(readRoomCodeFromUrl('')).toBeNull()
  })

  it('rejects a code of the wrong length', () => {
    expect(readRoomCodeFromUrl('?room=ABC23')).toBeNull()
    expect(readRoomCodeFromUrl('?room=ABC2345')).toBeNull()
  })

  it('rejects characters outside the protocol alphabet', () => {
    expect(readRoomCodeFromUrl('?room=ABC01I')).toBeNull()
    expect(readRoomCodeFromUrl('?room=ABC-34')).toBeNull()
  })

  it('ignores other query parameters', () => {
    expect(readRoomCodeFromUrl('?utm=x&room=ABC234&y=2')).toBe('ABC234')
  })
})

describe('writeRoomCodeToUrl', () => {
  it('puts the code in the query without navigating away', () => {
    writeRoomCodeToUrl('K7QM2X')
    expect(new URLSearchParams(window.location.search).get('room')).toBe('K7QM2X')
  })

  it('replaces an existing code rather than appending a second one', () => {
    writeRoomCodeToUrl('K7QM2X')
    writeRoomCodeToUrl('ABC234')
    expect(window.location.search.match(/room=/g)).toHaveLength(1)
    expect(new URLSearchParams(window.location.search).get('room')).toBe('ABC234')
  })
})
