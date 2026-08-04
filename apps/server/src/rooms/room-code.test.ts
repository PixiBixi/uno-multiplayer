import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomJoinSchema } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { generateRoomCode } from './room-code.js'

describe('generateRoomCode', () => {
  it('has the length the protocol declares', () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH)
  })

  it('only uses characters from the declared alphabet', () => {
    for (let i = 0; i < 500; i++) {
      for (const character of generateRoomCode()) {
        expect(ROOM_CODE_ALPHABET).toContain(character)
      }
    }
  })

  it('produces codes the join schema accepts', () => {
    for (let i = 0; i < 100; i++) {
      const parsed = roomJoinSchema.safeParse({ roomCode: generateRoomCode(), playerName: 'x' })
      expect(parsed.success).toBe(true)
    }
  })

  it('practically never repeats itself', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateRoomCode()))
    expect(codes.size).toBeGreaterThan(1990)
  })

  it('uses more than a handful of distinct first characters', () => {
    const firsts = new Set(Array.from({ length: 500 }, () => generateRoomCode()[0]))
    expect(firsts.size).toBeGreaterThan(10)
  })
})
