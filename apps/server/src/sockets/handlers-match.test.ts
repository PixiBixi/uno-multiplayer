import { createServer, type Server as HttpServer } from 'node:http'
import type { MatchGoal } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type MatchPace, type PlayerView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * The gap this file closes. Room.viewFor was tested directly and GameOver was
 * tested with a match handed to it, but nothing asserted that the view actually
 * arriving over the wire carries one — so a client crashing on `match.winners`
 * being undefined was not something any test could have caught.
 */

let httpServer: HttpServer
let ioServer: ReturnType<typeof registerSocketHandlers>
let rooms: RoomManager
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    // A round played at machine speed outruns a budget sized for a person. The
    // limiter is exercised by its own tests rather than by this file.
    MOVE_BURST: '5000',
    MOVE_PER_SECOND: '5000',
  })
  rooms = new RoomManager({ maxRooms: 10, gracePeriodMs: 20 })
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

type Player = { socket: Socket; view: () => PlayerView | null; version: () => number }

const newPlayer = (): Player => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  let latest: PlayerView | null = null
  let version = 0
  socket.on('game:view', (view: PlayerView) => {
    latest = view
    version += 1
  })
  return { socket, view: () => latest, version: () => version }
}

const emit = <T>(player: Player, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => player.socket.emit(event, payload, resolve))

const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/**
 * Plays a two-player round to a real finish by driving whichever seat holds the
 * turn, over its own socket, using its own server-issued `legalMoves` — the same
 * property test-helpers.ts's playOut relies on, just over the wire instead of the
 * in-process Room API.
 */
const playRoundToCompletion = async (playerA: Player, playerB: Player): Promise<void> => {
  for (let turn = 0; turn < 800; turn += 1) {
    const view = playerA.view()
    if (view === null || view.phase === 'finished') return
    const onTurn = view.currentSeat === view.you.seat ? playerA : playerB
    const moves = onTurn.view()?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) return
    /* Both versions, not just the mover's. A move broadcasts a new view to every
       player, but they do not land at the same instant — waiting only on the
       mover leaves the other view stale, so the next iteration reads an old
       currentSeat, asks the wrong seat to move, finds no legal moves and quietly
       gives up mid-round. */
    const before = [playerA.version(), playerB.version()] as const
    const ack = await emit<PlainAck>(onTurn, 'game:move', { move })
    if (!ack.ok) throw new Error(`legal move rejected: ${ack.error}`)
    await waitFor(
      () => playerA.version() > before[0] && playerB.version() > before[1],
      'both views after a move',
    )
  }
}

const table = async (goal: MatchGoal = DEFAULT_MATCH_GOAL, pace: MatchPace = null) => {
  const host = newPlayer()
  const guest = newPlayer()

  const created = await emit<CreateAck>(host, 'room:create', { playerName: 'Ana', goal, pace })
  if (!created.ok) throw new Error('room:create failed')
  await emit<PlainAck>(guest, 'room:join', { roomCode: created.roomCode, playerName: 'Ben' })
  await emit<PlainAck>(host, 'game:start', {})
  await waitFor(() => host.view() !== null && guest.view() !== null, 'the first views')

  return { host, guest, code: created.roomCode }
}

describe('the view on the wire always carries the match', () => {
  it('does so from the very first view of a points match', async () => {
    const { host, guest } = await table({ kind: 'points', target: 500 })

    for (const player of [host, guest]) {
      const match = player.view()?.match
      expect(match).toBeDefined()
      expect(match?.goal).toEqual({ kind: 'points', target: 500 })
      expect(match?.scores).toEqual([0, 0])
      expect(match?.round).toBe(1)
      expect(match?.winners).toBeNull()
    }
  })

  it('does so in rounds mode too', async () => {
    const { host } = await table({ kind: 'rounds', count: 3 })
    expect(host.view()?.match.goal).toEqual({ kind: 'rounds', count: 3 })
  })

  it('does so on the finished view, which is the one GameOver reads', async () => {
    /* Reached by a player leaving rather than by playing a round out: it ends the
       round deterministically and in milliseconds, and it lands on exactly the
       state the crashing component renders. */
    const { host, guest } = await table({ kind: 'rounds', count: 3 })
    guest.socket.disconnect()

    await waitFor(() => host.view()?.phase === 'finished', 'the round to end')

    const view = host.view()
    expect(view?.match).toBeDefined()
    expect(view?.match.scores).toHaveLength(2)
    // An aborted round pays nothing out, and ends the match.
    expect(view?.match.scores).toEqual([0, 0])
    expect(view?.match.winners).not.toBeUndefined()
  })
})

describe('game:nextRound over sockets', () => {
  /*
   * The bug this section closes. Room.nextRound() was tested directly and it
   * worked; the client emits 'game:nextRound' and it looked wired up; but no
   * socket.on('game:nextRound', ...) handler existed on the server at all. The
   * button did nothing because nobody was listening — a gap symmetric to the
   * missing-match one above, and just as invisible to a test that never goes
   * through the socket.
   */
  it('deals a fresh round and pushes it to every remaining player', async () => {
    /* Played to a real finish rather than ended by a disconnect: disconnecting
       the only other player leaves nobody active to deal a next round to, which
       would mask this test behind too_few_players instead of exercising it. */
    const { host, guest } = await table({ kind: 'rounds', count: 3 })
    await playRoundToCompletion(host, guest)
    await waitFor(() => host.view()?.phase === 'finished', 'the round to end')
    expect(host.view()?.match.winners).toBeNull() // the match, not just the round
    const roundBefore = host.view()?.match.round

    const before = [host.version(), guest.version()] as const
    const result = await emit<PlainAck>(host, 'game:nextRound', {})
    expect(result).toEqual({ ok: true })

    /* Waiting on BOTH views, not just the host's. Asserting as soon as one has
       arrived reads the other's view of the round that just ended — where the
       player who went out holds an empty hand, which looks exactly like a deal
       that never happened. */
    await waitFor(
      () => host.version() > before[0] && guest.version() > before[1],
      'both views of the next round',
    )
    for (const player of [host, guest]) {
      expect(player.view()?.you.hand).toHaveLength(7)
      expect(player.view()?.match.round).toBe(roundBefore)
    }
  })

  it('refuses while the round is still being played', async () => {
    const { host } = await table({ kind: 'rounds', count: 3 })
    expect(await emit<PlainAck>(host, 'game:nextRound', {})).toEqual({
      ok: false,
      error: 'round_in_progress',
    })
  })

  it('refuses from a guest', async () => {
    /* The guest has to still be connected to ask, so the round is played out
       rather than ended by disconnecting them — emitting on a closed socket just
       hangs waiting for an ack that will never come. */
    const { host, guest } = await table({ kind: 'rounds', count: 3 })
    await playRoundToCompletion(host, guest)
    await waitFor(() => host.view()?.phase === 'finished', 'the round to end')

    expect(await emit<PlainAck>(guest, 'game:nextRound', {})).toEqual({
      ok: false,
      error: 'not_host',
    })
  })

  it('refuses once the match itself is over', async () => {
    const { host, guest } = await table({ kind: 'rounds', count: 1 })
    guest.socket.disconnect()
    await waitFor(() => host.view()?.phase === 'finished', 'the round to end')
    expect(host.view()?.match.winners).not.toBeNull()

    expect(await emit<PlainAck>(host, 'game:nextRound', {})).toEqual({
      ok: false,
      error: 'match_over',
    })
  })
})

describe('every field GameOver reads is present on the wire', () => {
  it('never lands on a view whose match is undefined', async () => {
    const { host, guest } = await table({ kind: 'rounds', count: 2 })

    const seen: (PlayerView['match'] | undefined)[] = []
    host.socket.on('game:view', (view: PlayerView) => seen.push(view.match))

    guest.socket.disconnect()
    await waitFor(() => host.view()?.phase === 'finished', 'the round to end')

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((match) => match !== undefined)).toBe(true)
  })
})
