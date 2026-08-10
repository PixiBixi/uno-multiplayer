import { createServer, type Server as HttpServer } from 'node:http'
import type { Move, TableRules } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type GameEvent, type PlayerView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * Seven-Zero over a real socket.
 *
 * The gap this closes is the one that has already shipped twice here: both ends of a
 * chain tested and the wire between them not. A 7 needs the extra field in the
 * engine's Move, a Zod variant that keeps it rather than dropping it, a room playing
 * with the option on, and a view carrying one move per target — miss any one and the
 * target picker is a dialog that cannot do anything.
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
    // A round played at machine speed outruns a budget sized for a person.
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
type PlayMove = Extract<Move, { type: 'play' }>

type Player = {
  socket: Socket
  view: () => PlayerView | null
  version: () => number
  events: GameEvent[]
}

const newPlayer = (): Player => {
  const socket = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  let latest: PlayerView | null = null
  let version = 0
  const events: GameEvent[] = []
  socket.on('game:view', (view: PlayerView) => {
    latest = view
    version += 1
  })
  socket.on('game:event', (event: GameEvent) => events.push(event))
  return { socket, view: () => latest, version: () => version, events }
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

/** Driving a round over real sockets needs far more than vitest's 5s default under
 *  full-suite contention, exactly as the property tests do. */
const SOCKET_ROUND_TIMEOUT_MS = 20_000

/** Three seats, so a 7 has more than one target and the picker has a real choice. */
const table = async (rules: TableRules) => {
  const host = newPlayer()
  const guest = newPlayer()
  const third = newPlayer()

  const created = await emit<CreateAck>(host, 'room:create', {
    playerName: 'Ana',
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
    rules,
  })
  if (!created.ok) throw new Error('room:create failed')
  await emit<PlainAck>(guest, 'room:join', { roomCode: created.roomCode, playerName: 'Ben' })
  await emit<PlainAck>(third, 'room:join', { roomCode: created.roomCode, playerName: 'Cleo' })
  await emit<PlainAck>(host, 'game:start', {})
  const players = [host, guest, third]
  await waitFor(() => players.every((player) => player.view() !== null), 'the first views')

  return { host, guest, third, players, code: created.roomCode }
}

const swapsOffered = (player: Player): PlayMove[] =>
  (player.view()?.you.legalMoves ?? []).filter(
    (move): move is PlayMove => move.type === 'play' && move.swapWith !== undefined,
  )

/** A 0 in this player's hand that the server says may be laid down. */
const zeroOffered = (player: Player): PlayMove | undefined => {
  const view = player.view()
  if (view === null) return undefined
  return view.you.legalMoves.find((move): move is PlayMove => {
    if (move.type !== 'play') return false
    const card = view.you.hand.find((held) => held.id === move.cardId)
    return card?.kind === 'number' && card.value === 0
  })
}

/**
 * Plays the round over the wire until the seat on turn is offered what `find` is
 * after, deliberately avoiding it in the meantime so it is still there to use.
 */
const playUntilOffered = async (
  players: Player[],
  find: (player: Player) => PlayMove | undefined,
): Promise<{ player: Player; move: PlayMove }> => {
  for (let turn = 0; turn < 400; turn += 1) {
    const view = players[0]?.view()
    if (view == null || view.phase === 'finished') {
      throw new Error('the round ended before the move was ever offered')
    }
    const onTurn = players.find((player) => player.view()?.you.seat === view.currentSeat)
    if (onTurn === undefined) throw new Error('no player holds the turn')

    const wanted = find(onTurn)
    if (wanted !== undefined) return { player: onTurn, move: wanted }

    const moves = onTurn.view()?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'play' && m.swapWith === undefined) ??
      moves.find((m) => m.type === 'acceptDraw') ??
      moves.find((m) => m.type === 'draw')
    if (move === undefined) throw new Error('the seat on turn had nothing to do')

    /* Both versions, not just the mover's: views of one move do not land at the
       same instant, and reading a stale one asks the wrong seat to play next. */
    const before = players.map((player) => player.version())
    const ack = await emit<PlainAck>(onTurn, 'game:move', { move })
    if (!ack.ok) throw new Error(`legal move rejected: ${ack.error}`)
    await waitFor(
      () => players.every((player, index) => player.version() > (before[index] ?? 0)),
      'every view after a move',
    )
  }
  throw new Error('nobody was ever offered the move')
}

describe('Seven-Zero on the wire', () => {
  it(
    'offers one play per target and swaps the two hands when one is chosen',
    async () => {
      const { players } = await table({
        liar: false,
        sevenZero: true,
        jumpIn: false,
        playDrawnCard: false,
      })
      const { player, move } = await playUntilOffered(players, (p) => swapsOffered(p)[0])

      // A second decision the server enumerated, exactly like a wild's colours.
      const options = swapsOffered(player).filter((option) => option.cardId === move.cardId)
      expect(options).toHaveLength(2)
      expect(options.map((option) => option.swapWith).sort()).toEqual(
        [0, 1, 2].filter((seat) => seat !== player.view()?.you.seat),
      )

      const target = players.find((p) => p.view()?.you.seat === move.swapWith)
      if (target === undefined) throw new Error('the target is not at this table')
      const mineBefore = (player.view()?.you.hand ?? []).map((card) => card.id)
      const theirsBefore = (target.view()?.you.hand ?? []).map((card) => card.id)
      const before = players.map((p) => p.version())

      expect(await emit<PlainAck>(player, 'game:move', { move })).toEqual({ ok: true })
      await waitFor(
        () => players.every((p, index) => p.version() > (before[index] ?? 0)),
        'every view after the swap',
      )

      // The hands really changed places over the wire, not merely in the room.
      expect((player.view()?.you.hand ?? []).map((card) => card.id)).toEqual(theirsBefore)
      expect((target.view()?.you.hand ?? []).map((card) => card.id)).toEqual(
        mineBefore.filter((id) => id !== move.cardId),
      )
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'tells the whole table whose hands moved, and calls it a swap rather than a draw',
    async () => {
      const { players } = await table({
        liar: false,
        sevenZero: true,
        jumpIn: false,
        playDrawnCard: false,
      })
      const { player, move } = await playUntilOffered(players, (p) => swapsOffered(p)[0])
      const seat = player.view()?.you.seat
      /* Only what this one move produced. Getting to a playable 7 legitimately
         involves drawing, so asserting on the whole feed would be asserting about the
         drive rather than about the swap. */
      const already = players.map((p) => p.events.length)

      expect(await emit<PlainAck>(player, 'game:move', { move })).toEqual({ ok: true })
      await waitFor(
        () => players.every((p) => p.events.some((event) => event.type === 'handsSwapped')),
        'the handsSwapped event at every seat',
      )

      for (const [index, each] of players.entries()) {
        const fresh = each.events.slice(already[index] ?? 0)
        expect(fresh).toContainEqual({ type: 'handsSwapped', seat, with: move.swapWith })
        // Hands moving is not a draw, and reporting one would be a lie about the
        // deck as well as a wrong entry in the statistics.
        expect(fresh.some((event) => event.type === 'cardsDrawn')).toBe(false)
        expect(fresh.some((event) => event.type === 'unoPenalty')).toBe(false)
      }
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'reports a 0 as every hand rotating, in the direction of play',
    async () => {
      const { players } = await table({
        liar: false,
        sevenZero: true,
        jumpIn: false,
        playDrawnCard: false,
      })
      const { player, move } = await playUntilOffered(players, zeroOffered)
      const held = players.map((p) => (p.view()?.you.hand ?? []).map((card) => card.id))
      // A 0 does not change the direction, so the one in play is where hands go.
      const direction = player.view()?.direction ?? 1

      expect(await emit<PlainAck>(player, 'game:move', { move })).toEqual({ ok: true })
      await waitFor(
        () => players.every((p) => p.events.some((event) => event.type === 'handsRotated')),
        'the handsRotated event at every seat',
      )
      for (const each of players) {
        expect(each.events).toContainEqual({ type: 'handsRotated', direction })
      }

      /* One seat along, whichever way play is going. Read from the view rather than
         assumed clockwise: the room's seed is not fixed here, so a reverse may well
         have turned the table round before the 0 was ever reached — and that is
         precisely the interaction worth not asserting away. */
      const size = players.length
      for (let index = 0; index < size; index += 1) {
        const next = players[(index + direction + size) % size]
        const expected = (held[index] ?? []).filter((id) => id !== move.cardId)
        expect((next?.view()?.you.hand ?? []).map((card) => card.id)).toEqual(expected)
      }
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses a swap with a seat the server never offered',
    async () => {
      /* Swapping with yourself is the clearest case: the card id is right and the
         target is not, which is precisely the pair that has to be compared. */
      const { players } = await table({
        liar: false,
        sevenZero: true,
        jumpIn: false,
        playDrawnCard: false,
      })
      const { player, move } = await playUntilOffered(players, (p) => swapsOffered(p)[0])
      const own = player.view()?.you.seat ?? 0

      expect(
        await emit<PlainAck>(player, 'game:move', {
          move: { type: 'play', cardId: move.cardId, swapWith: own },
        }),
      ).toEqual({ ok: false, error: 'illegal_move' })

      // And with no target at all, when the table offered two.
      expect(
        await emit<PlainAck>(player, 'game:move', {
          move: { type: 'play', cardId: move.cardId },
        }),
      ).toEqual({ ok: false, error: 'illegal_move' })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses a swap payload naming an impossible seat',
    async () => {
      const { host } = await table({
        liar: false,
        sevenZero: true,
        jumpIn: false,
        playDrawnCard: false,
      })
      const cardId = host.view()?.you.hand[0]?.id ?? 'nothing'
      expect(
        await emit<PlainAck>(host, 'game:move', { move: { type: 'play', cardId, swapWith: 99 } }),
      ).toEqual({ ok: false, error: 'invalid_payload' })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'never offers a swap on a table that did not ask for the option',
    async () => {
      const { players } = await table({
        liar: false,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      await expect(playUntilOffered(players, (p) => swapsOffered(p)[0])).rejects.toThrow(
        /ended before the move was ever offered|nobody was ever offered/,
      )
      for (const player of players) {
        expect(player.events.some((event) => event.type === 'handsSwapped')).toBe(false)
        expect(player.events.some((event) => event.type === 'handsRotated')).toBe(false)
      }
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )
})
