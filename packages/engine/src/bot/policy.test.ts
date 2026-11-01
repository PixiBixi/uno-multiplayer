import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { initGame } from '../init.js'
import { applyMove, penaliseForgottenUno } from '../reducer.js'
import { act, cid, expectConservation, num, seatOf, stateOf, wild } from '../test-helpers.js'
import { DEFAULT_TABLE_RULES, type GameState, type Move, type TableRules } from '../types.js'
import { availableReactions, botMove, botReaction } from './policy.js'
import type { BotLevel } from './timing.js'
import { EMPTY_HISTORY, botViewFor, recordMove, type RoundHistory } from './view.js'

/* Bots always lay a card when they hold one, so a round ends well inside this; a round
   that does not means a policy that stalls, which is what the bound is there to catch. */
const MAX_TURNS = 1500

const PROPERTY_TIMEOUT_MS = 30_000

function apply(state: GameState, seat: number, move: Move): GameState {
  expect(botViewFor(state, seat, EMPTY_HISTORY).legalMoves).toContainEqual(move)
  const result = applyMove(state, seat, move)
  if (!result.okay) throw new Error(`bot move rejected: ${result.error}`)
  expectConservation(result.value)
  return result.value
}

/** Every seat offered each reaction legal to it once, as the server would after a move. */
function reactionsRound(
  state: GameState,
  history: RoundHistory,
  level: BotLevel,
  rng: number,
): { state: GameState; rng: number } {
  let next = state
  let r = rng
  for (const seat of next.seats.map((s) => s.index)) {
    for (const kind of availableReactions(botViewFor(next, seat, history))) {
      if (next.phase !== 'playing') return { state: next, rng: r }
      const reaction = botReaction(botViewFor(next, seat, history), level, kind, r)
      r = reaction.rng
      if (reaction.move !== null) next = apply(next, seat, reaction.move)
    }
  }
  // Mirrors the server clock that charges a forgotten UNO on a table without liar.
  if (!next.rules.liar) {
    for (const s of next.seats) {
      if (s.vulnerable && !s.unoCalled) next = penaliseForgottenUno(next, s.index)
    }
    expectConservation(next)
  }
  return { state: next, rng: r }
}

function playRound(seatCount: number, seed: number, rules: TableRules, level: BotLevel): GameState {
  const names = ['a', 'b', 'c', 'd'].slice(0, seatCount)
  const init = initGame({ names, seed, rules })
  if (!init.okay) throw new Error(init.error)
  let state = init.value
  let history = EMPTY_HISTORY
  let rng = seed
  for (let turn = 0; turn < MAX_TURNS && state.phase === 'playing'; turn++) {
    const seat = state.currentSeat
    const chosen = botMove(botViewFor(state, seat, history), level, rng)
    rng = chosen.rng
    if (chosen.move === null) throw new Error('botMove returned null on its own turn')
    const before = state
    state = apply(state, seat, chosen.move)
    history = recordMove(history, before, seat, chosen.move)
    if (state.phase !== 'playing') break
    const reacted = reactionsRound(state, history, level, rng)
    state = reacted.state
    rng = reacted.rng
  }
  return state
}

const rulesArb = fc.record({
  liar: fc.boolean(),
  sevenZero: fc.boolean(),
  jumpIn: fc.boolean(),
  playDrawnCard: fc.boolean(),
})

describe('botMove', () => {
  it(
    'botMove only returns legal moves',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 4 }),
          fc.integer({ min: 0, max: 100_000 }),
          rulesArb,
          fc.constantFrom<BotLevel>('easy', 'normal'),
          (seatCount, seed, rules, level) => {
            const final = playRound(seatCount, seed, rules, level)
            expect(final.phase).toBe('finished')
          },
        ),
        { numRuns: 150 },
      )
    },
    PROPERTY_TIMEOUT_MS,
  )

  it('normal never plays a wild while a coloured card is legal', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [wild('w', 'wild'), wild('w4', 'wild4'), num('r3', 'R', 3), num('g1', 'G', 1)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'play',
      cardId: cid('r3'),
    })
  })

  it('normal plays the highest-scoring coloured card', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('r3', 'R', 3), num('r9', 'R', 9), num('g7', 'G', 7)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2), num('b3', 'B', 3)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'play',
      cardId: cid('r9'),
    })
  })

  it('normal breaks a points tie towards the colour it holds most of', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('r5', 'R', 5), num('g7', 'G', 7), num('g2', 'G', 2), num('y7', 'Y', 7)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2), num('b3', 'B', 3)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'play',
      cardId: cid('g7'),
    })
  })

  it('normal always calls UNO when it can', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('r3', 'R', 3), num('g1', 'G', 1)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
      ],
    })
    for (const rng of [1, 2, 3, 99]) {
      expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', rng).move).toEqual({
        type: 'callUno',
      })
    }
  })

  it('normal names the colour it holds most of', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [wild('w', 'wild'), num('g1', 'G', 1), num('g2', 'G', 2), num('b3', 'B', 3)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'play',
      cardId: cid('w'),
      chosenColor: 'G',
    })
  })

  it('normal names the first colour when it holds no coloured card', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [wild('w', 'wild'), wild('w2', 'wild'), wild('w3', 'wild4')]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
      ],
    })
    const move = botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move
    expect(move).toMatchObject({ type: 'play', chosenColor: 'R' })
  })

  it('normal prefers an action card when the next seat holds the fewest cards', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [act('rs', 'skip', 'R'), num('r9', 'R', 9), num('r8', 'R', 8)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
        seatOf(2, [num('b3', 'B', 3), num('b4', 'B', 4), num('b5', 'B', 5)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'play',
      cardId: cid('rs'),
    })
  })

  it('normal swaps with the smallest opponent hand', () => {
    const state = stateOf({
      rules: { ...DEFAULT_TABLE_RULES, sevenZero: true },
      seats: [
        seatOf(0, [num('r7', 'R', 7), num('g1', 'G', 1), num('g2', 'G', 2)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2), num('b3', 'B', 3)]),
        seatOf(2, [num('b4', 'B', 4), num('b5', 'B', 5)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'play',
      cardId: cid('r7'),
      swapWith: 2,
    })
  })

  it('normal draws only when nothing is playable', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('g1', 'G', 1), num('g2', 'G', 2), num('b3', 'B', 3)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'draw',
    })
  })

  it('normal plays a drawn coloured card', () => {
    const state = stateOf({
      drawnCard: cid('r2'),
      seats: [
        seatOf(0, [num('g1', 'G', 1), num('g2', 'G', 2), num('r2', 'R', 2)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
      ],
    })
    expect(botMove(botViewFor(state, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'play',
      cardId: cid('r2'),
    })
  })

  it('normal keeps a drawn wild when it holds the colour in play', () => {
    const hand = [num('g1', 'G', 1), num('r2', 'R', 2), wild('w', 'wild')]
    const keep = stateOf({
      drawnCard: cid('w'),
      seats: [seatOf(0, hand), seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)])],
    })
    expect(botMove(botViewFor(keep, 0, EMPTY_HISTORY), 'normal', 1).move).toEqual({
      type: 'pass',
    })

    const play = stateOf({
      drawnCard: cid('w'),
      currentColor: 'Y',
      discardPile: [num('top-1', 'Y', 7)],
      seats: [seatOf(0, hand), seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)])],
    })
    expect(botMove(botViewFor(play, 0, EMPTY_HISTORY), 'normal', 1).move).toMatchObject({
      type: 'play',
      cardId: cid('w'),
    })
  })

  it('returns null off turn', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('r3', 'R', 3), num('g1', 'G', 1)]),
        seatOf(1, [num('r4', 'R', 4), num('b2', 'B', 2)]),
      ],
    })
    expect(botMove(botViewFor(state, 1, EMPTY_HISTORY), 'normal', 1).move).toBeNull()
  })
})

describe('botReaction', () => {
  const liarState = stateOf({
    rules: { ...DEFAULT_TABLE_RULES, liar: true },
    seats: [
      seatOf(0, [num('r3', 'R', 3), num('g1', 'G', 1)]),
      seatOf(1, [num('b2', 'B', 2)], { vulnerable: true }),
      seatOf(2, [num('b3', 'B', 3), num('b4', 'B', 4)]),
    ],
  })

  it('normal always calls out an exposed seat', () => {
    const view = botViewFor(liarState, 2, EMPTY_HISTORY)
    expect(availableReactions(view)).toContain('callOut')
    for (const rng of [1, 2, 3, 99]) {
      expect(botReaction(view, 'normal', 'callOut', rng).move).toEqual({
        type: 'callOut',
        target: 1,
      })
    }
  })

  it('easy calls out about half the time', () => {
    const view = botViewFor(liarState, 2, EMPTY_HISTORY)
    let calls = 0
    let rng = 7
    for (let i = 0; i < 400; i++) {
      const r = botReaction(view, 'easy', 'callOut', rng)
      rng = r.rng
      if (r.move !== null) calls++
    }
    expect(calls).toBeGreaterThan(150)
    expect(calls).toBeLessThan(250)
  })

  it('takes a late UNO whenever it is offered', () => {
    const view = botViewFor(liarState, 1, EMPTY_HISTORY)
    expect(availableReactions(view)).toEqual(['lateUno'])
    for (const level of ['easy', 'normal'] as const) {
      expect(botReaction(view, level, 'lateUno', 5).move).toEqual({ type: 'callUno' })
    }
  })

  it('a stale reaction is null', () => {
    const plain = stateOf({
      seats: [
        seatOf(0, [num('r3', 'R', 3), num('g1', 'G', 1)]),
        seatOf(1, [num('b2', 'B', 2), num('b5', 'B', 5)]),
      ],
    })
    const view = botViewFor(plain, 1, EMPTY_HISTORY)
    expect(view.legalMoves.some((m) => m.type === 'callOut')).toBe(false)
    for (const level of ['easy', 'normal'] as const) {
      expect(botReaction(view, level, 'callOut', 1).move).toBeNull()
      expect(botReaction(view, level, 'lateUno', 1).move).toBeNull()
    }
  })

  it('easy and normal never jump in', () => {
    const state = stateOf({
      rules: { ...DEFAULT_TABLE_RULES, jumpIn: true },
      seats: [
        seatOf(0, [num('g1', 'G', 1), num('g2', 'G', 2)]),
        seatOf(1, [num('r7', 'R', 7), num('b2', 'B', 2)]),
      ],
    })
    const view = botViewFor(state, 1, EMPTY_HISTORY)
    expect(availableReactions(view)).toEqual(['jumpIn'])
    for (const level of ['easy', 'normal'] as const) {
      for (const rng of [1, 2, 3, 99]) {
        expect(botReaction(view, level, 'jumpIn', rng).move).toBeNull()
      }
    }
  })
})

describe('easy', () => {
  it('easy only ever picks from the legal on-turn moves', () => {
    const state = stateOf({
      seats: [
        seatOf(0, [num('r3', 'R', 3), wild('w', 'wild')]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
      ],
    })
    const view = botViewFor(state, 0, EMPTY_HISTORY)
    const seen = new Set<string>()
    let rng = 3
    for (let i = 0; i < 300; i++) {
      const r = botMove(view, 'easy', rng)
      rng = r.rng
      expect(view.legalMoves).toContainEqual(r.move)
      seen.add(JSON.stringify(r.move))
    }
    // callUno, r3 and four wild colours; never draw while a play is legal.
    expect(seen.size).toBe(6)
    expect(seen.has(JSON.stringify({ type: 'draw' }))).toBe(false)
  })
  it('easy plays a drawn card or passes about half the time each', () => {
    const state = stateOf({
      drawnCard: cid('w'),
      seats: [
        seatOf(0, [num('g1', 'G', 1), num('b2', 'B', 2), wild('w', 'wild')]),
        seatOf(1, [num('b1', 'B', 1), num('b3', 'B', 3)]),
      ],
    })
    const view = botViewFor(state, 0, EMPTY_HISTORY)
    let passes = 0
    let rng = 11
    for (let i = 0; i < 400; i++) {
      const r = botMove(view, 'easy', rng)
      rng = r.rng
      expect(view.legalMoves).toContainEqual(r.move)
      if (r.move?.type === 'pass') passes++
    }
    expect(passes).toBeGreaterThan(150)
    expect(passes).toBeLessThan(250)
  })
})
