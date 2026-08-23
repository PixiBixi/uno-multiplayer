import type { GameEvent, LobbyView, PlayerView } from '@uno/protocol'
import type { Messages } from '../i18n/messages.js'

/** A long game produces hundreds of events. The feed is a view, not a log. */
export const FEED_LIMIT = 120
const TOAST_LIMIT = 4

export type FeedEntry =
  | { id: number; kind: 'chat'; seat: number; name: string; text: string }
  | { id: number; kind: 'event'; event: GameEvent }

export type Toast = { id: number; tone: 'info' | 'warn' | 'bad'; title: string; detail: string }

/**
 * `Omit` does not distribute over a union: `Omit<FeedEntry, 'id'>` collapses to
 * the keys the members share, silently dropping `event`, `seat` and `text`. This
 * applies the omission to each member instead.
 */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type ClientState = {
  connection: 'connecting' | 'open' | 'lost'
  screen: 'home' | 'lobby' | 'table'
  roomCode: string | null
  seat: number | null
  lobby: LobbyView | null
  view: PlayerView | null
  feed: FeedEntry[]
  toasts: Toast[]
  error: string | null
  nextId: number
}

export type Action =
  | { type: 'connection'; connection: ClientState['connection'] }
  | { type: 'joined'; roomCode: string; seat: number }
  | { type: 'lobby'; lobby: LobbyView }
  | { type: 'view'; view: PlayerView }
  | { type: 'event'; event: GameEvent }
  | { type: 'chat'; message: { seat: number; name: string; text: string } }
  | { type: 'error'; message: string }
  | { type: 'dismissToast'; id: number }
  | { type: 'left' }

export const initialState: ClientState = {
  connection: 'connecting',
  screen: 'home',
  roomCode: null,
  seat: null,
  lobby: null,
  view: null,
  feed: [],
  toasts: [],
  error: null,
  nextId: 1,
}

/**
 * Only events worth interrupting a player for. A toast per drawn card is noise,
 * and noise trains people to ignore the channel.
 *
 * The tone is this module's decision - how loudly to interrupt is behaviour. The
 * words are not: they are two sentences a player reads, so they come from the
 * catalogue it was handed, exactly as `describeEvent` takes one. Importing a
 * catalogue here instead would pick a language at build time and no chip on the
 * home screen could change it.
 */
function toastFor(event: GameEvent, t: Messages): Omit<Toast, 'id'> | null {
  const toast = t.toast
  switch (event.type) {
    case 'unoPenalty':
      return {
        tone: 'warn',
        title: toast.unoMissed.title,
        detail: toast.unoMissed.detail(event.count),
      }
    case 'seatDisconnected':
      return { tone: 'bad', ...toast.lostConnection }
    case 'seatLeft':
      return { tone: 'bad', ...toast.playerLeft }
    case 'roundEnded':
      return event.winner === null
        ? { tone: 'bad', ...toast.roundAbandoned }
        : { tone: 'info', ...toast.roundOver }
    case 'matchEnded':
      return { tone: 'info', ...toast.matchOver }
    case 'roundStarted':
      return { tone: 'info', ...toast.nextRound }
    case 'gameRestarted':
      return { tone: 'info', ...toast.newMatch }
    default:
      return null
  }
}

/** The newest entry already on screen. Both effect hooks need it to tell a fresh
 *  event from the backlog a reconnect replays. */
export const highestFeedId = (feed: FeedEntry[]): number =>
  feed.reduce((highest, entry) => (entry.id > highest ? entry.id : highest), 0)

const withFeed = (state: ClientState, entry: OmitEach<FeedEntry, 'id'>): ClientState => {
  const feed: FeedEntry[] = [...state.feed, { ...entry, id: state.nextId }]
  return {
    ...state,
    feed: feed.length > FEED_LIMIT ? feed.slice(feed.length - FEED_LIMIT) : feed,
    nextId: state.nextId + 1,
  }
}

export function gameReducer(state: ClientState, action: Action, messages: Messages): ClientState {
  switch (action.type) {
    case 'connection':
      return { ...state, connection: action.connection }

    case 'joined':
      return {
        ...state,
        screen: 'lobby',
        roomCode: action.roomCode,
        seat: action.seat,
        error: null,
      }

    case 'lobby':
      // Never demotes the screen: a lobby update arriving mid-game must not yank
      // the player off the table.
      return { ...state, lobby: action.lobby }

    case 'view':
      return { ...state, screen: 'table', view: action.view, error: null }

    case 'chat':
      return withFeed(state, { kind: 'chat', ...action.message })

    case 'event': {
      const withEvent = withFeed(state, { kind: 'event', event: action.event })
      const toast = toastFor(action.event, messages)
      if (toast === null) return withEvent
      const toasts = [...withEvent.toasts, { ...toast, id: withEvent.nextId }]
      return {
        ...withEvent,
        toasts: toasts.length > TOAST_LIMIT ? toasts.slice(toasts.length - TOAST_LIMIT) : toasts,
        nextId: withEvent.nextId + 1,
      }
    }

    case 'error':
      return { ...state, error: action.message }

    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.id) }

    case 'left':
      return { ...initialState, connection: state.connection, nextId: state.nextId }
  }
}
