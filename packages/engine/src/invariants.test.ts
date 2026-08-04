import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { initGame } from './init.js'
import { applyMove } from './reducer.js'
import { legalMoves } from './rules.js'
import { expectConservation } from './test-helpers.js'
import type { GameState } from './types.js'

const MAX_TURNS = 600

/**
 * Plays a game end to end, picking a legal move each turn, with the `pick`
 * index varying the choice deterministically.
 */
function playOut(
  seatCount: number,
  seed: number,
  picks: readonly number[],
): { states: GameState[]; final: GameState } {
  const init = initGame({ names: ['a', 'b', 'c', 'd'].slice(0, seatCount), seed })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  const states: GameState[] = [state]

  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    const moves = legalMoves(state, state.currentSeat)
    if (moves.length === 0) break
    const pick = picks[turn % picks.length] ?? 0
    const move = moves[pick % moves.length]
    if (move === undefined) break
    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
    states.push(state)
  }

  return { states, final: state }
}

/**
 * Plays greedily: lay a card whenever possible, draw only as a last resort.
 * This is how a sensible player behaves, and it is the policy under which
 * termination is meaningful — a random policy draws so often that hands grow
 * without bound.
 */
function playOutGreedy(seatCount: number, seed: number): GameState {
  const init = initGame({ names: ['a', 'b', 'c', 'd'].slice(0, seatCount), seed })
  if (!init.okay) throw new Error(init.error)

  let state = init.value
  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    const moves = legalMoves(state, state.currentSeat)
    // Call UNO first when it is offered: otherwise the penalty cancels out the
    // progress and the game never converges towards an end.
    const move =
      moves.find((m) => m.type === 'callUno') ??
      moves.find((m) => m.type === 'play') ??
      moves.find((m) => m.type === 'acceptDraw') ??
      moves[0]
    if (move === undefined) break
    const result = applyMove(state, state.currentSeat, move)
    if (!result.okay) throw new Error(`legal move rejected: ${result.error}`)
    state = result.value
  }
  return state
}

const gameArbitraries = [
  fc.integer({ min: 2, max: 4 }),
  fc.integer({ min: 0, max: 100_000 }),
  fc.array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 40 }),
] as const

describe('card conservation', () => {
  it('holds across randomly played games', () => {
    fc.assert(
      fc.property(...gameArbitraries, (seatCount, seed, picks) => {
        for (const state of playOut(seatCount, seed, picks).states) expectConservation(state)
      }),
      { numRuns: 300 },
    )
  })
})

describe('state validity', () => {
  it('never lets legalMoves produce a move that applyMove rejects', () => {
    fc.assert(
      fc.property(...gameArbitraries, (seatCount, seed, picks) => {
        // playOut throws if a move coming out of legalMoves gets rejected.
        expect(() => playOut(seatCount, seed, picks)).not.toThrow()
      }),
      { numRuns: 300 },
    )
  })

  it('keeps currentSeat pointing at an active seat while playing', () => {
    fc.assert(
      fc.property(...gameArbitraries, (seatCount, seed, picks) => {
        for (const state of playOut(seatCount, seed, picks).states) {
          if (state.phase !== 'playing') continue
          expect(state.seats[state.currentSeat]?.status).toBe('active')
        }
      }),
      { numRuns: 200 },
    )
  })

  it('never leaves a negative or fractional debt', () => {
    fc.assert(
      fc.property(...gameArbitraries, (seatCount, seed, picks) => {
        for (const state of playOut(seatCount, seed, picks).states) {
          if (state.pendingDraw === null) continue
          expect(state.pendingDraw.amount).toBeGreaterThan(0)
          expect(Number.isInteger(state.pendingDraw.amount)).toBe(true)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('declares a winner with an empty hand whenever a game finishes', () => {
    fc.assert(
      fc.property(...gameArbitraries, (seatCount, seed, picks) => {
        const { final } = playOut(seatCount, seed, picks)
        if (final.phase !== 'finished') return
        expect(final.winner).not.toBeNull()
        expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
      }),
      { numRuns: 200 },
    )
  })

  it('terminates under greedy play, for every seat count and seed', () => {
    for (const seatCount of [2, 3, 4]) {
      for (let seed = 0; seed < 40; seed++) {
        const final = playOutGreedy(seatCount, seed)
        expect(final.phase, `seatCount=${seatCount} seed=${seed}`).toBe('finished')
        expect(final.seats[final.winner ?? -1]?.hand).toHaveLength(0)
      }
    }
  })

  it('is fully reproducible from seed and picks', () => {
    const a = playOut(4, 31337, [0, 2, 1, 4]).final
    const b = playOut(4, 31337, [0, 2, 1, 4]).final
    expect(a).toEqual(b)
  })
})
