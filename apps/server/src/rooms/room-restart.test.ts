import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const started = (...names: string[]) => {
  const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL)
  names.forEach((name, i) => {
    const joined = room.join(name, `socket-${i}`)
    if (!joined.okay) throw new Error(joined.error)
  })
  const begun = room.start(0)
  if (!begun.okay) throw new Error(begun.error)
  return room
}

/** Plays greedily until the game ends, so restart runs on a real finished game. */
const finish = (room: Room) => {
  for (let turn = 0; turn < 600 && room.phase === 'playing'; turn++) {
    const seat = room.viewFor(0)?.currentSeat ?? 0
    const moves = room.viewFor(seat)?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) break
    const applied = room.move(seat, move)
    if (!applied.okay) throw new Error(applied.error)
  }
  return room
}

describe('Room.restart', () => {
  it('refuses while a game is still running', () => {
    expect(started('Ana', 'Ben').restart(0, 7)).toEqual({
      okay: false,
      error: 'round_in_progress',
    })
  })

  it('refuses before any game has been played', () => {
    const room = new Room('ABC234', 42, DEFAULT_MATCH_GOAL)
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    expect(room.restart(0, 7)).toEqual({ okay: false, error: 'game_not_started' })
  })

  it('refuses a non-host', () => {
    const room = finish(started('Ana', 'Ben'))
    expect(room.restart(1, 7)).toEqual({ okay: false, error: 'not_host' })
  })

  it('deals a fresh game to the same seats', () => {
    const room = finish(started('Ana', 'Ben', 'Cleo'))
    expect(room.restart(0, 99).okay).toBe(true)
    expect(room.phase).toBe('playing')
    for (const seat of [0, 1, 2]) expect(room.viewFor(seat)?.you.hand).toHaveLength(7)
    expect(room.lobbyView().seats.map((s) => s.name)).toEqual(['Ana', 'Ben', 'Cleo'])
  })

  it('uses the seed it is given, so the deal is reproducible', () => {
    const a = finish(started('Ana', 'Ben'))
    const b = finish(started('Ana', 'Ben'))
    a.restart(0, 12345)
    b.restart(0, 12345)
    expect(a.viewFor(0)?.you.hand).toEqual(b.viewFor(0)?.you.hand)
  })

  it('emits a gameRestarted event', () => {
    const room = finish(started('Ana', 'Ben'))
    const restarted = room.restart(0, 7)
    if (!restarted.okay) throw new Error(restarted.error)
    expect(restarted.value).toContainEqual({ type: 'gameRestarted' })
  })

  /* A departed seat stays in the deal, holding nothing. That is what keeps an
     engine seat index and a member seat index the same number — dealing only to
     the seats still present used to renumber the engine and leave the
     highest-numbered player with no view at all. Nobody receives this view: their
     socket is gone and rejoin refuses a seat that left. */
  it('keeps a departed seat in the round, empty-handed', () => {
    const room = finish(started('Ana', 'Ben', 'Cleo'))
    room.disconnect('socket-2')
    room.expireGrace(2)
    expect(room.restart(0, 7).okay).toBe(true)

    const view = room.viewFor(2)
    expect(view?.you.hand).toEqual([])
    // And the seats still playing were dealt a full hand each.
    expect(room.viewFor(0)?.you.hand).toHaveLength(7)
    expect(room.viewFor(1)?.you.hand).toHaveLength(7)
  })

  it('gives every present player a view, even when a seat was lost first', () => {
    // The regression this replaces: Cleo held cards and saw nothing.
    const room = started('Ana', 'Ben', 'Cleo')
    expect(room.viewFor(2)?.you.seat).toBe(2)
  })

  it('refuses when fewer than two seats remain active', () => {
    const room = finish(started('Ana', 'Ben'))
    room.disconnect('socket-1')
    room.expireGrace(1)
    expect(room.restart(0, 7)).toEqual({ okay: false, error: 'too_few_players' })
  })
})
