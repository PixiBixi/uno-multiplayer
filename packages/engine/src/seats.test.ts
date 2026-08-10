import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { markSeatLeft, setSeatStatus } from './seats.js'
import { expectConservation, num, seatOf, stateOf } from './test-helpers.js'

describe('setSeatStatus', () => {
  it('sets the status of the requested seat only', () => {
    const next = setSeatStatus(stateOf(), 1, 'disconnected')
    expect(next.seats[0]?.status).toBe('active')
    expect(next.seats[1]?.status).toBe('disconnected')
  })

  it('does not mutate the input', () => {
    const state = stateOf()
    const before = structuredClone(state)
    setSeatStatus(state, 0, 'left')
    expect(state).toEqual(before)
  })

  it('ignores an unknown seat', () => {
    const state = stateOf()
    expect(setSeatStatus(state, 9, 'left')).toEqual(state)
  })
})

describe('markSeatLeft', () => {
  it('returns the hand to the draw pile', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [num('h1', 'R', 3), num('h2', 'G', 5)]), seatOf(2, [])],
    })
    const next = markSeatLeft(state, 1)
    expect(next.seats[1]?.hand).toEqual([])
    expect(next.seats[1]?.status).toBe('left')
    expect(next.drawPile).toHaveLength(state.drawPile.length + 2)
  })

  it('preserves the 108-card invariant on a real game', () => {
    const init = initGame({ names: ['a', 'b', 'c'], seed: 11 })
    if (!init.okay) throw new Error(init.error)
    expect(() => expectConservation(markSeatLeft(init.value, 1))).not.toThrow()
  })

  it('passes the turn on when the leaver held it', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])] })
    expect(markSeatLeft(state, 0).currentSeat).toBe(1)
  })

  it('clears the uno flag of the seat gaining the turn', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [], { unoCalled: true }), seatOf(2, [])],
    })
    expect(markSeatLeft(state, 0).seats[1]?.unoCalled).toBe(false)
  })

  it('takes any Liar window with it, since the hand went back to the pile', () => {
    const state = stateOf({
      rules: { liar: true, sevenZero: false, jumpIn: false, playDrawnCard: false },
      seats: [seatOf(0, []), seatOf(1, [], { vulnerable: true }), seatOf(2, [])],
    })
    expect(markSeatLeft(state, 1).seats[1]?.vulnerable).toBe(false)
  })

  it('aborts the game when fewer than two seats remain active', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, [])] })
    const next = markSeatLeft(state, 1)
    expect(next.phase).toBe('finished')
    expect(next.winner).toBeNull()
  })

  it('keeps a finished game finished without renaming its winner', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])],
      phase: 'finished',
      winner: 0,
    })
    const next = markSeatLeft(state, 2)
    expect(next.phase).toBe('finished')
    expect(next.winner).toBe(0)
  })

  it('is idempotent on a seat that already left', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])] })
    const once = markSeatLeft(state, 2)
    expect(markSeatLeft(once, 2)).toEqual(once)
  })
})
