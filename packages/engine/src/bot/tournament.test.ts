import { describe, expect, it } from 'vitest'
import { nextRandom } from '../rng.js'
import { num, seatOf, stateOf } from '../test-helpers.js'
import { DEFAULT_TABLE_RULES, type TableRules } from '../types.js'
import type { BotLevel } from './timing.js'
import { earliest, fireEvent, runTournament, schedule, startRound } from './tournament.js'

const RULE_SETS: [string, TableRules][] = [
  ['defaults', DEFAULT_TABLE_RULES],
  ['liar', { ...DEFAULT_TABLE_RULES, liar: true }],
  ['sevenZero', { ...DEFAULT_TABLE_RULES, sevenZero: true }],
  ['jumpIn', { ...DEFAULT_TABLE_RULES, jumpIn: true }],
  ['playDrawnCard off', { ...DEFAULT_TABLE_RULES, playDrawnCard: false }],
]

const TIMEOUT_MS = 30_000

describe('runTournament', () => {
  it.each(RULE_SETS)(
    'four mixed bots always finish (%s)',
    (_, rules) => {
      const result = runTournament({
        seats: ['easy', 'normal', 'hard', 'normal'],
        rounds: 200,
        rules,
        seed: 7,
        unoGraceMs: 3000,
      })
      expect(result.unfinished).toBe(0)
      expect(result.wins.reduce((a, b) => a + b, 0)).toBe(200)
      expect(result.points).toHaveLength(4)
    },
    TIMEOUT_MS,
  )

  it('is deterministic for a seed', () => {
    const config = {
      seats: ['hard', 'easy', 'easy', 'easy'] as const,
      rounds: 50,
      rules: { ...DEFAULT_TABLE_RULES, jumpIn: true, liar: true },
      seed: 11,
      unoGraceMs: 3000,
    }
    const a = runTournament({ ...config, seats: [...config.seats] })
    const b = runTournament({ ...config, seats: [...config.seats] })
    expect(a).toEqual(b)
  })
})

describe('the race', () => {
  const levels: BotLevel[] = ['hard', 'easy', 'hard', 'hard']
  /** Seat 0 on turn, seat 1 down to one card without having called UNO. */
  const exposedTable = (rules: TableRules) =>
    stateOf({
      rules,
      seats: [
        seatOf(0, [num('r5', 'R', 5), num('g2', 'G', 2), num('g3', 'G', 3)]),
        seatOf(1, [num('b1', 'B', 1)], { vulnerable: true }),
        seatOf(2, [num('y1', 'Y', 1), num('y2', 'Y', 2)]),
        seatOf(3, [num('y3', 'Y', 3), num('y4', 'Y', 4)]),
      ],
    })
  const turnKey = (keys: Iterable<string>): string => [...keys].find((k) => k.startsWith('turn:'))!

  it('charges a forgotten UNO once the grace runs out with no move landing', () => {
    const round = startRound(exposedTable(DEFAULT_TABLE_RULES), levels, 500, 1)
    schedule(round)
    expect(earliest(round)).toBe('1:penalty')
    fireEvent(round, '1:penalty')
    expect(round.now).toBe(500)
    expect(round.state.seats[1]?.hand).toHaveLength(3)
    expect(round.state.seats[1]?.vulnerable).toBe(false)
  })

  it('re-arms the grace whenever a move lands', () => {
    const round = startRound(exposedTable(DEFAULT_TABLE_RULES), levels, 10_000, 1)
    schedule(round)
    expect(round.scheduled.get('1:penalty')?.at).toBe(10_000)
    fireEvent(round, turnKey(round.scheduled.keys()))
    const landed = round.now
    expect(landed).toBeGreaterThan(0)
    schedule(round)
    expect(round.state.seats[1]?.vulnerable).toBe(true)
    expect(round.scheduled.get('1:penalty')?.at).toBe(landed + 10_000)
  })

  it('closes a jump-in window when the next card lands', () => {
    const state = stateOf({
      rules: { ...DEFAULT_TABLE_RULES, jumpIn: true },
      seats: [
        seatOf(0, [num('r7a', 'R', 7), num('g2', 'G', 2), num('g3', 'G', 3)]),
        seatOf(1, [num('b1', 'B', 1), num('b2', 'B', 2)]),
        seatOf(2, [num('r7b', 'R', 7), num('y2', 'Y', 2), num('y5', 'Y', 5)]),
        seatOf(3, [num('y3', 'Y', 3), num('y4', 'Y', 4)]),
      ],
    })
    const round = startRound(state, levels, 3000, 1)
    schedule(round)
    expect(round.scheduled.has('2:jumpIn:top-1')).toBe(true)
    fireEvent(round, turnKey(round.scheduled.keys()))
    schedule(round)
    expect(round.scheduled.has('2:jumpIn:top-1')).toBe(false)
    // The card that landed is a fresh window, with a fresh delay.
    expect(round.scheduled.get('2:jumpIn:r7a')?.at).toBeGreaterThanOrEqual(round.now + 1000)
  })

  it('does not offer a declined reaction again while its window stays open', () => {
    const round = startRound(
      exposedTable({ ...DEFAULT_TABLE_RULES, liar: true }),
      ['hard', 'easy', 'easy', 'hard'],
      3000,
      1,
    )
    schedule(round)
    // Easy calls out on a coin flip: pick a stream whose first draw declines.
    let rng = 1
    while (nextRandom(rng).value < 0.5) rng = nextRandom(rng).state
    round.rng = rng
    fireEvent(round, '2:callOut')
    expect(round.state.seats[1]?.vulnerable).toBe(true)
    schedule(round)
    expect(round.scheduled.get('2:callOut')?.at).toBe(Infinity)
  })
})
