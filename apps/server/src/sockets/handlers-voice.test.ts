import { DEFAULT_MATCH_GOAL, type VoicePeer } from '@uno/protocol'
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
    TURN_URL: 'turn:turn.example.com:3478',
    TURN_SECRET: 'test-secret',
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

const once = <T>(client: Socket, event: string): Promise<T> =>
  new Promise((resolve) => client.once(event, resolve))

/**
 * Waits for a roster matching `predicate`. Not `once`: an ack resolves before the
 * broadcast that follows it, so a listener attached after an await would catch the
 * previous roster and assert against stale state.
 */
const rosterWhere = (
  client: Socket,
  predicate: (peers: VoicePeer[]) => boolean,
): Promise<VoicePeer[]> =>
  new Promise((resolve) => {
    const onPeers = (peers: VoicePeer[]): void => {
      if (!predicate(peers)) return
      client.off('voice:peers', onPeers)
      resolve(peers)
    }
    client.on('voice:peers', onPeers)
  })

type JoinVoiceAck =
  | { ok: true; iceServers: { urls: string[]; username?: string }[]; peers: VoicePeer[] }
  | { ok: false; error: string }
type PlainAck = { ok: true } | { ok: false; error: string }

/** Seats two players at one table and returns their sockets, seat 0 first. */
const seatTwo = async (): Promise<[Socket, Socket]> => {
  const host = newClient()
  const created = await emit<{ ok: true; roomCode: string } | { ok: false }>(host, 'room:create', {
    playerName: 'Ana',
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
  })
  if (!created.ok) throw new Error('room:create failed')
  const guest = newClient()
  const joined = await emit<PlainAck>(guest, 'room:join', {
    roomCode: created.roomCode,
    playerName: 'Bo',
  })
  if (!joined.ok) throw new Error('room:join failed')
  return [host, guest]
}

describe('voice signalling over sockets', () => {
  it('returns minted ice servers and an empty peer list to the first joiner', async () => {
    const [host] = await seatTwo()
    const ack = await emit<JoinVoiceAck>(host, 'voice:join', {})
    if (!ack.ok) throw new Error(ack.error)
    expect(ack.peers).toEqual([])
    expect(ack.iceServers[0]?.urls).toEqual(['turn:turn.example.com:3478'])
    expect(ack.iceServers[0]?.username).toMatch(/^\d+:[A-Z0-9]{6}$/)
  })

  it('tells the second joiner about the first', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    const ack = await emit<JoinVoiceAck>(guest, 'voice:join', {})
    if (!ack.ok) throw new Error(ack.error)
    expect(ack.peers).toEqual([{ seat: 0, muted: false }])
  })

  it('broadcasts the roster to everyone already in the session', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    const roster = rosterWhere(host, (peers) => peers.length === 2)
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    expect(await roster).toEqual([
      { seat: 0, muted: false },
      { seat: 1, muted: false },
    ])
  })

  it('relays a signal to the addressed seat, tagged with the sender', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const delivered = once<{ fromSeat: number; signal: { kind: string; sdp: string } }>(
      guest,
      'voice:signal',
    )
    const ack = await emit<PlainAck>(host, 'voice:signal', {
      toSeat: 1,
      signal: { kind: 'offer', sdp: 'v=0\r\n' },
    })
    expect(ack.ok).toBe(true)
    expect(await delivered).toEqual({ fromSeat: 0, signal: { kind: 'offer', sdp: 'v=0\r\n' } })
  })

  it('refuses to signal before joining', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const ack = await emit<PlainAck>(host, 'voice:signal', {
      toSeat: 1,
      signal: { kind: 'offer', sdp: 'v=0\r\n' },
    })
    expect(ack).toEqual({ ok: false, error: 'voice_not_joined' })
  })

  it('refuses to signal a seat that has not joined voice', async () => {
    const [host] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    const ack = await emit<PlainAck>(host, 'voice:signal', {
      toSeat: 1,
      signal: { kind: 'offer', sdp: 'v=0\r\n' },
    })
    expect(ack).toEqual({ ok: false, error: 'voice_peer_unavailable' })
  })

  it('rejects a malformed signal without disturbing the session', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const ack = await emit<PlainAck>(host, 'voice:signal', { toSeat: 1, signal: { kind: 'nope' } })
    expect(ack).toEqual({ ok: false, error: 'invalid_payload' })
  })

  it('broadcasts a mute to the room', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const roster = rosterWhere(guest, (peers) => peers.some((peer) => peer.muted))
    await emit<PlainAck>(host, 'voice:mute', { muted: true })
    expect(await roster).toEqual([
      { seat: 0, muted: true },
      { seat: 1, muted: false },
    ])
  })

  it('drops a seat from the roster when it leaves voice but stays at the table', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const roster = rosterWhere(guest, (peers) => peers.length === 1)
    await emit<PlainAck>(host, 'voice:leave', {})
    expect(await roster).toEqual([{ seat: 1, muted: false }])
  })

  it('drops a seat from the roster when its socket disconnects', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const roster = rosterWhere(guest, (peers) => peers.length === 1)
    host.disconnect()
    expect(await roster).toEqual([{ seat: 1, muted: false }])
  })

  it('refuses voice:join from a socket with no seat', async () => {
    const stranger = newClient()
    const ack = await emit<JoinVoiceAck>(stranger, 'voice:join', {})
    expect(ack).toEqual({ ok: false, error: 'room_not_found' })
  })
})
