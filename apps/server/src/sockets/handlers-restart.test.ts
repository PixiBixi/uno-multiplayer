import { createServer, type Server as HttpServer } from 'node:http'
import type { PlayerView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import type { Room } from '../rooms/room.js'
import { registerSocketHandlers } from './handlers.js'

let httpServer: HttpServer
let ioServer: ReturnType<typeof registerSocketHandlers>
let rooms: RoomManager
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })
  rooms = new RoomManager({ maxRooms: 10, gracePeriodMs: 5000 })
  httpServer = createServer()
  ioServer = registerSocketHandlers(httpServer, rooms, config)
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
  const address = httpServer.address()
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
  url = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  await ioServer.close()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

type PlainAck = { ok: true } | { ok: false; error: string }
type CreateAck = { ok: true; roomCode: string } | { ok: false }

/** A client that keeps its latest view and counts how many it has received. */
type Player = { socket: Socket; view: () => PlayerView | null; version: () => number }

const newPlayer = (): Player => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  let latest: PlayerView | null = null
  let version = 0
  socket.on('game:view', (view: PlayerView) => {
    latest = view
    version += 1
  })
  return { socket, view: () => latest, version: () => version }
}

const emit = <T>(player: Player, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => player.socket.emit(event, payload, resolve))

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/** Seats a two-player table over real sockets and starts the game. */
const table = async () => {
  const host = newPlayer()
  const created = await emit<CreateAck>(host, 'room:create', { playerName: 'Ana' })
  if (!created.ok) throw new Error('room:create failed')
  const guest = newPlayer()
  await emit<PlainAck>(guest, 'room:join', {
    roomCode: created.roomCode,
    playerName: 'Ben',
  })
  await emit<PlainAck>(host, 'game:start', {})
  await waitFor(() => host.view() !== null && guest.view() !== null, 'the initial deal')

  const room = rooms.get(created.roomCode)
  if (room === null) throw new Error('the room went missing')
  return { host, guest, room }
}

/**
 * Drives the game to its end through the Room API, synchronously.
 *
 * Deliberately NOT played over the wire: a hundred socket round trips depend on
 * two clients' views staying in step and on the move rate limiter, which makes
 * the test flaky for no benefit. What restart *does* is covered by
 * room-restart.test.ts; what this file tests is the socket wiring around it.
 */
const finishGame = (room: Room): void => {
  for (let turn = 0; turn < 900 && room.phase === 'playing'; turn++) {
    const seat = room.viewFor(0)?.currentSeat ?? 0
    const moves = room.viewFor(seat)?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) break
    const applied = room.move(seat, move)
    if (!applied.okay) throw new Error(`move rejected: ${applied.error}`)
  }
  if (room.phase !== 'finished') throw new Error('the game did not reach an end')
}

describe('game:restart over sockets', () => {
  it('refuses a restart while the game is running', async () => {
    const { host } = await table()
    expect(await emit<PlainAck>(host, 'game:restart', {})).toEqual({
      ok: false,
      error: 'game_already_started',
    })
  })

  it('refuses a restart from a client that never joined', async () => {
    const stranger = newPlayer()
    expect(await emit<PlainAck>(stranger, 'game:restart', {})).toEqual({
      ok: false,
      error: 'room_not_found',
    })
    expect(stranger.socket.connected).toBe(true)
  })

  it('refuses a restart from a guest', async () => {
    const { guest, room } = await table()
    finishGame(room)
    expect(await emit<PlainAck>(guest, 'game:restart', {})).toEqual({
      ok: false,
      error: 'not_host',
    })
  })

  it('rejects a payload of the wrong shape without dropping the connection', async () => {
    const { host } = await table()
    // A string is not an empty object, undefined or null, so validation fails.
    // Note that surplus *keys* on an object are stripped rather than rejected —
    // that is Zod's default and the right call here, since they are ignored.
    expect(await emit<PlainAck>(host, 'game:restart', 'not an object')).toEqual({
      ok: false,
      error: 'invalid_payload',
    })
    expect(host.socket.connected).toBe(true)
  })

  it('deals a fresh game and pushes new views to everyone', async () => {
    const { host, guest, room } = await table()
    finishGame(room)

    /* Wait for a genuinely NEW view on each socket rather than for a phase an
       in-flight message could still be carrying. */
    const hostSeen = host.version()
    const guestSeen = guest.version()

    expect(await emit<PlainAck>(host, 'game:restart', {})).toEqual({ ok: true })
    await waitFor(
      () => host.version() > hostSeen && guest.version() > guestSeen,
      'a fresh view on both sockets',
    )

    expect(host.view()?.phase).toBe('playing')
    expect(guest.view()?.phase).toBe('playing')
    expect(host.view()?.you.hand).toHaveLength(7)
    expect(guest.view()?.you.hand).toHaveLength(7)
  })
})
