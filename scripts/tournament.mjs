// Plays one bot of level L against three of level L-1 on each rule set, over several
// independent seeds, and prints the stronger seat's win rate and average points as mean
// and standard deviation across seeds. The engine does the playing; this loops and prints.
import { DEFAULT_TABLE_RULES, runTournament } from '../packages/engine/dist/index.js'

const ROUNDS = 10_000
const SEEDS = Array.from({ length: 10 }, (_, i) => 20261101 + i)
const UNO_GRACE_MS = 3000

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

function meanSd(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1)
  return { mean, sd: Math.sqrt(variance) }
}

console.log(
  `| Pair | Rule set | Win rate (mean, sd) | Avg points (mean, sd) | Seeds x rounds | Unfinished |`,
)
console.log('| --- | --- | --- | --- | --- | --- |')
for (const [strong, weak] of PAIRS) {
  for (const [name, rules] of RULE_SETS) {
    const started = performance.now()
    const rates = []
    const averages = []
    let unfinished = 0
    for (const seed of SEEDS) {
      const result = runTournament({
        seats: [strong, weak, weak, weak],
        rounds: ROUNDS,
        rules,
        seed,
        unoGraceMs: UNO_GRACE_MS,
      })
      // Both figures over finished rounds, so they describe the same games.
      const finished = ROUNDS - result.unfinished
      rates.push((100 * result.wins[0]) / finished)
      averages.push(result.points[0] / finished)
      unfinished += result.unfinished
    }
    const rate = meanSd(rates)
    const avg = meanSd(averages)
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    console.log(
      `| ${strong} vs 3 ${weak} | ${name} | ${rate.mean.toFixed(1)}% (${rate.sd.toFixed(1)}) | ${avg.mean.toFixed(1)} (${avg.sd.toFixed(1)}) | ${SEEDS.length} x ${ROUNDS} | ${unfinished} |`,
    )
    console.error(`  ${strong} vs 3 ${weak}, ${name}: ${seconds} s`)
  }
}
