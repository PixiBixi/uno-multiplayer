import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const humans = (...names: string[]) => {
  const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL)
  for (const [i, name] of names.entries()) {
    const joined = room.join(name, `socket-${i}`)
    if (!joined.okay) throw new Error(joined.error)
  }
  return room
}

describe('bots in the lobby', () => {
  it('host adds a bot and a solo table can start', () => {
    const room = humans('Ana')
    expect(room.lobbyView().canStart).toBe(false)
    expect(room.addBot(0, 'normal').okay).toBe(true)
    expect(room.lobbyView().canStart).toBe(true)
    expect(room.lobbyView().seats[1]).toEqual({
      seat: 1,
      name: 'Ada',
      status: 'active',
      bot: 'normal',
    })
    expect(room.start(0).okay).toBe(true)
  })

  it('names bots from the fixed list, first unused', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'hard')
    expect(room.lobbyView().seats.map((s) => s.name)).toEqual(['Ana', 'Ada', 'Bip'])
  })

  it('only the host manages bots', () => {
    const room = humans('Ana', 'Ben')
    room.addBot(0, 'easy')
    expect(room.addBot(1, 'easy')).toEqual({ okay: false, error: 'not_host' })
    expect(room.setBotLevel(1, 2, 'hard')).toEqual({ okay: false, error: 'not_host' })
    expect(room.removeBot(1, 2)).toEqual({ okay: false, error: 'not_host' })
  })

  it('refuses a level change or removal aimed at a human', () => {
    const room = humans('Ana', 'Ben')
    expect(room.setBotLevel(0, 1, 'hard')).toEqual({ okay: false, error: 'invalid_payload' })
    expect(room.removeBot(0, 1)).toEqual({ okay: false, error: 'invalid_payload' })
  })

  it('changes a bot level and reports a full table', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    expect(room.setBotLevel(0, 1, 'hard').okay).toBe(true)
    expect(room.levelFor(1)).toBe('hard')
    room.addBot(0, 'easy')
    room.addBot(0, 'easy')
    expect(room.addBot(0, 'easy')).toEqual({ okay: false, error: 'room_full' })
  })

  it('bots are frozen once the match is dealt', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.start(0)
    expect(room.addBot(0, 'easy')).toEqual({ okay: false, error: 'game_already_started' })
    expect(room.setBotLevel(0, 1, 'hard')).toEqual({ okay: false, error: 'game_already_started' })
    expect(room.removeBot(0, 1)).toEqual({ okay: false, error: 'game_already_started' })
  })

  it('a joiner replaces the last-added bot on a full table', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'normal')
    room.addBot(0, 'hard')
    const joined = room.join('Ben', 'socket-9')
    expect(joined.okay && joined.value.seat).toBe(3)
    expect(room.lobbyView().seats.map((s) => s.bot)).toEqual([null, 'easy', 'normal', null])
  })

  it('a full table of humans stays full', () => {
    const room = humans('A', 'B', 'C', 'D')
    expect(room.join('E', 'socket-9')).toEqual({ okay: false, error: 'room_full' })
  })

  it('remove, join, start keeps seat == engine index', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'easy')
    expect(room.removeBot(0, 1).okay).toBe(true)
    const joined = room.join('Ben', 'socket-1')
    expect(joined.okay && joined.value.seat).toBe(1)
    expect(room.start(0).okay).toBe(true)
    expect(room.viewFor(0)?.you.seat).toBe(0)
    expect(room.viewFor(1)?.you.seat).toBe(1)
    expect(room.lobbyView().seats.some((s) => s.status === 'left')).toBe(false)
  })

  it('a removed bot is omitted from the lobby view', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.addBot(0, 'easy')
    room.removeBot(0, 1)
    expect(room.lobbyView().seats.map((s) => s.seat)).toEqual([0, 2])
  })

  it('a table of bots alone is abandoned', () => {
    const room = humans('Ana')
    room.addBot(0, 'easy')
    room.disconnect('socket-0')
    room.expireGrace(0)
    expect(room.abandoned).toBe(true)
  })

  it('host transfer skips bots', () => {
    const room = humans('Ana', 'Ben')
    room.addBot(0, 'easy')
    room.disconnect('socket-0')
    expect(room.hostSeat).toBe(1)
  })

  it('exposes bot control and levels, with presence from the member in views', () => {
    const room = humans('Ana')
    room.addBot(0, 'hard')
    room.start(0)
    expect(room.connectedHumanCount()).toBe(1)
    expect(room.isBotControlled(0)).toBe(false)
    expect(room.isBotControlled(1)).toBe(true)
    expect(room.levelFor(0)).toBeNull()
    expect(room.levelFor(1)).toBe('hard')
    expect(room.viewFor(0)?.opponents).toEqual([
      expect.objectContaining({
        seat: 1,
        name: 'Ada',
        status: 'active',
        bot: 'hard',
        standIn: false,
      }),
    ])
  })
})
