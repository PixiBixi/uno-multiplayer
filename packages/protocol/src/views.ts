import type { Card, Color, GamePhase, Move, SeatStatus } from '@uno/engine'

export const ROOM_CODE_LENGTH = 6
export const MAX_SEATS = 4
export const MIN_SEATS = 2
export const MAX_NAME_LENGTH = 20
export const MAX_CHAT_LENGTH = 200

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
}

export type LobbyView = {
  roomCode: string
  hostSeat: number
  seats: { seat: number; name: string; status: SeatStatus }[]
  canStart: boolean
}
