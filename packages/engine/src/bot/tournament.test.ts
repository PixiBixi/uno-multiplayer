import { describe, expect, it } from 'vitest'
import { DEFAULT_TABLE_RULES, type TableRules } from '../types.js'
import { runTournament } from './tournament.js'

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
