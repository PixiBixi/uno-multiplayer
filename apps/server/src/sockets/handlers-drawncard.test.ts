import { createServer, type Server as HttpServer } from 'node:http'
import { DEFAULT_TABLE_RULES, type Move, type TableRules } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type GameEvent, type PlayerView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * Playing the card you just drew, over a real socket.
 *
 * The gap this closes is the one that has shipped twice here: both ends of a chain
 * tested and the wire between them not. Ending a turn needs a `pass` in the engine's
 * `Move` union, a branch in the Zod discriminated union, a `game:move` handler that
 * accepts it, and a client that emits it — and the schema is exactly the piece that gets
 * forgotten, which would leave the button answering `invalid_payload` and the turn
 * unable to end at all.
 *
 * It is also the only place the drawn card can be shown to be a real card on the wire:
 * drawn over one connection, laid down over the same one, and seen by everybody else.
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

/** Driving a round over real sockets needs far more than vitest's 5s default under full
 *  suite contention, exactly as the property tests do. */
const SOCKET_ROUND_TIMEOUT_MS = 20_000

const table = async (rules: TableRules, goal = DEFAULT_MATCH_GOAL) => {
  const host = newPlayer()
  const guest = newPlayer()
  const third = newPlayer()

  const created = await emit<CreateAck>(host, 'room:create', {
    playerName: 'Ana',
    goal,
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

const onTurn = (players: Player[]): Player => {
  const seat = players[0]?.view()?.currentSeat
  const found = players.find((player) => player.view()?.you.seat === seat)
  if (found === undefined) throw new Error('no player holds the turn')
  return found
}

const send = async (players: Player[], mover: Player, move: Move): Promise<void> => {
  /* Every version, not just the mover's: views of one move do not land at the same
     instant, and reading a stale one asks the wrong seat to play next. */
  const before = players.map((player) => player.version())
  const ack = await emit<PlainAck>(mover, 'game:move', { move })
  if (!ack.ok) throw new Error(`legal move rejected: ${ack.error}`)
  await waitFor(
    () => players.every((player, index) => player.version() > (before[index] ?? 0)),
    'every view after a move',
  )
}

/**
 * Draws over the wire until the card that arrives is playable, dealing further rounds
 * rather than giving up at the end of one.
 *
 * The room's seed is random per test and whether a drawn card is playable is a property
 * of the deal, so a drive that gave up after one round would fail on an unlucky shuffle —
 * which is the flake the jump-in drive was written to avoid.
 *
 * Drawing on every turn rather than playing is deliberate: the state being hunted exists
 * only after a voluntary draw, so a drive that played its cards would rarely reach it.
 */
const drawUntilDeciding = async (players: Player[], host: Player, limit = 600): Promise<Player> => {
  for (let turn = 0; turn < limit; turn += 1) {
    const view = players[0]?.view()
    if (view == null) throw new Error('no view at all')

    if (view.phase === 'finished') {
      if (view.match.winners !== null) throw new Error('the match ended with no playable draw')
      const before = players.map((player) => player.version())
      const dealt = await emit<PlainAck>(host, 'game:nextRound', {})
      if (!dealt.ok) throw new Error(`could not deal another round: ${dealt.error}`)
      await waitFor(
        () => players.every((player, index) => player.version() > (before[index] ?? 0)),
        'every view after a fresh deal',
      )
      continue
    }

    const mover = onTurn(players)
    const moves = mover.view()?.you.legalMoves ?? []
    if (moves.some((move) => move.type === 'pass')) return mover

    const move =
      moves.find((m) => m.type === 'draw') ??
      moves.find((m) => m.type === 'acceptDraw') ??
      moves.find((m) => m.type === 'play' && m.swapWith === undefined)
    if (move === undefined) throw new Error('the seat on turn had nothing to do')
    await send(players, mover, move)
  }
  throw new Error('no drawn card was ever playable')
}

describe('the drawn card on the wire', () => {
  it(
    'draws a playable card and lays it down over the same connection',
    async () => {
      const { players, host } = await table(DEFAULT_TABLE_RULES)
      const mover = await drawUntilDeciding(players, host)
      const seat = mover.view()?.you.seat
      const held = (mover.view()?.you.hand ?? []).map((card) => card.id)

      /* Exactly one card is offered, and it is the one in hand. The whole hand being
         offered would make drawing a free extra turn, and the view is where a client
         would learn to believe it. */
      const plays = (mover.view()?.you.legalMoves ?? []).filter(
        (move): move is PlayMove => move.type === 'play',
      )
      expect(new Set(plays.map((move) => move.cardId)).size).toBe(1)
      const move = plays[0]
      if (move === undefined) throw new Error('no play offered in the sub-state')
      expect(held).toContain(move.cardId)
      // The turn has not moved, which is the part a client cannot work out for itself.
      for (const each of players) expect(each.view()?.currentSeat).toBe(seat)

      await send(players, mover, move)

      // The card really left that hand and really landed on top, over the wire.
      const after = (mover.view()?.you.hand ?? []).map((card) => card.id)
      expect(after).not.toContain(move.cardId)
      expect(mover.view()?.discardTop.id).toBe(move.cardId)
      for (const each of players) expect(each.view()?.discardTop.id).toBe(move.cardId)
      expect(mover.view()?.you.legalMoves.some((m) => m.type === 'pass')).toBe(false)
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'ends the turn on a pass, and tells the whole table it happened',
    async () => {
      /* The `pass` move end to end: the type, the Zod branch, the handler and the emit.
         Without the schema the ack is `invalid_payload` and the turn cannot be ended at
         all, which is the failure mode this file exists for. */
      const { players, host } = await table(DEFAULT_TABLE_RULES)
      const mover = await drawUntilDeciding(players, host)
      const seat = mover.view()?.you.seat
      const held = (mover.view()?.you.hand ?? []).map((card) => card.id)
      const already = players.map((player) => player.events.length)

      expect(await emit<PlainAck>(mover, 'game:move', { move: { type: 'pass' } })).toEqual({
        ok: true,
      })
      await waitFor(
        () => players.every((player) => player.events.some((event) => event.type === 'turnPassed')),
        'the turnPassed event at every seat',
      )

      for (const [index, each] of players.entries()) {
        expect(each.events.slice(already[index] ?? 0)[0]).toEqual({ type: 'turnPassed', seat })
      }
      // The card stays: passing declines to play it, not to hold it.
      expect((mover.view()?.you.hand ?? []).map((card) => card.id)).toEqual(held)
      await waitFor(() => {
        const first = players[0]?.view()
        if (first == null) return false
        return (
          first.currentSeat !== seat &&
          players.every((p) => p.view()?.currentSeat === first.currentSeat)
        )
      }, 'every seat to agree the turn moved on')
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses a pass sent twice, and one sent by a seat that is not on turn',
    async () => {
      /* The race as it can actually happen: a double tap, an impatient retry, a flaky
         connection replaying the move. The server is the only thing that decides. */
      const { players, host } = await table(DEFAULT_TABLE_RULES)
      const mover = await drawUntilDeciding(players, host)
      const waiting = players.find((player) => player !== mover)
      if (waiting === undefined) throw new Error('no other seat')

      expect(await emit<PlainAck>(waiting, 'game:move', { move: { type: 'pass' } })).toEqual({
        ok: false,
        error: 'not_your_turn',
      })

      const acks = await Promise.all([
        emit<PlainAck>(mover, 'game:move', { move: { type: 'pass' } }),
        emit<PlainAck>(mover, 'game:move', { move: { type: 'pass' } }),
      ])
      expect(acks[0]).toEqual({ ok: true })
      expect(acks[1]?.ok).toBe(false)
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses a play of any other card while the drawn one is on offer',
    async () => {
      /* Checked over the wire because the view is what the client obeys, and because a
         client is free to send whatever it likes: the seat may only lay down the card it
         drew, and the gate refusing the rest is the server's alone. */
      const { players, host } = await table(DEFAULT_TABLE_RULES)
      const mover = await drawUntilDeciding(players, host)
      const offered = (mover.view()?.you.legalMoves ?? []).find(
        (move): move is PlayMove => move.type === 'play',
      )
      const other = (mover.view()?.you.hand ?? []).find((card) => card.id !== offered?.cardId)
      if (other === undefined) throw new Error('the seat held only the card it drew')

      expect(
        await emit<PlainAck>(mover, 'game:move', {
          move: { type: 'play', cardId: other.id, chosenColor: 'R' },
        }),
      ).toEqual({ ok: false, error: 'illegal_move' })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'never offers a pass on a table that switched the rule off',
    async () => {
      const { players, host } = await table(
        { liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false },
        { kind: 'rounds', count: 2 },
      )
      /* A shorter drive than the ones above: this one is walking to a foregone
         conclusion, and 200 turns of drawing on every single turn is already far more
         playable draws than a table sees in a match. */
      await expect(drawUntilDeciding(players, host, 200)).rejects.toThrow(
        /the match ended with no playable draw|no drawn card was ever playable/,
      )
      for (const player of players) {
        expect(player.events.some((event) => event.type === 'turnPassed')).toBe(false)
        // The drive has to have actually drawn, or it proves nothing about draws.
        expect(player.events.filter((event) => event.type === 'cardsDrawn').length).toBeGreaterThan(
          20,
        )
      }
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )
})
