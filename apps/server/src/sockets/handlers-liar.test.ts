import { createServer, type Server as HttpServer } from 'node:http'
import { UNO_PENALTY, type Move, type TableRules } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type GameEvent, type PlayerView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * The Liar call-out over a real socket.
 *
 * The gap this file closes is the one that has already shipped twice here: both
 * ends of a chain tested, and the wire between them not. A new move needs the type
 * in the engine, a Zod variant at the boundary, a room that plays with the option
 * on, and a view that offers the move - miss any one and the "Liar!" button is a
 * button that does nothing.
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

/**
 * Three players, not two. At two seats the only player who could accuse is always
 * the one on turn - the seat that just played down to one card hands the turn
 * straight to them - so a two-player table cannot exercise the one thing that makes
 * this move unlike every other: being legal off turn.
 */
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

const callOutOffered = (player: Player): Extract<Move, { type: 'callOut' }> | undefined =>
  player
    .view()
    ?.you.legalMoves.find(
      (move): move is Extract<Move, { type: 'callOut' }> => move.type === 'callOut',
    )

/** True when this player may accuse somebody while somebody else is on turn. */
const watching = (player: Player): boolean => {
  const view = player.view()
  if (view == null || view.currentSeat === view.you.seat) return false
  return callOutOffered(player) !== undefined
}

/**
 * Plays the round over the wire until a player who is NOT on turn is offered a
 * call-out, deliberately never calling UNO - a table where everybody remembers
 * gives this rule nothing to do.
 */
const playUntilOffered = async (players: Player[]): Promise<Player> => {
  for (let turn = 0; turn < 400; turn += 1) {
    const watcher = players.find(watching)
    if (watcher !== undefined) return watcher

    const view = players[0]?.view()
    if (view == null || view.phase === 'finished') {
      throw new Error('the round ended before anybody forgot to call UNO')
    }
    const onTurn = players.find((player) => player.view()?.you.seat === view.currentSeat)
    if (onTurn === undefined) throw new Error('no player holds the turn')

    const moves = onTurn.view()?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'play') ??
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
  throw new Error('nobody ever went down to one card')
}

describe('the Liar call-out on the wire', () => {
  it(
    'is offered to the seat that is not on turn, and accepted from it',
    async () => {
      const { players } = await table({
        liar: true,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      const caller = await playUntilOffered(players)

      const move = callOutOffered(caller)
      expect(move).toBeDefined()
      if (move === undefined) return
      // The whole point of the rule: the accuser is not the seat on turn.
      expect(caller.view()?.currentSeat).not.toBe(caller.view()?.you.seat)

      const target = players.find((player) => player.view()?.you.seat === move.target)
      if (target === undefined) throw new Error('the target is not at this table')
      const targetHeld = target.view()?.you.hand.length ?? 0
      const callerHeld = caller.view()?.you.hand.length ?? 0
      const before = players.map((player) => player.version())

      expect(await emit<PlainAck>(caller, 'game:move', { move })).toEqual({ ok: true })
      await waitFor(
        () => players.every((player, index) => player.version() > (before[index] ?? 0)),
        'every view after the call-out',
      )

      // The penalty landed on the target, and the accuser paid nothing.
      expect(target.view()?.you.hand).toHaveLength(targetHeld + UNO_PENALTY)
      expect(caller.view()?.you.hand).toHaveLength(callerHeld)
      // And the window is shut, so the button goes away.
      expect(callOutOffered(caller)).toBeUndefined()
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'tells the whole table who called whom',
    async () => {
      const { players } = await table({
        liar: true,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      const caller = await playUntilOffered(players)
      const move = callOutOffered(caller)
      if (move === undefined) throw new Error('no call-out was offered')
      const callerSeat = caller.view()?.you.seat

      expect(await emit<PlainAck>(caller, 'game:move', { move })).toEqual({ ok: true })
      await waitFor(
        () => players.every((player) => player.events.some((e) => e.type === 'calledOut')),
        'the calledOut event at every seat',
      )

      for (const player of players) {
        expect(player.events).toContainEqual({
          type: 'calledOut',
          by: callerSeat,
          target: move.target,
        })
        // The cards themselves still arrive as a forgotten-UNO penalty.
        expect(player.events).toContainEqual({
          type: 'unoPenalty',
          seat: move.target,
          count: UNO_PENALTY,
        })
      }
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses a call-out against a seat that is not holding one card uncalled',
    async () => {
      const { host, guest } = await table({
        liar: true,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      const targetSeat = guest.view()?.you.seat ?? 1
      expect(callOutOffered(host)).toBeUndefined()

      expect(
        await emit<PlainAck>(host, 'game:move', { move: { type: 'callOut', target: targetSeat } }),
      ).toEqual({ ok: false, error: 'illegal_move' })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses a call-out payload naming an impossible seat',
    async () => {
      const { host } = await table({
        liar: true,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      expect(
        await emit<PlainAck>(host, 'game:move', { move: { type: 'callOut', target: 99 } }),
      ).toEqual({ ok: false, error: 'invalid_payload' })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'lets the exposed seat call UNO off turn, and the accusation dies with it',
    async () => {
      /* The escape has to be reachable exactly when the accusation is: the window
         opens as the exposed seat's own turn ends, so every moment it is accusable
         belongs to somebody else. Offered on its own next turn only, the button the
         table could see had no counterpart at the seat it threatened. */
      const { players } = await table({
        liar: true,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      const caller = await playUntilOffered(players)
      const move = callOutOffered(caller)
      if (move === undefined) throw new Error('no call-out was offered')
      const exposed = players.find((player) => player.view()?.you.seat === move.target)
      if (exposed === undefined) throw new Error('the target is not at this table')

      const view = exposed.view()
      expect(view?.currentSeat).not.toBe(view?.you.seat)
      expect(view?.you.legalMoves).toContainEqual({ type: 'callUno' })

      const held = view?.you.hand.length ?? 0
      const before = players.map((player) => player.version())
      expect(await emit<PlainAck>(exposed, 'game:move', { move: { type: 'callUno' } })).toEqual({
        ok: true,
      })
      await waitFor(
        () => players.every((player, index) => player.version() > (before[index] ?? 0)),
        'every view after the late UNO',
      )

      // Nothing was drawn, and the accusation is no longer on offer to anybody.
      expect(exposed.view()?.you.hand).toHaveLength(held)
      for (const player of players) expect(callOutOffered(player)).toBeUndefined()
      expect(await emit<PlainAck>(caller, 'game:move', { move })).toEqual({
        ok: false,
        error: 'illegal_move',
      })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'never offers one on a table that did not ask for the option',
    async () => {
      /* A plain table played the same way: the penalty is charged automatically, so
         no seat is ever left open to an accusation and no button ever appears. */
      const { host, players } = await table({
        liar: false,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      await expect(playUntilOffered(players)).rejects.toThrow(
        /ended before anybody forgot|nobody ever went down/,
      )
      expect(host.events.some((event) => event.type === 'unoPenalty')).toBe(true)
      expect(host.events.some((event) => event.type === 'calledOut')).toBe(false)
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )
})
