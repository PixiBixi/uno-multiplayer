import { createServer, type Server as HttpServer } from 'node:http'
import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * Leaving a table used to be a client-only idea: the button cleared local state
 * and told the server nothing at all. The seat kept a dead socket id forever, so
 * Room.isEmpty() was permanently false and purge() could never reclaim the room —
 * one leaked room per leave, until MAX_ROOMS was reached and the server refused
 * every new game. Worse, the socket stayed in the old socket.io room, so the
 * player kept receiving the chat and events of a table they had walked away from.
 */

let httpServer: HttpServer
let ioServer: ReturnType<typeof registerSocketHandlers>
let rooms: RoomManager
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })
  rooms = new RoomManager({ maxRooms: 10, gracePeriodMs: 50 })
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

type Chat = { seat: number; name: string; text: string }

const newPlayer = () => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  const chats: Chat[] = []
  socket.on('chat:message', (message: Chat) => chats.push(message))
  return { socket, chats }
}

type Player = ReturnType<typeof newPlayer>

const emit = <T>(player: Player, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => player.socket.emit(event, payload, resolve))

const settle = () => new Promise((resolve) => setTimeout(resolve, 60))

describe('room:leave', () => {
  it('frees the seat, so the room can be reclaimed', async () => {
    const host = newPlayer()
    const created = await emit<CreateAck>(host, 'room:create', {
      playerName: 'Ana',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
    })
    if (!created.ok) throw new Error('room:create failed')

    expect(await emit<PlainAck>(host, 'room:leave', {})).toEqual({ ok: true })
    await settle()

    const room = rooms.get(created.roomCode)
    expect(room?.isEmpty()).toBe(true)
    expect(rooms.purge()).toBe(1)
    expect(rooms.get(created.roomCode)).toBeNull()
  })

  it('stops the chat of the table you walked away from', async () => {
    const host = newPlayer()
    const stayer = newPlayer()

    const created = await emit<CreateAck>(host, 'room:create', {
      playerName: 'Ana',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
    })
    if (!created.ok) throw new Error('room:create failed')
    await emit<PlainAck>(stayer, 'room:join', {
      roomCode: created.roomCode,
      playerName: 'Ben',
    })

    await emit<PlainAck>(host, 'room:leave', {})
    await settle()
    host.chats.length = 0

    await emit<PlainAck>(stayer, 'chat:send', { text: 'still here' })
    await settle()

    // The one who left hears nothing; the one who stayed still does.
    expect(host.chats).toEqual([])
    expect(stayer.chats.map((chat) => chat.text)).toEqual(['still here'])
  })

  it('lets the same socket start a fresh table without dragging the old one along', async () => {
    const host = newPlayer()
    const stayer = newPlayer()

    const first = await emit<CreateAck>(host, 'room:create', {
      playerName: 'Ana',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
    })
    if (!first.ok) throw new Error('room:create failed')
    await emit<PlainAck>(stayer, 'room:join', { roomCode: first.roomCode, playerName: 'Ben' })

    await emit<PlainAck>(host, 'room:leave', {})
    const second = await emit<CreateAck>(host, 'room:create', {
      playerName: 'Ana',
      goal: DEFAULT_MATCH_GOAL,
      pace: null,
    })
    if (!second.ok) throw new Error('the second room:create failed')
    expect(second.roomCode).not.toBe(first.roomCode)

    host.chats.length = 0
    await emit<PlainAck>(stayer, 'chat:send', { text: 'from the old table' })
    await settle()

    expect(host.chats).toEqual([])
  })

  it('is harmless when nobody is seated', async () => {
    const stranger = newPlayer()
    // Double-clicking Leave, or leaving from a stale tab, must not be an error.
    expect(await emit<PlainAck>(stranger, 'room:leave', {})).toEqual({ ok: true })
  })
})
