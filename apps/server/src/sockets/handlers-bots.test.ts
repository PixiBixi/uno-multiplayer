import { createServer, type Server as HttpServer } from 'node:http'
import { DEFAULT_TABLE_RULES } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type GameEvent, type LobbyView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager, type Timers } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * Lobby bots and Leave over a real socket: a handler that is never registered passes
 * every Room-level test. Bot timers are held by hand, so no bot acts behind the test.
 */

let httpServer: HttpServer
let ioServer: ReturnType<typeof registerSocketHandlers>
let rooms: RoomManager
let url: string
const clients: Socket[] = []

const heldTimers: Timers = {
  setTimeout: () => Symbol('held'),
  clearTimeout: () => undefined,
}

beforeEach(async () => {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })
  rooms = new RoomManager({ maxRooms: 10, gracePeriodMs: 1000, timers: heldTimers })
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
type CreateAck = { ok: true; roomCode: string; sessionToken: string } | { ok: false }
type JoinAck = { ok: true; sessionToken: string; seat: number } | { ok: false }

const newPlayer = () => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  const lobbies: LobbyView[] = []
  const events: GameEvent[] = []
  socket.on('room:state', (lobby: LobbyView) => lobbies.push(lobby))
  socket.on('game:event', (event: GameEvent) => events.push(event))
  return { socket, lobbies, events, lobby: () => lobbies[lobbies.length - 1] ?? null }
}

type Player = ReturnType<typeof newPlayer>

const emit = <T>(player: Player, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => player.socket.emit(event, payload, resolve))

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${label}`)
}

const lobby = async (guestName = 'Ben') => {
  const host = newPlayer()
  const guest = newPlayer()
  const created = await emit<CreateAck>(host, 'room:create', {
    playerName: 'Ana',
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
    rules: DEFAULT_TABLE_RULES,
  })
  if (!created.ok) throw new Error('room:create failed')
  const joined = await emit<JoinAck>(guest, 'room:join', {
    roomCode: created.roomCode,
    playerName: guestName,
  })
  if (!joined.ok) throw new Error('room:join failed')
  await waitFor(
    () => host.lobby()?.seats.length === 2 && guest.lobby()?.seats.length === 2,
    'both lobby views',
  )
  return { host, guest, roomCode: created.roomCode, guestToken: joined.sessionToken }
}

describe('lobby bots over the wire', () => {
  it('room:addBot from a guest is refused not_host', async () => {
    const { guest } = await lobby()
    expect(await emit<PlainAck>(guest, 'room:addBot', { level: 'hard' })).toEqual({
      ok: false,
      error: 'not_host',
    })
  })

  it('room:addBot from the host shows the bot to every member', async () => {
    const { host, guest } = await lobby()
    expect(await emit<PlainAck>(host, 'room:addBot', { level: 'hard' })).toEqual({ ok: true })
    for (const player of [host, guest]) {
      await waitFor(() => player.lobby()?.seats.length === 3, 'the bot in the lobby')
      expect(player.lobby()?.seats[2]).toMatchObject({ seat: 2, bot: 'hard' })
    }
  })

  it('room:setBotLevel and room:removeBot reach every member', async () => {
    const { host, guest } = await lobby()
    await emit<PlainAck>(host, 'room:addBot', { level: 'easy' })
    expect(await emit<PlainAck>(host, 'room:setBotLevel', { seat: 2, level: 'hard' })).toEqual({
      ok: true,
    })
    await waitFor(() => guest.lobby()?.seats[2]?.bot === 'hard', 'the new level')
    expect(await emit<PlainAck>(host, 'room:removeBot', { seat: 2 })).toEqual({ ok: true })
    await waitFor(() => guest.lobby()?.seats.length === 2, 'the bot removed')
  })

  it('refuses a malformed level', async () => {
    const { host } = await lobby()
    expect(await emit<PlainAck>(host, 'room:addBot', { level: 'godlike' })).toEqual({
      ok: false,
      error: 'invalid_payload',
    })
  })
})

describe('room:leave mid-match', () => {
  it('hands the seat to a bot for good, and the old token cannot rejoin', async () => {
    const { host, guest, roomCode, guestToken } = await lobby()
    expect(await emit<PlainAck>(host, 'game:start', {})).toEqual({ ok: true })
    expect(await emit<PlainAck>(guest, 'room:leave', {})).toEqual({ ok: true })

    await waitFor(
      () => host.events.some((e) => e.type === 'botTookOver' && e.seat === 1),
      'botTookOver for the leaver',
    )
    expect(host.events).toContainEqual({ type: 'seatLeft', seat: 1 })
    const room = rooms.get(roomCode)
    expect(room?.isBotControlled(1)).toBe(true)

    const comeback = newPlayer()
    expect(
      await emit<PlainAck>(comeback, 'room:rejoin', { roomCode, sessionToken: guestToken }),
    ).toEqual({ ok: false, error: 'invalid_session' })
    expect(room?.isBotControlled(1)).toBe(true)
  })
})
