import { initGame } from '../init.js'
import { roundPoints } from '../match.js'
import { applyMove, penaliseForgottenUno } from '../reducer.js'
import type { GameState, Move, TableRules } from '../types.js'
import { availableReactions, botMove, botReaction, type ReactionKind } from './policy.js'
import { jumpsIn, sampleDelayMs, type BotLevel } from './timing.js'
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
export type Scheduled = { at: number; seat: number; kind: EventKind }

/** One round in flight on a virtual clock. Exported for the race tests only. */
export type Round = {
  state: GameState
  history: RoundHistory
  levels: BotLevel[]
  graceMs: number
  rng: number
  now: number
  /** When the last move landed: the server re-arms the UNO grace from it. */
  lastMoveAt: number
  turnMoves: number
  scheduled: Map<string, Scheduled>
}

export function startRound(
  state: GameState,
  levels: BotLevel[],
  graceMs: number,
  rng: number,
): Round {
  return {
    state,
    history: EMPTY_HISTORY,
    levels,
    graceMs,
    rng,
    now: 0,
    lastMoveAt: 0,
    turnMoves: 0,
    scheduled: new Map(),
  }
}

function levelOf(round: Round, seat: number): BotLevel {
  const level = round.levels[seat]
  if (level === undefined) throw new RangeError(`no bot level for seat ${seat}`)
  return level
}

function sample(round: Round, level: BotLevel, kind: 'turn' | 'reaction' | 'jumpIn'): number {
  const delay = sampleDelayMs(level, kind, round.rng)
  round.rng = delay.rng
  return delay.ms
}

/* The events whose window is open right now, keyed so an event keeps its delay for as
   long as its window stays open, as a server timer would. A jump-in window is tied to
   the card on top: once another card lands, the old window has closed. */
function openWindows(round: Round): Map<string, Omit<Scheduled, 'at'>> {
  const { state, history } = round
  const open = new Map<string, Omit<Scheduled, 'at'>>()
  open.set(`turn:${state.currentSeat}:${round.turnMoves}`, {
    seat: state.currentSeat,
    kind: 'turn',
  })
  const top = state.discardPile[state.discardPile.length - 1]?.id ?? 'none'
  for (const seat of state.seats) {
    const level = levelOf(round, seat.index)
    for (const kind of availableReactions(botViewFor(state, seat.index, history))) {
      if (kind === 'jumpIn' && !jumpsIn(level)) continue
      const key = kind === 'jumpIn' ? `${seat.index}:jumpIn:${top}` : `${seat.index}:${kind}`
      open.set(key, { seat: seat.index, kind })
    }
    if (!state.rules.liar && seat.vulnerable && !seat.unoCalled) {
      open.set(`${seat.index}:penalty`, { seat: seat.index, kind: 'penalty' })
    }
  }
  return open
}

/** Drops events whose window closed and samples a delay for each newly opened one. */
export function schedule(round: Round): void {
  const open = openWindows(round)
  for (const key of round.scheduled.keys()) {
    if (!open.has(key)) round.scheduled.delete(key)
  }
  for (const [key, event] of open) {
    if (event.kind === 'penalty') {
      // A plain table's grace clock is re-armed by every move, as the server does.
      round.scheduled.set(key, { ...event, at: round.lastMoveAt + round.graceMs })
      continue
    }
    if (round.scheduled.has(key)) continue
    const level = levelOf(round, event.seat)
    const kind = event.kind === 'turn' || event.kind === 'jumpIn' ? event.kind : 'reaction'
    round.scheduled.set(key, { ...event, at: round.now + sample(round, level, kind) })
  }
}

/** The key of the next event to fire; ties go to the one scheduled first. */
export function earliest(round: Round): string | undefined {
  let best: [string, Scheduled] | undefined
  for (const entry of round.scheduled) {
    if (best === undefined || entry[1].at < best[1].at) best = entry
  }
  return best?.[0]
}

function apply(round: Round, seat: number, move: Move): void {
  const result = applyMove(round.state, seat, move)
  if (!result.okay) throw new Error(`bot move rejected: ${result.error}`)
  round.history = recordMove(round.history, round.state, seat, move)
  round.state = result.value
  round.lastMoveAt = round.now
}

/** Fires one scheduled event at its time; the caller reschedules before the next. */
export function fireEvent(round: Round, key: string): void {
  const event = round.scheduled.get(key)
  if (event === undefined) throw new RangeError(`no event scheduled under ${key}`)
  round.now = event.at
  const level = levelOf(round, event.seat)
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
    round.scheduled.delete(key)
    return
  }
  const chosen = botReaction(view, level, event.kind, round.rng)
  round.rng = chosen.rng
  // Declining keeps the key scheduled at infinity, so the same window is not offered again.
  round.scheduled.set(key, { ...event, at: Infinity })
  if (chosen.move !== null) apply(round, event.seat, chosen.move)
}

function playRound(round: Round): boolean {
  for (let i = 0; i < MAX_EVENTS && round.state.phase === 'playing'; i++) {
    schedule(round)
    const key = earliest(round)
    if (key === undefined) break
    fireEvent(round, key)
  }
  return round.state.phase === 'finished'
}

/** murmur3's finaliser: spreads every input bit over the whole word. */
function fmix32(input: number): number {
  let h = input >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Independent seeds per round and per use, so the deal never shares a stream with the bots. */
function streamSeed(seed: number, round: number, stream: number): number {
  return fmix32(fmix32(fmix32(seed + 0x9e3779b9) ^ round) ^ (stream + 0x7f4a7c15))
}

const DEAL_STREAM = 1
const BOT_STREAM = 2

/** Seeded self-play on a virtual clock: every own turn and reaction races on its human-paced delay. */
export function runTournament(config: TournamentConfig): TournamentResult {
  const wins = config.seats.map(() => 0)
  const points = config.seats.map(() => 0)
  const names = config.seats.map((_, i) => `bot${i}`)
  let unfinished = 0
  for (let r = 0; r < config.rounds; r++) {
    const init = initGame({
      names,
      seed: streamSeed(config.seed, r, DEAL_STREAM),
      rules: config.rules,
      // The deal rotates so no seat keeps the first-move advantage.
      firstSeat: r % config.seats.length,
    })
    if (!init.okay) throw new Error(init.error)
    const round = startRound(
      init.value,
      config.seats,
      config.unoGraceMs,
      streamSeed(config.seed, r, BOT_STREAM),
    )
    const winner = playRound(round) ? round.state.winner : null
    if (winner === null) {
      unfinished++
      continue
    }
    wins[winner] = (wins[winner] ?? 0) + 1
    roundPoints(round.state).forEach((p, i) => (points[i] = (points[i] ?? 0) + p))
  }
  return { wins, points, unfinished }
}
