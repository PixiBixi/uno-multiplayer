import { createServer, type Server as HttpServer } from 'node:http'
import { DEFAULT_TABLE_RULES, type TableRules } from '@uno/engine'
import {
  DEFAULT_MATCH_GOAL,
  MAX_POINTS_TARGET,
  MAX_ROUNDS,
  MAX_TURN_SECONDS,
  MIN_POINTS_TARGET,
  MIN_ROUNDS,
  MIN_TURN_SECONDS,
  type LobbyView,
  type PlayerView,
} from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * Configuring the table from the lobby, over a real socket.
 *
 * Driven through a connection rather than through the Room API, because that is where
 * this repository has lost two features already: both ends of a chain were tested and
 * the wire between them was not, and one socket handler was never registered at all.
 * A `room:configure` that reaches no `socket.on` is a switch that silently does
 * nothing, and every Room-level test would still pass.
 *
 * The other thing only a connection can show is who receives the result. A change that
 * refreshes the sender's own view satisfies a naive assertion and fails the feature: the
 * entire point of moving configuration into the lobby is the guest watching it happen.
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
type CreateAck = { ok: true; roomCode: string; sessionToken: string } | { ok: false }

type Player = {
  socket: Socket
  lobby: () => LobbyView | null
  lobbies: LobbyView[]
  views: PlayerView[]
}

const newPlayer = (): Player => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  const lobbies: LobbyView[] = []
  const views: PlayerView[] = []
  socket.on('room:state', (lobby: LobbyView) => lobbies.push(lobby))
  socket.on('game:view', (view: PlayerView) => views.push(view))
  return { socket, lobby: () => lobbies[lobbies.length - 1] ?? null, lobbies, views }
}

const emit = <T>(player: Player, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => player.socket.emit(event, payload, resolve))

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/** A host and a guest sitting in a lobby, nothing dealt. */
const lobby = async () => {
  const host = newPlayer()
  const guest = newPlayer()
  const created = await emit<CreateAck>(host, 'room:create', {
    playerName: 'Ana',
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
    rules: DEFAULT_TABLE_RULES,
  })
  if (!created.ok) throw new Error('room:create failed')
  const joined = await emit<{ ok: true; sessionToken: string } | { ok: false }>(
    guest,
    'room:join',
    { roomCode: created.roomCode, playerName: 'Ben' },
  )
  if (!joined.ok) throw new Error('room:join failed')
  await waitFor(
    () => host.lobby()?.seats.length === 2 && guest.lobby()?.seats.length === 2,
    'both lobby views',
  )
  return { host, guest, code: created.roomCode, guestToken: joined.sessionToken }
}

const ALL_ON: TableRules = { liar: true, sevenZero: true, jumpIn: true, playDrawnCard: false }

describe('room:configure over sockets', () => {
  it('is registered at all, which is the piece that has been forgotten here', async () => {
    /* A protocol type, a schema and a client emit with no `socket.on` behind them is a
       control that does nothing and reports nothing. socket.io answers an unknown event
       by never calling the ack, so this asserts an answer arrives. */
    const { host } = await lobby()
    expect(await emit<PlainAck>(host, 'room:configure', {})).toEqual({ ok: true })
  })

  it('reaches every member, not only the sender', async () => {
    const { host, guest } = await lobby()
    const before = { host: host.lobbies.length, guest: guest.lobbies.length }

    expect(await emit<PlainAck>(host, 'room:configure', { rules: ALL_ON })).toEqual({ ok: true })

    await waitFor(
      () => host.lobbies.length > before.host && guest.lobbies.length > before.guest,
      'a fresh room:state at both seats',
    )
    // The guest is the reason this feature exists: they must see the rules they are
    // about to play by, without touching anything.
    expect(guest.lobby()?.rules).toEqual(ALL_ON)
    expect(host.lobby()?.rules).toEqual(ALL_ON)
  })

  it('carries the goal and the pace to the guest too', async () => {
    const { host, guest } = await lobby()
    expect(
      await emit<PlainAck>(host, 'room:configure', {
        goal: { kind: 'rounds', count: 3 },
        pace: { turnSeconds: 20 },
      }),
    ).toEqual({ ok: true })

    await waitFor(() => guest.lobby()?.pace !== null, 'the pace at the guest')
    expect(guest.lobby()?.goal).toEqual({ kind: 'rounds', count: 3 })
    expect(guest.lobby()?.pace).toEqual({ turnSeconds: 20 })
  })

  it('refuses a guest, and the table does not move', async () => {
    const { host, guest } = await lobby()
    expect(await emit<PlainAck>(guest, 'room:configure', { rules: ALL_ON })).toEqual({
      ok: false,
      error: 'not_host',
    })
    // Not merely the ack: the room really was left alone, at both seats.
    expect(guest.lobby()?.rules).toEqual(DEFAULT_TABLE_RULES)
    expect(host.lobby()?.rules).toEqual(DEFAULT_TABLE_RULES)
  })

  it('refuses a client sitting at no table at all', async () => {
    const stranger = newPlayer()
    expect(await emit<PlainAck>(stranger, 'room:configure', { rules: ALL_ON })).toEqual({
      ok: false,
      error: 'room_not_found',
    })
    expect(stranger.socket.connected).toBe(true)
  })

  it('refuses a change once the match has been dealt', async () => {
    /* The guard is checked when the event is handled, never at render: a host can press
       Distribute and toggle a rule in the same breath, and whichever arrives second has
       to lose. Hiding the control client-side is presentation only. */
    const { host, guest } = await lobby()
    expect(await emit<PlainAck>(host, 'game:start', {})).toEqual({ ok: true })
    await waitFor(() => guest.views.length > 0, 'the first views')

    expect(await emit<PlainAck>(host, 'room:configure', { rules: ALL_ON })).toEqual({
      ok: false,
      error: 'game_already_started',
    })
    expect(host.lobby()?.rules).toEqual(DEFAULT_TABLE_RULES)
    expect(host.lobby()?.configurable).toBe(false)
  })

  it('refuses out-of-bounds values with exactly the bounds room:create refuses', async () => {
    const { host } = await lobby()
    const outOfBounds = [
      { goal: { kind: 'points', target: MIN_POINTS_TARGET - 1 } },
      { goal: { kind: 'points', target: MAX_POINTS_TARGET + 1 } },
      { goal: { kind: 'rounds', count: MIN_ROUNDS - 1 } },
      { goal: { kind: 'rounds', count: MAX_ROUNDS + 1 } },
      { pace: { turnSeconds: MIN_TURN_SECONDS - 1 } },
      { pace: { turnSeconds: MAX_TURN_SECONDS + 1 } },
      { rules: { jumpIn: 'yes' } },
      { goal: { kind: 'forever' } },
    ]
    for (const payload of outOfBounds) {
      expect(
        await emit<PlainAck>(host, 'room:configure', payload),
        JSON.stringify(payload),
      ).toEqual({ ok: false, error: 'invalid_payload' })
    }

    // And the values just inside those bounds are accepted, so the refusals above are
    // the bound biting rather than the whole field being rejected.
    for (const payload of [
      { goal: { kind: 'points', target: MIN_POINTS_TARGET } },
      { goal: { kind: 'rounds', count: MAX_ROUNDS } },
      { pace: { turnSeconds: MIN_TURN_SECONDS } },
      { pace: { turnSeconds: MAX_TURN_SECONDS } },
    ]) {
      expect(
        await emit<PlainAck>(host, 'room:configure', payload),
        JSON.stringify(payload),
      ).toEqual({ ok: true })
    }
  })

  it('leaves the fields a partial payload omits exactly as they were', async () => {
    const { host, guest } = await lobby()
    await emit<PlainAck>(host, 'room:configure', {
      goal: { kind: 'rounds', count: 5 },
      pace: { turnSeconds: 30 },
    })
    await waitFor(() => guest.lobby()?.pace !== null, 'the pace at the guest')

    await emit<PlainAck>(host, 'room:configure', { rules: { sevenZero: true } })
    await waitFor(() => guest.lobby()?.rules.sevenZero === true, 'the rule at the guest')

    const view = guest.lobby()
    expect(view?.goal).toEqual({ kind: 'rounds', count: 5 })
    expect(view?.pace).toEqual({ turnSeconds: 30 })
  })

  it('gives a rejoining player the rules as they now stand', async () => {
    /* No extra path for this: `room:state` carries the whole view, so a reconnection is
       already covered — which is worth asserting rather than assuming, since a client
       that rejoins into stale rules is a client playing a different game. */
    const { host, guest, code, guestToken } = await lobby()
    await emit<PlainAck>(host, 'room:configure', { rules: ALL_ON, pace: { turnSeconds: 9 } })
    await waitFor(() => guest.lobby()?.rules.jumpIn === true, 'the rules at the guest')

    guest.socket.disconnect()
    const returning = newPlayer()
    expect(
      await emit<PlainAck>(returning, 'room:rejoin', { roomCode: code, sessionToken: guestToken }),
    ).toEqual({ ok: true, seat: 1 })

    await waitFor(() => returning.lobby() !== null, 'the lobby view after rejoining')
    expect(returning.lobby()?.rules).toEqual(ALL_ON)
    expect(returning.lobby()?.pace).toEqual({ turnSeconds: 9 })
  })

  it('arms no clock: a pace chosen in the lobby deals nobody a deadline', async () => {
    /* Blazing is armed by RoomManager at the deal. A change that started a timer from the
       lobby would be counting down against a seat holding no cards, and the first thing
       anybody would see is a forced draw before the game began. */
    const { host, guest } = await lobby()
    await emit<PlainAck>(host, 'room:configure', { pace: { turnSeconds: 3 } })
    await waitFor(() => guest.lobby()?.pace !== null, 'the pace at the guest')

    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(host.views).toEqual([])
    expect(guest.views).toEqual([])
    expect(rooms.get(host.lobby()?.roomCode ?? '')?.phase).toBe('lobby')
  })

  it('really is the rules the round is dealt with, not a label on the view', async () => {
    /* The end of the chain: a rule switched on in the lobby has to reach `initGame`, or
       the lobby is showing a setting the engine never received. Seven-Zero is visible in
       a view — it puts a swap target on a 7 — so this reads it back off the wire. */
    const { host, guest } = await lobby()
    await emit<PlainAck>(host, 'room:configure', {
      rules: { sevenZero: true, playDrawnCard: false },
    })
    await waitFor(() => guest.lobby()?.rules.sevenZero === true, 'the rule at the guest')
    await emit<PlainAck>(host, 'game:start', {})
    await waitFor(() => host.views.length > 0 && guest.views.length > 0, 'the first views')

    const room = rooms.get(host.lobby()?.roomCode ?? '')
    expect(room?.lobbyView().rules).toEqual({
      liar: false,
      sevenZero: true,
      jumpIn: false,
      playDrawnCard: false,
    })
    /* Every seat is offered a `pass` on a table that plays the drawn card, and none on a
       table that does not — which is the second flag, read out of a real view. */
    const passes = [...host.views, ...guest.views].flatMap((view) =>
      view.you.legalMoves.filter((move) => move.type === 'pass'),
    )
    expect(passes).toEqual([])
  })
})
