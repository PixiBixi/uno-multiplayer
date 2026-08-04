import { describe, expect, it } from 'vitest'
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, MAX_SEATS, MIN_SEATS } from './views.js'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './views.js'

describe('protocol limits', () => {
  it('publishes the bounds the server enforces', () => {
    expect(ROOM_CODE_LENGTH).toBe(6)
    expect(MIN_SEATS).toBe(2)
    expect(MAX_SEATS).toBe(4)
    expect(MAX_NAME_LENGTH).toBe(20)
    expect(MAX_CHAT_LENGTH).toBe(200)
  })
})

describe('room code alphabet', () => {
  it('excludes every visually ambiguous character', () => {
    for (const ambiguous of ['O', '0', 'I', '1']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ambiguous)
    }
  })

  it('is large enough to make guessing a live room impractical', () => {
    expect(ROOM_CODE_ALPHABET.length ** ROOM_CODE_LENGTH).toBeGreaterThan(1e9)
  })

  it('has no duplicate characters', () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length)
  })
})
