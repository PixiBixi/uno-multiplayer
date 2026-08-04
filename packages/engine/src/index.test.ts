import { describe, expect, it } from 'vitest'
import * as engine from './index.js'

describe('public surface', () => {
  it('exports the functions the server needs', () => {
    expect(typeof engine.initGame).toBe('function')
    expect(typeof engine.applyMove).toBe('function')
    expect(typeof engine.legalMoves).toBe('function')
    expect(typeof engine.isPlayable).toBe('function')
    expect(typeof engine.activeCount).toBe('function')
    expect(typeof engine.buildDeck).toBe('function')
    expect(engine.COLORS).toEqual(['R', 'G', 'B', 'Y'])
    expect(engine.MIN_PLAYERS).toBe(2)
    expect(engine.MAX_PLAYERS).toBe(4)
  })

  it('does not leak test helpers', () => {
    expect('stateOf' in engine).toBe(false)
    expect('expectConservation' in engine).toBe(false)
    expect('seatOf' in engine).toBe(false)
  })

  it('runs a full turn through the public API only', () => {
    const init = engine.initGame({ names: ['a', 'b'], seed: 7 })
    if (!init.okay) throw new Error(init.error)
    const moves = engine.legalMoves(init.value, 0)
    expect(moves.length).toBeGreaterThan(0)
    const first = moves[0]
    if (first === undefined) throw new Error('expected at least one legal move')
    expect(engine.applyMove(init.value, 0, first).okay).toBe(true)
  })
})
