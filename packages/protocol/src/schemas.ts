import type { CardId, MatchGoal, Move } from '@uno/engine'
import { z } from 'zod'
import {
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_POINTS_TARGET,
  MAX_ROUNDS,
  MIN_POINTS_TARGET,
  MIN_ROUNDS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './views.js'

const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(ROOM_CODE_LENGTH)
  .refine((code) => [...code].every((c) => ROOM_CODE_ALPHABET.includes(c)), {
    message: 'room code contains characters outside the allowed alphabet',
  })

const playerName = z.string().trim().min(1).max(MAX_NAME_LENGTH)

const colorSchema = z.enum(['R', 'G', 'B', 'Y'])

/**
 * Bounded: a legitimate cardId is under 16 characters ('reverseR#42'). The cast
 * to the branded type belongs here — this schema IS the boundary where an
 * untrusted string becomes a validated CardId.
 */
const cardId = z
  .string()
  .min(1)
  .max(32)
  .transform((value) => value as CardId)

/**
 * Produces an engine `Move` directly. The play variant omits `chosenColor`
 * rather than setting it to undefined: under `exactOptionalPropertyTypes` an
 * absent key and an explicit undefined are different types, and the engine
 * declares the key absent.
 */
export const moveSchema: z.ZodType<Move> = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('play'), cardId, chosenColor: colorSchema.optional() })
    .transform((value): Move =>
      value.chosenColor === undefined
        ? { type: 'play', cardId: value.cardId }
        : { type: 'play', cardId: value.cardId, chosenColor: value.chosenColor },
    ),
  z.object({ type: z.literal('draw') }),
  z.object({ type: z.literal('acceptDraw') }),
  z.object({ type: z.literal('callUno') }),
])

/**
 * Bounded on both variants. Without the ceilings a client could ask for a match to
 * two billion points, which is not a match — it is a way to make the game never end.
 */
export const matchGoalSchema: z.ZodType<MatchGoal> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('points'),
    target: z.number().int().min(MIN_POINTS_TARGET).max(MAX_POINTS_TARGET),
  }),
  z.object({
    kind: z.literal('rounds'),
    count: z.number().int().min(MIN_ROUNDS).max(MAX_ROUNDS),
  }),
])

export const roomCreateSchema = z.object({ playerName, goal: matchGoalSchema })
export const roomJoinSchema = z.object({ roomCode, playerName })
export const roomRejoinSchema = z.object({ roomCode, sessionToken: z.uuid() })
export const gameStartSchema = z.object({})
export const gameNextRoundSchema = z.object({})
export const gameMoveSchema = z.object({ move: moveSchema })
export const chatSendSchema = z.object({ text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) })
