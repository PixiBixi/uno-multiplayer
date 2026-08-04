# Plan C2 — Socket client, écrans, livraison

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le client jouable de bout en bout — connexion, lobby, table, chat, fin de partie — puis les tests Playwright et l'image Docker déployable.

**Architecture:** Un seul point de contact socket (`useGameSocket`), un `useReducer` pour tout l'état, et un écran qui est une **fonction** de ce que le serveur a poussé. Aucune règle, aucune copie d'état de jeu.

**Tech Stack:** React 19.2, Vite 8.2, Vitest 4 + Testing Library 16, Playwright 1.62, Docker multi-stage.

**Spec:** `docs/superpowers/specs/2026-08-04-uno-multiplayer-design.md` §2.7, §3.2–3.6, §4.3–4.4
**Maquettes:** l'artifact publié, section par section.

**Prérequis:** plan C1 livré — `restart()`, service des statiques, squelette `@uno/web`, composant `Card`.

## Global Constraints

- Node 22+, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Aucune règle de jeu dans le client.** La jouabilité vient de `you.legalMoves`, jamais d'un calcul local.
- Une seule socket, dans un `useRef`, fermée par `socket.disconnect()`, listeners retirés nommément.
- Jamais `alert()` ni `prompt()`.
- L'identité du joueur est le `sessionToken` en `localStorage`, indexé par code de room.
- Cibles tactiles ≥ 44 px, focus visible partout, couleur jamais seule porteuse d'information.
- Commentaires, identifiants et commits **en anglais**.
- `npm run verify` passe à la fin de chaque task.

## Structure de fichiers

| Fichier | Responsabilité |
|---|---|
| `apps/web/src/lib/session.ts` | Jetons de session en `localStorage` |
| `apps/web/src/lib/room-url.ts` | Lecture et écriture du code de room dans l'URL |
| `apps/web/src/hooks/useGameSocket.ts` | Le seul point de contact socket, plus le réducteur |
| `apps/web/src/screens/Home.tsx` | Créer ou rejoindre |
| `apps/web/src/screens/Lobby.tsx` | Composition de la table, démarrage par l'hôte |
| `apps/web/src/screens/Table.tsx` | Assemblage des sièges, du centre et de la main |
| `apps/web/src/components/Seat.tsx` | Plaque de nom, éventail de dos de cartes |
| `apps/web/src/components/CentreStack.tsx` | Pioche, défausse, couleur en cours, sens |
| `apps/web/src/components/Hand.tsx` | Main, choix du coup |
| `apps/web/src/components/ColourPicker.tsx` | Choix de couleur, filtré depuis `legalMoves` |
| `apps/web/src/components/ChatPanel.tsx` | Flux entrelacé chat et journal |
| `apps/web/src/components/GameOver.tsx` | Vainqueur ou abandon |
| `apps/web/src/components/Toaster.tsx` | Messages éphémères |
| `e2e/game.spec.ts` | Playwright multi-contextes |
| `Dockerfile`, `compose.yaml` | Image unique, développement local |

---

### Task 1: Stockage de session et code de room dans l'URL

**Files:**
- Create: `apps/web/src/lib/session.ts`, `apps/web/src/lib/room-url.ts`
- Test: `apps/web/src/lib/session.test.ts`, `apps/web/src/lib/room-url.test.ts`

**Interfaces:**
- Consumes: `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH` (`@uno/protocol`)
- Produces:
  - `readSession(roomCode: string): string | null`
  - `writeSession(roomCode: string, token: string): void`
  - `clearSession(roomCode: string): void`
  - `readRoomCodeFromUrl(search?: string): string | null`
  - `writeRoomCodeToUrl(roomCode: string): void`

Pas de routeur : le routage tient en un paramètre. Une dépendance de plus pour lire `?room=` ne se justifie pas, et la navigation arrière n'a pas de sens dans une partie.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/lib/session.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, readSession, writeSession } from './session.js'

beforeEach(() => {
  localStorage.clear()
})

describe('session store', () => {
  it('returns null for a room it has never seen', () => {
    expect(readSession('ABC234')).toBeNull()
  })

  it('round-trips a token', () => {
    writeSession('ABC234', 'token-1')
    expect(readSession('ABC234')).toBe('token-1')
  })

  it('keeps rooms independent', () => {
    writeSession('ABC234', 'token-1')
    writeSession('XYZ789', 'token-2')
    expect(readSession('ABC234')).toBe('token-1')
    expect(readSession('XYZ789')).toBe('token-2')
  })

  it('is case-insensitive on the room code', () => {
    writeSession('ABC234', 'token-1')
    expect(readSession('abc234')).toBe('token-1')
  })

  it('clears one room without touching the others', () => {
    writeSession('ABC234', 'token-1')
    writeSession('XYZ789', 'token-2')
    clearSession('ABC234')
    expect(readSession('ABC234')).toBeNull()
    expect(readSession('XYZ789')).toBe('token-2')
  })

  it('survives storage being unavailable rather than throwing', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    expect(() => writeSession('ABC234', 'token')).not.toThrow()
    expect(readSession('ABC234')).toBeNull()
    if (original) Object.defineProperty(window, 'localStorage', original)
  })
})
```

`apps/web/src/lib/room-url.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { readRoomCodeFromUrl } from './room-url.js'

describe('readRoomCodeFromUrl', () => {
  it('reads a well-formed code', () => {
    expect(readRoomCodeFromUrl('?room=ABC234')).toBe('ABC234')
  })

  it('uppercases the code', () => {
    expect(readRoomCodeFromUrl('?room=abc234')).toBe('ABC234')
  })

  it('returns null when absent', () => {
    expect(readRoomCodeFromUrl('')).toBeNull()
  })

  it('rejects a code of the wrong length', () => {
    expect(readRoomCodeFromUrl('?room=ABC23')).toBeNull()
  })

  it('rejects characters outside the alphabet', () => {
    expect(readRoomCodeFromUrl('?room=ABC01I')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/lib`
Expected: FAIL — les deux modules sont introuvables.

- [ ] **Step 3: Implémenter le stockage de session**

`apps/web/src/lib/session.ts` :

```ts
const PREFIX = 'uno.session.'

const keyFor = (roomCode: string): string => `${PREFIX}${roomCode.toUpperCase()}`

/**
 * localStorage can throw outright — private browsing, blocked storage, a full
 * quota. Losing the ability to reconnect is a degraded experience; a crash on
 * page load is a broken one.
 */
export function readSession(roomCode: string): string | null {
  try {
    return localStorage.getItem(keyFor(roomCode))
  } catch {
    return null
  }
}

export function writeSession(roomCode: string, token: string): void {
  try {
    localStorage.setItem(keyFor(roomCode), token)
  } catch {
    /* Reconnection will not survive a reload. The game still plays. */
  }
}

export function clearSession(roomCode: string): void {
  try {
    localStorage.removeItem(keyFor(roomCode))
  } catch {
    /* Nothing to do. */
  }
}
```

- [ ] **Step 4: Implémenter la lecture d'URL**

`apps/web/src/lib/room-url.ts` :

```ts
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@uno/protocol'

/** Validated against the protocol's own alphabet, so a hand-typed URL cannot
 *  push a malformed code as far as the socket. */
export function readRoomCodeFromUrl(search: string = window.location.search): string | null {
  const raw = new URLSearchParams(search).get('room')
  if (raw === null) return null
  const code = raw.trim().toUpperCase()
  if (code.length !== ROOM_CODE_LENGTH) return null
  if (![...code].every((character) => ROOM_CODE_ALPHABET.includes(character))) return null
  return code
}

export function writeRoomCodeToUrl(roomCode: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomCode)
  history.replaceState(null, '', url)
}
```

- [ ] **Step 5: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/lib && npm run verify`
Expected: 11 tests PASS, `verify` en code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib
git commit -m "feat(web): add session storage and room code URL handling"
```

---

### Task 2: `useGameSocket`

**Files:**
- Create: `apps/web/src/hooks/useGameSocket.ts`
- Create: `apps/web/src/hooks/game-reducer.ts`
- Test: `apps/web/src/hooks/game-reducer.test.ts`

**Interfaces:**
- Consumes: types de `@uno/protocol`, `session.ts` (Task 1)
- Produces:
  - `type ClientState = { connection: 'connecting' | 'open' | 'lost'; screen: 'home' | 'lobby' | 'table'; roomCode: string | null; seat: number | null; lobby: LobbyView | null; view: PlayerView | null; feed: FeedEntry[]; toasts: Toast[]; error: string | null }`
  - `type FeedEntry = { id: number; kind: 'chat'; seat: number; name: string; text: string } | { id: number; kind: 'event'; event: GameEvent }`
  - `gameReducer(state: ClientState, action: Action): ClientState`
  - `initialState: ClientState`
  - `useGameSocket(): { state: ClientState; actions: {...} }`

Le réducteur est **séparé du hook** pour être testé sans React ni socket. C'est là que vit toute la logique de présentation, donc c'est là qu'elle doit être testable.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/hooks/game-reducer.test.ts` :

```ts
import type { LobbyView, PlayerView } from '@uno/protocol'
import { describe, expect, it } from 'vitest'
import { FEED_LIMIT, gameReducer, initialState } from './game-reducer.js'

const lobby: LobbyView = {
  roomCode: 'ABC234',
  hostSeat: 0,
  seats: [{ seat: 0, name: 'Ana', status: 'active' }],
  canStart: false,
}

const view = { phase: 'playing', winner: null } as PlayerView

describe('gameReducer', () => {
  it('starts on the home screen, disconnected', () => {
    expect(initialState.screen).toBe('home')
    expect(initialState.view).toBeNull()
    expect(initialState.roomCode).toBeNull()
  })

  it('moves to the lobby when a room is joined', () => {
    const next = gameReducer(initialState, {
      type: 'joined',
      roomCode: 'ABC234',
      seat: 0,
    })
    expect(next.screen).toBe('lobby')
    expect(next.roomCode).toBe('ABC234')
    expect(next.seat).toBe(0)
  })

  it('moves to the table on the first game view', () => {
    const joined = gameReducer(initialState, { type: 'joined', roomCode: 'ABC234', seat: 0 })
    const next = gameReducer(joined, { type: 'view', view })
    expect(next.screen).toBe('table')
    expect(next.view).toBe(view)
  })

  it('keeps the table screen when a game finishes', () => {
    let state = gameReducer(initialState, { type: 'joined', roomCode: 'ABC234', seat: 0 })
    state = gameReducer(state, { type: 'view', view })
    state = gameReducer(state, {
      type: 'view',
      view: { ...view, phase: 'finished', winner: 0 } as PlayerView,
    })
    expect(state.screen).toBe('table')
    expect(state.view?.phase).toBe('finished')
  })

  it('stores the lobby view without leaving the table', () => {
    let state = gameReducer(initialState, { type: 'joined', roomCode: 'ABC234', seat: 0 })
    state = gameReducer(state, { type: 'view', view })
    state = gameReducer(state, { type: 'lobby', lobby })
    expect(state.screen).toBe('table')
    expect(state.lobby).toEqual(lobby)
  })

  it('appends chat and events to one feed', () => {
    let state = gameReducer(initialState, {
      type: 'chat',
      message: { seat: 1, name: 'Ben', text: 'hi' },
    })
    state = gameReducer(state, { type: 'event', event: { type: 'unoCalled', seat: 1 } })
    expect(state.feed.map((entry) => entry.kind)).toEqual(['chat', 'event'])
  })

  it('gives every feed entry a distinct id', () => {
    let state = initialState
    for (let i = 0; i < 5; i++) {
      state = gameReducer(state, { type: 'event', event: { type: 'unoCalled', seat: 0 } })
    }
    expect(new Set(state.feed.map((entry) => entry.id)).size).toBe(5)
  })

  it('caps the feed so a long game cannot grow without bound', () => {
    let state = initialState
    for (let i = 0; i < FEED_LIMIT + 30; i++) {
      state = gameReducer(state, { type: 'event', event: { type: 'unoCalled', seat: 0 } })
    }
    expect(state.feed).toHaveLength(FEED_LIMIT)
  })

  it('records an error and clears it on the next successful action', () => {
    const failed = gameReducer(initialState, { type: 'error', message: 'Room is full' })
    expect(failed.error).toBe('Room is full')
    const recovered = gameReducer(failed, { type: 'joined', roomCode: 'ABC234', seat: 1 })
    expect(recovered.error).toBeNull()
  })

  it('marks the connection lost without discarding the last view', () => {
    let state = gameReducer(initialState, { type: 'joined', roomCode: 'ABC234', seat: 0 })
    state = gameReducer(state, { type: 'view', view })
    state = gameReducer(state, { type: 'connection', connection: 'lost' })
    expect(state.connection).toBe('lost')
    expect(state.view).toBe(view)
    expect(state.screen).toBe('table')
  })

  it('returns home and forgets the room when the player leaves', () => {
    let state = gameReducer(initialState, { type: 'joined', roomCode: 'ABC234', seat: 0 })
    state = gameReducer(state, { type: 'view', view })
    state = gameReducer(state, { type: 'left' })
    expect(state.screen).toBe('home')
    expect(state.roomCode).toBeNull()
    expect(state.view).toBeNull()
    expect(state.feed).toEqual([])
  })

  it('adds a toast for a notable event and none for routine ones', () => {
    const notable = gameReducer(initialState, {
      type: 'event',
      event: { type: 'unoPenalty', seat: 0, count: 2 },
    })
    expect(notable.toasts).toHaveLength(1)
    const routine = gameReducer(initialState, {
      type: 'event',
      event: { type: 'cardsDrawn', seat: 1, count: 1 },
    })
    expect(routine.toasts).toHaveLength(0)
  })

  it('dismisses a toast by id', () => {
    const withToast = gameReducer(initialState, {
      type: 'event',
      event: { type: 'gameOver', winner: 1 },
    })
    const id = withToast.toasts[0]?.id
    if (id === undefined) throw new Error('expected a toast')
    expect(gameReducer(withToast, { type: 'dismissToast', id }).toasts).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/hooks/game-reducer.test.ts`
Expected: FAIL — `./game-reducer.js` introuvable.

- [ ] **Step 3: Implémenter le réducteur**

`apps/web/src/hooks/game-reducer.ts` :

```ts
import type { GameEvent, LobbyView, PlayerView } from '@uno/protocol'

/** A long game produces hundreds of events. The feed is a view, not a log. */
export const FEED_LIMIT = 120
const TOAST_LIMIT = 4

export type FeedEntry =
  | { id: number; kind: 'chat'; seat: number; name: string; text: string }
  | { id: number; kind: 'event'; event: GameEvent }

export type Toast = { id: number; tone: 'info' | 'warn' | 'bad'; title: string; detail: string }

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

/** Only events a player would want interrupted for. A toast per drawn card is
 *  noise, and noise trains people to ignore the channel. */
function toastFor(event: GameEvent): Omit<Toast, 'id'> | null {
  switch (event.type) {
    case 'unoPenalty':
      return {
        tone: 'warn',
        title: 'UNO was not called',
        detail: `${event.count} cards added to seat ${event.seat}.`,
      }
    case 'seatDisconnected':
      return {
        tone: 'bad',
        title: 'A player lost connection',
        detail: 'Their turns are skipped until they return.',
      }
    case 'seatLeft':
      return { tone: 'bad', title: 'A player left', detail: 'Their cards went back to the pile.' }
    case 'gameOver':
      return event.winner === null
        ? { tone: 'bad', title: 'Game abandoned', detail: 'Not enough players remain.' }
        : { tone: 'info', title: 'Game over', detail: `Seat ${event.winner} wins.` }
    case 'gameRestarted':
      return { tone: 'info', title: 'New deal', detail: 'The host started another game.' }
    default:
      return null
  }
}

const withFeed = (state: ClientState, entry: Omit<FeedEntry, 'id'>): ClientState => {
  const feed = [...state.feed, { ...entry, id: state.nextId } as FeedEntry]
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
      // Never demotes the screen: a lobby update arriving mid-game must not
      // yank the player off the table.
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
```

- [ ] **Step 4: Implémenter le hook**

`apps/web/src/hooks/useGameSocket.ts` :

```ts
import type { ClientToServer, ErrorCode, Move, ServerToClient } from '@uno/protocol'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { readRoomCodeFromUrl, writeRoomCodeToUrl } from '../lib/room-url.js'
import { clearSession, readSession, writeSession } from '../lib/session.js'
import { gameReducer, initialState, type ClientState } from './game-reducer.js'

type TypedSocket = Socket<ServerToClient, ClientToServer>

const MESSAGES: Record<ErrorCode, string> = {
  room_not_found: 'No game with that code.',
  room_full: 'That game already has four players.',
  invalid_payload: 'That did not look right. Try again.',
  not_host: 'Only the host can do that.',
  too_few_players: 'A game needs at least two players.',
  game_already_started: 'That game is already under way.',
  game_not_started: 'The game has not started yet.',
  illegal_move: 'That card cannot be played right now.',
  not_your_turn: 'It is not your turn.',
  rate_limited: 'Slow down a moment.',
  invalid_session: 'Your seat was given away. Rejoin to play.',
  server_full: 'The server is at capacity. Try again shortly.',
}

export function useGameSocket() {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  /* One socket for the app's lifetime, in a ref — never a module-level variable,
     which would leak between mounts and across two tabs of the same bundle. */
  const socketRef = useRef<TypedSocket | null>(null)

  useEffect(() => {
    const socket: TypedSocket = io({ transports: ['websocket', 'polling'] })
    socketRef.current = socket

    const onConnect = () => {
      dispatch({ type: 'connection', connection: 'open' })
      // A code in the URL plus a stored token means this is a return, not a
      // first visit: reclaim the seat before anything else.
      const code = readRoomCodeFromUrl()
      const token = code === null ? null : readSession(code)
      if (code === null || token === null) return
      socket.emit('room:rejoin', { roomCode: code, sessionToken: token }, (result) => {
        if (result.ok) dispatch({ type: 'joined', roomCode: code, seat: result.seat })
        else clearSession(code)
      })
    }
    const onDisconnect = () => dispatch({ type: 'connection', connection: 'lost' })
    const onLobby: ServerToClient['room:state'] = (lobby) => dispatch({ type: 'lobby', lobby })
    const onView: ServerToClient['game:view'] = (view) => dispatch({ type: 'view', view })
    const onEvent: ServerToClient['game:event'] = (event) => dispatch({ type: 'event', event })
    const onChat: ServerToClient['chat:message'] = (message) => dispatch({ type: 'chat', message })
    const onError: ServerToClient['error'] = ({ code }) =>
      dispatch({ type: 'error', message: MESSAGES[code] })

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:state', onLobby)
    socket.on('game:view', onView)
    socket.on('game:event', onEvent)
    socket.on('chat:message', onChat)
    socket.on('error', onError)

    return () => {
      /* Named removals, then a real disconnect. `socket.off()` with no argument
         would also strip socket.io's own internal listeners. */
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:state', onLobby)
      socket.off('game:view', onView)
      socket.off('game:event', onEvent)
      socket.off('chat:message', onChat)
      socket.off('error', onError)
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const fail = useCallback((code: ErrorCode) => {
    dispatch({ type: 'error', message: MESSAGES[code] })
  }, [])

  const createRoom = useCallback(
    (playerName: string) => {
      socketRef.current?.emit('room:create', { playerName }, (result) => {
        if (!result.ok) return fail(result.error)
        writeSession(result.roomCode, result.sessionToken)
        writeRoomCodeToUrl(result.roomCode)
        dispatch({ type: 'joined', roomCode: result.roomCode, seat: result.seat })
      })
    },
    [fail],
  )

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      socketRef.current?.emit('room:join', { roomCode, playerName }, (result) => {
        if (!result.ok) return fail(result.error)
        writeSession(roomCode, result.sessionToken)
        writeRoomCodeToUrl(roomCode)
        dispatch({ type: 'joined', roomCode, seat: result.seat })
      })
    },
    [fail],
  )

  const startGame = useCallback(() => {
    socketRef.current?.emit('game:start', {}, (result) => {
      if (!result.ok) fail(result.error)
    })
  }, [fail])

  const restartGame = useCallback(() => {
    socketRef.current?.emit('game:restart', {}, (result) => {
      if (!result.ok) fail(result.error)
    })
  }, [fail])

  const playMove = useCallback(
    (move: Move) => {
      socketRef.current?.emit('game:move', { move }, (result) => {
        if (!result.ok) fail(result.error)
      })
    },
    [fail],
  )

  const sendChat = useCallback(
    (text: string) => {
      socketRef.current?.emit('chat:send', { text }, (result) => {
        if (!result.ok) fail(result.error)
      })
    },
    [fail],
  )

  const leave = useCallback(() => {
    if (state.roomCode !== null) clearSession(state.roomCode)
    dispatch({ type: 'left' })
  }, [state.roomCode])

  const dismissToast = useCallback((id: number) => {
    dispatch({ type: 'dismissToast', id })
  }, [])

  return {
    state: state satisfies ClientState,
    actions: {
      createRoom,
      joinRoom,
      startGame,
      restartGame,
      playMove,
      sendChat,
      leave,
      dismissToast,
    },
  }
}
```

- [ ] **Step 5: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/hooks && npm run verify`
Expected: 13 tests PASS, `verify` en code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks
git commit -m "feat(web): add game reducer and single-socket hook"
```

---

### Task 3: Écran d'accueil

**Files:**
- Create: `apps/web/src/screens/Home.tsx`
- Test: `apps/web/src/screens/Home.test.tsx`

**Interfaces:**
- Consumes: `MAX_NAME_LENGTH`, `ROOM_CODE_LENGTH` (`@uno/protocol`)
- Produces: `<Home onCreate={(name: string) => void} onJoin={(code: string, name: string) => void} error={string | null} prefilledCode={string | null} />`

Les contraintes de saisie reprennent celles des schémas du protocole. Ce n'est pas une duplication de règle : c'est un retour immédiat pour l'utilisateur, le serveur restant seul juge.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/screens/Home.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Home } from './Home.js'

const setup = (overrides: Partial<Parameters<typeof Home>[0]> = {}) => {
  const props = {
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    error: null,
    prefilledCode: null,
    ...overrides,
  }
  render(<Home {...props} />)
  return props
}

describe('Home', () => {
  it('will not create a game without a name', async () => {
    const { onCreate } = setup()
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('creates a game with a trimmed name', async () => {
    const { onCreate } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), '  Ana  ')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledWith('Ana')
  })

  it('caps the name at the protocol limit', async () => {
    setup()
    const field = screen.getByLabelText(/your name/i)
    await userEvent.type(field, 'x'.repeat(40))
    expect((field as HTMLInputElement).value).toHaveLength(20)
  })

  it('joins with an uppercased code', async () => {
    const { onJoin } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ben')
    await userEvent.type(screen.getByLabelText(/game code/i), 'abc234')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(onJoin).toHaveBeenCalledWith('ABC234', 'Ben')
  })

  it('will not join on a short code', async () => {
    const { onJoin } = setup()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Ben')
    await userEvent.type(screen.getByLabelText(/game code/i), 'ABC')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('prefills a code taken from the URL', () => {
    setup({ prefilledCode: 'K7QM2X' })
    expect((screen.getByLabelText(/game code/i) as HTMLInputElement).value).toBe('K7QM2X')
  })

  it('shows a server error as a live region', () => {
    setup({ error: 'That game already has four players.' })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('four players')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/screens/Home.test.tsx`
Expected: FAIL — `./Home.js` introuvable.

- [ ] **Step 3: Implémenter l'écran**

`apps/web/src/screens/Home.tsx` :

```tsx
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH } from '@uno/protocol'
import { useState, type FormEvent } from 'react'

type HomeProps = {
  onCreate: (name: string) => void
  onJoin: (roomCode: string, name: string) => void
  error: string | null
  prefilledCode: string | null
}

export function Home({ onCreate, onJoin, error, prefilledCode }: HomeProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState(prefilledCode ?? '')

  const trimmedName = name.trim()
  const normalisedCode = code.trim().toUpperCase()
  const canCreate = trimmedName.length > 0
  const canJoin = canCreate && normalisedCode.length === ROOM_CODE_LENGTH

  /* Mirrors the protocol schemas so feedback is immediate. The server remains
     the only authority — this just spares a round trip to learn the obvious. */
  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    if (canCreate) onCreate(trimmedName)
  }
  const submitJoin = (event: FormEvent) => {
    event.preventDefault()
    if (canJoin) onJoin(normalisedCode, trimmedName)
  }

  return (
    <main className="home">
      <h1>UNO</h1>
      <p className="home-lede">Two to four players. Share the code and deal.</p>

      {error !== null && (
        <p className="banner banner-bad" role="alert">
          {error}
        </p>
      )}

      <form className="home-form" onSubmit={submitCreate}>
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="nickname"
          placeholder="Ana"
        />
        <button type="submit" className="btn btn-primary" disabled={!canCreate}>
          Create a game
        </button>
      </form>

      <div className="home-divider">
        <span>or join one</span>
      </div>

      <form className="home-form" onSubmit={submitJoin}>
        <label htmlFor="room-code">Game code</label>
        <input
          id="room-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={ROOM_CODE_LENGTH}
          autoComplete="off"
          spellCheck={false}
          placeholder="K7QM2X"
          className="code-input"
        />
        <button type="submit" className="btn" disabled={!canJoin}>
          Join game
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Ajouter les styles**

Ajouter à `apps/web/src/styles/app.css` :

```css
.home {
  max-width: 26rem;
  margin: 0 auto;
  padding: clamp(2rem, 8vh, 5rem) 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.home h1 {
  font-size: var(--step-3);
  letter-spacing: -0.02em;
}

.home-lede {
  margin: 0;
  color: var(--text-dim);
}

.home-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.home-form label {
  font-size: var(--step--1);
  font-weight: 600;
  color: var(--text-dim);
}

.home-form input {
  font: inherit;
  min-height: 44px;
  padding: 0.6rem 0.9rem;
  border-radius: var(--r-md);
  border: 1px solid var(--panel-edge);
  background: var(--panel);
  color: var(--text);
}

.code-input {
  font-family: var(--data);
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.btn {
  appearance: none;
  font: inherit;
  font-family: var(--display);
  min-height: 44px;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  border: 1px solid var(--panel-edge);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.btn:hover:not(:disabled) {
  border-color: var(--accent);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--green);
  border-color: transparent;
  color: var(--bone);
  font-weight: 600;
}

.home-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--text-dim);
  font-size: var(--step--1);
}

.home-divider::before,
.home-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--panel-edge);
}

.banner {
  margin: 0;
  padding: 0.7rem 1rem;
  border-radius: var(--r-md);
  font-size: var(--step--1);
  border-left: 4px solid var(--accent);
  background: var(--panel);
}

.banner-bad {
  border-left-color: var(--red);
}
```

- [ ] **Step 5: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/screens/Home.test.tsx && npm run verify`
Expected: 7 tests PASS, `verify` en code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens apps/web/src/styles/app.css
git commit -m "feat(web): add home screen with create and join"
```

---

*Tasks 4 à 10 — lobby, table, main et flux de jeu, sélecteur de couleur, chat, fin de partie, Playwright, Docker — sont rédigées à la suite de ce document.*
