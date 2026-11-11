import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { createServer, type Server as HttpServer } from 'node:http'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * The abuse limits follow the client address, not the socket: a script that opens a
 * fresh connection per request must not get a fresh allowance with each one.
 */

let httpServer: HttpServer | null = null
let ioServer: ReturnType<typeof registerSocketHandlers> | null = null
let url = ''
const clients: Socket[] = []

const start = async (env: Record<string, string>): Promise<void> => {
  // Budgets of two with a refill far slower than the test, so the third request is refused.
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CREATE_BURST: '2',
    CREATE_PER_SECOND: '0.01',
    JOIN_BURST: '2',
    JOIN_PER_SECOND: '0.01',
    VOICE_CONTROL_BURST: '2',
    VOICE_CONTROL_PER_SECOND: '0.1',
    ...env,
  })
  httpServer = createServer()
  ioServer = registerSocketHandlers(
    httpServer,
    new RoomManager({
      maxRooms: 50,
      maxRoomsPerOwner: config.maxRoomsPerIp,
      gracePeriodMs: config.gracePeriodMs,
      seedSource: () => 42,
    }),
    config,
  )
  await new Promise<void>((resolve) => httpServer?.listen(0, resolve))
  const address = httpServer.address()
  if (address === null || typeof address === 'string') throw new Error('expected a TCP address')
  url = `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  await ioServer?.close()
  await new Promise<void>((resolve) => (httpServer ? httpServer.close(() => resolve()) : resolve()))
  ioServer = null
  httpServer = null
})

/** A new connection, as a client behind `ip` would open one through Traefik. */
const clientFrom = (ip: string): Socket => {
  const client = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { 'x-forwarded-for': ip },
  })
  clients.push(client)
  return client
}

type Ack = { ok: boolean; error?: string; roomCode?: string }

const emit = (client: Socket, event: string, payload: unknown): Promise<Ack> =>
  new Promise((resolve) => client.emit(event, payload, resolve))

const create = (client: Socket): Promise<Ack> =>
  emit(client, 'room:create', { playerName: 'Ana', goal: DEFAULT_MATCH_GOAL, pace: null })

describe('limits keyed by client IP', () => {
  it('shares the create budget across every socket from one address', async () => {
    await start({ BEHIND_TLS: 'true' })
    expect((await create(clientFrom('203.0.113.7'))).ok).toBe(true)
    expect((await create(clientFrom('203.0.113.7'))).ok).toBe(true)
    expect(await create(clientFrom('203.0.113.7'))).toEqual({ ok: false, error: 'rate_limited' })
    expect((await create(clientFrom('198.51.100.1'))).ok).toBe(true)
  })

  it('ignores X-Forwarded-For without the proxy, so a forged header buys nothing', async () => {
    await start({ BEHIND_TLS: 'false' })
    expect((await create(clientFrom('203.0.113.1'))).ok).toBe(true)
    expect((await create(clientFrom('203.0.113.2'))).ok).toBe(true)
    expect(await create(clientFrom('203.0.113.3'))).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('caps the rooms one address holds, whatever the rate', async () => {
    await start({ BEHIND_TLS: 'true', CREATE_BURST: '10', MAX_ROOMS_PER_IP: '1' })
    expect((await create(clientFrom('203.0.113.7'))).ok).toBe(true)
    expect(await create(clientFrom('203.0.113.7'))).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('limits joins per address, which bounds room code guessing', async () => {
    await start({ BEHIND_TLS: 'true' })
    const guess = (client: Socket) =>
      emit(client, 'room:join', { roomCode: 'ZZZZZZ', playerName: 'Eve' })
    expect(await guess(clientFrom('203.0.113.7'))).toEqual({ ok: false, error: 'room_not_found' })
    expect(await guess(clientFrom('203.0.113.7'))).toEqual({ ok: false, error: 'room_not_found' })
    expect(await guess(clientFrom('203.0.113.7'))).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('limits voice join and mute, which fan out to the whole table', async () => {
    await start({ BEHIND_TLS: 'true' })
    const host = clientFrom('203.0.113.7')
    expect((await create(host)).ok).toBe(true)
    expect((await emit(host, 'voice:join', {})).ok).toBe(true)
    expect((await emit(host, 'voice:mute', { muted: true })).ok).toBe(true)
    expect(await emit(host, 'voice:mute', { muted: false })).toEqual({
      ok: false,
      error: 'rate_limited',
    })
  })
})
