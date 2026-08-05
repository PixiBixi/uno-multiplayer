import type { GameEvent, LobbyView, PlayerView } from '@uno/protocol'
import { cardCount } from '../lib/phrase.js'

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
 */
function toastFor(event: GameEvent): Omit<Toast, 'id'> | null {
  switch (event.type) {
    case 'unoPenalty':
      return {
        tone: 'warn',
        title: 'UNO was not called',
        detail: `${cardCount(event.count)} added.`,
      }
    case 'seatDisconnected':
      return {
        tone: 'bad',
        title: 'A player lost connection',
        detail: 'Their turns are skipped until they return.',
      }
    case 'seatLeft':
      return { tone: 'bad', title: 'A player left', detail: 'Their cards went back to the pile.' }
    case 'roundEnded':
      return event.winner === null
        ? { tone: 'bad', title: 'Round abandoned', detail: 'Not enough players remain.' }
        : { tone: 'info', title: 'Round over', detail: 'Points go to whoever went out.' }
    case 'matchEnded':
      return { tone: 'info', title: 'Match over', detail: 'The standings are final.' }
    case 'roundStarted':
      return { tone: 'info', title: 'Next round', detail: 'The host dealt again.' }
    case 'gameRestarted':
      return { tone: 'info', title: 'New match', detail: 'The standings were reset.' }
    default:
      return null
  }
}

const withFeed = (state: ClientState, entry: OmitEach<FeedEntry, 'id'>): ClientState => {
  const feed: FeedEntry[] = [...state.feed, { ...entry, id: state.nextId }]
  return {
    ...state,
    feed: feed.length > FEED_LIMIT ? feed.slice(feed.length - FEED_LIMIT) : feed,
    nextId: state.nextId + 1,
  }
}

export function gameReducer(state: ClientState, action: Action): ClientState {
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
      const toast = toastFor(action.event)
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
