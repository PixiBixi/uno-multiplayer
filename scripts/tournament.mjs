// Plays one bot of level L against three of level L-1 on each rule set and prints the
// win rate of the stronger seat. The engine does the playing; this only loops and prints.
import { DEFAULT_TABLE_RULES, runTournament } from '../packages/engine/dist/index.js'

const ROUNDS = 10_000
const UNO_GRACE_MS = 3000
const SEED = 20261101

const PAIRS = [
  ['normal', 'easy'],
  ['hard', 'normal'],
]

const RULE_SETS = [
  ['defaults', DEFAULT_TABLE_RULES],
  ['liar', { ...DEFAULT_TABLE_RULES, liar: true }],
  ['sevenZero', { ...DEFAULT_TABLE_RULES, sevenZero: true }],
  ['jumpIn', { ...DEFAULT_TABLE_RULES, jumpIn: true }],
  ['playDrawnCard off', { ...DEFAULT_TABLE_RULES, playDrawnCard: false }],
]

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`

console.log('| Pair | Rule set | Win rate | Avg points | Rounds | Unfinished |')
console.log('| --- | --- | --- | --- | --- | --- |')
for (const [strong, weak] of PAIRS) {
  for (const [name, rules] of RULE_SETS) {
    const started = performance.now()
    const result = runTournament({
      seats: [strong, weak, weak, weak],
      rounds: ROUNDS,
      rules,
      seed: SEED,
      unoGraceMs: UNO_GRACE_MS,
    })
    const finished = ROUNDS - result.unfinished
    const avg = (result.points[0] / ROUNDS).toFixed(1)
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    console.log(
      `| ${strong} vs 3 ${weak} | ${name} | ${pct(result.wins[0], finished)} | ${avg} | ${ROUNDS} | ${result.unfinished} |`,
    )
    console.error(`  ${strong} vs 3 ${weak}, ${name}: ${seconds} s`)
  }
}
