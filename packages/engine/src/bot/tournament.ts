import { initGame } from '../init.js'
import { roundPoints } from '../match.js'
import { applyMove, penaliseForgottenUno } from '../reducer.js'
import { nextRandom } from '../rng.js'
import type { GameState, Move, TableRules } from '../types.js'
import { availableReactions, botMove, botReaction, type ReactionKind } from './policy.js'
import { sampleDelayMs, type BotLevel } from './timing.js'
import { EMPTY_HISTORY, botViewFor, recordMove, type RoundHistory } from './view.js'

export type TournamentConfig = {
  seats: BotLevel[]
  rounds: number
  rules: TableRules
  seed: number
  unoGraceMs: number
}

/** Per seat: rounds won and points scored; `unfinished` counts rounds cut at the event cap. */
export type TournamentResult = { wins: number[]; points: number[]; unfinished: number }

/* Bots always lay a card when they hold one, so a round ends well inside this; a round
   that does not is a policy that stalls, reported rather than looped on forever. */
const MAX_EVENTS = 5000

type EventKind = 'turn' | ReactionKind | 'penalty'

/** Something a seat will do at virtual time `at`, unless its window closes first. */
type Scheduled = { at: number; seat: number; kind: EventKind }

type Round = {
  state: GameState
  history: RoundHistory
  rng: number
  now: number
  turnMoves: number
  scheduled: Map<string, Scheduled>
}

function sample(round: Round, level: BotLevel, kind: 'turn' | 'reaction' | 'jumpIn'): number {
  const delay = sampleDelayMs(level, kind, round.rng)
  round.rng = delay.rng
  return delay.ms
}

/* The events whose window is open right now, keyed so an event keeps its delay for as
   long as its window stays open, as a server timer would. A jump-in window is tied to
   the card on top: once another card lands, the old window has closed. */
function openWindows(round: Round, levels: BotLevel[]): Map<string, Omit<Scheduled, 'at'>> {
  const { state, history } = round
  const open = new Map<string, Omit<Scheduled, 'at'>>()
  open.set(`turn:${state.currentSeat}:${round.turnMoves}`, {
    seat: state.currentSeat,
    kind: 'turn',
  })
  const top = state.discardPile[state.discardPile.length - 1]?.id ?? 'none'
  for (const seat of state.seats) {
    const level = levels[seat.index] ?? 'easy'
    for (const kind of availableReactions(botViewFor(state, seat.index, history))) {
      // Easy and Normal never jump in; a plain table charges late UNO on its own clock.
      if (kind === 'jumpIn' && level !== 'hard') continue
      if (kind === 'lateUno' && !state.rules.liar) continue
      const key = kind === 'jumpIn' ? `${seat.index}:jumpIn:${top}` : `${seat.index}:${kind}`
      open.set(key, { seat: seat.index, kind })
    }
    if (!state.rules.liar && seat.vulnerable && !seat.unoCalled) {
      open.set(`${seat.index}:uno`, { seat: seat.index, kind: 'lateUno' })
    }
  }
  return open
}

function schedule(round: Round, levels: BotLevel[], graceMs: number): void {
  const open = openWindows(round, levels)
  for (const key of round.scheduled.keys()) {
    if (!open.has(key)) round.scheduled.delete(key)
  }
  for (const [key, event] of open) {
    if (round.scheduled.has(key)) continue
    const level = levels[event.seat] ?? 'easy'
    if (event.kind === 'turn') {
      round.scheduled.set(key, { ...event, at: round.now + sample(round, level, 'turn') })
    } else if (key.endsWith(':uno')) {
      // Without liar the exposed seat races the grace clock: too slow and it pays.
      const ms = sample(round, level, 'reaction')
      round.scheduled.set(
        key,
        ms < graceMs
          ? { ...event, at: round.now + ms }
          : { ...event, kind: 'penalty', at: round.now + graceMs },
      )
    } else {
      const kind = event.kind === 'jumpIn' ? 'jumpIn' : 'reaction'
      round.scheduled.set(key, { ...event, at: round.now + sample(round, level, kind) })
    }
  }
}

function earliest(round: Round): [string, Scheduled] | undefined {
  let best: [string, Scheduled] | undefined
  for (const entry of round.scheduled) {
    if (best === undefined || entry[1].at < best[1].at) best = entry
  }
  return best
}

function apply(round: Round, seat: number, move: Move): void {
  const result = applyMove(round.state, seat, move)
  if (!result.okay) throw new Error(`bot move rejected: ${result.error}`)
  round.history = recordMove(round.history, round.state, seat, move)
  round.state = result.value
}

function fire(round: Round, key: string, event: Scheduled, levels: BotLevel[]): void {
  const level = levels[event.seat] ?? 'easy'
  const view = botViewFor(round.state, event.seat, round.history)
  if (event.kind === 'turn') {
    const chosen = botMove(view, level, round.rng)
    round.rng = chosen.rng
    if (chosen.move === null) throw new Error('botMove returned null on its own turn')
    apply(round, event.seat, chosen.move)
    round.turnMoves++
    return
  }
  if (event.kind === 'penalty') {
    round.state = penaliseForgottenUno(round.state, event.seat)
    return
  }
  const chosen = botReaction(view, level, event.kind, round.rng)
  round.rng = chosen.rng
  // Declining keeps the key scheduled at infinity, so the same window is not offered again.
  round.scheduled.set(key, { ...event, at: Infinity })
  if (chosen.move !== null) apply(round, event.seat, chosen.move)
}

function playRound(
  config: TournamentConfig,
  seed: number,
  firstSeat: number,
): { state: GameState; finished: boolean } {
  const names = config.seats.map((_, i) => `bot${i}`)
  const init = initGame({ names, seed, rules: config.rules, firstSeat })
  if (!init.okay) throw new Error(init.error)
  const round: Round = {
    state: init.value,
    history: EMPTY_HISTORY,
    rng: seed,
    now: 0,
    turnMoves: 0,
    scheduled: new Map(),
  }
  for (let i = 0; i < MAX_EVENTS && round.state.phase === 'playing'; i++) {
    schedule(round, config.seats, config.unoGraceMs)
    const next = earliest(round)
    if (next === undefined) break
    round.now = next[1].at
    fire(round, next[0], next[1], config.seats)
  }
  return { state: round.state, finished: round.state.phase === 'finished' }
}

/** Seeded self-play on a virtual clock: every own turn and reaction races on its human-paced delay. */
export function runTournament(config: TournamentConfig): TournamentResult {
  const wins = config.seats.map(() => 0)
  const points = config.seats.map(() => 0)
  let unfinished = 0
  let rng = config.seed
  for (let r = 0; r < config.rounds; r++) {
    const step = nextRandom(rng)
    rng = step.state
    // The deal rotates so no seat keeps the first-move advantage.
    const { state, finished } = playRound(config, step.state, r % config.seats.length)
    if (!finished || state.winner === null) {
      unfinished++
      continue
    }
    wins[state.winner] = (wins[state.winner] ?? 0) + 1
    roundPoints(state).forEach((p, i) => (points[i] = (points[i] ?? 0) + p))
  }
  return { wins, points, unfinished }
}
