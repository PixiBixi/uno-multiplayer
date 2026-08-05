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

  it('hands the turn on when the absent player held it', () => {
    const { room } = started('Ana', 'Ben', 'Cleo')
    expect(room.viewFor(1)?.currentSeat).toBe(0)
    room.disconnect('socket-0')
    expect(room.viewFor(1)?.currentSeat).not.toBe(0)
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
      value: { seat: 1 },
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
    room.disconnect('socket-2')
    room.expireGrace(2)
    expect(room.rejoin(tokens[2] ?? '', 'sock')).toEqual({
      okay: false,
      error: 'invalid_session',
    })
  })

  it('accepts a rejoin while the seat is still connected, replacing the socket', () => {
    const { room, tokens } = started('Ana', 'Ben')
    expect(room.rejoin(tokens[0] ?? '', 'socket-0-second-tab').okay).toBe(true)
    expect(room.memberAt(0)?.socketId).toBe('socket-0-second-tab')
  })
})

describe('Room.expireGrace', () => {
  it('returns the hand to the pile and marks the seat left', () => {
    const { room } = started('Ana', 'Ben', 'Cleo')
    const pileBefore = room.viewFor(0)?.drawPileCount ?? 0
    room.disconnect('socket-2')
    const events = room.expireGrace(2)
    expect(room.memberAt(2)?.status).toBe('left')
    expect(room.viewFor(0)?.drawPileCount).toBeGreaterThan(pileBefore)
    expect(events).toContainEqual({ type: 'seatLeft', seat: 2 })
  })

  it('aborts the game below two active players', () => {
    const { room } = started('Ana', 'Ben')
    room.disconnect('socket-1')
    const events = room.expireGrace(1)
    expect(room.phase).toBe('finished')
    expect(events).toContainEqual({
      type: 'roundEnded',
      winner: null,
      awarded: [0, 0],
      scores: [0, 0],
    })
  })

  it('does nothing for a seat that came back in time', () => {
    const { room, tokens } = started('Ana', 'Ben', 'Cleo')
    room.disconnect('socket-1')
    room.rejoin(tokens[1] ?? '', 'socket-1-new')
    expect(room.expireGrace(1)).toEqual([])
    expect(room.memberAt(1)?.status).toBe('active')
  })

  it('is idempotent', () => {
    const { room } = started('Ana', 'Ben', 'Cleo')
    room.disconnect('socket-2')
    room.expireGrace(2)
    expect(room.expireGrace(2)).toEqual([])
  })
})
