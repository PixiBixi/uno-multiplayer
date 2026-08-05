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
}
