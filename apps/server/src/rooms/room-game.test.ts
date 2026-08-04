import type { GameEvent } from '@uno/protocol'
import type { Move } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const seated = (...names: string[]) => {
  const room = new Room('ABC234', 42)
  names.forEach((name, i) => {
    const result = room.join(name, `socket-${i}`)
    if (!result.okay) throw new Error(result.error)
  })
  return room
}

const started = (...names: string[]) => {
  const room = seated(...names)
  const result = room.start(0)
  if (!result.okay) throw new Error(result.error)
  return room
}

const firstLegalMove = (room: Room, seat: number): Move => {
  const move = room.viewFor(seat)?.you.legalMoves[0]
  if (move === undefined) throw new Error('expected a legal move')
  return move
}

describe('Room.start', () => {
  it('refuses a non-host', () => {
    expect(seated('Ana', 'Ben').start(1)).toEqual({ okay: false, error: 'not_host' })
  })

  it('refuses a single player', () => {
    expect(seated('Ana').start(0)).toEqual({ okay: false, error: 'too_few_players' })
  })

  it('moves the room into play and deals seven cards each', () => {
    const room = started('Ana', 'Ben', 'Cleo')
    expect(room.phase).toBe('playing')
    for (const seat of [0, 1, 2]) expect(room.viewFor(seat)?.you.hand).toHaveLength(7)
  })

  it('refuses to start twice', () => {
    expect(started('Ana', 'Ben').start(0)).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })

  it('is reproducible from the room seed', () => {
    expect(started('Ana', 'Ben').viewFor(0)?.you.hand).toEqual(
      started('Ana', 'Ben').viewFor(0)?.you.hand,
    )
  })
})

describe('Room.viewFor', () => {
  it('returns null before the game starts', () => {
    expect(seated('Ana', 'Ben').viewFor(0)).toBeNull()
  })

  it('gives each seat only its own hand', () => {
    const room = started('Ana', 'Ben')
    expect(room.viewFor(0)?.you.hand).not.toEqual(room.viewFor(1)?.you.hand)
    expect(room.viewFor(0)?.opponents[0]?.handCount).toBe(7)
  })

  it('returns null for an unknown seat', () => {
    expect(started('Ana', 'Ben').viewFor(9)).toBeNull()
  })
})

describe('Room.move', () => {
  it('refuses a seat whose turn it is not', () => {
    expect(started('Ana', 'Ben', 'Cleo').move(1, { type: 'draw' })).toEqual({
      okay: false,
      error: 'not_your_turn',
    })
  })

  it('refuses a move before the game starts', () => {
    expect(seated('Ana', 'Ben').move(0, { type: 'draw' })).toEqual({
      okay: false,
      error: 'game_not_started',
    })
  })

  it('applies a legal move and passes the turn', () => {
    const room = started('Ana', 'Ben', 'Cleo')
    expect(room.move(0, firstLegalMove(room, 0)).okay).toBe(true)
    expect(room.viewFor(0)?.currentSeat).not.toBe(0)
  })

  it('reports a draw as a cardsDrawn event', () => {
    const result = started('Ana', 'Ben', 'Cleo').move(0, { type: 'draw' })
    if (!result.okay) throw new Error(result.error)
    expect(result.value).toContainEqual({ type: 'cardsDrawn', seat: 0, count: 1 })
  })

  it('reports a played card as a cardPlayed event', () => {
    const room = started('Ana', 'Ben', 'Cleo')
    const move = room.viewFor(0)?.you.legalMoves.find((m) => m.type === 'play')
    if (move === undefined || move.type !== 'play') throw new Error('expected a play move')
    const result = room.move(0, move)
    if (!result.okay) throw new Error(result.error)
    expect(result.value.some((e) => e.type === 'cardPlayed' && e.seat === 0)).toBe(true)
  })

  it('rejects an illegal move without changing state', () => {
    const room = started('Ana', 'Ben', 'Cleo')
    const before = room.viewFor(0)
    expect(room.move(0, { type: 'acceptDraw' })).toEqual({
      okay: false,
      error: 'illegal_move',
    })
    expect(room.viewFor(0)).toEqual(before)
  })

  it('emits gameOver and flips the phase when someone wins', () => {
    const room = started('Ana', 'Ben')
    const events: GameEvent[] = []
    for (let turn = 0; turn < 600 && room.phase === 'playing'; turn++) {
      const seat = room.viewFor(0)?.currentSeat ?? 0
      const moves = room.viewFor(seat)?.you.legalMoves ?? []
      const move =
        moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
      if (move === undefined) break
      const result = room.move(seat, move)
      if (!result.okay) throw new Error(result.error)
      events.push(...result.value)
    }
    expect(room.phase).toBe('finished')
    expect(events.some((e) => e.type === 'gameOver')).toBe(true)
  })
})
