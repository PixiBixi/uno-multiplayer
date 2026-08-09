import type { Server as HttpServer } from 'node:http'
import {
  chatSendSchema,
  gameMoveSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomRejoinSchema,
  type ClientToServer,
  type ErrorCode,
  type GameEvent,
  type ServerToClient,
} from '@uno/protocol'
import { Server, type Socket } from 'socket.io'
import { z, type ZodType } from 'zod'
import type { Config } from '../config.js'
import { logger } from '../logger.js'
import type { RoomManager } from '../rooms/room-manager.js'
import type { Room } from '../rooms/room.js'
import { createRateLimiter } from '../security/rate-limit.js'

type TypedServer = Server<ClientToServer, ServerToClient>
type TypedSocket = Socket<ClientToServer, ServerToClient>

type AckFailure = { ok: false; error: ErrorCode }

/** Which room and seat a live socket belongs to. */
type Presence = { room: Room; seat: number }

/** socket.io may deliver `undefined` when the client sends no payload object. */
const emptyPayloadSchema = z.union([z.object({}), z.undefined(), z.null()]).transform(() => ({}))

/** Returns the parsed payload, or null when it does not match the contract. */
function parsePayload<T>(schema: ZodType<T>, payload: unknown): T | null {
  const parsed = schema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

/**
 * Runs a handler body so that nothing escapes to the process boundary — an
 * uncaught throw in a socket listener is exactly what took the predecessor down.
 * `ack` is checked at runtime too: a client is free to omit it, and calling
 * `undefined` would defeat the whole purpose.
 */
function attempt(ack: unknown, run: () => void): void {
  try {
    run()
  } catch (error) {
    logger.error({ err: error }, 'socket handler threw')
    if (typeof ack !== 'function') return
    try {
      ;(ack as (result: AckFailure) => void)({ ok: false, error: 'invalid_payload' })
    } catch {
      // The client is already gone; nothing left to report to.
    }
  }
}

export function registerSocketHandlers(
  httpServer: HttpServer,
  rooms: RoomManager,
  config: Config,
): TypedServer {
  const io: TypedServer = new Server(httpServer, {
    cors: { origin: config.corsOrigins.length > 0 ? config.corsOrigins : false },
    transports: ['websocket', 'polling'],
  })

  const presences = new Map<string, Presence>()
  const moveLimiter = createRateLimiter({
    capacity: config.moveBurst,
    refillPerSecond: config.movePerSecond,
  })
  const chatLimiter = createRateLimiter({
    capacity: config.chatBurst,
    refillPerSecond: config.chatPerSecond,
  })

  /** Pushes every connected seat its own redacted view. */
  const broadcastViews = (room: Room): void => {
    for (let seat = 0; seat < room.memberCount; seat++) {
      const socketId = room.memberAt(seat)?.socketId
      const view = room.viewFor(seat)
      if (socketId == null || view === null) continue
      io.to(socketId).emit('game:view', view)
    }
  }

  const broadcastLobby = (room: Room): void => {
    const view = room.lobbyView()
    for (let seat = 0; seat < room.memberCount; seat++) {
      const socketId = room.memberAt(seat)?.socketId
      if (socketId == null) continue
      io.to(socketId).emit('room:state', view)
    }
  }

  /**
   * Restarts whichever clock the room is now owed and pushes the result.
   *
   * Called after anything that can change whose turn it is. Both arms are safe to
   * call unconditionally: each clears itself when the room is not in its state, so
   * a table with no pace simply ends up with no timers and null deadlines.
   */
  const retime = (room: Room): void => {
    const afterExpiry = (events: GameEvent[]): void => {
      if (events.length > 0) broadcastEvents(room, events)
      // Re-timed before broadcasting, so the deadline every player receives is
      // already the next seat's rather than the one that just elapsed.
      retime(room)
      broadcastViews(room)
    }
    rooms.armTurn(room, afterExpiry)
    rooms.armNextRound(room, afterExpiry)
  }

  const broadcastEvents = (room: Room, events: GameEvent[]): void => {
    for (const event of events) io.to(room.code).emit('game:event', event)
  }

  io.on('connection', (socket: TypedSocket) => {
    const attach = (room: Room, seat: number): void => {
      presences.set(socket.id, { room, seat })
      void socket.join(room.code)
    }

    socket.on('room:create', (payload, ack) => {
      attempt(ack, () => {
        const data = parsePayload(roomCreateSchema, payload)
        if (data === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const created = rooms.create(data.goal, data.pace)
        if (!created.okay) {
          ack({ ok: false, error: created.error })
          return
        }
        const room = created.value
        const joined = room.join(data.playerName, socket.id)
        if (!joined.okay) {
          ack({ ok: false, error: joined.error })
          return
        }
        attach(room, joined.value.seat)
        ack({
          ok: true,
          roomCode: room.code,
          sessionToken: joined.value.sessionToken,
          seat: joined.value.seat,
        })
        broadcastLobby(room)
      })
    })

    socket.on('room:join', (payload, ack) => {
      attempt(ack, () => {
        const data = parsePayload(roomJoinSchema, payload)
        if (data === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const room = rooms.get(data.roomCode)
        if (room === null) {
          ack({ ok: false, error: 'room_not_found' })
          return
        }
        const joined = room.join(data.playerName, socket.id)
        if (!joined.okay) {
          ack({ ok: false, error: joined.error })
          return
        }
        attach(room, joined.value.seat)
        ack({ ok: true, sessionToken: joined.value.sessionToken, seat: joined.value.seat })
        broadcastLobby(room)
      })
    })

    socket.on('room:rejoin', (payload, ack) => {
      attempt(ack, () => {
        const data = parsePayload(roomRejoinSchema, payload)
        if (data === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const room = rooms.get(data.roomCode)
        if (room === null) {
          ack({ ok: false, error: 'room_not_found' })
          return
        }
        const rejoined = room.rejoin(data.sessionToken, socket.id)
        if (!rejoined.okay) {
          ack({ ok: false, error: rejoined.error })
          return
        }
        rooms.cancelGrace(room, rejoined.value.seat)
        attach(room, rejoined.value.seat)
        ack({ ok: true, seat: rejoined.value.seat })
        broadcastLobby(room)
        broadcastEvents(room, [{ type: 'seatReconnected', seat: rejoined.value.seat }])
        retime(room)
        broadcastViews(room)
      })
    })

    /**
     * Giving up a seat on purpose, which used to be a client-only idea: the
     * button cleared local state and the server was never told. The seat kept a
     * dead socket id forever, so the room could never be reclaimed, and the
     * socket stayed in the old socket.io room and kept receiving its chat.
     *
     * Deliberately the same path as an unexpected disconnect, minus the grace
     * period: somebody who pressed Leave is not coming back to that seat.
     */
    /**
     * The seat this socket is sitting in, or null after telling the caller there
     * is none. Six handlers began with the same six lines; a change to what "not
     * at a table" means had to be remembered in all of them.
     */
    const seated = (ack: (result: AckFailure) => void): Presence | null => {
      const presence = presences.get(socket.id)
      if (presence === undefined) {
        ack({ ok: false, error: 'room_not_found' })
        return null
      }
      return presence
    }

    socket.on('room:leave', (payload, ack) => {
      attempt(ack, () => {
        if (parsePayload(emptyPayloadSchema, payload) === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const presence = presences.get(socket.id)
        // Leaving twice, or from a stale tab, is not an error worth reporting.
        if (presence === undefined) {
          ack({ ok: true })
          return
        }

        const { room } = presence
        const result = room.disconnect(socket.id)
        presences.delete(socket.id)
        moveLimiter.forget(socket.id)
        chatLimiter.forget(socket.id)
        void socket.leave(room.code)
        ack({ ok: true })

        if (result === null) return
        // No grace timer: the seat is given up, not lost.
        room.expireGrace(result.seat)
        broadcastEvents(room, [...result.events, { type: 'seatLeft', seat: result.seat }])
        retime(room)
        broadcastLobby(room)
        broadcastViews(room)
      })
    })

    socket.on('game:start', (payload, ack) => {
      attempt(ack, () => {
        if (parsePayload(emptyPayloadSchema, payload) === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const presence = seated(ack)
        if (presence === null) return
        const started = presence.room.start(presence.seat)
        if (!started.okay) {
          ack({ ok: false, error: started.error })
          return
        }
        ack({ ok: true })
        retime(presence.room)
        broadcastLobby(presence.room)
        broadcastViews(presence.room)
      })
    })

    socket.on('game:nextRound', (payload, ack) => {
      attempt(ack, () => {
        if (parsePayload(emptyPayloadSchema, payload) === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const presence = seated(ack)
        if (presence === null) return
        const dealt = presence.room.nextRound(presence.seat, rooms.nextSeed())
        if (!dealt.okay) {
          ack({ ok: false, error: dealt.error })
          return
        }
        ack({ ok: true })
        broadcastEvents(presence.room, dealt.value)
        retime(presence.room)
        broadcastViews(presence.room)
      })
    })

    socket.on('game:restart', (payload, ack) => {
      attempt(ack, () => {
        if (parsePayload(emptyPayloadSchema, payload) === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const presence = seated(ack)
        if (presence === null) return
        const restarted = presence.room.restart(presence.seat, rooms.nextSeed())
        if (!restarted.okay) {
          ack({ ok: false, error: restarted.error })
          return
        }
        ack({ ok: true })
        broadcastEvents(presence.room, restarted.value)
        retime(presence.room)
        broadcastLobby(presence.room)
        broadcastViews(presence.room)
      })
    })

    socket.on('game:move', (payload, ack) => {
      attempt(ack, () => {
        const data = parsePayload(gameMoveSchema, payload)
        if (data === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const presence = seated(ack)
        if (presence === null) return
        if (!moveLimiter.allow(socket.id)) {
          ack({ ok: false, error: 'rate_limited' })
          return
        }
        const applied = presence.room.move(presence.seat, data.move)
        if (!applied.okay) {
          ack({ ok: false, error: applied.error })
          return
        }
        ack({ ok: true })
        broadcastEvents(presence.room, applied.value)
        retime(presence.room)
        broadcastViews(presence.room)
      })
    })

    socket.on('chat:send', (payload, ack) => {
      attempt(ack, () => {
        const data = parsePayload(chatSendSchema, payload)
        if (data === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const presence = seated(ack)
        if (presence === null) return
        if (!chatLimiter.allow(socket.id)) {
          ack({ ok: false, error: 'rate_limited' })
          return
        }
        const name = presence.room.memberAt(presence.seat)?.name ?? 'unknown'
        ack({ ok: true })
        io.to(presence.room.code).emit('chat:message', {
          seat: presence.seat,
          name,
          text: data.text,
        })
      })
    })

    socket.on('disconnect', () => {
      attempt(undefined, () => {
        moveLimiter.forget(socket.id)
        chatLimiter.forget(socket.id)
        const presence = presences.get(socket.id)
        presences.delete(socket.id)
        if (presence === undefined) return

        const { room } = presence
        const result = room.disconnect(socket.id)
        if (result === null) return

        broadcastEvents(room, result.events)
        // A disconnection moves the turn past the seat that left, so the clock
        // now belongs to somebody else.
        retime(room)
        broadcastLobby(room)
        broadcastViews(room)

        rooms.scheduleGrace(room, result.seat, (events) => {
          broadcastEvents(room, events)
          retime(room)
          broadcastLobby(room)
          broadcastViews(room)
        })
      })
    })
  })

  return io
}
