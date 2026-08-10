import type { Card, MatchGoal, Move, TableRules } from '@uno/engine'
import type { LobbyView, MatchPace, PlayerView } from './views.js'

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'invalid_payload'
  | 'not_host'
  | 'too_few_players'
  | 'game_already_started'
  | 'game_not_started'
  | 'illegal_move'
  | 'not_your_turn'
  | 'rate_limited'
  | 'invalid_session'
  | 'server_full'
  | 'round_in_progress'
  | 'match_over'

/** Narrative feed used for animations and the in-game log, never for state. */
export type GameEvent =
  | { type: 'cardPlayed'; seat: number; card: Card }
  | { type: 'cardsDrawn'; seat: number; count: number }
  | { type: 'unoCalled'; seat: number }
  | { type: 'unoPenalty'; seat: number; count: number }
  /* Who noticed, and who it cost. The two cards themselves still arrive as
     `unoPenalty` against the target, so the statistics and the sound cue for a
     forgotten UNO keep working whichever rule charged it. */
  | { type: 'calledOut'; by: number; target: number }
  | { type: 'seatDisconnected'; seat: number }
  | { type: 'seatReconnected'; seat: number }
  | { type: 'seatLeft'; seat: number }
  /* A round ending and a match ending are two different moments, and conflating
     them was what the old single `gameOver` did. `awarded` is what this round paid
     out, `scores` the running totals after it. */
  | { type: 'roundEnded'; winner: number | null; awarded: number[]; scores: number[] }
  | { type: 'matchEnded'; winners: number[]; scores: number[] }
  | { type: 'roundStarted'; round: number }
  /* The clock played for somebody. Distinct from cardsDrawn so the log can say
     why, and so the client can react to a forced turn differently. */
  | { type: 'turnTimedOut'; seat: number }
  | { type: 'gameRestarted' }

/**
 * An acknowledgement carrying no extra fields on success. Not
 * `Record<string, never>`: intersecting that with `{ ok: true }` would demand
 * `ok` be of type `never`, making the result unsatisfiable.
 */
export type Empty = Record<never, never>

export type Ack<T = Empty> = (result: ({ ok: true } & T) | { ok: false; error: ErrorCode }) => void

export type ClientToServer = {
  'room:create': (
    payload: { playerName: string; goal: MatchGoal; pace: MatchPace; rules: TableRules },
    ack: Ack<{ roomCode: string; sessionToken: string; seat: number }>,
  ) => void
  'room:join': (
    payload: { roomCode: string; playerName: string },
    ack: Ack<{ sessionToken: string; seat: number }>,
  ) => void
  'room:rejoin': (
    payload: { roomCode: string; sessionToken: string },
    ack: Ack<{ seat: number }>,
  ) => void
  /** Gives up the seat. Without it the server never learns the player is gone. */
  'room:leave': (payload: Empty, ack: Ack) => void
  'game:start': (payload: Empty, ack: Ack) => void
  /** Deals the next round of the current match, keeping the scores. */
  'game:nextRound': (payload: Empty, ack: Ack) => void
  /** Abandons the standings and starts a fresh match on the same goal. */
  'game:restart': (payload: Empty, ack: Ack) => void
  'game:move': (payload: { move: Move }, ack: Ack) => void
  'chat:send': (payload: { text: string }, ack: Ack) => void
}

export type ServerToClient = {
  'room:state': (view: LobbyView) => void
  'game:view': (view: PlayerView) => void
  'game:event': (event: GameEvent) => void
  'chat:message': (message: { seat: number; name: string; text: string }) => void
  error: (payload: { code: ErrorCode; message: string }) => void
}
