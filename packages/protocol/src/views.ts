import type { Card, Color, GamePhase, MatchGoal, Move, SeatStatus, TableRules } from '@uno/engine'

export const ROOM_CODE_LENGTH = 6
export const MAX_SEATS = 4
export const MIN_SEATS = 2
export const MAX_NAME_LENGTH = 20
export const MAX_CHAT_LENGTH = 200

/* Bounds on a match goal, enforced at the socket boundary rather than only in the
   lobby UI: a client can send whatever it likes. A one-round match is a single
   game, which is why the floor on rounds is 1 and not 2. */
export const MIN_POINTS_TARGET = 50
export const MAX_POINTS_TARGET = 2000
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 20

/** What a host gets by default: the official target. */
export const DEFAULT_MATCH_GOAL: MatchGoal = { kind: 'points', target: 500 }

/* Below three seconds nobody can read their hand; above two minutes it has
   stopped being a limit. Enforced at the socket boundary, not only in the lobby. */
export const MIN_TURN_SECONDS = 3
export const MAX_TURN_SECONDS = 120
export const DEFAULT_TURN_SECONDS = 15

/**
 * Fixed rather than exposed. It exists so a fast match does not stall waiting for
 * the host to click Next round, and a second dial for it would be a setting nobody
 * has an opinion about.
 */
export const BETWEEN_ROUNDS_SECONDS = 5

/**
 * How long a seat has to say UNO after playing down to one card, on a table without
 * call-outs.
 *
 * Fixed for the same reason: it is a reflex window, not a house rule, and the lobby
 * already carries four rules and two dials. Three seconds is long enough to reach a
 * button that is already on screen and short enough that the table does not wait.
 *
 * In the protocol package because both ends may want it, but nothing on the wire carries
 * a deadline for it yet: the exposed player sees the banner and a live UNO button, not a
 * countdown. The server remains the only thing that charges anything when it runs out.
 */
export const UNO_GRACE_SECONDS = 3

/**
 * How fast a table is played. Independent of MatchGoal, which says how a match
 * ENDS rather than how quickly it runs - hence a separate field and not a third
 * goal variant.
 *
 * `null` means what every table did before this existed: no clock at all. It lives
 * in the protocol rather than the engine because a time limit is a house setting,
 * not a rule of UNO, and the engine stays free of clocks.
 */
export type MatchPace = { turnSeconds: number } | null

/* `TableRules` is declared in @uno/engine rather than here beside MatchPace, and that
   split is the point: a clock is a house setting the engine never sees, while those
   flags change what the rules are and the reducer has to read them. The protocol
   re-exports the type and carries it on the wire - on `LobbyView` and on `PlayerView`
   both - but it does not own it, so there is exactly one definition of what a rule is.

   On both views, because a rule read once before the deal is not one anybody remembers
   twenty minutes later: a manual UNO penalty got reported as a missing one, and the game
   was right. And on the player view rather than sent once and cached client-side, because
   a reload mid-game receives a PlayerView and no lobby at all. */

/** Alphabet without ambiguous characters: no O/0, no I/1. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * Everything ONE player receives. `opponents` exposes a card count only: the
 * contents of other players' hands never travel over the wire, which is what
 * makes hidden information structurally hidden rather than merely hidden in CSS.
 */
export type PlayerView = {
  you: { seat: number; hand: Card[]; legalMoves: Move[] }
  opponents: { seat: number; name: string; handCount: number; status: SeatStatus }[]
  /**
   * What this table plays by, so the game can say so rather than leaving everyone to
   * remember the lobby. Four booleans against a view of roughly 1.4 KB, and a field that
   * never changes between frames is almost free once the socket deflates them.
   */
  rules: TableRules
  discardTop: Card
  currentColor: Color
  pendingDraw: { amount: number; kind: 'draw2' | 'wild4' } | null
  currentSeat: number
  direction: 1 | -1
  drawPileCount: number
  phase: GamePhase
  winner: number | null
  match: MatchProgress
  /**
   * When the seat on turn runs out, as an epoch millisecond stamp, or null when
   * the table has no clock.
   *
   * A deadline rather than a remaining duration on purpose: a client that drops a
   * frame, sleeps a tab or reconnects mid-turn must not end up disagreeing with
   * the server about when time is up. The server owns the deadline; the client
   * only renders what is left of it.
   */
  turnDeadline: number | null
  /** When the next round deals itself, on a table that does that. */
  nextRoundDeadline: number | null
}

/**
 * What each seat did over the whole match, for the scoreboard at the end.
 *
 * Not a rule and not needed to play - purely something to laugh at afterwards -
 * so it lives here rather than in the engine, and is counted from the event feed
 * the server already produces rather than from any new bookkeeping.
 */
export type SeatStats = {
  cardsPlayed: number
  wild4Played: number
  draw2Played: number
  cardsDrawn: number
  unoCalls: number
  unoPenalties: number
  timeouts: number
  roundsWon: number
}

/**
 * Where the match stands. `scores` is indexed by seat, joined against the names
 * the view already carries rather than repeating them.
 *
 * `winners` is null while the match continues and an array once it is over - an
 * array even in points mode, where only one seat can ever cross the target, so
 * that both modes share one shape.
 */
export type MatchProgress = {
  goal: MatchGoal
  scores: number[]
  /** 1-based, and names the round currently being played. */
  round: number
  winners: number[] | null
  /** Indexed by seat, like `scores`. */
  stats: SeatStats[]
}

/**
 * Everything a player in the lobby receives, host and guest alike.
 *
 * It carries the whole table configuration because a guest who cannot see the rules
 * finds out about Seven-Zero when their hand changes owner. Rules used to be kept off
 * the wire on the grounds that the client evaluates none of them, which is still true
 * - it renders them and never reasons about them.
 */
export type LobbyView = {
  roomCode: string
  hostSeat: number
  seats: { seat: number; name: string; status: SeatStatus }[]
  /** Whether enough seats are filled to deal. NOT whether the table may be configured. */
  canStart: boolean
  goal: MatchGoal
  pace: MatchPace
  rules: TableRules
  /**
   * Whether the host may still change the three fields above.
   *
   * False from the first deal of the **match** onward, not of each round: a match
   * spans rounds and carries a score, so flipping Seven-Zero at round three would
   * rewrite the rules of a contest already in progress.
   *
   * Deliberately not derivable from `canStart`, which reports seat count and nothing
   * else - a room can be un-startable and already dealt, because somebody left
   * mid-match. Sent so the host's controls can disappear; the server checks the same
   * thing again when `room:configure` arrives, which is where the guard actually is.
   */
  configurable: boolean
}
