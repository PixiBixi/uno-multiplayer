import { voiceMuteSchema, voiceSignalSendSchema } from '@uno/protocol'
import type { ZodType } from 'zod'
import type { Config } from '../config.js'
import type { RateLimiter } from '../security/rate-limit.js'
import { mintIceServers } from './turn-credentials.js'
import type { AckFailure, Presence, TypedServer, TypedSocket } from './types.js'
import type { VoiceRooms } from './voice-room.js'

export type VoiceContext = {
  io: TypedServer
  voiceRooms: VoiceRooms
  config: Config
  limiter: RateLimiter
  presenceOf: (socketId: string) => Presence | undefined
}

type VoiceHelpers = {
  attempt: (ack: unknown, run: () => void) => void
  parsePayload: <T>(schema: ZodType<T>, payload: unknown) => T | null
  emptyPayloadSchema: ZodType<Record<string, never>>
  seated: (ack: (result: AckFailure) => void) => Presence | null
}

/** Pushes the current roster to every socket in the room, sender included. */
function broadcastPeers(context: VoiceContext, presence: Presence): void {
  context.io
    .to(presence.room.code)
    .emit('voice:peers', context.voiceRooms.in(presence.room.code).peers())
}

/**
 * Removes a socket's seat from its voice session. Called from `voice:leave` and
 * from the two paths where a socket goes away without saying anything.
 *
 * Voice gets no reconnect grace period: the game seat's grace protects a match in
 * progress, while a peer connection that has already dropped is better rebuilt.
 */
export function leaveVoice(context: VoiceContext, socket: TypedSocket): void {
  const presence = context.presenceOf(socket.id)
  if (presence === undefined) return
  const room = context.voiceRooms.in(presence.room.code)
  if (!room.has(presence.seat)) return

  room.leave(presence.seat)
  context.limiter.forget(socket.id)
  if (room.size() === 0) context.voiceRooms.drop(presence.room.code)
  broadcastPeers(context, presence)
}

export function registerVoiceHandlers(
  context: VoiceContext,
  socket: TypedSocket,
  helpers: VoiceHelpers,
): void {
  const { attempt, parsePayload, emptyPayloadSchema, seated } = helpers

  socket.on('voice:join', (payload, ack) => {
    attempt(ack, () => {
      if (parsePayload(emptyPayloadSchema, payload) === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      const presence = seated(ack)
      if (presence === null) return

      const room = context.voiceRooms.in(presence.room.code)
      // Read the peers before joining: a joiner must not be told about itself.
      const peers = room.peersExcept(presence.seat)
      room.join(presence.seat)
      ack({ ok: true, iceServers: mintIceServers(context.config, presence.room.code), peers })
      broadcastPeers(context, presence)
    })
  })

  socket.on('voice:leave', (payload, ack) => {
    attempt(ack, () => {
      if (parsePayload(emptyPayloadSchema, payload) === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      // Leaving twice is not worth reporting: there is simply nothing to remove.
      leaveVoice(context, socket)
      ack({ ok: true })
    })
  })

  socket.on('voice:signal', (payload, ack) => {
    attempt(ack, () => {
      const data = parsePayload(voiceSignalSendSchema, payload)
      if (data === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      const presence = seated(ack)
      if (presence === null) return
      if (!context.limiter.allow(socket.id)) {
        ack({ ok: false, error: 'rate_limited' })
        return
      }

      const room = context.voiceRooms.in(presence.room.code)
      if (!room.has(presence.seat)) {
        ack({ ok: false, error: 'voice_not_joined' })
        return
      }
      /* The target is checked against this room's session, never taken on trust:
         a seat number from a client is an index into somebody else's table. */
      if (data.toSeat === presence.seat || !room.has(data.toSeat)) {
        ack({ ok: false, error: 'voice_peer_unavailable' })
        return
      }
      const targetSocketId = presence.room.memberAt(data.toSeat)?.socketId
      if (targetSocketId == null) {
        ack({ ok: false, error: 'voice_peer_unavailable' })
        return
      }

      ack({ ok: true })
      // Relayed verbatim. The server does not parse SDP and must not start.
      context.io
        .to(targetSocketId)
        .emit('voice:signal', { fromSeat: presence.seat, signal: data.signal })
    })
  })

  socket.on('voice:mute', (payload, ack) => {
    attempt(ack, () => {
      const data = parsePayload(voiceMuteSchema, payload)
      if (data === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      const presence = seated(ack)
      if (presence === null) return

      const room = context.voiceRooms.in(presence.room.code)
      if (!room.has(presence.seat)) {
        ack({ ok: false, error: 'voice_not_joined' })
        return
      }
      room.setMuted(presence.seat, data.muted)
      ack({ ok: true })
      broadcastPeers(context, presence)
    })
  })
}
