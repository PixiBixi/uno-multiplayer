import type { Card, Color, GamePhase, MatchGoal, Move, SeatStatus } from '@uno/engine'

export const ROOM_CODE_LENGTH = 6
export const MAX_SEATS = 4
export const MIN_SEATS = 2
export const MAX_NAME_LENGTH = 20
export const MAX_CHAT_LENGTH = 200

/* Bounds on a match goal, enforced at the socket boundary rather than only in the
   lobby UI: a client can send whatever it likes. A one-round match is a single
   game, which is why the floor on rounds is 1 and not 2. */
export const MIN_POINTS_TARGET = 50
export const MAX_POINTS_TARGET = 2000
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 20

/** What a host gets by default: the official target. */
export const DEFAULT_MATCH_GOAL: MatchGoal = { kind: 'points', target: 500 }

/* Below three seconds nobody can read their hand; above two minutes it has
   stopped being a limit. Enforced at the socket boundary, not only in the lobby. */
export const MIN_TURN_SECONDS = 3
export const MAX_TURN_SECONDS = 120
export const DEFAULT_TURN_SECONDS = 15

/**
 * Fixed rather than exposed. It exists so a fast match does not stall waiting for
 * the host to click Next round, and a second dial for it would be a setting nobody
 * has an opinion about.
 */
export const BETWEEN_ROUNDS_SECONDS = 5

/**
 * How fast a table is played. Independent of MatchGoal, which says how a match
 * ENDS rather than how quickly it runs — hence a separate field and not a third
 * goal variant.
 *
 * `null` means what every table did before this existed: no clock at all. It lives
 * in the protocol rather than the engine because a time limit is a house setting,
 * not a rule of UNO, and the engine stays free of clocks.
 */
export type MatchPace = { turnSeconds: number } | null

/** Alphabet without ambiguous characters: no O/0, no I/1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Everything ONE player receives. `opponents` exposes a card count only: the
 * contents of other players' hands never travel over the wire, which is what
 * makes hidden information structurally hidden rather than merely hidden in CSS.
 */
export type PlayerView = {
  you: { seat: number; hand: Card[]; legalMoves: Move[] }
  opponents: { seat: number; name: string; handCount: number; status: SeatStatus }[]
  discardTop: Card
  currentColor: Color
  pendingDraw: { amount: number; kind: 'draw2' | 'wild4' } | null
  currentSeat: number
  direction: 1 | -1
  drawPileCount: number
  phase: GamePhase
  winner: number | null
  match: MatchProgress
  /**
   * When the seat on turn runs out, as an epoch millisecond stamp, or null when
   * the table has no clock.
   *
   * A deadline rather than a remaining duration on purpose: a client that drops a
   * frame, sleeps a tab or reconnects mid-turn must not end up disagreeing with
   * the server about when time is up. The server owns the deadline; the client
   * only renders what is left of it.
   */
  turnDeadline: number | null
  /** When the next round deals itself, on a table that does that. */
  nextRoundDeadline: number | null
}

/**
 * Where the match stands. `scores` is indexed by seat, joined against the names
 * the view already carries rather than repeating them.
 *
 * `winners` is null while the match continues and an array once it is over — an
 * array even in points mode, where only one seat can ever cross the target, so
 * that both modes share one shape.
 */
export type MatchProgress = {
  goal: MatchGoal
  scores: number[]
  /** 1-based, and names the round currently being played. */
  round: number
  winners: number[] | null
}

export type LobbyView = {
  roomCode: string
  hostSeat: number
  seats: { seat: number; name: string; status: SeatStatus }[]
  canStart: boolean
  goal: MatchGoal
  pace: MatchPace
}
