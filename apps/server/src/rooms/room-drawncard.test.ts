import { DEFAULT_TABLE_RULES, type Move, type TableRules } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'
import { emptyStatsFor, tally } from './stats.js'

/*
 * The drawn-card decision as the Room reports it.
 *
 * The engine owns whether the card may be played; what is checked here is that the view
 * every player receives carries the decision, that ending a turn produces an event the
 * log can read, and that the event goes through the recording funnel — a room method
 * that reports outside `record` under-counts the match statistics silently.
 */

type PlayMove = Extract<Move, { type: 'play' }>

const OFF: TableRules = {
  liar: false,
  sevenZero: false,
  jumpIn: false,
  playDrawnCard: false,
}

const roomWith = (rules: TableRules): Room => {
  const room = new Room('ABC234', 42, { kind: 'rounds', count: 3 }, null, rules)
  room.join('Ana', 'socket-0')
  room.join('Ben', 'socket-1')
  room.join('Cleo', 'socket-2')
  room.start(0)
  return room
}

const SEATS = [0, 1, 2]

/**
 * Draws on every turn until one of the cards drawn turns out playable.
 *
 * Deterministic — the room is seeded — but which turn it lands on is a property of that
 * seed rather than something to assert, so the caller checks it was reached at all.
 */
const drawUntilDeciding = (
  room: Room,
): { seat: number; events: GameEvent[]; heldBefore: number } => {
  const events: GameEvent[] = []
  for (let turn = 0; turn < 400; turn += 1) {
    const seat = room.currentSeat
    if (seat === null || room.viewFor(seat)?.phase !== 'playing') break
    const moves = room.viewFor(seat)?.you.legalMoves ?? []
    const move =
      moves.find((candidate) => candidate.type === 'draw') ??
      moves.find((candidate) => candidate.type === 'acceptDraw')
    if (move === undefined) break

    const heldBefore = room.viewFor(seat)?.you.hand.length ?? 0
    const result = room.move(seat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    events.push(...result.value)
    if (room.decidingOnDrawnCard) return { seat, events, heldBefore }
  }
  throw new Error('the round ended before a drawn card was ever playable')
}

const heldBy = (room: Room, seat: number): string[] =>
  (room.viewFor(seat)?.you.hand ?? []).map((card) => card.id)

describe('a room playing the drawn-card rule', () => {
  it('keeps the turn with the seat that drew, and offers it the card and a way out', () => {
    const room = roomWith(DEFAULT_TABLE_RULES)
    const { seat, heldBefore } = drawUntilDeciding(room)
    const view = room.viewFor(seat)

    expect(room.currentSeat).toBe(seat)
    expect(view?.you.hand).toHaveLength(heldBefore + 1)
    // Exactly the card just drawn, which is the last one in the hand.
    const drawn = view?.you.hand[view.you.hand.length - 1]
    const plays = (view?.you.legalMoves ?? []).filter((m): m is PlayMove => m.type === 'play')
    expect(plays.map((move) => move.cardId)).toEqual([drawn?.id])
    expect(view?.you.legalMoves.some((move) => move.type === 'pass')).toBe(true)
    expect(view?.you.legalMoves.some((move) => move.type === 'draw')).toBe(false)

    // And every seat agrees the turn has not moved, which is what a client renders from.
    for (const watcher of SEATS) expect(room.viewFor(watcher)?.currentSeat).toBe(seat)
  })

  it('lays the drawn card down over the room API, and moves the turn on', () => {
    const room = roomWith(DEFAULT_TABLE_RULES)
    const { seat } = drawUntilDeciding(room)
    const move = (room.viewFor(seat)?.you.legalMoves ?? []).find(
      (candidate): candidate is PlayMove => candidate.type === 'play',
    )
    if (move === undefined) throw new Error('no play offered in the sub-state')
    const held = heldBy(room, seat)

    const result = room.move(seat, move)
    if (!result.okay) throw new Error(result.error)

    expect(result.value[0]).toMatchObject({ type: 'cardPlayed', seat })
    expect(room.viewFor(seat)?.discardTop.id).toBe(move.cardId)
    expect(heldBy(room, seat)).toEqual(held.filter((id) => id !== move.cardId))
    expect(room.decidingOnDrawnCard).toBe(false)
  })

  it('reports a kept card as a turn ending, and only that', () => {
    const room = roomWith(DEFAULT_TABLE_RULES)
    const { seat } = drawUntilDeciding(room)
    const held = heldBy(room, seat)

    const result = room.move(seat, { type: 'pass' })
    if (!result.okay) throw new Error(result.error)

    /* One event and no more: passing moves no card and draws none, so anything else
       here would be the hand-size diff reporting something that did not happen. */
    expect(result.value).toEqual([{ type: 'turnPassed', seat }])
    expect(heldBy(room, seat)).toEqual(held)
    expect(room.currentSeat).not.toBe(seat)
    expect(room.decidingOnDrawnCard).toBe(false)
  })

  it('counts a kept card as nothing at all, through the one funnel', () => {
    const room = roomWith(DEFAULT_TABLE_RULES)
    const { seat, events } = drawUntilDeciding(room)
    const result = room.move(seat, { type: 'pass' })
    if (!result.okay) throw new Error(result.error)

    // A room method reporting outside `record` would show up as a gap here.
    const seen = [...events, ...result.value]
    expect(room.viewFor(0)?.match.stats).toEqual(tally(emptyStatsFor(3), seen))
    // And the tally is unchanged by the pass itself: declining to play is not a statistic.
    expect(room.viewFor(0)?.match.stats).toEqual(tally(emptyStatsFor(3), events))
  })

  it('refuses a pass from a seat that has not drawn, and from one off turn', () => {
    const room = roomWith(DEFAULT_TABLE_RULES)
    const onTurn = room.currentSeat ?? 0
    expect(room.move(onTurn, { type: 'pass' })).toEqual({ okay: false, error: 'illegal_move' })
    const other = SEATS.find((seat) => seat !== onTurn) ?? 0
    expect(room.move(other, { type: 'pass' })).toEqual({ okay: false, error: 'not_your_turn' })
  })

  it('refuses a second pass once the turn has already moved on', () => {
    /* What the loser of a double tap gets, and the reason the offer has to be cleared on
       the turn change rather than on the next draw. */
    const room = roomWith(DEFAULT_TABLE_RULES)
    const { seat } = drawUntilDeciding(room)
    expect(room.move(seat, { type: 'pass' }).okay).toBe(true)
    expect(room.move(seat, { type: 'pass' })).toEqual({ okay: false, error: 'not_your_turn' })
  })

  it('clears the decision when the deciding seat disconnects', () => {
    const room = roomWith(DEFAULT_TABLE_RULES)
    const { seat } = drawUntilDeciding(room)
    room.disconnect(`socket-${String(seat)}`)

    expect(room.decidingOnDrawnCard).toBe(false)
    expect(room.currentSeat).not.toBe(seat)
    const now = room.currentSeat ?? 0
    // The seat that inherits the turn gets an ordinary turn, not somebody else's offer.
    expect(room.viewFor(now)?.you.legalMoves.some((move) => move.type === 'draw')).toBe(true)
    expect(room.viewFor(now)?.you.legalMoves.some((move) => move.type === 'pass')).toBe(false)
  })
})

describe('a room with the drawn-card rule switched off', () => {
  it('ends the turn on a voluntary draw and never offers a pass', () => {
    const room = roomWith(OFF)
    for (let turn = 0; turn < 400; turn += 1) {
      const seat = room.currentSeat
      if (seat === null || room.viewFor(seat)?.phase !== 'playing') break
      const moves = room.viewFor(seat)?.you.legalMoves ?? []
      expect(moves.some((move) => move.type === 'pass')).toBe(false)

      const move =
        moves.find((candidate) => candidate.type === 'draw') ??
        moves.find((candidate) => candidate.type === 'acceptDraw') ??
        moves.find((candidate) => candidate.type === 'play')
      if (move === undefined) break
      const result = room.move(seat, move)
      if (!result.okay) throw new Error(result.error)
      expect(result.value.some((event) => event.type === 'turnPassed')).toBe(false)
      if (move.type === 'draw') {
        expect(room.decidingOnDrawnCard).toBe(false)
        expect(room.currentSeat).not.toBe(seat)
      }
    }
  })
})
