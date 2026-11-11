import type { BotLevel, DelayKind, MatchGoal, ReactionKind, TableRules } from '@uno/engine'
import { randomInt } from 'node:crypto'
import {
  DEFAULT_TABLE_RULES,
  err,
  ok,
  sampleDelayMs,
  type DeckSeed,
  type Result,
} from '@uno/engine'
import {
  ABSENT_TURN_GRACE_MS,
  BETWEEN_ROUNDS_SECONDS,
  UNO_GRACE_SECONDS,
  MIN_SEATS,
  type ErrorCode,
  type GameEvent,
  type MatchPace,
} from '@uno/protocol'
import { logger } from '../logger.js'
import { randomDealSeed } from './deal-seed.js'
import { generateRoomCode } from './room-code.js'
import { Room } from './room.js'

export type Timers = {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

type RoomManagerOptions = {
  maxRooms: number
  /** Rooms one owner (a client IP) may hold at once. Unlimited when omitted. */
  maxRoomsPerOwner?: number
  gracePeriodMs: number
  timers?: Timers
  seedSource?: () => DeckSeed
  /** Injectable for the same reason the timers are: tests must not wait. */
  now?: () => number
  /** Multiplies every bot delay and the absent grace; below 1 only to speed up e2e. */
  botDelayFactor?: number
  /** Seed of the delay stream, separate from the rooms' so timing never shifts a bot's choice. */
  delaySeed?: number
}

/** A bot never plays closer than this to its turn clock, so it never times out. */
const CLOCK_MARGIN_MS = 1000

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/**
 * The room directory, and the only place in the server that owns timers. They
 * sit behind an injectable interface so tests never wait on real time.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly graceTimers = new Map<string, unknown>()
  /** The seat a clock was armed for, so a presence change can tell it is still that turn. */
  private readonly turnTimers = new Map<string, { handle: unknown; seat: number | null }>()
  private readonly roundTimers = new Map<string, unknown>()
  /** With the seat it was armed for, so a presence change can tell it is the same window. */
  private readonly unoTimers = new Map<string, { handle: unknown; seat: number | null }>()
  /** The bot or absent-grace timer of the seat on turn; seat and controller tell keepBot it is the same one. */
  private readonly botTimers = new Map<
    string,
    { handle: unknown; seat: number; controller: 'bot' | 'absent' }
  >()
  /** Per room, one entry per open reaction window; a null handle is a window already acted on. */
  private readonly reactionTimers = new Map<string, Map<string, unknown>>()
  /** When the running turn clock expires, so a bot's delay can be capped below it. */
  private readonly turnDeadlines = new Map<string, number>()
  /** When a room last became empty, so purge can tell "gone" from "gone for good". */
  private readonly emptySince = new Map<string, number>()
  /** Told the code of each purged room, so the socket layer can drop what it keeps per room. */
  private readonly purgeListeners: ((code: string) => void)[] = []
  private readonly maxRooms: number
  private readonly maxRoomsPerOwner: number
  /** Who created each room, and how many each owner holds, until the room is purged. */
  private readonly ownerOf = new Map<string, string>()
  private readonly ownedCount = new Map<string, number>()
  private readonly gracePeriodMs: number
  private readonly timers: Timers
  private readonly seedSource: () => DeckSeed
  private readonly now: () => number
  private readonly botDelayFactor: number
  private delayRng: number

  constructor(options: RoomManagerOptions) {
    this.maxRooms = options.maxRooms
    this.maxRoomsPerOwner = options.maxRoomsPerOwner ?? Number.POSITIVE_INFINITY
    this.gracePeriodMs = options.gracePeriodMs
    this.timers = options.timers ?? defaultTimers
    this.seedSource = options.seedSource ?? randomDealSeed
    this.now = options.now ?? (() => Date.now())
    this.botDelayFactor = options.botDelayFactor ?? 1
    this.delayRng = options.delaySeed ?? randomInt(2 ** 31 - 1)
  }

  get size(): number {
    return this.rooms.size
  }

  create(
    goal: MatchGoal,
    pace: MatchPace = null,
    rules: TableRules = DEFAULT_TABLE_RULES,
    owner: string | null = null,
  ): Result<Room, ErrorCode> {
    if (this.rooms.size >= this.maxRooms) return err('server_full')
    const owned = owner === null ? 0 : (this.ownedCount.get(owner) ?? 0)
    if (owned >= this.maxRoomsPerOwner) return err('rate_limited')

    // Retry on the astronomically unlikely collision rather than overwrite.
    let code = generateRoomCode()
    for (let attempt = 0; this.rooms.has(code) && attempt < 10; attempt++) {
      code = generateRoomCode()
    }
    if (this.rooms.has(code)) return err('server_full')

    const room = new Room(code, this.seedSource(), goal, pace, rules)
    this.rooms.set(code, room)
    if (owner !== null) {
      this.ownerOf.set(code, owner)
      this.ownedCount.set(owner, owned + 1)
    }
    return ok(room)
  }

  /** The seed source, so a restart can draw one without owning randomness. */
  nextSeed(): DeckSeed {
    return this.seedSource()
  }

  get(code: string): Room | null {
    return this.rooms.get(code.toUpperCase()) ?? null
  }

  onPurge(listener: (code: string) => void): void {
    this.purgeListeners.push(listener)
  }

  scheduleGrace(room: Room, seat: number, onExpire: (events: GameEvent[]) => void): void {
    this.cancelGrace(room, seat)
    const key = graceKey(room.code, seat)
    const handle = this.timers.setTimeout(() => {
      this.graceTimers.delete(key)
      onExpire(room.expireGrace(seat))
    }, this.gracePeriodMs)
    this.graceTimers.set(key, handle)
  }

  cancelGrace(room: Room, seat: number): void {
    const key = graceKey(room.code, seat)
    const handle = this.graceTimers.get(key)
    if (handle === undefined) return
    this.timers.clearTimeout(handle)
    this.graceTimers.delete(key)
  }

  /**
   * Re-arms the clock for whoever is now on turn, and writes the deadline into the
   * room so every view agrees on it.
   *
   * Called after anything that can change whose turn it is. Idempotent by design:
   * arming twice for the same turn simply restarts it, which is what a re-deal
   * wants. A reconnection does not, and goes through keepTurn instead.
   */
  armTurn(room: Room, onExpire: (events: GameEvent[]) => void): void {
    /* One exception to the idempotence above: a voluntary draw on a table that plays the
       drawn card does not end the turn, so restarting the clock for it would hand the seat
       a fresh allowance for having drawn. The countdown keeps running through the
       decision, which is what the player watching it expects.

       Only while a timer is really live. After one has fired the map no longer holds it,
       so a forced draw that lands in the sub-state still arms a fresh clock - and has to,
       or the deadline would sit in the past and nothing would ever fire against that seat
       again. */
    if (room.decidingOnDrawnCard && this.turnTimers.has(room.code)) return

    this.cancelTurn(room)

    const seconds = room.turnSeconds
    /* Connected humans, not just awaitingMove: with nobody attached the table stops, and
       bots count as active, so they would otherwise keep the clock forcing draws for ever. */
    if (seconds === null || !room.awaitingMove || room.connectedHumanCount() === 0) {
      room.setTurnDeadline(null)
      return
    }

    const deadline = this.now() + seconds * 1000
    room.setTurnDeadline(deadline)
    this.turnDeadlines.set(room.code, deadline)
    const handle = this.timers.setTimeout(() => {
      this.turnTimers.delete(room.code)
      this.turnDeadlines.delete(room.code)
      /* Deliberately does NOT re-arm itself. The caller re-times the room before
         it broadcasts, so exactly one place decides when a clock starts and the
         deadline in the views being sent already belongs to the next seat. */
      onExpire(room.forceTurnMove())
    }, seconds * 1000)
    this.turnTimers.set(room.code, { handle, seat: room.currentSeat })
  }

  /**
   * armTurn for a presence change - a rejoin, a disconnect, a grace expiring - where
   * no move was made. Keeps the running clock while the seat on turn is the one it was
   * armed for: re-arming there let that seat stall the table by re-emitting a rejoin.
   */
  keepTurn(room: Room, onExpire: (events: GameEvent[]) => void): void {
    const armed = this.turnTimers.get(room.code)
    const sameTurn = armed !== undefined && armed.seat === room.currentSeat
    if (sameTurn && room.awaitingMove && room.connectedHumanCount() > 0) return
    this.armTurn(room, onExpire)
  }

  /** armNextRound for a presence change: a rejoin loop must not hold the next deal back. */
  keepNextRound(room: Room, onExpire: (events: GameEvent[]) => void): void {
    const running = this.roundTimers.has(room.code)
    const due =
      room.turnSeconds !== null &&
      room.betweenRounds &&
      room.seatedCount() >= MIN_SEATS &&
      room.connectedHumanCount() > 0
    if (running && due) return
    this.armNextRound(room, onExpire)
  }

  /** armUnoGrace for a presence change: a rejoin loop must not keep an exposed seat safe. */
  keepUnoGrace(room: Room, onExpire: (events: GameEvent[]) => void): void {
    const armed = this.unoTimers.get(room.code)
    if (
      armed !== undefined &&
      !room.callOutsAllowed &&
      armed.seat === room.exposedSeat() &&
      room.connectedHumanCount() > 0
    ) {
      return
    }
    this.armUnoGrace(room, onExpire)
  }

  cancelTurn(room: Room): void {
    const armed = this.turnTimers.get(room.code)
    if (armed !== undefined) {
      this.timers.clearTimeout(armed.handle)
      this.turnTimers.delete(room.code)
    }
    this.turnDeadlines.delete(room.code)
    room.setTurnDeadline(null)
  }

  /**
   * Times the seat on turn when a bot plays it: human-paced bot timing, or the absent
   * grace before a stand-in first takes over. Arms nothing while no human is connected.
   */
  armBot(room: Room, onEvents: (events: GameEvent[]) => void): void {
    this.cancelBot(room)
    if (room.connectedHumanCount() === 0) return
    const controller = room.turnController()
    const seat = room.currentSeat
    if (controller === null || seat === null) return

    const scaled =
      controller === 'absent'
        ? ABSENT_TURN_GRACE_MS * this.botDelayFactor
        : this.sampleDelay(room.levelFor(seat) ?? 'normal', 'turn')
    const handle = this.timers.setTimeout(
      () => {
        this.botTimers.delete(room.code)
        this.guarded(room, 'bot turn timer threw', () => {
          let events: GameEvent[]
          try {
            events = room.botStep()
          } catch (error) {
            // A policy bug must not stall the seat: the clock's own fallback plays it instead.
            logger.error({ err: error, room: room.code, seat }, 'bot step threw, forcing the turn')
            // botStep sets standIn before choosing a move, so the takeover happened anyway.
            const tookOver: GameEvent[] =
              controller === 'absent' && room.isBotControlled(seat)
                ? [{ type: 'botTookOver', seat }]
                : []
            events = [...tookOver, ...room.forceTurnMove()]
          }
          // Nothing happened, so nothing is retimed: a retime restarts the human's clock.
          if (events.length > 0) onEvents(events)
        })
      },
      this.belowClock(room, scaled),
    )
    this.botTimers.set(room.code, { handle, seat, controller })
  }

  /** armBot, except the pending move survives while it still times the same seat and controller. */
  keepBot(room: Room, onEvents: (events: GameEvent[]) => void): void {
    const armed = this.botTimers.get(room.code)
    if (
      armed !== undefined &&
      room.connectedHumanCount() > 0 &&
      armed.seat === room.currentSeat &&
      armed.controller === room.turnController()
    ) {
      return
    }
    this.armBot(room, onEvents)
  }

  /**
   * One timer per open reaction window of a bot-controlled seat. A window keeps the delay
   * sampled when it opened across later retimes, and its timer goes when it closes.
   */
  armReactions(room: Room, onEvents: (events: GameEvent[]) => void): void {
    const armed = this.reactionTimers.get(room.code) ?? new Map<string, unknown>()
    this.reactionTimers.set(room.code, armed)
    const open = new Map<string, { seat: number; kind: ReactionKind }>()
    if (room.connectedHumanCount() > 0) {
      for (const reaction of room.pendingReactions()) {
        open.set(reactionKey(room, reaction.seat, reaction.kind), reaction)
      }
    }

    for (const [key, handle] of armed) {
      if (open.has(key)) continue
      if (handle !== null) this.timers.clearTimeout(handle)
      armed.delete(key)
    }
    for (const [key, { seat, kind }] of open) {
      if (armed.has(key)) continue
      const level = room.levelFor(seat) ?? 'normal'
      const ms = this.sampleDelay(level, kind === 'jumpIn' ? 'jumpIn' : 'reaction')
      const handle = this.timers.setTimeout(() => {
        // Spent, not deleted: a declined window is not offered again while it stays open.
        armed.set(key, null)
        this.guarded(room, 'bot reaction timer threw', () => {
          let events: GameEvent[]
          try {
            events = room.botReact(seat, kind)
          } catch (error) {
            logger.error({ err: error, room: room.code, seat, kind }, 'bot reaction threw, dropped')
            return
          }
          // A declined or stale reaction changes nothing and must not restart any clock.
          if (events.length > 0) onEvents(events)
        })
      }, Math.round(ms))
      armed.set(key, handle)
    }
  }

  cancelBots(room: Room): void {
    this.cancelBot(room)
    const armed = this.reactionTimers.get(room.code)
    if (armed === undefined) return
    for (const handle of armed.values()) {
      if (handle !== null) this.timers.clearTimeout(handle)
    }
    this.reactionTimers.delete(room.code)
  }

  private cancelBot(room: Room): void {
    const armed = this.botTimers.get(room.code)
    if (armed === undefined) return
    this.timers.clearTimeout(armed.handle)
    this.botTimers.delete(room.code)
  }

  /** A scaled delay from the manager's own stream, so timing never perturbs a bot's decisions. */
  private sampleDelay(level: BotLevel, kind: DelayKind): number {
    const sampled = sampleDelayMs(level, kind, this.delayRng)
    this.delayRng = sampled.rng
    return sampled.ms * this.botDelayFactor
  }

  /* Capped after scaling, against the clock actually running: a drawn card keeps the turn
     without restarting the clock, so the cap is what is left of it, not turnSeconds. */
  private belowClock(room: Room, ms: number): number {
    const deadline = this.turnDeadlines.get(room.code)
    if (deadline === undefined) return Math.round(ms)
    return Math.round(Math.max(0, Math.min(ms, deadline - this.now() - CLOCK_MARGIN_MS)))
  }

  /** Nothing a timer runs may throw out of setTimeout: it would take the process down. */
  private guarded(room: Room, message: string, run: () => void): void {
    try {
      run()
    } catch (error) {
      logger.error({ err: error, room: room.code }, message)
    }
  }

  /**
   * Deals the next round on its own after a short pause, so a fast match does not
   * stall on the host clicking a button. Only ever armed on a table with a clock;
   * everywhere else the host still decides when to move on.
   */
  armNextRound(room: Room, onExpire: (events: GameEvent[]) => void): void {
    this.cancelNextRound(room)
    /* The dealing guard also requires two active members, and this one used not
       to. A round ending with one player left made the deal fail, changed nothing
       about the room, and the caller armed it again - every five seconds for the
       life of the process, pushing a countdown that could never resolve. */
    if (
      room.turnSeconds === null ||
      !room.betweenRounds ||
      room.seatedCount() < MIN_SEATS ||
      room.connectedHumanCount() === 0
    ) {
      room.setNextRoundDeadline(null)
      return
    }

    const ms = BETWEEN_ROUNDS_SECONDS * 1000
    room.setNextRoundDeadline(this.now() + ms)
    const handle = this.timers.setTimeout(() => {
      this.roundTimers.delete(room.code)
      room.setNextRoundDeadline(null)
      const dealt = room.dealNextRoundAutomatically(this.seedSource())
      onExpire(dealt)
    }, ms)
    this.roundTimers.set(room.code, handle)
  }

  /**
   * The three seconds a seat has to say UNO after playing down to one card.
   *
   * Only on a table WITHOUT call-outs, which is the whole distinction between the two:
   * there an opponent shuts the window and no deadline is wanted, here nobody is watching
   * so a clock has to. Re-armed from scratch on every move, like the turn clock, so the
   * window that is running always belongs to the seat currently exposed.
   *
   * The penalty used to be charged by the reducer the instant the card left the hand,
   * which made the plain table the harsher of the two for no reason anybody chose: the
   * call was legal a moment too late to make.
   */
  armUnoGrace(room: Room, onExpire: (events: GameEvent[]) => void): void {
    this.cancelUnoGrace(room)
    // Like every clock, stopped while no human is connected.
    if (room.callOutsAllowed || room.exposedSeat() === null || room.connectedHumanCount() === 0) {
      return
    }

    const handle = this.timers.setTimeout(() => {
      this.unoTimers.delete(room.code)
      /* Re-checked rather than trusted: `chargeForgottenUno` is a no-op when nobody is
         exposed any more, which is what makes a call arriving in the last millisecond
         safe against a timer already on its way. */
      onExpire(room.chargeForgottenUno())
    }, UNO_GRACE_SECONDS * 1000)
    this.unoTimers.set(room.code, { handle, seat: room.exposedSeat() })
  }

  cancelUnoGrace(room: Room): void {
    const armed = this.unoTimers.get(room.code)
    if (armed !== undefined) {
      this.timers.clearTimeout(armed.handle)
      this.unoTimers.delete(room.code)
    }
  }

  cancelNextRound(room: Room): void {
    const handle = this.roundTimers.get(room.code)
    if (handle !== undefined) {
      this.timers.clearTimeout(handle)
      this.roundTimers.delete(room.code)
    }
    room.setNextRoundDeadline(null)
  }

  /** Gives a purged room back to its owner's allowance; the count is dropped at zero. */
  private releaseOwner(code: string): void {
    const owner = this.ownerOf.get(code)
    if (owner === undefined) return
    this.ownerOf.delete(code)
    const left = (this.ownedCount.get(owner) ?? 1) - 1
    if (left > 0) this.ownedCount.set(owner, left)
    else this.ownedCount.delete(owner)
  }

  /**
   * Drops rooms nobody is connected to. Returns how many went away.
   *
   * "Empty" alone is not enough: it becomes true the instant every socket id is
   * null, which includes players still inside their grace period. Purge runs on
   * the same cadence as that grace period, so it used to win whenever its tick
   * landed first - cancelling the very grace timers it was pre-empting, and
   * losing the game for anyone who reloaded at the wrong moment. A room now has
   * to have STAYED empty for a full grace period.
   */
  purge(): number {
    let removed = 0
    for (const [code, room] of this.rooms) {
      if (!room.isEmpty()) {
        this.emptySince.delete(code)
        continue
      }

      /* An abandoned room goes at once: rejoin refuses a seat that has left, so
         holding it for a grace period protects nobody. Only a room whose players
         might still be mid-reload gets the wait. */
      if (!room.abandoned) {
        const since = this.emptySince.get(code) ?? this.now()
        this.emptySince.set(code, since)
        if (this.now() - since < this.gracePeriodMs) continue
      }
      for (let seat = 0; seat < room.memberCount; seat++) this.cancelGrace(room, seat)
      this.cancelTurn(room)
      this.cancelNextRound(room)
      this.cancelUnoGrace(room)
      this.cancelBots(room)
      this.rooms.delete(code)
      this.emptySince.delete(code)
      this.releaseOwner(code)
      for (const listener of this.purgeListeners) listener(code)
      removed++
    }
    return removed
  }
}

const graceKey = (code: string, seat: number): string => `${code}#${seat}`

/* A jump-in window belongs to the card on top and a call-out to its target: either
   changing opens a new window with a fresh delay, as the tournament models it. */
const reactionKey = (room: Room, seat: number, kind: ReactionKind): string => {
  if (kind === 'jumpIn') return `${seat}:jumpIn:${room.viewFor(seat)?.discardTop.id ?? 'none'}`
  if (kind === 'callOut') return `${seat}:callOut:${room.exposedSeat() ?? 'none'}`
  return `${seat}:${kind}`
}
