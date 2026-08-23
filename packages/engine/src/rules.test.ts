import { describe, expect, it } from 'vitest'
import { activeCount, advance, isPlayable, legalMoves } from './rules.js'
import { act, cid, num, seatOf, stateOf, wild } from './test-helpers.js'

describe('isPlayable without a debt', () => {
  it('accepts a colour match', () => {
    expect(isPlayable(num('x', 'R', 3), stateOf())).toBe(true)
  })

  it('accepts a number match on a different colour', () => {
    expect(isPlayable(num('x', 'G', 7), stateOf())).toBe(true)
  })

  it('rejects a card matching neither colour nor number', () => {
    expect(isPlayable(num('x', 'G', 3), stateOf())).toBe(false)
  })

  it('always accepts wilds', () => {
    expect(isPlayable(wild('x', 'wild'), stateOf())).toBe(true)
    expect(isPlayable(wild('x', 'wild4'), stateOf())).toBe(true)
  })

  it('accepts an action card of the current colour', () => {
    expect(isPlayable(act('x', 'skip', 'R'), stateOf())).toBe(true)
  })

  it('accepts an action card matching the top action kind', () => {
    const state = stateOf({ discardPile: [act('t', 'skip', 'R')], currentColor: 'R' })
    expect(isPlayable(act('x', 'skip', 'G'), state)).toBe(true)
  })

  it('rejects an action card matching neither colour nor kind', () => {
    const state = stateOf({ discardPile: [act('t', 'skip', 'R')], currentColor: 'R' })
    expect(isPlayable(act('x', 'reverse', 'G'), state)).toBe(false)
  })

  it('matches on currentColor, not on the visible card colour', () => {
    const state = stateOf({ discardPile: [wild('t', 'wild')], currentColor: 'B' })
    expect(isPlayable(num('x', 'B', 3), state)).toBe(true)
    expect(isPlayable(num('x', 'R', 3), state)).toBe(false)
  })
})

describe('isPlayable with a debt - strictly same type', () => {
  it('lets a +2 answer a +2', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(isPlayable(act('x', 'draw2', 'G'), state)).toBe(true)
  })

  it('refuses a +4 on a +2', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(isPlayable(wild('x', 'wild4'), state)).toBe(false)
  })

  it('refuses a +2 on a +4', () => {
    const state = stateOf({ pendingDraw: { amount: 4, kind: 'wild4' } })
    expect(isPlayable(act('x', 'draw2', 'R'), state)).toBe(false)
  })

  it('lets a +4 answer a +4', () => {
    const state = stateOf({ pendingDraw: { amount: 4, kind: 'wild4' } })
    expect(isPlayable(wild('x', 'wild4'), state)).toBe(true)
  })

  it('refuses everything else while a debt stands', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' } })
    expect(isPlayable(num('x', 'R', 7), state)).toBe(false)
    expect(isPlayable(wild('x', 'wild'), state)).toBe(false)
    expect(isPlayable(act('x', 'skip', 'R'), state)).toBe(false)
  })

  it('ignores colour when raising', () => {
    const state = stateOf({ pendingDraw: { amount: 2, kind: 'draw2' }, currentColor: 'R' })
    expect(isPlayable(act('x', 'draw2', 'Y'), state)).toBe(true)
  })
})

describe('legalMoves', () => {
  it('is empty for a seat whose turn it is not', () => {
    expect(legalMoves(stateOf(), 1)).toEqual([])
  })

  it('is empty once the game is finished', () => {
    expect(legalMoves(stateOf({ phase: 'finished' }), 0)).toEqual([])
  })

  it('is empty for a non-active seat', () => {
    const state = stateOf({ seats: [seatOf(0, [], { status: 'disconnected' }), seatOf(1, [])] })
    expect(legalMoves(state, 0)).toEqual([])
  })

  it('offers draw when there is no debt', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'G', 3)]), seatOf(1, [])] })
    expect(legalMoves(state, 0)).toContainEqual({ type: 'draw' })
  })

  it('offers acceptDraw instead of draw when a debt stands', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'G', 3)]), seatOf(1, [])],
      pendingDraw: { amount: 2, kind: 'draw2' },
    })
    const moves = legalMoves(state, 0)
    expect(moves).toContainEqual({ type: 'acceptDraw' })
    expect(moves).not.toContainEqual({ type: 'draw' })
  })

  it('expands a wild into one move per colour', () => {
    const state = stateOf({ seats: [seatOf(0, [wild('w', 'wild')]), seatOf(1, [])] })
    const plays = legalMoves(state, 0).filter((m) => m.type === 'play')
    expect(plays).toHaveLength(4)
    expect(plays.map((m) => (m.type === 'play' ? m.chosenColor : null))).toEqual([
      'R',
      'G',
      'B',
      'Y',
    ])
  })

  it('emits a single move for a coloured card, with no chosenColor', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'R', 3)]), seatOf(1, [])] })
    expect(legalMoves(state, 0).filter((m) => m.type === 'play')).toEqual([
      { type: 'play', cardId: cid('a') },
    ])
  })

  it('offers callUno at exactly two cards', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)]), seatOf(1, [])],
    })
    expect(legalMoves(state, 0)).toContainEqual({ type: 'callUno' })
  })

  it('does not offer callUno once already called', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0)], { unoCalled: true }), seatOf(1, [])],
    })
    expect(legalMoves(state, 0)).not.toContainEqual({ type: 'callUno' })
  })

  it('does not offer callUno at three cards', () => {
    const state = stateOf({
      seats: [seatOf(0, [num('a', 'R', 3), num('b', 'R', 0), num('c', 'R', 7)]), seatOf(1, [])],
    })
    expect(legalMoves(state, 0)).not.toContainEqual({ type: 'callUno' })
  })

  it('excludes unplayable cards', () => {
    const state = stateOf({ seats: [seatOf(0, [num('a', 'G', 3)]), seatOf(1, [])] })
    expect(legalMoves(state, 0).filter((m) => m.type === 'play')).toEqual([])
  })
})

describe('activeCount and advance', () => {
  it('counts only active seats', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [], { status: 'left' }), seatOf(2, [])],
    })
    expect(activeCount(state)).toBe(2)
  })

  it('advances clockwise', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])] })
    expect(advance(state, 0, 1)).toBe(1)
  })

  it('advances anticlockwise', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])], direction: -1 })
    expect(advance(state, 0, 1)).toBe(2)
  })

  it('skips inactive seats', () => {
    const state = stateOf({
      seats: [seatOf(0, []), seatOf(1, [], { status: 'disconnected' }), seatOf(2, [])],
    })
    expect(advance(state, 0, 1)).toBe(2)
  })

  it('wraps around', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])] })
    expect(advance(state, 2, 1)).toBe(0)
  })

  it('advances two steps for a skip', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, []), seatOf(2, [])] })
    expect(advance(state, 0, 2)).toBe(2)
  })

  it('returns the origin seat when it is the only active one', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, [], { status: 'left' })] })
    expect(advance(state, 0, 1)).toBe(0)
  })

  it('returns to the same seat on a two-step advance with two players', () => {
    const state = stateOf({ seats: [seatOf(0, []), seatOf(1, [])] })
    expect(advance(state, 0, 2)).toBe(0)
  })
})
