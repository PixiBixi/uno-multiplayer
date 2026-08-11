import { createServer, type Server as HttpServer } from 'node:http'
import { DEFAULT_MATCH_GOAL, type LobbyView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * One socket moving between tables.
 *
 * `attach()` recorded the new presence and nothing else, so the table a socket walked
 * away from kept that socket's id on a seat for ever. `Room.disconnect` finds a member
 * BY SOCKET ID, and the `disconnect` handler only ever sees the socket's CURRENT
 * presence — so the abandoned seat was never released, `isEmpty()` stayed false, and
 * `purge()` could not reclaim the room for the lifetime of the process.
 *
 * Two ways that hurts, both asserted below: rooms accumulate against MAX_ROOMS until
 * creation is refused outright, and a table with a clock keeps firing timeouts against
 * a game nobody is playing.
 *
 * Driven over real sockets on purpose. The bug lives in the wiring between the handler
 * and the room, which is exactly the seam Room-level tests cannot see.
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

type CreateAck = { ok: true; roomCode: string; sessionToken: string } | { ok: false; error: string }
type JoinAck = { ok: true; sessionToken: string; seat: number } | { ok: false; error: string }

const newPlayer = () => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  const lobbies: LobbyView[] = []
  socket.on('room:state', (lobby: LobbyView) => lobbies.push(lobby))
  return { socket, lobbies }
}

type Player = ReturnType<typeof newPlayer>

const emit = <T>(player: Player, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => player.socket.emit(event, payload, resolve))

const create = (player: Player, name = 'Ana'): Promise<CreateAck> =>
  emit<CreateAck>(player, 'room:create', {
    playerName: name,
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
    rules: {},
  })

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${label}`)
}

describe('a socket that moves to another table', () => {
  it('releases the seat it walked away from', async () => {
    const player = newPlayer()
    const first = await create(player)
    if (!first.ok) throw new Error('expected the first room')
    const second = await create(player)
    if (!second.ok) throw new Error('expected the second room')
    expect(second.roomCode).not.toBe(first.roomCode)

    const abandoned = rooms.get(first.roomCode)
    expect(abandoned).not.toBeNull()
    // The seat must be gone, not merely disconnected: nobody is coming back to it, and a
    // seat held by a dead socket id is one no purge can ever reclaim.
    expect(abandoned?.isEmpty()).toBe(true)
  }, 20_000)

  it('lets the abandoned room be purged once the socket is gone', async () => {
    const player = newPlayer()
    const first = await create(player)
    if (!first.ok) throw new Error('expected the first room')
    await create(player)

    player.socket.disconnect()
    await waitFor(() => rooms.get(first.roomCode)?.isEmpty() === true, 'the first room to empty')
    // Twice: the first pass records when the room became empty, the second reclaims it
    // once the grace window has passed.
    rooms.purge()
    await new Promise((resolve) => setTimeout(resolve, 120))
    rooms.purge()
    expect(rooms.get(first.roomCode)).toBeNull()
  }, 20_000)

  it('does not fill MAX_ROOMS from a single socket', async () => {
    const player = newPlayer()
    const codes: string[] = []
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const created = await create(player)
      if (created.ok) codes.push(created.roomCode)
    }
    // Every create but the last abandons its predecessor, so at most one room should be
    // occupied — never ten. Before the fix this reached the ceiling and stayed there.
    const resident = codes.filter((code) => rooms.get(code)?.isEmpty() === false)
    expect(resident).toHaveLength(1)
  }, 20_000)

  it('keeps the seat when the socket re-attaches to the room it is already in', async () => {
    const host = newPlayer()
    const created = await create(host)
    if (!created.ok) throw new Error('expected a room')

    // Rejoining the table you are already sitting at must not hand your own seat back:
    // the teardown has to be scoped to a DIFFERENT room, or reconnection eats the seat
    // it was meant to restore.
    const rejoined = await emit<JoinAck>(host, 'room:rejoin', {
      roomCode: created.roomCode,
      sessionToken: created.sessionToken,
    })
    expect(rejoined.ok).toBe(true)
    expect(rooms.get(created.roomCode)?.isEmpty()).toBe(false)
  }, 20_000)

  it('tells the table someone left, rather than leaving a ghost on it', async () => {
    const host = newPlayer()
    const created = await create(host)
    if (!created.ok) throw new Error('expected a room')

    const guest = newPlayer()
    const joined = await emit<JoinAck>(guest, 'room:join', {
      roomCode: created.roomCode,
      playerName: 'Bo',
    })
    expect(joined.ok).toBe(true)
    await waitFor(() => host.lobbies.length > 0, 'the host to see the guest')

    const before = host.lobbies.length
    await create(guest, 'Bo')

    // The people still at the table have to be told, or the guest sits there as a ghost
    // on everyone's screen until something else happens to refresh it.
    await waitFor(() => host.lobbies.length > before, 'the host to be told the guest left')
    const latest = host.lobbies[host.lobbies.length - 1]
    /* Asserted on the status, not on the name disappearing: a departed seat stays listed
       so the table can show "Bo left" rather than silently renumbering everyone. What
       must change is that the seat is no longer active — `left`, and not `disconnected`,
       because a seat given up is not one waiting out a grace period. */
    expect(latest?.seats.find((seat) => seat.name === 'Bo')?.status).toBe('left')
  }, 20_000)
})
