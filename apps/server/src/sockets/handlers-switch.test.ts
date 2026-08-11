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

  /*
   * What this proves and what it does not: engine.io builds a deflate config only when
   * this option is present — it is absent from its defaults — so the option being set is
   * the difference between compression on and off, and it went out off while a comment
   * claimed otherwise. It does not prove a frame arrived smaller. Reading the negotiated
   * extension back off the live socket would, but only by reaching into socket.io-client
   * internals whose shape is undocumented and version-specific, and a test that breaks on
   * a patch bump costs more than this one buys.
   */
  it('is built with websocket compression enabled', () => {
    const options = (ioServer.engine as unknown as { opts: Record<string, unknown> }).opts
    expect(options.perMessageDeflate).toEqual({ threshold: 1024 })
  })

  it('refuses a burst of room creation', async () => {
    const player = newPlayer()
    const results = []
    for (let attempt = 0; attempt < 6; attempt += 1) results.push(await create(player))

    // The default bucket is three, and it refills far slower than a loop runs.
    const refused = results.filter((result) => !result.ok)
    expect(refused.length).toBeGreaterThan(0)
    expect(refused.every((result) => !result.ok && result.error === 'rate_limited')).toBe(true)
  }, 20_000)

  it('does not refill the create bucket by creating', async () => {
    const player = newPlayer()
    /* The trap this pins down: `release` forgets a socket's limiter buckets, and `attach`
       now calls `release` on every create. Forgetting the create bucket there would hand
       the socket a fresh allowance on each attempt and cancel the limit entirely, while
       every other test in this file still passed. */
    const results = []
    for (let attempt = 0; attempt < 8; attempt += 1) results.push(await create(player))
    expect(results.filter((result) => result.ok).length).toBeLessThanOrEqual(4)
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
    const seatOfBo = (): string | undefined =>
      host.lobbies[host.lobbies.length - 1]?.seats.find((seat) => seat.name === 'Bo')?.status
    await waitFor(() => seatOfBo() !== undefined, 'the host to see the guest')

    const moved = await create(guest, 'Bo')
    // Asserted, not assumed: a refused create performs no teardown, and this test would
    // then be measuring a stale broadcast rather than the seat being given up.
    expect(moved.ok).toBe(true)

    /*
     * The people still at the table have to be told, or the guest sits there as a ghost on
     * everyone's screen until something else refreshes it.
     *
     * Waiting on the seat's status rather than on the number of broadcasts received: under
     * load a lobby from the guest's own join can land after the count is sampled, which
     * satisfies a counter-based wait and then asserts against a view that predates the
     * teardown. That is how this test failed once in a full parallel run while passing
     * alone — the condition was a proxy for the one that mattered.
     */
    await waitFor(() => seatOfBo() === 'left', 'the host to be told the guest left')
    /* `left` and not `disconnected`: a seat given up is not one waiting out a grace
       period. It stays listed under its name so the table can say so. */
    expect(seatOfBo()).toBe('left')
  }, 20_000)
})
