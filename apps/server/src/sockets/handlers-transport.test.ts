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
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGIN: 'https://play.example.com',
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

const clientWith = (transport: 'websocket' | 'polling', origin?: string): Socket => {
  const client = connect(url, {
    transports: [transport],
    forceNew: true,
    reconnection: false,
    ...(origin === undefined ? {} : { extraHeaders: { Origin: origin } }),
  })
  clients.push(client)
  return client
}

/** Resolves 'connected' or 'refused', whichever the handshake ends in. */
const handshake = (client: Socket): Promise<'connected' | 'refused'> =>
  new Promise((resolve) => {
    client.once('connect', () => resolve('connected'))
    client.once('connect_error', () => resolve('refused'))
  })

describe('the handshake Origin check', () => {
  for (const transport of ['websocket', 'polling'] as const) {
    describe(`over ${transport}`, () => {
      it('accepts a client that sends no Origin', async () => {
        expect(await handshake(clientWith(transport))).toBe('connected')
      })

      it('accepts a page served by this host', async () => {
        expect(await handshake(clientWith(transport, url))).toBe('connected')
      })

      it('accepts an origin on CORS_ORIGIN', async () => {
        const client = clientWith(transport, 'https://play.example.com')
        expect(await handshake(client)).toBe('connected')
      })

      /* A WebSocket upgrade is not subject to CORS at all, so without this any page on
         the internet could open a socket from a player's browser. */
      it('refuses a page on another site', async () => {
        expect(await handshake(clientWith(transport, 'https://evil.example'))).toBe('refused')
      })
    })
  }
})

describe('the message size cap', () => {
  it('drops a client that sends a frame far beyond any legitimate payload', async () => {
    const client = clientWith('websocket')
    expect(await handshake(client)).toBe('connected')

    const dropped = new Promise<string>((resolve) => client.once('disconnect', resolve))
    client.emit('chat:send', { text: 'x'.repeat(100_000) }, () => undefined)
    expect(await dropped).toBe('transport close')
  })
})
