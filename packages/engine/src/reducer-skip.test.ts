import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { skipDisconnectedTurn } from './reducer.js'
import { setSeatStatus } from './seats.js'
import { expectConservation, handOf, num, seatOf, stateOf } from './test-helpers.js'

describe('skipDisconnectedTurn', () => {
  it('leaves an active seat alone', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])] })
    expect(skipDisconnectedTurn(state)).toEqual(state)
  })

  it('makes the absent seat draw one and passes the turn on', () => {
    const state = stateOf({
      seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, []), seatOf(2, [])],
    })
    const next = skipDisconnectedTurn(state)
    expect(handOf(next, 0)).toHaveLength(1)
    expect(next.currentSeat).toBe(1)
  })

  it('makes the absent seat swallow an outstanding debt', () => {
    const state = stateOf({
      seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, []), seatOf(2, [])],
      drawPile: [num('d1', 'R', 3), num('d2', 'G', 5), num('d3', 'B', 7)],
      pendingDraw: { amount: 2, kind: 'draw2' },
    })
    const next = skipDisconnectedTurn(state)
    expect(handOf(next, 0)).toHaveLength(2)
    expect(next.pendingDraw).toBeNull()
    expect(next.currentSeat).toBe(1)
  })

  it('walks past several consecutive absent seats', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [], { status: 'disconnected' }),
        seatOf(1, [], { status: 'disconnected' }),
        seatOf(2, []),
      ],
    })
    expect(skipDisconnectedTurn(state).currentSeat).toBe(2)
  })

  it('terminates when nobody is active instead of looping forever', () => {
    const state = stateOf({
      seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, [], { status: 'left' })],
    })
    expect(() => skipDisconnectedTurn(state)).not.toThrow()
  })

  it('does nothing on a finished game', () => {
    const state = stateOf({
      seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, [])],
      phase: 'finished',
    })
    expect(skipDisconnectedTurn(state)).toEqual(state)
  })

  it('preserves the 108-card invariant', () => {
    const init = initGame({ names: ['a', 'b', 'c'], seed: 3 })
    if (!init.okay) throw new Error(init.error)
    const absent = setSeatStatus(init.value, 0, 'disconnected')
    expect(() => expectConservation(skipDisconnectedTurn(absent))).not.toThrow()
  })

  it('does not mutate the input', () => {
    const state = stateOf({
      seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, []), seatOf(2, [])],
    })
    const before = structuredClone(state)
    skipDisconnectedTurn(state)
    expect(state).toEqual(before)
  })
})
