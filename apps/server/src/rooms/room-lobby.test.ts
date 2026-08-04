import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const roomWith = (...names: string[]) => {
  const room = new Room('ABC234', 7)
  names.forEach((name, i) => {
    const result = room.join(name, `socket-${i}`)
    if (!result.okay) throw new Error(result.error)
  })
  return room
}

describe('Room.join', () => {
  it('starts in the lobby with nobody seated', () => {
    const room = new Room('ABC234', 7)
    expect(room.phase).toBe('lobby')
    expect(room.memberCount).toBe(0)
    expect(room.isEmpty()).toBe(true)
  })

  it('seats players in arrival order from index zero', () => {
    const room = roomWith('Ana', 'Ben')
    expect(room.memberAt(0)?.name).toBe('Ana')
    expect(room.memberAt(1)?.name).toBe('Ben')
  })

  it('returns a distinct session token per seat', () => {
    const room = new Room('ABC234', 7)
    const a = room.join('Ana', 'socket-a')
    const b = room.join('Ben', 'socket-b')
    if (!a.okay || !b.okay) throw new Error('expected both joins to succeed')
    expect(a.value.sessionToken).not.toBe(b.value.sessionToken)
    expect(a.value.seat).toBe(0)
    expect(b.value.seat).toBe(1)
  })

  it('makes the first player the host', () => {
    expect(roomWith('Ana', 'Ben').hostSeat).toBe(0)
  })

  it('refuses a fifth player', () => {
    const room = roomWith('Ana', 'Ben', 'Cleo', 'Dan')
    expect(room.join('Eve', 'socket-4')).toEqual({ okay: false, error: 'room_full' })
  })

  it('maps a socket id back to its seat', () => {
    const room = roomWith('Ana', 'Ben')
    expect(room.seatOfSocket('socket-1')).toBe(1)
    expect(room.seatOfSocket('unknown')).toBeNull()
  })

  it('refuses a join once the game has started', () => {
    const room = roomWith('Ana', 'Ben')
    const started = room.start(0)
    if (!started.okay) throw new Error(started.error)
    expect(room.join('Cleo', 'socket-2')).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })
})

describe('Room.lobbyView', () => {
  it('describes the table without exposing session tokens', () => {
    const view = roomWith('Ana', 'Ben').lobbyView()
    expect(view).toEqual({
      roomCode: 'ABC234',
      hostSeat: 0,
      seats: [
        { seat: 0, name: 'Ana', status: 'active' },
        { seat: 1, name: 'Ben', status: 'active' },
      ],
      canStart: true,
    })
    expect(JSON.stringify(view)).not.toContain('sessionToken')
  })

  it('cannot start with a single player', () => {
    expect(roomWith('Ana').lobbyView().canStart).toBe(false)
  })

  it('can start from two players onward', () => {
    expect(roomWith('Ana', 'Ben', 'Cleo').lobbyView().canStart).toBe(true)
  })
})
