import { describe, expect, it } from 'vitest'
import { UNO_PENALTY, applyMove, penaliseForgottenUno } from './reducer.js'
import { act, cid, handOf, num, seatOf, stateOf, wild } from './test-helpers.js'
import type { Card, GameState, Move } from './types.js'

const apply = (state: GameState, seat: number, move: Move): GameState => {
  const r = applyMove(state, seat, move)
  if (!r.okay) throw new Error(`unexpected failure: ${r.error}`)
  return r.value
}

const threeSeats = (hand0: Card[]) =>
  stateOf({ seats: [seatOf(0, hand0), seatOf(1, []), seatOf(2, [])] })

describe('number card', () => {
  it('sets the current colour and passes the turn', () => {
    // Three cards in hand: playing one does not leave exactly one, so the UNO
    // penalty does not interfere with what this test observes.
    const state = threeSeats([num('a', 'R', 3), num('x', 'R', 0), num('y', 'R', 7)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.currentColor).toBe('R')
    expect(next.currentSeat).toBe(1)
    expect(next.discardPile[next.discardPile.length - 1]?.id).toBe('a')
    expect(handOf(next, 0).map((c) => c.id)).toEqual(['x', 'y'])
  })

  it('is playable on a number match and switches the colour', () => {
    const state = threeSeats([num('a', 'G', 7), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.currentColor).toBe('G')
  })
})

describe('skip', () => {
  it('skips the next seat with three players', () => {
    const state = threeSeats([act('a', 'skip', 'R'), num('x', 'R', 0)])
    expect(apply(state, 0, { type: 'play', cardId: cid('a') }).currentSeat).toBe(2)
  })

  it('returns the turn to the player with two players', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'skip', 'R'), num('x', 'R', 0)]), seatOf(1, [])],
    })
    expect(apply(state, 0, { type: 'play', cardId: cid('a') }).currentSeat).toBe(0)
  })
})

describe('reverse', () => {
  it('flips the direction with three players', () => {
    const state = threeSeats([act('a', 'reverse', 'R'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.direction).toBe(-1)
    expect(next.currentSeat).toBe(2)
  })

  it('acts as a skip with two active players, leaving direction unchanged', () => {
    const state = stateOf({
      seats: [seatOf(0, [act('a', 'reverse', 'R'), num('x', 'R', 0)]), seatOf(1, [])],
    })
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.currentSeat).toBe(0)
    expect(next.direction).toBe(1)
  })

  it('acts as a skip when a third seat has left', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [act('a', 'reverse', 'R'), num('x', 'R', 0)]),
        seatOf(1, [], { status: 'left' }),
        seatOf(2, []),
      ],
    })
    expect(apply(state, 0, { type: 'play', cardId: cid('a') }).currentSeat).toBe(0)
  })

  it('flips direction back on a second reverse with four players', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [act('a', 'reverse', 'R'), num('x', 'R', 0)]),
        seatOf(1, []),
        seatOf(2, []),
        seatOf(3, []),
      ],
    })
    expect(apply(state, 0, { type: 'play', cardId: cid('a') }).currentSeat).toBe(3)
  })
})

describe('draw2 effect on the next seat', () => {
  it('leaves the debt for the next seat to answer or accept', () => {
    const state = threeSeats([act('a', 'draw2', 'R'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.currentSeat).toBe(1)
    expect(next.pendingDraw).toEqual({ amount: 2, kind: 'draw2' })
    expect(handOf(next, 1)).toHaveLength(0)
  })
})

describe('wild', () => {
  it('applies the chosen colour', () => {
    const state = threeSeats([wild('a', 'wild'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a'), chosenColor: 'Y' })
    expect(next.currentColor).toBe('Y')
    expect(next.currentSeat).toBe(1)
    expect(next.pendingDraw).toBeNull()
  })
})

describe('wild4', () => {
  it('applies the chosen colour and opens a four-card debt', () => {
    const state = threeSeats([wild('a', 'wild4'), num('x', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a'), chosenColor: 'G' })
    expect(next.currentColor).toBe('G')
    expect(next.pendingDraw).toEqual({ amount: 4, kind: 'wild4' })
    expect(next.currentSeat).toBe(1)
  })
})

describe('uno penalty', () => {
  /* No longer charged by the reducer, on any table. Reaching one card uncalled opens the
     escapable window it always opened on a Liar table; what differs is who shuts it -
     an opponent there, a three-second clock in `RoomManager` here. The engine is pure and
     timer-free, so it cannot be the thing that charges a penalty on a deadline. */
  it('opens a window rather than charging, so the call can still be made', () => {
    const state = threeSeats([num('a', 'R', 3), num('b', 'R', 0)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.seats[0]?.vulnerable).toBe(true)
  })

  /* The consequence without the deadline. `RoomManager` holds the three seconds and calls
     this when they run out; the engine stays pure and knows nothing about clocks. Shutting
     the window is part of it: a seat that has paid is not still open to a call-out. */
  it('charges the penalty and shuts the window, when asked to', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3)], { vulnerable: true }), seatOf(1, [])],
      drawPile: [num('d1', 'G', 1), num('d2', 'G', 2), num('d3', 'G', 3)],
    })
    const next = penaliseForgottenUno(state, 0)
    expect(handOf(next, 0)).toHaveLength(1 + UNO_PENALTY)
    expect(next.seats[0]?.vulnerable).toBe(false)
  })

  it('leaves a seat that is not exposed exactly as it was', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])],
      drawPile: [num('d1', 'G', 1), num('d2', 'G', 2)],
    })
    expect(penaliseForgottenUno(state, 0)).toEqual(state)
  })

  it('opens no window when uno was called before playing', () => {
    const state = threeSeats([num('a', 'R', 3), num('b', 'R', 0)])
    const called = apply(state, 0, { type: 'callUno' })
    const next = apply(called, 0, { type: 'play', cardId: cid('a') })
    expect(next.seats[0]?.vulnerable).toBe(false)
  })

  it('draws nothing when uno was called first', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, []), seatOf(2, [])],
    })
    const called = apply(state, 0, { type: 'callUno' })
    const next = apply(called, 0, { type: 'play', cardId: cid('a') })
    expect(handOf(next, 0).map((c) => c.id)).toEqual(['b'])
  })

  it('does not apply when going from three cards to two', () => {
    const state = threeSeats([num('a', 'R', 3), num('b', 'R', 0), num('c', 'R', 7)])
    expect(handOf(apply(state, 0, { type: 'play', cardId: cid('a') }), 0)).toHaveLength(2)
  })
})

describe('victory', () => {
  it('finishes the game when the last card is played', () => {
    const state = threeSeats([num('a', 'R', 3)])
    const next = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(next.phase).toBe('finished')
    expect(next.winner).toBe(0)
    expect(handOf(next, 0)).toHaveLength(0)
  })

  it('applies no uno penalty on the winning card', () => {
    const state = threeSeats([num('a', 'R', 3)])
    expect(handOf(apply(state, 0, { type: 'play', cardId: cid('a') }), 0)).toHaveLength(0)
  })

  it('refuses any further move once finished', () => {
    const state = threeSeats([num('a', 'R', 3)])
    const done = apply(state, 0, { type: 'play', cardId: cid('a') })
    expect(applyMove(done, 1, { type: 'draw' })).toEqual({
      okay: false,
      error: 'game_finished',
    })
  })
})

describe('inactive seats', () => {
  it('skips a disconnected seat when passing the turn', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('a', 'R', 3), num('x', 'R', 0)]),
        seatOf(1, [], { status: 'disconnected' }),
        seatOf(2, []),
      ],
    })
    expect(apply(state, 0, { type: 'play', cardId: cid('a') }).currentSeat).toBe(2)
  })
})
