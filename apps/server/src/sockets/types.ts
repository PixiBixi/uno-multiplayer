import type { ClientToServer, ErrorCode, ServerToClient } from '@uno/protocol'
import type { Server, Socket } from 'socket.io'
import type { Room } from '../rooms/room.js'

export type TypedServer = Server<ClientToServer, ServerToClient>
export type TypedSocket = Socket<ClientToServer, ServerToClient>

export type AckFailure = { ok: false; error: ErrorCode }

/** Which room and seat a live socket belongs to. */
export type Presence = { room: Room; seat: number }
