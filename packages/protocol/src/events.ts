import type { Card, MatchGoal, Move, TableRules } from '@uno/engine'
import type { LobbyView, MatchPace, PlayerView } from './views.js'

export type ErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'invalid_payload'
  | 'not_host'
  | 'too_few_players'
  | 'game_already_started'
  | 'game_not_started'
  | 'illegal_move'
  | 'not_your_turn'
  | 'rate_limited'
  | 'invalid_session'
  | 'server_full'
  | 'round_in_progress'
  | 'match_over'
  | 'voice_not_joined'
  | 'voice_peer_unavailable'

/** Narrative feed used for animations and the in-game log, never for state. */
export type GameEvent =
  | { type: 'cardPlayed'; seat: number; card: Card }
  | { type: 'cardsDrawn'; seat: number; count: number }
  | { type: 'unoCalled'; seat: number }
  | { type: 'unoPenalty'; seat: number; count: number }
  /* Who noticed, and who it cost. The two cards themselves still arrive as
     `unoPenalty` against the target, so the statistics and the sound cue for a
     forgotten UNO keep working whichever rule charged it. */
  | { type: 'calledOut'; by: number; target: number }
  /* Seven-Zero, the two ways hands move without a card being drawn. Named events
     rather than left to the hand-size diff: a swap between two seats holding four
     cards each changes no count at all, and one that does change counts would
     otherwise be reported as a draw that never happened. */
  | { type: 'handsSwapped'; seat: number; with: number }
  | { type: 'handsRotated'; direction: 1 | -1 }
  /* Jump-in: a card laid down by a seat whose turn it was not. Named rather than
     left to `cardPlayed` alone, because the surprising part is not the card - it is
     that play has just moved somewhere nobody was expecting, and the seats in
     between never got their turn. The card still arrives as `cardPlayed` right
     after, so the statistics and the sound cue need to learn nothing. */
  | { type: 'jumpedIn'; seat: number }
  /* A seat declining the card it just drew, on a table that plays the official
     drawn-card rule. Named rather than left silent, because the feed would otherwise have
     nothing at all to say about a turn that ended: a draw no longer implies the turn is
     over, so "Ana drew a card" followed by somebody else playing is genuinely ambiguous -
     she may have been still deciding. Counts towards nothing; declining to play is not a
     statistic. */
  | { type: 'turnPassed'; seat: number }
  | { type: 'seatDisconnected'; seat: number }
  | { type: 'seatReconnected'; seat: number }
  | { type: 'seatLeft'; seat: number }
  /* A round ending and a match ending are two different moments, and conflating
     them was what the old single `gameOver` did. `awarded` is what this round paid
     out, `scores` the running totals after it. */
  | { type: 'roundEnded'; winner: number | null; awarded: number[]; scores: number[] }
  | { type: 'matchEnded'; winners: number[]; scores: number[] }
  | { type: 'roundStarted'; round: number }
  /* The clock played for somebody. Distinct from cardsDrawn so the log can say
     why, and so the client can react to a forced turn differently. */
  | { type: 'turnTimedOut'; seat: number }
  | { type: 'gameRestarted' }

/**
 * An acknowledgement carrying no extra fields on success. Not
 * `Record<string, never>`: intersecting that with `{ ok: true }` would demand
 * `ok` be of type `never`, making the result unsatisfiable.
 */
export type Empty = Record<never, never>

export type Ack<T = Empty> = (result: ({ ok: true } & T) | { ok: false; error: ErrorCode }) => void

/**
 * What `room:configure` asks to change. Every field optional and every absent field
 * left as it is, so toggling one rule cannot write back a goal the client read a
 * moment earlier. `pace` is the one where absent and `null` differ: null takes the
 * clock off the table, absent leaves whatever clock it has.
 *
 * The keys admit an explicit `undefined` as well as being absent, which under
 * `exactOptionalPropertyTypes` are different types. Zod's `.optional()` produces the
 * former and reads it as "not mentioned", so both spellings mean the same thing here
 * and neither side has to strip keys to satisfy the other.
 */
export type TableConfiguration = {
  goal?: MatchGoal | undefined
  pace?: MatchPace | undefined
  rules?: TableRules | undefined
}

/** A seat that has joined the voice session, and whether its own mic is off. */
export type VoicePeer = { seat: number; muted: boolean }

/** Shaped for `RTCConfiguration.iceServers`, minted per join. */
export type IceServer = { urls: string[]; username?: string; credential?: string }

/**
 * What one peer needs to say to another to negotiate. The server validates the
 * shape and relays it; it never parses the SDP.
 */
export type VoiceSignal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | {
      kind: 'candidate'
      candidate: string
      sdpMid: string | null
      sdpMLineIndex: number | null
    }

export type ClientToServer = {
  'room:create': (
    payload: { playerName: string; goal: MatchGoal; pace: MatchPace; rules: TableRules },
    ack: Ack<{ roomCode: string; sessionToken: string; seat: number }>,
  ) => void
  'room:join': (
    payload: { roomCode: string; playerName: string },
    ack: Ack<{ sessionToken: string; seat: number }>,
  ) => void
  'room:rejoin': (
    payload: { roomCode: string; sessionToken: string },
    ack: Ack<{ seat: number }>,
  ) => void
  /** Gives up the seat. Without it the server never learns the player is gone. */
  'room:leave': (payload: Empty, ack: Ack) => void
  /**
   * Changes the table from the lobby. Host only, and only before the first deal of the
   * match; anyone else gets `not_host` and a late one gets `game_already_started`.
   *
   * Partial on purpose - see `roomConfigureSchema`. Every accepted change re-emits
   * `room:state` to every member, not to the sender: the whole reason configuration
   * moved into the lobby is that a guest watches the host toggle Jump-in.
   */
  'room:configure': (payload: TableConfiguration, ack: Ack) => void
  'game:start': (payload: Empty, ack: Ack) => void
  /** Deals the next round of the current match, keeping the scores. */
  'game:nextRound': (payload: Empty, ack: Ack) => void
  /** Abandons the standings and starts a fresh match on the same goal. */
  'game:restart': (payload: Empty, ack: Ack) => void
  'game:move': (payload: { move: Move }, ack: Ack) => void
  'chat:send': (payload: { text: string }, ack: Ack) => void
  /**
   * Joins the voice session. The client must already hold a microphone stream:
   * a denied permission has to cost nothing on the server.
   */
  'voice:join': (payload: Empty, ack: Ack<{ iceServers: IceServer[]; peers: VoicePeer[] }>) => void
  'voice:leave': (payload: Empty, ack: Ack) => void
  /** Relayed verbatim to `toSeat`, which must be in the same room's voice session. */
  'voice:signal': (payload: { toSeat: number; signal: VoiceSignal }, ack: Ack) => void
  /**
   * Own microphone off. Broadcast because a muted mic produces silence that is
   * indistinguishable from a player who is simply not talking.
   */
  'voice:mute': (payload: { muted: boolean }, ack: Ack) => void
}

export type ServerToClient = {
  'room:state': (view: LobbyView) => void
  'game:view': (view: PlayerView) => void
  'game:event': (event: GameEvent) => void
  'chat:message': (message: { seat: number; name: string; text: string }) => void
  'voice:peers': (peers: VoicePeer[]) => void
  'voice:signal': (payload: { fromSeat: number; signal: VoiceSignal }) => void
  error: (payload: { code: ErrorCode; message: string }) => void
}
