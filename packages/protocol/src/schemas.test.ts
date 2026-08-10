import { DEFAULT_MATCH_GOAL } from './views.js'
import { describe, expect, it } from 'vitest'
import {
  chatSendSchema,
  gameMoveSchema,
  moveSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomRejoinSchema,
} from './schemas.js'

describe('roomCreateSchema', () => {
  it('accepts a normal name', () => {
    expect(
      roomCreateSchema.safeParse({ playerName: 'Jeremy', goal: DEFAULT_MATCH_GOAL, pace: null })
        .success,
    ).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(
      roomCreateSchema.parse({ playerName: '  Jeremy  ', goal: DEFAULT_MATCH_GOAL, pace: null })
        .playerName,
    ).toBe('Jeremy')
  })

  it('rejects an empty name', () => {
    expect(
      roomCreateSchema.safeParse({ playerName: '   ', goal: DEFAULT_MATCH_GOAL, pace: null })
        .success,
    ).toBe(false)
  })

  it('rejects a name over 20 characters', () => {
    expect(roomCreateSchema.safeParse({ playerName: 'x'.repeat(21) }).success).toBe(false)
  })

  it('rejects a missing name', () => {
    expect(roomCreateSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a non-string name', () => {
    expect(roomCreateSchema.safeParse({ playerName: 42 }).success).toBe(false)
  })

  it('takes the table rules the host chose', () => {
    const parsed = roomCreateSchema.parse({
      playerName: 'Jeremy',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
      rules: { liar: true },
    })
    expect(parsed.rules).toEqual({ liar: true })
  })

  it('falls back to plain UNO when the field is absent', () => {
    // A client that predates table options still gets a table it understands.
    const parsed = roomCreateSchema.parse({
      playerName: 'Jeremy',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
    })
    expect(parsed.rules).toEqual({ liar: false })
  })

  it('rejects rules that are not booleans', () => {
    expect(
      roomCreateSchema.safeParse({
        playerName: 'Jeremy',
        goal: DEFAULT_MATCH_GOAL,
        pace: null,
        rules: { liar: 'yes' },
      }).success,
    ).toBe(false)
  })
})

describe('roomJoinSchema', () => {
  it('accepts a well-formed code', () => {
    expect(roomJoinSchema.safeParse({ roomCode: 'ABC234', playerName: 'x' }).success).toBe(true)
  })

  it('uppercases the code', () => {
    expect(roomJoinSchema.parse({ roomCode: 'abc234', playerName: 'x' }).roomCode).toBe('ABC234')
  })

  it('rejects a code of the wrong length', () => {
    expect(roomJoinSchema.safeParse({ roomCode: 'ABC23', playerName: 'x' }).success).toBe(false)
  })

  it('rejects ambiguous characters outside the alphabet', () => {
    expect(roomJoinSchema.safeParse({ roomCode: 'ABC01I', playerName: 'x' }).success).toBe(false)
  })
})

describe('roomRejoinSchema', () => {
  it('accepts a UUID session token', () => {
    const payload = { roomCode: 'ABC234', sessionToken: '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e' }
    expect(roomRejoinSchema.safeParse(payload).success).toBe(true)
  })

  it('rejects a token that is not a UUID', () => {
    expect(
      roomRejoinSchema.safeParse({ roomCode: 'ABC234', sessionToken: 'guessable' }).success,
    ).toBe(false)
  })
})

describe('chatSendSchema', () => {
  it('accepts a normal message', () => {
    expect(chatSendSchema.safeParse({ text: 'nicely played' }).success).toBe(true)
  })

  it('rejects an empty message', () => {
    expect(chatSendSchema.safeParse({ text: '  ' }).success).toBe(false)
  })

  it('rejects a message over 200 characters', () => {
    expect(chatSendSchema.safeParse({ text: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('moveSchema', () => {
  it('accepts a plain play', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'R7#3' }).success).toBe(true)
  })

  it('accepts a play with a chosen colour', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'W#101', chosenColor: 'B' }).success).toBe(
      true,
    )
  })

  it('rejects an unknown colour', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'W#101', chosenColor: 'Z' }).success).toBe(
      false,
    )
  })

  it('accepts the parameterless moves', () => {
    expect(moveSchema.safeParse({ type: 'draw' }).success).toBe(true)
    expect(moveSchema.safeParse({ type: 'acceptDraw' }).success).toBe(true)
    expect(moveSchema.safeParse({ type: 'callUno' }).success).toBe(true)
  })

  it('rejects an unknown move type', () => {
    expect(moveSchema.safeParse({ type: 'teleport' }).success).toBe(false)
  })

  it('accepts a call-out against a seat that could exist', () => {
    expect(moveSchema.safeParse({ type: 'callOut', target: 3 }).success).toBe(true)
  })

  it('rejects a call-out against a seat that could not', () => {
    // Bounded here as well as in the engine: a client can send whatever it likes.
    expect(moveSchema.safeParse({ type: 'callOut', target: 4 }).success).toBe(false)
    expect(moveSchema.safeParse({ type: 'callOut', target: -1 }).success).toBe(false)
    expect(moveSchema.safeParse({ type: 'callOut', target: 1.5 }).success).toBe(false)
    expect(moveSchema.safeParse({ type: 'callOut' }).success).toBe(false)
  })

  it('rejects a cardId that is absurdly long', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: 'x'.repeat(200) }).success).toBe(false)
  })
})

describe('gameMoveSchema', () => {
  it('wraps a move', () => {
    expect(gameMoveSchema.safeParse({ move: { type: 'draw' } }).success).toBe(true)
  })

  it('rejects a payload with no move', () => {
    expect(gameMoveSchema.safeParse({}).success).toBe(false)
  })
})
