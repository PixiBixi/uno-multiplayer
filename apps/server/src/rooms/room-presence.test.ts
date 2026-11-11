import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const seated = (...names: string[]) => {
  const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL)
  const tokens = names.map((name, i) => {
    const result = room.join(name, `socket-${i}`)
    if (!result.okay) throw new Error(result.error)
    return result.value.sessionToken
  })
  return { room, tokens }
}

const started = (...names: string[]) => {
  const table = seated(...names)
  const result = table.room.start(0)
  if (!result.okay) throw new Error(result.error)
  return table
}

describe('Room.disconnect', () => {
  it('returns null for an unknown socket', () => {
    expect(seated('Ana', 'Ben').room.disconnect('nope')).toBeNull()
  })

  it('marks the seat disconnected and reports it', () => {
    const { room } = started('Ana', 'Ben', 'Cleo')
    const result = room.disconnect('socket-1')
    expect(result?.seat).toBe(1)
    expect(room.memberAt(1)?.status).toBe('disconnected')
    expect(result?.events).toContainEqual({ type: 'seatDisconnected', seat: 1 })
  })

  it('clears the socket id so the seat can be reclaimed', () => {
    const { room } = started('Ana', 'Ben')
    room.disconnect('socket-0')
    expect(room.memberAt(0)?.socketId).toBeNull()
  })

  it('keeps the turn on the absent player, for a bot to stand in', () => {
    // No longer skipped (docs/superpowers/specs/2026-11-01-bots-design.md).
    const { room } = started('Ana', 'Ben', 'Cleo')
    expect(room.viewFor(1)?.currentSeat).toBe(0)
    room.disconnect('socket-0')
    expect(room.viewFor(1)?.currentSeat).toBe(0)
    expect(room.turnController()).toBe('absent')
  })

  it('transfers the host in the lobby', () => {
    const { room } = seated('Ana', 'Ben', 'Cleo')
    expect(room.hostSeat).toBe(0)
    room.disconnect('socket-0')
    expect(room.hostSeat).toBe(1)
  })

  it('reports the room empty once everyone has gone', () => {
    const { room } = seated('Ana', 'Ben')
    room.disconnect('socket-0')
    expect(room.isEmpty()).toBe(false)
    room.disconnect('socket-1')
    expect(room.isEmpty()).toBe(true)
  })
})

describe('Room.rejoin', () => {
  it('restores the seat and its exact hand', () => {
    const { room, tokens } = started('Ana', 'Ben', 'Cleo')
    const handBefore = room.viewFor(1)?.you.hand
    room.disconnect('socket-1')
    expect(room.rejoin(tokens[1] ?? '', 'socket-1-new')).toEqual({
      okay: true,
      value: { seat: 1, supersededSocketId: null },
    })
    expect(room.memberAt(1)?.status).toBe('active')
    expect(room.viewFor(1)?.you.hand).toEqual(handBefore)
  })

  it('refuses an unknown token', () => {
    expect(
      started('Ana', 'Ben').room.rejoin('11111111-2222-4333-8444-555555555555', 'sock'),
    ).toEqual({ okay: false, error: 'invalid_session' })
  })

  it('refuses a token whose seat already left for good', () => {
    const { room, tokens } = started('Ana', 'Ben', 'Cleo')
    // Only Leave gives a seat up mid-match now (docs/superpowers/specs/2026-11-01-bots-design.md).
    room.leave('socket-2')
    expect(room.rejoin(tokens[2] ?? '', 'sock')).toEqual({
      okay: false,
      error: 'invalid_session',
    })
  })

  it('accepts a rejoin while the seat is still connected, replacing the socket', () => {
    const { room, tokens } = started('Ana', 'Ben')
    expect(room.rejoin(tokens[0] ?? '', 'socket-0-second-tab')).toEqual({
      okay: true,
      value: { seat: 0, supersededSocketId: 'socket-0' },
    })
    expect(room.memberAt(0)?.socketId).toBe('socket-0-second-tab')
  })
})

describe('Room.expireGrace', () => {
  it('marks a lobby seat left, freeing it for the next joiner', () => {
    const { room } = seated('Ana', 'Ben', 'Cleo')
    room.disconnect('socket-2')
    const events = room.expireGrace(2)
    expect(room.memberAt(2)?.status).toBe('left')
    expect(events).toContainEqual({ type: 'seatLeft', seat: 2 })
  })

  it('leaves a match running and the seat reclaimable', () => {
    // Mid-match the hand stays and a bot plays it (docs/superpowers/specs/2026-11-01-bots-design.md).
    const { room, tokens } = started('Ana', 'Ben')
    room.disconnect('socket-1')
    expect(room.expireGrace(1)).toEqual([])
    expect(room.phase).toBe('playing')
    expect(room.memberAt(1)?.status).toBe('disconnected')
    expect(room.rejoin(tokens[1] ?? '', 'socket-1b').okay).toBe(true)
  })

  it('does nothing for a seat that came back in time', () => {
    const { room, tokens } = started('Ana', 'Ben', 'Cleo')
    room.disconnect('socket-1')
    room.rejoin(tokens[1] ?? '', 'socket-1-new')
    expect(room.expireGrace(1)).toEqual([])
    expect(room.memberAt(1)?.status).toBe('active')
  })

  it('is idempotent', () => {
    const { room } = seated('Ana', 'Ben', 'Cleo')
    room.disconnect('socket-2')
    room.expireGrace(2)
    expect(room.expireGrace(2)).toEqual([])
  })
})

describe('one socket, one seat', () => {
  it('refuses a rejoin that would put a seated socket in a second seat', () => {
    const { room, tokens } = started('Ana', 'Ben', 'Cleo')
    room.disconnect('socket-0')
    // socket-1 holds seat 1 and presents seat 0's token.
    expect(room.rejoin(tokens[0] ?? '', 'socket-1')).toEqual({
      okay: false,
      error: 'invalid_session',
    })
    expect(room.memberAt(0)?.socketId).toBeNull()
    expect(room.memberAt(1)?.socketId).toBe('socket-1')
  })

  it('still lets a socket rejoin the seat it already holds', () => {
    const { room, tokens } = started('Ana', 'Ben')
    expect(room.rejoin(tokens[1] ?? '', 'socket-1').okay).toBe(true)
  })
})

describe('host after a rejoin', () => {
  it('moves the host to the first human back when the host seat is still away', () => {
    const { room, tokens } = started('Ana', 'Ben')
    room.disconnect('socket-0') // host moves to Ben
    room.disconnect('socket-1') // nobody left to take it: stays on Ben
    expect(room.hostSeat).toBe(1)

    expect(room.rejoin(tokens[0] ?? '', 'socket-0b').okay).toBe(true)
    expect(room.hostSeat).toBe(0)
  })

  it('leaves a present host alone when someone else comes back', () => {
    const { room, tokens } = started('Ana', 'Ben')
    room.disconnect('socket-1')
    room.rejoin(tokens[1] ?? '', 'socket-1b')
    expect(room.hostSeat).toBe(0)
  })
})
