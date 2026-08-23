import { createServer, type Server as HttpServer } from 'node:http'
import type { Move, TableRules } from '@uno/engine'
import { DEFAULT_MATCH_GOAL, type GameEvent, type PlayerView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

/*
 * Jump-in over a real socket.
 *
 * The gap this closes is the one that has already shipped twice here: both ends of a
 * chain tested and the wire between them not. A jump-in needs the engine's off-turn
 * exemption, a room that plays with the option on, a `game:move` handler that trusts
 * the socket's own seat rather than the seat on turn, and a view that carries a play
 * to somebody who is not holding the turn. Miss any one and the card is simply not
 * clickable, with nothing failing anywhere.
 *
 * It is also the only place the race can be driven: two moves arriving for one card,
 * with the server the only thing deciding which of them happened.
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

/**
 * Three seats, so a jumper is not simply the next player anyway.
 *
 * The goal is a parameter because the drives want opposite things from it: hunting a
 * jump-in wants as many rounds as it takes, while proving one is never offered has to
 * stop, and a 500-point match is a long way to walk to reach a foregone conclusion.
 */
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

/**
 * A play offered to somebody who is not holding the turn - which on a jump-in table
 * is a jump-in, and can be nothing else: the only other off-turn move is a call-out,
 * and that is a different type.
 */
const jumpOffered = (players: Player[]): { player: Player; move: PlayMove } | undefined => {
  const current = players[0]?.view()?.currentSeat
  for (const player of players) {
    const view = player.view()
    if (view === null || view.you.seat === current) continue
    const move = view.you.legalMoves.find((m): m is PlayMove => m.type === 'play')
    if (move !== undefined) return { player, move }
  }
  return undefined
}

/**
 * Plays over the wire until somebody off turn is offered a jump-in.
 *
 * Unlike the Seven-Zero drive, this one cannot play "around" the move it is hunting:
 * the chance to jump exists only while a particular card is on top, and the seat on
 * turn playing would bury it. So the check happens after every single move.
 *
 * And it deals further rounds rather than giving up at the end of one. The room's
 * seed is drawn at random per test, and whether the twin of a card ever reaches a
 * hand at a moment somebody can use it is a property of the deal - one round is not
 * reliably enough, and a test that fails on an unlucky shuffle is a test nobody can
 * read. Several rounds of a points match is plenty.
 */
const playUntilJumpable = async (
  players: Player[],
  host: Player,
): Promise<{ player: Player; move: PlayMove }> => {
  for (let turn = 0; turn < 1200; turn += 1) {
    const view = players[0]?.view()
    if (view == null) throw new Error('no view at all')

    if (view.phase === 'finished') {
      if (view.match.winners !== null) throw new Error('the match ended with no jump-in offered')
      const before = players.map((player) => player.version())
      const dealt = await emit<PlainAck>(host, 'game:nextRound', {})
      if (!dealt.ok) throw new Error(`could not deal another round: ${dealt.error}`)
      await waitFor(
        () => players.every((player, index) => player.version() > (before[index] ?? 0)),
        'every view after a fresh deal',
      )
      continue
    }

    const jump = jumpOffered(players)
    if (jump !== undefined) return jump

    const mover = onTurn(players)
    const moves = mover.view()?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'callUno') ??
      moves.find((m) => m.type === 'play' && m.swapWith === undefined) ??
      moves.find((m) => m.type === 'acceptDraw') ??
      moves.find((m) => m.type === 'draw')
    if (move === undefined) throw new Error('the seat on turn had nothing to do')

    /* Both versions, not just the mover's: views of one move do not land at the same
       instant, and reading a stale one asks the wrong seat to play next. */
    const before = players.map((player) => player.version())
    const ack = await emit<PlainAck>(mover, 'game:move', { move })
    if (!ack.ok) throw new Error(`legal move rejected: ${ack.error}`)
    await waitFor(
      () => players.every((player, index) => player.version() > (before[index] ?? 0)),
      'every view after a move',
    )
  }
  throw new Error('nobody was ever offered a jump-in')
}

const JUMP: TableRules = { liar: false, sevenZero: false, jumpIn: true, playDrawnCard: false }

describe('jump-in on the wire', () => {
  it(
    'lets a seat whose turn it is not lay the identical card down, and play carries on from them',
    async () => {
      const { players, host } = await table(JUMP)
      const { player, move } = await playUntilJumpable(players, host)
      const seat = player.view()?.you.seat
      const held = (player.view()?.you.hand ?? []).map((card) => card.id)
      const before = players.map((p) => p.version())

      expect(await emit<PlainAck>(player, 'game:move', { move })).toEqual({ ok: true })
      await waitFor(
        () => players.every((p, index) => p.version() > (before[index] ?? 0)),
        'every view after the jump-in',
      )

      // The card really left that hand and really landed on top, over the wire.
      const after = (player.view()?.you.hand ?? []).map((card) => card.id)
      expect(after).not.toContain(move.cardId)
      expect(player.view()?.discardTop.id).toBe(move.cardId)
      for (const kept of held.filter((id) => id !== move.cardId)) expect(after).toContain(kept)
      /* One card fewer, or one MORE: a jumper is offered no `callUno`, so a jump-in
         that lands on a single card is an uncalled UNO and costs the two the automatic
         penalty always costs. Which of the two happened depends on the deal, and both
         are correct. */
      expect([held.length - 1, held.length + 1]).toContain(after.length)

      /* And every seat agrees about whose turn it is now, which is the part a client
         cannot work out for itself. */
      const current = player.view()?.currentSeat
      for (const each of players) expect(each.view()?.currentSeat).toBe(current)

      /* Deliberately NOT asserting the turn left the jumper. That held on almost
         every seed and then failed on Node 24 with "expected 2 not to be 2",
         because it was never a rule: the jumped card's own effect applies from the
         jumper's seat, so a skip - or a reverse at two players, which acts as one -
         legitimately hands the turn straight back to them.

         What IS always true is that the jumper's turn happened and was spent, which
         the discard top and the changed hand above already prove. So the claim
         checked here is the one a client depends on and cannot derive: the whole
         table agrees on who plays next. */
      // Whoever it is must be able to play: an active seat at this table.
      const active = [
        ...(player.view()?.opponents ?? []).filter((o) => o.status === 'active').map((o) => o.seat),
        seat,
      ]
      expect(active).toContain(current)
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'tells the whole table that somebody jumped in, beside the card itself',
    async () => {
      const { players, host } = await table(JUMP)
      const { player, move } = await playUntilJumpable(players, host)
      const seat = player.view()?.you.seat
      /* Only what this one move produced: reaching a jumpable top legitimately
         involves ordinary play, so asserting on the whole feed would be asserting
         about the drive. */
      const already = players.map((p) => p.events.length)

      expect(await emit<PlainAck>(player, 'game:move', { move })).toEqual({ ok: true })
      await waitFor(
        () => players.every((p) => p.events.some((event) => event.type === 'jumpedIn')),
        'the jumpedIn event at every seat',
      )

      for (const [index, each] of players.entries()) {
        const fresh = each.events.slice(already[index] ?? 0)
        expect(fresh[0]).toEqual({ type: 'jumpedIn', seat })
        expect(fresh[1]).toMatchObject({ type: 'cardPlayed', seat })
      }
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'applies the first of two jump-ins for the same card and refuses the second',
    async () => {
      /* The race, as it can actually happen. Two seats cannot hold a jump-in against
         the same top - a card has exactly one twin in a UNO deck, so it is in one
         place only - but the same seat can ask twice: a double tap, an impatient
         retry, a flaky connection replaying a move. Both are sent without waiting for
         the first to come back, and the server is the only thing that decides. */
      const { players, host } = await table(JUMP)
      const { player, move } = await playUntilJumpable(players, host)

      const acks = await Promise.all([
        emit<PlainAck>(player, 'game:move', { move }),
        emit<PlainAck>(player, 'game:move', { move }),
      ])
      expect(acks).toEqual([{ ok: true }, { ok: false, error: 'illegal_move' }])
      // One card left the hand, not two, and the pile says so.
      expect(player.view()?.discardTop.id).toBe(move.cardId)
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses a jump-in claimed by a seat that does not hold the card',
    async () => {
      /* The other half of the same race: two clients emitting the same jump-in. Only
         one of them is holding the card, and the server neither knows nor cares which
         client believes it should win. */
      const { players, host } = await table(JUMP)
      const { player, move } = await playUntilJumpable(players, host)
      const impostor = players.find((p) => p !== player && p !== onTurn(players))
      if (impostor === undefined) throw new Error('no third seat to impersonate with')

      const acks = await Promise.all([
        emit<PlainAck>(player, 'game:move', { move }),
        emit<PlainAck>(impostor, 'game:move', { move }),
      ])
      expect(acks.filter((ack) => ack.ok)).toHaveLength(1)
      expect(acks[0]).toEqual({ ok: true })
      expect(acks[1]).toEqual({ ok: false, error: 'illegal_move' })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'stays consistent when a jump-in and the turn holder’s own play arrive together',
    async () => {
      /* Nothing here asserts who wins: that is the point. The server applies whichever
         it reads first, and what has to hold afterwards is that the table agrees - one
         top, one set of hands, one turn - however the two landed. */
      const { players, host } = await table(JUMP)
      const { player, move } = await playUntilJumpable(players, host)
      const mover = onTurn(players)
      /* Whatever the seat on turn was about to do. A play if it has one, otherwise a
         draw - the race is between two moves arriving at once, and it does not matter
         which move the loser was making. */
      const theirs = (mover.view()?.you.legalMoves ?? []).find(
        (m) =>
          (m.type === 'play' && m.swapWith === undefined) ||
          m.type === 'draw' ||
          m.type === 'acceptDraw',
      )
      if (theirs === undefined) throw new Error('the seat on turn had nothing to do')

      const acks = await Promise.all([
        emit<PlainAck>(player, 'game:move', { move }),
        emit<PlainAck>(mover, 'game:move', { move: theirs }),
      ])
      expect(acks.some((ack) => ack.ok)).toBe(true)
      for (const ack of acks) {
        if (!ack.ok) expect(['illegal_move', 'not_your_turn']).toContain(ack.error)
      }

      /* Eventually, and not immediately: a move broadcasts to everybody but the views
         do not land at the same instant, so reading one and comparing it with another
         is a race of the test's own making. What must hold is that they converge. */
      await waitFor(() => {
        const first = players[0]?.view()
        if (first == null) return false
        return players.every(
          (p) =>
            p.view()?.discardTop.id === first.discardTop.id &&
            p.view()?.currentSeat === first.currentSeat,
        )
      }, 'every seat to agree about the top card and the turn')

      /* And the jumper's own view agrees with the answer it was given: the card is
         gone if the server took it and still in hand if it did not. Either outcome is
         correct - which one happened is the server's to decide and nobody else's. */
      const stillHeld = (player.view()?.you.hand ?? []).some((card) => card.id === move.cardId)
      expect(stillHeld).toBe(!acks[0]?.ok)
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'never offers a jump-in while a draw is pending',
    async () => {
      /* Checked over the wire because the view is what the client obeys. A stacked
         +2/+4 has strict same-type answer rules of its own, and a jump-in interleaved
         with them would make "strictly same type" mean nothing. */
      const { players } = await table(JUMP)
      let stacked = 0
      for (let turn = 0; turn < 400 && stacked < 3; turn += 1) {
        const view = players[0]?.view()
        if (view == null || view.phase === 'finished') break

        if (view.pendingDraw !== null) {
          stacked += 1
          for (const each of players) {
            if (each.view()?.you.seat === view.currentSeat) continue
            expect(each.view()?.you.legalMoves.filter((m) => m.type === 'play')).toEqual([])
          }
        }

        const mover = onTurn(players)
        const moves = mover.view()?.you.legalMoves ?? []
        const move =
          moves.find((m) => m.type === 'play' && m.swapWith === undefined) ??
          moves.find((m) => m.type === 'acceptDraw') ??
          moves.find((m) => m.type === 'draw') ??
          moves[0]
        if (move === undefined) break
        const before = players.map((p) => p.version())
        const ack = await emit<PlainAck>(mover, 'game:move', { move })
        if (!ack.ok) throw new Error(`legal move rejected: ${ack.error}`)
        await waitFor(
          () => players.every((p, index) => p.version() > (before[index] ?? 0)),
          'every view after a move',
        )
      }
      // The drive has to have reached the state it claims to be testing.
      expect(stacked).toBeGreaterThan(0)
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'never offers an off-turn play on a table that did not ask for the option',
    async () => {
      const { players, host } = await table(
        { liar: false, sevenZero: false, jumpIn: false, playDrawnCard: false },
        {
          kind: 'rounds',
          count: 2,
        },
      )
      await expect(playUntilJumpable(players, host)).rejects.toThrow(
        /the match ended with no jump-in offered|nobody was ever offered/,
      )
      for (const player of players) {
        expect(player.events.some((event) => event.type === 'jumpedIn')).toBe(false)
      }
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )

  it(
    'refuses an off-turn play as not that seat’s turn without the option',
    async () => {
      const { players } = await table({
        liar: false,
        sevenZero: false,
        jumpIn: false,
        playDrawnCard: false,
      })
      const waiting = players.find((p) => p !== onTurn(players))
      const cardId = waiting?.view()?.you.hand[0]?.id
      if (waiting === undefined || cardId === undefined) throw new Error('no waiting seat')
      expect(
        await emit<PlainAck>(waiting, 'game:move', { move: { type: 'play', cardId } }),
      ).toEqual({ ok: false, error: 'not_your_turn' })
    },
    SOCKET_ROUND_TIMEOUT_MS,
  )
})
