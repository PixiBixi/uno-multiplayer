import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { DEFAULT_TABLE_RULES } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { z, type ZodType } from 'zod'
import { loadConfig } from '../config.js'
import { Room } from '../rooms/room.js'
import { createRateLimiter } from '../security/rate-limit.js'
import type { Presence, TypedServer, TypedSocket } from './types.js'
import { createVoiceRooms } from './voice-room.js'
import { forgetVoiceSocket, leaveVoice, registerVoiceHandlers, type VoiceContext } from './voice.js'

type Handler = (payload: unknown, ack: (result: unknown) => void) => void

/**
 * The voice handlers against fakes, so a test can read the voice registry and the
 * limiter directly. Over a real socket both are private to `registerSocketHandlers`.
 */
const voiceHarness = () => {
  const room = new Room('ABCDEF', 42, DEFAULT_MATCH_GOAL, null, DEFAULT_TABLE_RULES)
  room.join('Ana', 'socket-0')
  room.join('Ben', 'socket-1')
  const presence: Presence = { room, seat: 0 }

  const io = { to: () => ({ emit: () => true }) } as unknown as TypedServer
  const context: VoiceContext = {
    io,
    voiceRooms: createVoiceRooms(),
    config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    limiter: createRateLimiter({ capacity: 120, refillPerSecond: 10 }),
    presenceOf: (socketId) => (socketId === 'socket-0' ? presence : undefined),
  }

  const handlers = new Map<string, Handler>()
  const socket = {
    id: 'socket-0',
    on: (event: string, handler: Handler) => handlers.set(event, handler),
  } as unknown as TypedSocket

  registerVoiceHandlers(context, socket, {
    attempt: (_ack, run) => run(),
    parsePayload: <T>(schema: ZodType<T>, payload: unknown): T | null => {
      const parsed = schema.safeParse(payload)
      return parsed.success ? parsed.data : null
    },
    emptyPayloadSchema: z.object({}),
    seated: () => presence,
  })

  const send = (event: string, payload: unknown): unknown => {
    let acked: unknown = null
    handlers.get(event)?.(payload, (result) => (acked = result))
    return acked
  }
  return { context, socket, send }
}

describe('voice registry reads', () => {
  it('a signal from a seat outside voice leaves no session behind', () => {
    const { context, send } = voiceHarness()
    const offer = { kind: 'offer', sdp: 'v=0' }
    expect(send('voice:signal', { toSeat: 1, signal: offer })).toEqual({
      ok: false,
      error: 'voice_not_joined',
    })
    expect(context.voiceRooms.size()).toBe(0)
  })

  it('a mute from a seat outside voice leaves no session behind', () => {
    const { context, send } = voiceHarness()
    expect(send('voice:mute', { muted: true })).toEqual({ ok: false, error: 'voice_not_joined' })
    expect(context.voiceRooms.size()).toBe(0)
  })

  it('leaving without having joined leaves no session behind', () => {
    const { context, socket } = voiceHarness()
    leaveVoice(context, socket)
    expect(context.voiceRooms.size()).toBe(0)
  })

  /* The roster broadcast after the last seat leaves used to look the room up again,
     recreating the entry that had just been dropped. */
  it('the last seat leaving drops the session for good', () => {
    const { context, socket, send } = voiceHarness()
    expect(send('voice:join', {})).toMatchObject({ ok: true })
    leaveVoice(context, socket)
    expect(context.voiceRooms.size()).toBe(0)
  })
})

describe('a voice socket going away', () => {
  it('forgets its signal bucket even when it never joined voice', () => {
    const { context, socket, send } = voiceHarness()
    const offer = { kind: 'offer', sdp: 'v=0' }
    send('voice:signal', { toSeat: 1, signal: offer })
    expect(context.limiter.size()).toBe(1)

    forgetVoiceSocket(context, socket)
    expect(context.limiter.size()).toBe(0)
  })
})
