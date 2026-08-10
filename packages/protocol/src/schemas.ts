import {
  DEFAULT_TABLE_RULES,
  type CardId,
  type MatchGoal,
  type Move,
  type TableRules,
} from '@uno/engine'
import { z } from 'zod'
import {
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SEATS,
  MAX_POINTS_TARGET,
  MAX_ROUNDS,
  MIN_POINTS_TARGET,
  MIN_ROUNDS,
  MAX_TURN_SECONDS,
  MIN_TURN_SECONDS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type MatchPace,
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
 * Bounded by the table size. The engine refuses a seat that is not a legal target
 * anyway, but a seat number is an index and an unbounded one has no business
 * reaching the reducer at all.
 */
const seatNumber = z
  .number()
  .int()
  .min(0)
  .max(MAX_SEATS - 1)

/**
 * Produces an engine `Move` directly. The play variant omits `chosenColor` and
 * `swapWith` rather than setting them to undefined: under
 * `exactOptionalPropertyTypes` an absent key and an explicit undefined are
 * different types, and the engine declares the keys absent.
 */
export const moveSchema: z.ZodType<Move> = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('play'),
      cardId,
      chosenColor: colorSchema.optional(),
      /** Whose hand a 7 takes, on a Seven-Zero table. */
      swapWith: seatNumber.optional(),
    })
    .transform((value): Move => ({
      type: 'play',
      cardId: value.cardId,
      ...(value.chosenColor === undefined ? {} : { chosenColor: value.chosenColor }),
      ...(value.swapWith === undefined ? {} : { swapWith: value.swapWith }),
    })),
  z.object({ type: z.literal('draw') }),
  z.object({ type: z.literal('acceptDraw') }),
  z.object({ type: z.literal('callUno') }),
  z.object({ type: z.literal('callOut'), target: seatNumber }),
])

/**
 * The optional rules a host switches on at creation. Booleans have no interesting
 * bounds, but the field still goes through Zod like every other payload: a client
 * can send whatever it likes.
 *
 * Each flag defaults on its own rather than only the object as a whole. A client
 * built when `liar` was the only option sends `{ liar }` and nothing else, and
 * rejecting that outright would break a client that is perfectly able to play —
 * it simply asks for a table without the newer rule, which is what it wants.
 */
export const tableRulesSchema: z.ZodType<TableRules> = z.object({
  liar: z.boolean().default(false),
  sevenZero: z.boolean().default(false),
  jumpIn: z.boolean().default(false),
})

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

/** Null is the ordinary case — a table with no clock — so it is spelled out. */
export const matchPaceSchema: z.ZodType<MatchPace> = z.union([
  z.null(),
  z.object({
    turnSeconds: z.number().int().min(MIN_TURN_SECONDS).max(MAX_TURN_SECONDS),
  }),
])

export const roomCreateSchema = z.object({
  playerName,
  goal: matchGoalSchema,
  pace: matchPaceSchema,
  /* Defaulted rather than required, unlike the goal and the pace: a client built
     before table options existed asks for a plain UNO table by saying nothing,
     which is exactly what it wants. */
  rules: tableRulesSchema.default(DEFAULT_TABLE_RULES),
})
export const roomJoinSchema = z.object({ roomCode, playerName })
export const roomRejoinSchema = z.object({ roomCode, sessionToken: z.uuid() })
export const roomLeaveSchema = z.object({})
export const gameStartSchema = z.object({})
export const gameNextRoundSchema = z.object({})
export const gameMoveSchema = z.object({ move: moveSchema })
export const chatSendSchema = z.object({ text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) })
