import type { Card, Move } from '@uno/engine'
import type { LobbyView, PlayerView } from './views.js'

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

/** Narrative feed used for animations and the in-game log, never for state. */
export type GameEvent =
  | { type: 'cardPlayed'; seat: number; card: Card }
  | { type: 'cardsDrawn'; seat: number; count: number }
  | { type: 'unoCalled'; seat: number }
  | { type: 'unoPenalty'; seat: number; count: number }
  | { type: 'seatDisconnected'; seat: number }
  | { type: 'seatReconnected'; seat: number }
  | { type: 'seatLeft'; seat: number }
  | { type: 'gameOver'; winner: number | null }

export type Ack<T> = (result: ({ ok: true } & T) | { ok: false; error: ErrorCode }) => void

export type ClientToServer = {
  'room:create': (
    payload: { playerName: string },
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
  'game:start': (payload: Record<string, never>, ack: Ack<Record<string, never>>) => void
  'game:move': (payload: { move: Move }, ack: Ack<Record<string, never>>) => void
  'chat:send': (payload: { text: string }, ack: Ack<Record<string, never>>) => void
}

export type ServerToClient = {
  'room:state': (view: LobbyView) => void
  'game:view': (view: PlayerView) => void
  'game:event': (event: GameEvent) => void
  'chat:message': (message: { seat: number; name: string; text: string }) => void
  error: (payload: { code: ErrorCode; message: string }) => void
}
