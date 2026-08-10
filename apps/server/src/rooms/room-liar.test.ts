import type { Move } from '@uno/engine'
import { UNO_PENALTY } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'
import { emptyStatsFor, tally } from './stats.js'

/*
 * The Liar call-out as the Room reports it. The engine owns whether the move is
 * legal; what is checked here is that the room turns it into the events the log,
 * the sounds and the statistics all read — and that every one of them goes through
 * the recording funnel.
 */

const liarRoom = (): Room => {
  const room = new Room('ABC234', 42, { kind: 'rounds', count: 3 }, null, {
    liar: true,
    sevenZero: false,
    jumpIn: false,
    playDrawnCard: false,
  })
  room.join('Ana', 'socket-0')
  room.join('Ben', 'socket-1')
  room.join('Cleo', 'socket-2')
  room.start(0)
  return room
}

/** A move for the seat on turn that deliberately never calls UNO. */
const forgetfulMove = (room: Room, seat: number): Move | undefined => {
  const moves = room.viewFor(seat)?.you.legalMoves ?? []
  return (
    moves.find((move) => move.type === 'play') ??
    moves.find((move) => move.type === 'acceptDraw') ??
    moves.find((move) => move.type === 'draw')
  )
}

/**
 * Plays until somebody is holding one card uncalled, and returns who may say so.
 * Nobody ever calls UNO, so this happens within a few turns.
 */
const playUntilVulnerable = (
  room: Room,
  seatCount: number,
): { caller: number; move: Extract<Move, { type: 'callOut' }>; events: GameEvent[] } => {
  const events: GameEvent[] = []
  for (let turn = 0; turn < 400; turn += 1) {
    for (let seat = 0; seat < seatCount; seat += 1) {
      const callOut = room
        .viewFor(seat)
        ?.you.legalMoves.find((move): move is Extract<Move, { type: 'callOut' }> => {
          return move.type === 'callOut'
        })
      if (callOut !== undefined) return { caller: seat, move: callOut, events }
    }

    const onTurn = room.currentSeat
    if (onTurn === null || room.viewFor(onTurn)?.phase !== 'playing') break
    const move = forgetfulMove(room, onTurn)
    if (move === undefined) break
    const result = room.move(onTurn, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    events.push(...result.value)
  }
  throw new Error('nobody ever went down to one card')
}

describe('a room playing with the Liar option', () => {
  it('offers the call-out to a seat whose turn it is not', () => {
    const room = liarRoom()
    const { caller, move } = playUntilVulnerable(room, 3)
    expect(move.target).not.toBe(caller)
    // The point of the rule: the accuser need not be on turn.
    expect(room.currentSeat === caller).toBe(false)
  })

  it('reports who called whom, and the two cards it cost', () => {
    const room = liarRoom()
    const { caller, move } = playUntilVulnerable(room, 3)
    const before = room.viewFor(move.target)?.you.hand.length ?? 0

    const result = room.move(caller, move)
    expect(result.okay).toBe(true)
    if (!result.okay) return

    expect(result.value).toEqual([
      { type: 'calledOut', by: caller, target: move.target },
      { type: 'unoPenalty', seat: move.target, count: UNO_PENALTY },
    ])
    expect(room.viewFor(move.target)?.you.hand).toHaveLength(before + UNO_PENALTY)
  })

  it('leaves the turn where it was', () => {
    const room = liarRoom()
    const { caller, move } = playUntilVulnerable(room, 3)
    const onTurn = room.currentSeat
    expect(room.move(caller, move).okay).toBe(true)
    expect(room.currentSeat).toBe(onTurn)
    expect(room.phase).toBe('playing')
  })

  it('refuses a second call-out against the same seat', () => {
    const room = liarRoom()
    const { caller, move } = playUntilVulnerable(room, 3)
    expect(room.move(caller, move).okay).toBe(true)

    const other = [0, 1, 2].find((seat) => seat !== caller && seat !== move.target) ?? 0
    expect(room.move(other, move)).toEqual({ okay: false, error: 'illegal_move' })
  })

  it('counts the penalty it charged, through the same funnel as everything else', () => {
    const room = liarRoom()
    const { caller, move, events } = playUntilVulnerable(room, 3)
    const result = room.move(caller, move)
    if (!result.okay) throw new Error(result.error)

    const seen = [...events, ...result.value]
    expect(room.viewFor(0)?.match.stats).toEqual(tally(emptyStatsFor(3), seen))
    expect(room.viewFor(0)?.match.stats[move.target]?.unoPenalties).toBe(1)
  })
})

describe('a room playing plain UNO', () => {
  it('never offers a call-out, and still charges a forgotten UNO on the spot', () => {
    const room = new Room('ABC234', 42, { kind: 'rounds', count: 3 })
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    room.start(0)

    const seen: GameEvent[] = []
    for (let turn = 0; turn < 400; turn += 1) {
      const seat = room.currentSeat
      if (seat === null || room.viewFor(seat)?.phase !== 'playing') break
      for (const watcher of [0, 1]) {
        const moves = room.viewFor(watcher)?.you.legalMoves ?? []
        expect(moves.some((move) => move.type === 'callOut')).toBe(false)
      }
      const move = forgetfulMove(room, seat)
      if (move === undefined) break
      const result = room.move(seat, move)
      if (!result.okay) throw new Error(result.error)
      seen.push(...result.value)
    }

    expect(seen.some((event) => event.type === 'unoPenalty')).toBe(true)
    expect(seen.some((event) => event.type === 'calledOut')).toBe(false)
  })
})
