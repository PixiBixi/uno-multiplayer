import { DEFAULT_TABLE_RULES, initGame } from '@uno/engine'
import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { randomDealSeed } from './deal-seed.js'
import { RoomManager } from './room-manager.js'

const isWord = (word: number): boolean => Number.isInteger(word) && word >= 0 && word < 2 ** 32

describe('randomDealSeed', () => {
  it('draws four full 32-bit words', () => {
    const seed = randomDealSeed()
    expect(seed).toHaveLength(4)
    for (const word of seed) expect(isWord(word)).toBe(true)
  })

  it('never repeats across draws', () => {
    const seen = new Set(Array.from({ length: 100 }, () => randomDealSeed().join(':')))
    expect(seen.size).toBe(100)
  })
})

describe('deal seeds in a room', () => {
  const seatedRoom = () => {
    const manager = new RoomManager({ maxRooms: 10, gracePeriodMs: 60_000 })
    const created = manager.create(DEFAULT_MATCH_GOAL)
    if (!created.okay) throw new Error(created.error)
    const room = created.value
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    return { manager, room }
  }

  it('records a fresh 128-bit seed for every deal, replayable on its own', () => {
    const { manager, room } = seatedRoom()
    expect(room.start(0).okay).toBe(true)
    const first = room.dealSeed
    if (first === null || typeof first === 'number') throw new Error('expected a 128-bit seed')
    expect(first).toHaveLength(4)

    const replayed = initGame({ names: ['Ana', 'Ben'], seed: first, rules: DEFAULT_TABLE_RULES })
    if (!replayed.okay) throw new Error(replayed.error)
    expect(room.viewFor(0)?.you.hand).toEqual(replayed.value.seats[0]?.hand)

    // The next deal draws its own seed rather than continuing this one's stream.
    expect(manager.nextSeed()).not.toEqual(first)
  })
})
