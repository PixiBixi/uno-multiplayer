import { DEFAULT_MATCH_GOAL } from '@uno/protocol'
import { createServer, type Server as HttpServer } from 'node:http'
import type { PlayerView } from '@uno/protocol'
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
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', GRACE_PERIOD_MS: '80' })
  httpServer = createServer()
  ioServer = registerSocketHandlers(
    httpServer,
    new RoomManager({ maxRooms: 10, gracePeriodMs: config.gracePeriodMs }),
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

const nextView = (client: Socket): Promise<PlayerView> =>
  new Promise((resolve) => client.once('game:view', resolve))

type CreateAck = { ok: true; roomCode: string; sessionToken: string; seat: number } | { ok: false }
type JoinAck = { ok: true; sessionToken: string; seat: number } | { ok: false; error: string }
type PlainAck = { ok: true } | { ok: false; error: string }

const createRoom = async (client: Socket, name = 'Ana') => {
  const ack = await emit<CreateAck>(client, 'room:create', {
    playerName: name,
    goal: DEFAULT_MATCH_GOAL,
  })
  if (!ack.ok) throw new Error('room:create failed')
  return ack
}

describe('room lifecycle over sockets', () => {
  it('creates a room and returns a code, token and seat', async () => {
    const ack = await createRoom(newClient())
    expect(ack.roomCode).toHaveLength(6)
    expect(ack.seat).toBe(0)
    expect(ack.sessionToken).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects an invalid payload without dropping the connection', async () => {
    const client = newClient()
    expect(
      await emit<PlainAck>(client, 'room:create', { playerName: '', goal: DEFAULT_MATCH_GOAL }),
    ).toEqual({
      ok: false,
      error: 'invalid_payload',
    })
    expect(client.connected).toBe(true)
  })

  it('rejects a chat message from a client that never joined', async () => {
    const client = newClient()
    expect(await emit<PlainAck>(client, 'chat:send', { text: 'hello' })).toEqual({
      ok: false,
      error: 'room_not_found',
    })
    expect(client.connected).toBe(true)
  })

  it('reports an unknown room code', async () => {
    expect(
      await emit<JoinAck>(newClient(), 'room:join', { roomCode: 'ZZZZZZ', playerName: 'Ben' }),
    ).toEqual({ ok: false, error: 'room_not_found' })
  })

  it('refuses a fifth player', async () => {
    const created = await createRoom(newClient())
    for (const name of ['Ben', 'Cleo', 'Dan']) {
      await emit<JoinAck>(newClient(), 'room:join', {
        roomCode: created.roomCode,
        playerName: name,
      })
    }
    expect(
      await emit<JoinAck>(newClient(), 'room:join', {
        roomCode: created.roomCode,
        playerName: 'Eve',
      }),
    ).toEqual({ ok: false, error: 'room_full' })
  })
})

describe('playing over sockets', () => {
  const table = async (playerCount: number) => {
    const host = newClient()
    const created = await createRoom(host, 'P0')
    const others: Socket[] = []
    for (let i = 1; i < playerCount; i++) {
      const client = newClient()
      await emit<JoinAck>(client, 'room:join', {
        roomCode: created.roomCode,
        playerName: `P${i}`,
      })
      others.push(client)
    }
    return { host, others, roomCode: created.roomCode, token: created.sessionToken }
  }

  it('refuses to start when a non-host asks', async () => {
    const { others } = await table(3)
    const guest = others[0]
    if (guest === undefined) throw new Error('expected a guest')
    expect(await emit<PlainAck>(guest, 'game:start', {})).toEqual({ ok: false, error: 'not_host' })
  })

  it('deals a private view to every seat on start', async () => {
    const { host, others } = await table(3)
    const views = Promise.all([host, ...others].map(nextView))
    await emit<PlainAck>(host, 'game:start', {})
    const dealt = await views

    for (const view of dealt) expect(view.you.hand).toHaveLength(7)
    expect(dealt[0]?.you.seat).toBe(0)
    expect(dealt[1]?.you.seat).toBe(1)
  })

  it('never sends a seat the cards of another seat', async () => {
    const { host, others } = await table(3)
    const views = Promise.all([host, ...others].map(nextView))
    await emit<PlainAck>(host, 'game:start', {})
    const dealt = await views

    const hostView = dealt[0]
    const guestView = dealt[1]
    if (hostView === undefined || guestView === undefined) throw new Error('missing views')
    const serialisedHostView = JSON.stringify(hostView)
    for (const card of guestView.you.hand) {
      expect(serialisedHostView).not.toContain(card.id)
    }
  })

  it('refuses a move from a seat whose turn it is not', async () => {
    const { host, others } = await table(3)
    const dealt = nextView(host)
    await emit<PlainAck>(host, 'game:start', {})
    await dealt
    const guest = others[0]
    if (guest === undefined) throw new Error('expected a guest')
    expect(await emit<PlainAck>(guest, 'game:move', { move: { type: 'draw' } })).toEqual({
      ok: false,
      error: 'not_your_turn',
    })
  })

  it('applies a legal move and pushes a fresh view to everyone', async () => {
    const { host, others } = await table(3)
    const dealt = Promise.all([host, ...others].map(nextView))
    await emit<PlainAck>(host, 'game:start', {})
    const first = await dealt
    const move = first[0]?.you.legalMoves[0]
    if (move === undefined) throw new Error('expected a legal move')

    const updated = Promise.all([host, ...others].map(nextView))
    expect(await emit<PlainAck>(host, 'game:move', { move })).toEqual({ ok: true })
    const after = await updated
    expect(after[0]?.currentSeat).not.toBe(0)
  })

  it('rejects a malformed move payload', async () => {
    const { host } = await table(2)
    const dealt = nextView(host)
    await emit<PlainAck>(host, 'game:start', {})
    await dealt
    expect(await emit<PlainAck>(host, 'game:move', { move: { type: 'teleport' } })).toEqual({
      ok: false,
      error: 'invalid_payload',
    })
  })

  it('relays a chat message to the table', async () => {
    const { host, others } = await table(2)
    const guest = others[0]
    if (guest === undefined) throw new Error('expected a guest')
    const received = new Promise((resolve) => guest.once('chat:message', resolve))
    await emit<PlainAck>(host, 'chat:send', { text: 'good luck' })
    expect(await received).toEqual({ seat: 0, name: 'P0', text: 'good luck' })
  })
})

describe('reconnection over sockets', () => {
  it('restores the exact hand when rejoining within the grace period', async () => {
    const host = newClient()
    const created = await createRoom(host)
    const guest = newClient()
    const joined = await emit<JoinAck>(guest, 'room:join', {
      roomCode: created.roomCode,
      playerName: 'Ben',
    })
    if (!joined.ok) throw new Error('join failed')

    const dealt = nextView(guest)
    await emit<PlainAck>(host, 'game:start', {})
    const handBefore = (await dealt).you.hand

    guest.disconnect()
    const returning = newClient()
    // Listen before emitting: the handler broadcasts the view immediately after
    // the ack, so a listener registered afterwards would miss it.
    const restored = nextView(returning)
    const ack = await emit<PlainAck>(returning, 'room:rejoin', {
      roomCode: created.roomCode,
      sessionToken: joined.sessionToken,
    })
    expect(ack.ok).toBe(true)
    expect((await restored).you.hand).toEqual(handBefore)
  })

  it('refuses a rejoin with an unknown token', async () => {
    const created = await createRoom(newClient())
    expect(
      await emit<PlainAck>(newClient(), 'room:rejoin', {
        roomCode: created.roomCode,
        sessionToken: '11111111-2222-4333-8444-555555555555',
      }),
    ).toEqual({ ok: false, error: 'invalid_session' })
  })

  it('gives the seat away once the grace period has elapsed', async () => {
    const host = newClient()
    const created = await createRoom(host)
    const guest = newClient()
    const joined = await emit<JoinAck>(guest, 'room:join', {
      roomCode: created.roomCode,
      playerName: 'Ben',
    })
    if (!joined.ok) throw new Error('join failed')

    guest.disconnect()
    // GRACE_PERIOD_MS is 80ms in these tests; wait comfortably past it.
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(
      await emit<PlainAck>(newClient(), 'room:rejoin', {
        roomCode: created.roomCode,
        sessionToken: joined.sessionToken,
      }),
    ).toEqual({ ok: false, error: 'invalid_session' })
  })
})

describe('rate limiting', () => {
  it('starts refusing a client that floods chat', async () => {
    const host = newClient()
    await createRoom(host)

    const results: PlainAck[] = []
    for (let i = 0; i < 20; i++) {
      results.push(await emit<PlainAck>(host, 'chat:send', { text: `spam ${i}` }))
    }
    expect(results.some((r) => !r.ok && r.error === 'rate_limited')).toBe(true)
    expect(host.connected).toBe(true)
  })
})
