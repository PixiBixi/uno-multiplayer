import { z } from 'zod'
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './views.js'

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

/** Bounded: a legitimate cardId is under 16 characters ('reverseR#42'). */
const cardId = z.string().min(1).max(32)

export const moveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), cardId, chosenColor: colorSchema.optional() }),
  z.object({ type: z.literal('draw') }),
  z.object({ type: z.literal('acceptDraw') }),
  z.object({ type: z.literal('callUno') }),
])

export const roomCreateSchema = z.object({ playerName })
export const roomJoinSchema = z.object({ roomCode, playerName })
export const roomRejoinSchema = z.object({ roomCode, sessionToken: z.uuid() })
export const gameStartSchema = z.object({})
export const gameMoveSchema = z.object({ move: moveSchema })
export const chatSendSchema = z.object({ text: z.string().trim().min(1).max(MAX_CHAT_LENGTH) })
