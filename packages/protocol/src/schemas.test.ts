import { DEFAULT_TABLE_RULES } from '@uno/engine'
import {
  DEFAULT_MATCH_GOAL,
  MAX_POINTS_TARGET,
  MAX_ROUNDS,
  MAX_TURN_SECONDS,
  MIN_POINTS_TARGET,
  MIN_ROUNDS,
  MIN_TURN_SECONDS,
} from './views.js'
import { describe, expect, it } from 'vitest'
import {
  chatSendSchema,
  gameMoveSchema,
  moveSchema,
  roomConfigureSchema,
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
      rules: { liar: true, sevenZero: true, jumpIn: false, playDrawnCard: false },
    })
    expect(parsed.rules).toEqual({
      liar: true,
      sevenZero: true,
      jumpIn: false,
      playDrawnCard: false,
    })
  })

  it('falls back to the engine defaults when the field is absent', () => {
    /* A client that predates table options still gets a table it understands: no house
       rules, and the official drawn-card rule the engine plays by default. Asserted
       against DEFAULT_TABLE_RULES rather than a copy of it, so the boundary and the engine
       cannot drift into disagreeing about what saying nothing means. */
    const parsed = roomCreateSchema.parse({
      playerName: 'Jeremy',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
    })
    expect(parsed.rules).toEqual(DEFAULT_TABLE_RULES)
  })

  it('defaults every flag on its own exactly as the engine does', () => {
    /* Each flag is defaulted separately, so this is where the two could diverge one field
       at a time. `playDrawnCard` is the one that defaults to true, and a copy of that
       decision living in Zod is precisely what this asserts against. */
    const parsed = roomCreateSchema.parse({
      playerName: 'Jeremy',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
      rules: {},
    })
    expect(parsed.rules).toEqual(DEFAULT_TABLE_RULES)
    expect(parsed.rules.playDrawnCard).toBe(true)
  })

  it('fills in an option a client has never heard of', () => {
    /* A client built when `liar` was the only rule sends only that. Rejecting it
       would break a client that can play perfectly well; it is asking for a table
       without the newer rule, which is exactly what it gets. */
    const parsed = roomCreateSchema.parse({
      playerName: 'Jeremy',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
      rules: { liar: true },
    })
    expect(parsed.rules).toEqual({
      liar: true,
      sevenZero: false,
      jumpIn: false,
      playDrawnCard: true,
    })
  })

  it('carries jump-in across on its own', () => {
    const parsed = roomCreateSchema.parse({
      playerName: 'Jeremy',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
      rules: { jumpIn: true },
    })
    expect(parsed.rules).toEqual({
      liar: false,
      sevenZero: false,
      jumpIn: true,
      playDrawnCard: true,
    })
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
    expect(
      roomCreateSchema.safeParse({
        playerName: 'Jeremy',
        goal: DEFAULT_MATCH_GOAL,
        pace: null,
        rules: { liar: false, sevenZero: 1, jumpIn: false },
      }).success,
    ).toBe(false)
    expect(
      roomCreateSchema.safeParse({
        playerName: 'Jeremy',
        goal: DEFAULT_MATCH_GOAL,
        pace: null,
        rules: { jumpIn: 'sure' },
      }).success,
    ).toBe(false)
    expect(
      roomCreateSchema.safeParse({
        playerName: 'Jeremy',
        goal: DEFAULT_MATCH_GOAL,
        pace: null,
        rules: { playDrawnCard: 'obviously' },
      }).success,
    ).toBe(false)
  })
})

describe('roomConfigureSchema', () => {
  it('accepts an empty payload, which asks for nothing to change', () => {
    /* Partial on purpose: a host toggling one rule must not have to echo back a goal
       and a pace it read a moment earlier, because echoing back a stale one is how a
       second control gets silently reverted. */
    const parsed = roomConfigureSchema.parse({})
    expect('goal' in parsed).toBe(false)
    expect('pace' in parsed).toBe(false)
    expect('rules' in parsed).toBe(false)
  })

  it('carries one field without inventing the other two', () => {
    const parsed = roomConfigureSchema.parse({ rules: { sevenZero: true } })
    expect(parsed.rules).toEqual({
      liar: false,
      sevenZero: true,
      jumpIn: false,
      playDrawnCard: true,
    })
    expect(parsed.goal).toBeUndefined()
    expect(parsed.pace).toBeUndefined()
  })

  it('tells a pace of null apart from a pace nobody mentioned', () => {
    /* The one field where absent and null are different requests: null means "take the
       clock off this table", absent means "leave the clock alone". Collapsing them
       would make it impossible to turn Blazing off. */
    expect(roomConfigureSchema.parse({ pace: null }).pace).toBeNull()
    expect('pace' in roomConfigureSchema.parse({ goal: DEFAULT_MATCH_GOAL })).toBe(false)
  })

  it('enforces exactly the bounds room:create does, because it shares them', () => {
    /* Table-driven against both schemas rather than restating the numbers: a second
       copy of MIN_POINTS_TARGET and friends is the failure this guards, and a copy
       drifts by one field at a time. */
    const goals = [
      { kind: 'points', target: MIN_POINTS_TARGET },
      { kind: 'points', target: MIN_POINTS_TARGET - 1 },
      { kind: 'points', target: MAX_POINTS_TARGET },
      { kind: 'points', target: MAX_POINTS_TARGET + 1 },
      { kind: 'points', target: 500.5 },
      { kind: 'rounds', count: MIN_ROUNDS },
      { kind: 'rounds', count: MIN_ROUNDS - 1 },
      { kind: 'rounds', count: MAX_ROUNDS },
      { kind: 'rounds', count: MAX_ROUNDS + 1 },
    ]
    for (const goal of goals) {
      expect(roomConfigureSchema.safeParse({ goal }).success, `goal ${JSON.stringify(goal)}`).toBe(
        roomCreateSchema.safeParse({ playerName: 'Ana', goal, pace: null }).success,
      )
    }

    const paces = [
      null,
      { turnSeconds: MIN_TURN_SECONDS },
      { turnSeconds: MIN_TURN_SECONDS - 1 },
      { turnSeconds: MAX_TURN_SECONDS },
      { turnSeconds: MAX_TURN_SECONDS + 1 },
      { turnSeconds: 15.5 },
    ]
    for (const pace of paces) {
      expect(roomConfigureSchema.safeParse({ pace }).success, `pace ${JSON.stringify(pace)}`).toBe(
        roomCreateSchema.safeParse({ playerName: 'Ana', goal: DEFAULT_MATCH_GOAL, pace }).success,
      )
    }
  })

  it('refuses a rule flag that is not a boolean', () => {
    expect(roomConfigureSchema.safeParse({ rules: { jumpIn: 'sure' } }).success).toBe(false)
  })

  it('refuses a goal of a kind that does not exist', () => {
    expect(roomConfigureSchema.safeParse({ goal: { kind: 'forever' } }).success).toBe(false)
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
    /* Without this one the pass button reaches a server that answers `invalid_payload` and
       the turn never ends - the schema being exactly the piece of a new action that has
       been forgotten here before. */
    expect(moveSchema.safeParse({ type: 'pass' }).success).toBe(true)
    expect(moveSchema.parse({ type: 'pass' })).toEqual({ type: 'pass' })
  })

  it('rejects an unknown move type', () => {
    expect(moveSchema.safeParse({ type: 'teleport' }).success).toBe(false)
  })

  it('accepts a 7 played with a swap target, and keeps it', () => {
    const parsed = moveSchema.safeParse({ type: 'play', cardId: '7R#3', swapWith: 2 })
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ type: 'play', cardId: '7R#3', swapWith: 2 })
  })

  it('omits the swap target rather than sending an explicit undefined', () => {
    /* Under exactOptionalPropertyTypes an absent key and an undefined one are
       different types, and the engine declares the key absent. */
    const parsed = moveSchema.parse({ type: 'play', cardId: '7R#3' })
    expect('swapWith' in parsed).toBe(false)
  })

  it('rejects a swap target that could not be a seat', () => {
    expect(moveSchema.safeParse({ type: 'play', cardId: '7R#3', swapWith: 4 }).success).toBe(false)
    expect(moveSchema.safeParse({ type: 'play', cardId: '7R#3', swapWith: -1 }).success).toBe(false)
    expect(moveSchema.safeParse({ type: 'play', cardId: '7R#3', swapWith: 1.5 }).success).toBe(
      false,
    )
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
