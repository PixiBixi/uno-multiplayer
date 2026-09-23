import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { createServer, type Server as HttpServer } from 'node:http'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

let httpServer: HttpServer
let ioServer: ReturnType<typeof registerSocketHandlers>
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  // Three in a burst and a refill far slower than the test, so the fourth event is the one refused.
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CONTROL_BURST: '3',
    CONTROL_PER_SECOND: '0.1',
  })
  httpServer = createServer()
  ioServer = registerSocketHandlers(
    httpServer,
    new RoomManager({ maxRooms: 10, gracePeriodMs: config.gracePeriodMs, seedSource: () => 42 }),
    config,
  )
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

const newClient = (): Socket => {
  const client = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(client)
  return client
}

const emit = <T>(client: Socket, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => client.emit(event, payload, resolve))

type CreateAck = { ok: true; roomCode: string; sessionToken: string } | { ok: false }
type PlainAck = { ok: true } | { ok: false; error: string }

const hostRoom = async (): Promise<{ host: Socket; roomCode: string; sessionToken: string }> => {
  const host = newClient()
  const created = await emit<CreateAck>(host, 'room:create', {
    playerName: 'Ana',
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
  })
  if (!created.ok) throw new Error('room:create failed')
  return { host, roomCode: created.roomCode, sessionToken: created.sessionToken }
}

describe('the control-event rate limit', () => {
  it('refuses a flood of lobby configuration', async () => {
    const { host } = await hostRoom()
    const acks: PlainAck[] = []
    for (let i = 0; i < 4; i += 1) {
      acks.push(await emit<PlainAck>(host, 'room:configure', { pace: { turnSeconds: 10 + i } }))
    }
    expect(acks.slice(0, 3).every((ack) => ack.ok)).toBe(true)
    expect(acks[3]).toEqual({ ok: false, error: 'rate_limited' })
  })

  /* One bucket for every control event: a script alternating between them must not get
     a fresh allowance per event name. */
  it('shares one bucket across the control events', async () => {
    const { host, roomCode, sessionToken } = await hostRoom()
    await emit<PlainAck>(host, 'room:configure', { pace: null })
    await emit<PlainAck>(host, 'game:start', {})
    await emit<PlainAck>(host, 'room:rejoin', { roomCode, sessionToken })
    for (const event of ['game:nextRound', 'game:restart', 'game:start']) {
      expect(await emit<PlainAck>(host, event, {})).toEqual({ ok: false, error: 'rate_limited' })
    }
    expect(await emit<PlainAck>(host, 'room:rejoin', { roomCode, sessionToken })).toEqual({
      ok: false,
      error: 'rate_limited',
    })
  })

  it('keeps moves and chat out of that bucket', async () => {
    const { host } = await hostRoom()
    for (let i = 0; i < 4; i += 1) await emit<PlainAck>(host, 'room:configure', { pace: null })
    expect(await emit<PlainAck>(host, 'chat:send', { text: 'still here' })).toEqual({ ok: true })
  })
})
