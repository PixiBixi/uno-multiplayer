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

### Task 4: Écran de lobby

**Files:**
- Create: `apps/web/src/screens/Lobby.tsx`
- Test: `apps/web/src/screens/Lobby.test.tsx`

**Interfaces:**
- Consumes: `LobbyView`, `MAX_SEATS` (`@uno/protocol`)
- Produces: `<Lobby lobby={LobbyView} mySeat={number} onStart={() => void} onLeave={() => void} />`

Le bouton de démarrage n'est actif que pour l'hôte **et** à partir de deux joueurs — deux conditions distinctes, avec deux messages distincts, parce que « rien ne se passe quand je clique » est la pire des réponses.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/screens/Lobby.test.tsx` :

```tsx
import type { LobbyView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Lobby } from './Lobby.js'

const lobbyWith = (names: string[], canStart = names.length >= 2): LobbyView => ({
  roomCode: 'K7QM2X',
  hostSeat: 0,
  seats: names.map((name, seat) => ({ seat, name, status: 'active' as const })),
  canStart,
})

const setup = (lobby: LobbyView, mySeat: number) => {
  const props = { lobby, mySeat, onStart: vi.fn(), onLeave: vi.fn() }
  render(<Lobby {...props} />)
  return props
}

describe('Lobby', () => {
  it('shows the game code', () => {
    setup(lobbyWith(['Ana', 'Ben']), 0)
    expect(screen.getByText('K7QM2X')).toBeTruthy()
  })

  it('lists every seated player', () => {
    setup(lobbyWith(['Ana', 'Ben', 'Cleo']), 0)
    for (const name of ['Ana', 'Ben', 'Cleo']) expect(screen.getByText(name)).toBeTruthy()
  })

  it('shows the remaining empty seats', () => {
    setup(lobbyWith(['Ana', 'Ben']), 0)
    expect(screen.getAllByText(/waiting/i)).toHaveLength(2)
  })

  it('marks the host', () => {
    setup(lobbyWith(['Ana', 'Ben']), 1)
    expect(screen.getByText(/host/i)).toBeTruthy()
  })

  it('lets the host start once two players are seated', async () => {
    const { onStart } = setup(lobbyWith(['Ana', 'Ben']), 0)
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('tells the host they need another player', () => {
    setup(lobbyWith(['Ana'], false), 0)
    expect(screen.getByRole('button', { name: /start/i })).toHaveProperty('disabled', true)
    expect(screen.getByText(/at least two/i)).toBeTruthy()
  })

  it('tells a guest who they are waiting for', () => {
    setup(lobbyWith(['Ana', 'Ben']), 1)
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull()
    expect(screen.getByText(/waiting for ana/i)).toBeTruthy()
  })

  it('can leave', async () => {
    const { onLeave } = setup(lobbyWith(['Ana', 'Ben']), 1)
    await userEvent.click(screen.getByRole('button', { name: /leave/i }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('greys out a seat that dropped', () => {
    const lobby = lobbyWith(['Ana', 'Ben'])
    const seats = [...lobby.seats]
    seats[1] = { seat: 1, name: 'Ben', status: 'disconnected' }
    setup({ ...lobby, seats }, 0)
    expect(screen.getByText(/reconnecting/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/screens/Lobby.test.tsx`
Expected: FAIL — `./Lobby.js` introuvable.

- [ ] **Step 3: Implémenter l'écran**

`apps/web/src/screens/Lobby.tsx` :

```tsx
import { MAX_SEATS, type LobbyView, type SeatStatus } from '@uno/protocol'

const SEAT_PIGMENT = ['var(--red)', 'var(--blue)', 'var(--yellow)', 'var(--green)']

const STATUS_LABEL: Record<SeatStatus, string | null> = {
  active: null,
  disconnected: 'reconnecting…',
  left: 'left',
}

type LobbyProps = {
  lobby: LobbyView
  mySeat: number
  onStart: () => void
  onLeave: () => void
}

export function Lobby({ lobby, mySeat, onStart, onLeave }: LobbyProps) {
  const isHost = mySeat === lobby.hostSeat
  const hostName = lobby.seats.find((seat) => seat.seat === lobby.hostSeat)?.name ?? 'the host'
  const emptySeats = Math.max(0, MAX_SEATS - lobby.seats.length)

  return (
    <main className="lobby">
      <div className="stack">
        <span className="eyebrow">Game code</span>
        <p className="code-display">{lobby.roomCode}</p>
        <p className="hint">Share this with the people you want to play.</p>
      </div>

      <ul className="roster">
        {lobby.seats.map((seat) => {
          const status = STATUS_LABEL[seat.status]
          return (
            <li key={seat.seat} className={seat.status === 'active' ? 'slot' : 'slot slot-away'}>
              <span className="avatar" style={{ background: SEAT_PIGMENT[seat.seat % 4] }}>
                {seat.name.slice(0, 1).toUpperCase()}
              </span>
              <span>{seat.name}</span>
              {status !== null && <span className="slot-status">{status}</span>}
              {seat.seat === lobby.hostSeat && <span className="host-tag">Host</span>}
            </li>
          )
        })}
        {Array.from({ length: emptySeats }, (_, index) => (
          <li key={`empty-${index}`} className="slot slot-empty">
            <span className="avatar avatar-empty">—</span>
            <span>Waiting for a player…</span>
          </li>
        ))}
      </ul>

      {/* Two separate reasons the game cannot start, said separately. "Nothing
          happens when I click" is the worst possible answer. */}
      {isHost ? (
        <div className="stack">
          <button type="button" className="btn btn-primary" onClick={onStart} disabled={!lobby.canStart}>
            Start game
          </button>
          {!lobby.canStart && <p className="hint">A game needs at least two players.</p>}
        </div>
      ) : (
        <p className="hint">Waiting for {hostName} to start the game.</p>
      )}

      <button type="button" className="btn" onClick={onLeave}>
        Leave table
      </button>
    </main>
  )
}
```

- [ ] **Step 4: Ajouter les styles**

Ajouter à `apps/web/src/styles/app.css` :

```css
.lobby {
  max-width: 28rem;
  margin: 0 auto;
  padding: clamp(1.5rem, 6vh, 4rem) 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.eyebrow {
  font-size: var(--step--1);
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.code-display {
  margin: 0;
  font-family: var(--data);
  font-size: var(--step-2);
  font-weight: 700;
  letter-spacing: 0.22em;
}

.hint {
  margin: 0;
  font-size: var(--step--1);
  color: var(--text-dim);
}

.roster {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.slot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: var(--r-md);
  border: 1px solid var(--panel-edge);
  background: var(--panel);
  font-size: var(--step--1);
}

.slot-away {
  opacity: 0.6;
}

.slot-empty {
  border-style: dashed;
  background: none;
  color: var(--text-dim);
}

.slot-status {
  font-size: 0.72rem;
  color: var(--text-dim);
}

.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: none;
  font-family: var(--display);
  color: var(--ink);
}

.avatar-empty {
  background: var(--panel-edge);
  color: var(--text-dim);
}

.host-tag {
  margin-left: auto;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--yellow);
  color: var(--ink);
  padding: 0.16rem 0.45rem;
  border-radius: 4px;
}
```

- [ ] **Step 5: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/screens/Lobby.test.tsx && npm run verify`
Expected: 9 tests PASS, `verify` en code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens apps/web/src/styles/app.css
git commit -m "feat(web): add lobby screen with roster and host start"
```

---

### Task 5: Sièges et centre de table

**Files:**
- Create: `apps/web/src/components/Seat.tsx`
- Create: `apps/web/src/components/CentreStack.tsx`
- Test: `apps/web/src/components/Seat.test.tsx`, `apps/web/src/components/CentreStack.test.tsx`

**Interfaces:**
- Consumes: `CardBack`, `Card` (plan C1), `PlayerView` (`@uno/protocol`)
- Produces:
  - `<Seat name={string} handCount={number} status={SeatStatus} isTurn={boolean} orientation={'horizontal' | 'vertical'} />`
  - `<CentreStack view={PlayerView} />`

Le badge de sens de rotation vient des maquettes : il nomme la direction **en mots**, pas seulement par une flèche, et signale l'inversion. Sans lui, `direction` existait côté serveur et l'interface l'ignorait.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/components/Seat.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Seat } from './Seat.js'

const base = {
  name: 'Ben',
  handCount: 3,
  status: 'active' as const,
  isTurn: false,
  orientation: 'horizontal' as const,
}

describe('Seat', () => {
  it('shows the name and card count', () => {
    render(<Seat {...base} />)
    expect(screen.getByText('Ben')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('renders one card back per held card, capped for wide hands', () => {
    const { container } = render(<Seat {...base} handCount={12} />)
    const backs = container.querySelectorAll('[role="img"]')
    expect(backs.length).toBeGreaterThan(0)
    expect(backs.length).toBeLessThanOrEqual(6)
  })

  it('renders no card backs for an empty hand', () => {
    const { container } = render(<Seat {...base} handCount={0} />)
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0)
  })

  it('marks the active seat in text, not only in colour', () => {
    render(<Seat {...base} isTurn />)
    expect(screen.getByText(/their turn/i)).toBeTruthy()
  })

  it('says a seat is reconnecting', () => {
    render(<Seat {...base} status="disconnected" />)
    expect(screen.getByText(/reconnecting/i)).toBeTruthy()
  })

  it('says a seat has left', () => {
    render(<Seat {...base} status="left" />)
    expect(screen.getByText(/left/i)).toBeTruthy()
  })
})
```

`apps/web/src/components/CentreStack.test.tsx` :

```tsx
import type { Card as CardData, CardId } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CentreStack } from './CentreStack.js'

const top: CardData = { id: 'top' as CardId, kind: 'number', color: 'B', value: 7 }

const viewWith = (overrides: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: { seat: 0, hand: [], legalMoves: [] },
    opponents: [],
    discardTop: top,
    currentColor: 'B',
    pendingDraw: null,
    currentSeat: 0,
    direction: 1,
    drawPileCount: 34,
    phase: 'playing',
    winner: null,
    ...overrides,
  }) as PlayerView

describe('CentreStack', () => {
  it('shows how many cards are left to draw', () => {
    render(<CentreStack view={viewWith()} />)
    expect(screen.getByText(/34/)).toBeTruthy()
  })

  it('shows the discard top', () => {
    render(<CentreStack view={viewWith()} />)
    expect(screen.getByRole('img', { name: /blue 7/i })).toBeTruthy()
  })

  it('names the direction of play in words', () => {
    render(<CentreStack view={viewWith()} />)
    expect(screen.getByText(/clockwise/i)).toBeTruthy()
  })

  it('names the reversed direction', () => {
    render(<CentreStack view={viewWith({ direction: -1 })} />)
    expect(screen.getByText(/anticlockwise/i)).toBeTruthy()
  })

  it('names the colour in play, since a wild makes it diverge from the top card', () => {
    render(<CentreStack view={viewWith({ currentColor: 'G' })} />)
    expect(screen.getByText(/green/i)).toBeTruthy()
  })

  it('shows a stacked draw debt when one is live', () => {
    render(<CentreStack view={viewWith({ pendingDraw: { amount: 6, kind: 'draw2' } })} />)
    expect(screen.getByText(/\+6/)).toBeTruthy()
  })

  it('shows no debt badge when none stands', () => {
    render(<CentreStack view={viewWith()} />)
    expect(screen.queryByText(/stacked/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/components/Seat.test.tsx apps/web/src/components/CentreStack.test.tsx`
Expected: FAIL — les deux modules sont introuvables.

- [ ] **Step 3: Implémenter le siège**

`apps/web/src/components/Seat.tsx` :

```tsx
import type { SeatStatus } from '@uno/protocol'
import { CardBack } from './CardBack.js'

/** A fan wider than this stops communicating and starts costing layout. */
const MAX_FANNED = 6

const STATUS_TEXT: Record<SeatStatus, string | null> = {
  active: null,
  disconnected: 'reconnecting…',
  left: 'left the game',
}

type SeatProps = {
  name: string
  handCount: number
  status: SeatStatus
  isTurn: boolean
  orientation: 'horizontal' | 'vertical'
}

export function Seat({ name, handCount, status, isTurn, orientation }: SeatProps) {
  const shown = Math.min(handCount, MAX_FANNED)
  const statusText = STATUS_TEXT[status]

  return (
    <div className={`seat seat-${orientation}`}>
      <div className={`fan fan-${orientation}`} aria-hidden="true">
        {Array.from({ length: shown }, (_, index) => (
          <div key={index} className="fan-card">
            <CardBack />
          </div>
        ))}
      </div>
      <p className={isTurn ? 'plate plate-turn' : 'plate'}>
        <span className={`presence presence-${status}`} aria-hidden="true" />
        <span className="plate-name">{name}</span>
        <span className="plate-count">{handCount}</span>
        {/* Turn state and presence are never colour-only. */}
        {isTurn && <span className="plate-note">their turn</span>}
        {statusText !== null && <span className="plate-note">{statusText}</span>}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Implémenter le centre**

`apps/web/src/components/CentreStack.tsx` :

```tsx
import type { Color } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { Card } from './Card.js'
import { CardBack } from './CardBack.js'

const COLOR_NAME: Record<Color, string> = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' }
const COLOR_VALUE: Record<Color, string> = {
  R: 'var(--red)',
  G: 'var(--green)',
  B: 'var(--blue)',
  Y: 'var(--yellow)',
}

/** The same shape tokens the cards use, so the colour in play is readable
 *  without relying on hue. */
function ColourGlyph({ color }: { color: Color }) {
  const fill = 'var(--bone)'
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      {color === 'R' && <circle cx={12} cy={12} r={8} fill={fill} />}
      {color === 'G' && <path d="M12 3l9 16H3Z" fill={fill} />}
      {color === 'B' && <rect x={4} y={4} width={16} height={16} rx={2} fill={fill} />}
      {color === 'Y' && <path d="M12 2l10 10-10 10L2 12Z" fill={fill} />}
    </svg>
  )
}

function DirectionBadge({ direction }: { direction: 1 | -1 }) {
  return (
    <p className="dir-badge">
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={direction === -1 ? { transform: 'scaleX(-1)' } : undefined}
      >
        <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
        <path d="M20.5 4.5V10h-5.5" />
      </svg>
      {/* Named, not just drawn: an arrow alone is ambiguous at a glance. */}
      <span>{direction === 1 ? 'Clockwise' : 'Anticlockwise'}</span>
    </p>
  )
}

export function CentreStack({ view }: { view: PlayerView }) {
  return (
    <div className="centre-stack">
      <div className="pile-group">
        <div className="pile" aria-hidden="true">
          <CardBack />
        </div>
        <p className="pile-label">{view.drawPileCount} left</p>
      </div>

      <div className="pile">
        <Card card={view.discardTop} />
      </div>

      <div className="pile-group">
        <span
          className="colour-orb"
          style={{ background: COLOR_VALUE[view.currentColor], color: COLOR_VALUE[view.currentColor] }}
        >
          <ColourGlyph color={view.currentColor} />
        </span>
        <p className="pile-label">{COLOR_NAME[view.currentColor]} in play</p>
      </div>

      <DirectionBadge direction={view.direction} />

      {view.pendingDraw !== null && (
        <p className="debt-badge">
          <span className="debt-amount">+{view.pendingDraw.amount}</span> stacked
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Ajouter les styles**

Ajouter à `apps/web/src/styles/app.css` :

```css
.seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.fan {
  display: flex;
  justify-content: center;
}

.fan-card {
  width: 42px;
  flex: none;
}

.fan-horizontal > .fan-card + .fan-card {
  margin-left: -26px;
}

.fan-vertical {
  flex-direction: column;
  align-items: center;
}

.fan-vertical > .fan-card + .fan-card {
  margin-top: -46px;
}

.plate {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.32);
  border: 1px solid rgb(245 241 232 / 0.16);
  color: var(--bone);
  font-size: var(--step--1);
  white-space: nowrap;
}

.plate-turn {
  background: var(--green);
  border-color: transparent;
  box-shadow: 0 0 0 3px rgb(30 158 74 / 0.28);
}

.plate-count {
  font-family: var(--data);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.plate-note {
  font-size: 0.68rem;
  opacity: 0.8;
}

.presence {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.presence-active {
  background: #7ee2a0;
}
.presence-disconnected {
  background: #e0b64a;
}
.presence-left {
  background: #b9564a;
}

.centre-stack {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: clamp(0.6rem, 3vw, 1.4rem);
}

.pile {
  width: 84px;
}

.pile-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

.pile-label {
  margin: 0;
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bone);
  opacity: 0.75;
  text-align: center;
}

.colour-orb {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 3px solid rgb(245 241 232 / 0.85);
  display: grid;
  place-items: center;
  box-shadow: 0 0 22px -2px currentColor;
}

.dir-badge,
.debt-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-size: 0.7rem
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bone);
  white-space: nowrap;
}

.dir-badge {
  background: rgb(245 241 232 / 0.1);
  border: 1px solid rgb(245 241 232 / 0.3);
}

.debt-badge {
  background: var(--red);
  border: 1px solid transparent;
}

.debt-amount {
  font-family: var(--data);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
```

Attention : la déclaration `font-size: 0.7rem` ci-dessus doit se terminer par un point-virgule. La corriger en l'écrivant — c'est exactement le genre de collision silencieuse qui fait grossir le texte sans erreur visible.

- [ ] **Step 6: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/components && npm run verify`
Expected: 13 tests PASS pour ces deux fichiers, `verify` en code 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components apps/web/src/styles/app.css
git commit -m "feat(web): add seat plates and centre stack with direction badge"
```

---

### Task 6: Main, coups et sélecteur de couleur

**Files:**
- Create: `apps/web/src/components/Hand.tsx`
- Create: `apps/web/src/components/ColourPicker.tsx`
- Test: `apps/web/src/components/Hand.test.tsx`, `apps/web/src/components/ColourPicker.test.tsx`

**Interfaces:**
- Consumes: `Card` (plan C1), `Move`, `Card as CardData` (`@uno/engine`)
- Produces:
  - `<Hand cards={CardData[]} legalMoves={Move[]} onPlay={(move: Move) => void} />`
  - `<ColourPicker options={Extract<Move, { type: 'play' }>[]} onChoose={(move) => void} onCancel={() => void} />`
  - `movesForCard(legalMoves: Move[], cardId: CardId): Extract<Move, { type: 'play' }>[]`

Le point clef : une carte est jouable **si et seulement si** un coup de `legalMoves` la référence. Le client ne calcule rien. Et comme un joker est développé en un coup par couleur, choisir une couleur revient à choisir un coup — il n'y a aucune saisie à valider.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/components/Hand.test.tsx` :

```tsx
import type { Card as CardData, CardId, Move } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Hand, movesForCard } from './Hand.js'

const id = (value: string) => value as CardId
const red7: CardData = { id: id('r7'), kind: 'number', color: 'R', value: 7 }
const blue3: CardData = { id: id('b3'), kind: 'number', color: 'B', value: 3 }
const wild: CardData = { id: id('w'), kind: 'wild' }

describe('movesForCard', () => {
  it('finds the single move for a coloured card', () => {
    const moves: Move[] = [{ type: 'play', cardId: id('r7') }, { type: 'draw' }]
    expect(movesForCard(moves, id('r7'))).toEqual([{ type: 'play', cardId: id('r7') }])
  })

  it('finds all four colour options for a wild', () => {
    const moves: Move[] = [
      { type: 'play', cardId: id('w'), chosenColor: 'R' },
      { type: 'play', cardId: id('w'), chosenColor: 'G' },
      { type: 'play', cardId: id('w'), chosenColor: 'B' },
      { type: 'play', cardId: id('w'), chosenColor: 'Y' },
    ]
    expect(movesForCard(moves, id('w'))).toHaveLength(4)
  })

  it('returns nothing for a card with no legal move', () => {
    expect(movesForCard([{ type: 'draw' }], id('r7'))).toEqual([])
  })
})

describe('Hand', () => {
  it('renders every held card', () => {
    render(<Hand cards={[red7, blue3]} legalMoves={[]} onPlay={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('disables a card that no legal move references', () => {
    render(
      <Hand cards={[red7, blue3]} legalMoves={[{ type: 'play', cardId: id('r7') }]} onPlay={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /red 7/i })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: /blue 3/i })).toHaveProperty('disabled', true)
  })

  it('plays a coloured card straight away', async () => {
    const onPlay = vi.fn()
    render(<Hand cards={[red7]} legalMoves={[{ type: 'play', cardId: id('r7') }]} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button', { name: /red 7/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('r7') })
  })

  it('opens the colour picker for a wild instead of guessing', async () => {
    const onPlay = vi.fn()
    render(
      <Hand
        cards={[wild]}
        legalMoves={[
          { type: 'play', cardId: id('w'), chosenColor: 'R' },
          { type: 'play', cardId: id('w'), chosenColor: 'G' },
        ]}
        onPlay={onPlay}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    expect(onPlay).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /colour/i })).toBeTruthy()
  })

  it('plays the wild with the colour chosen', async () => {
    const onPlay = vi.fn()
    render(
      <Hand
        cards={[wild]}
        legalMoves={[
          { type: 'play', cardId: id('w'), chosenColor: 'R' },
          { type: 'play', cardId: id('w'), chosenColor: 'G' },
        ]}
        onPlay={onPlay}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    await userEvent.click(screen.getByRole('button', { name: /green/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: id('w'), chosenColor: 'G' })
  })

  it('closes the picker without playing when cancelled', async () => {
    const onPlay = vi.fn()
    render(
      <Hand
        cards={[wild]}
        legalMoves={[{ type: 'play', cardId: id('w'), chosenColor: 'R' }]}
        onPlay={onPlay}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /^wild$/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onPlay).not.toHaveBeenCalled()
  })
})
```

`apps/web/src/components/ColourPicker.test.tsx` :

```tsx
import type { CardId, Move } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColourPicker } from './ColourPicker.js'

const id = (value: string) => value as CardId
const options = (['R', 'G', 'B', 'Y'] as const).map(
  (chosenColor): Extract<Move, { type: 'play' }> => ({
    type: 'play',
    cardId: id('w'),
    chosenColor,
  }),
)

describe('ColourPicker', () => {
  it('offers only the colours the server allows', () => {
    render(<ColourPicker options={options.slice(0, 2)} onChoose={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /red|green|blue|yellow/i })).toHaveLength(2)
  })

  it('names each colour in text, not only by swatch', () => {
    render(<ColourPicker options={options} onChoose={vi.fn()} onCancel={vi.fn()} />)
    for (const name of [/red/i, /green/i, /blue/i, /yellow/i]) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('returns the exact move it was given', async () => {
    const onChoose = vi.fn()
    render(<ColourPicker options={options} onChoose={onChoose} onCancel={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /yellow/i }))
    expect(onChoose).toHaveBeenCalledWith(options[3])
  })

  it('cancels on Escape', async () => {
    const onCancel = vi.fn()
    render(<ColourPicker options={options} onChoose={vi.fn()} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('is a labelled dialog', () => {
    render(<ColourPicker options={options} onChoose={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /colour/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/components/Hand.test.tsx apps/web/src/components/ColourPicker.test.tsx`
Expected: FAIL — les deux modules sont introuvables.

- [ ] **Step 3: Implémenter le sélecteur de couleur**

`apps/web/src/components/ColourPicker.tsx` :

```tsx
import type { Color, Move } from '@uno/engine'
import { useEffect } from 'react'

type PlayMove = Extract<Move, { type: 'play' }>

const COLOR_NAME: Record<Color, string> = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' }
const COLOR_VALUE: Record<Color, string> = {
  R: 'var(--red)',
  G: 'var(--green)',
  B: 'var(--blue)',
  Y: 'var(--yellow)',
}

function Glyph({ color }: { color: Color }) {
  const fill = 'currentColor'
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden="true">
      {color === 'R' && <circle cx={12} cy={12} r={8} fill={fill} />}
      {color === 'G' && <path d="M12 3l9 16H3Z" fill={fill} />}
      {color === 'B' && <rect x={4} y={4} width={16} height={16} rx={2} fill={fill} />}
      {color === 'Y' && <path d="M12 2l10 10-10 10L2 12Z" fill={fill} />}
    </svg>
  )
}

type ColourPickerProps = {
  options: PlayMove[]
  onChoose: (move: PlayMove) => void
  onCancel: () => void
}

/**
 * Four buttons, one per legal move. The prototype used `prompt()`: cancelling it
 * threw, and typing `Z` locked the game forever. Choosing a colour here is
 * choosing a move, so there is nothing to validate.
 */
export function ColourPicker({ options, onChoose, onCancel }: ColourPickerProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="picker-veil">
      <div className="picker" role="dialog" aria-modal="true" aria-label="Choose the new colour">
        <h2 className="picker-title">Choose a colour</h2>
        <div className="picker-grid">
          {options.map((move) => {
            const color = move.chosenColor
            if (color === undefined) return null
            return (
              <button
                key={color}
                type="button"
                className="swatch"
                style={{ background: COLOR_VALUE[color] }}
                onClick={() => onChoose(move)}
              >
                <Glyph color={color} />
                {COLOR_NAME[color]}
              </button>
            )
          })}
        </div>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implémenter la main**

`apps/web/src/components/Hand.tsx` :

```tsx
import type { Card as CardData, CardId, Move } from '@uno/engine'
import { useState } from 'react'
import { Card } from './Card.js'
import { ColourPicker } from './ColourPicker.js'

type PlayMove = Extract<Move, { type: 'play' }>

/** A card is playable if and only if a legal move references it. The client
 *  never evaluates a rule of its own. */
export function movesForCard(legalMoves: Move[], cardId: CardId): PlayMove[] {
  return legalMoves.filter((move): move is PlayMove => move.type === 'play' && move.cardId === cardId)
}

type HandProps = {
  cards: CardData[]
  legalMoves: Move[]
  onPlay: (move: Move) => void
}

export function Hand({ cards, legalMoves, onPlay }: HandProps) {
  const [pending, setPending] = useState<PlayMove[] | null>(null)

  const choose = (options: PlayMove[]) => {
    const only = options[0]
    if (only === undefined) return
    // One option means no choice to make; several means a wild needs a colour.
    if (options.length === 1) onPlay(only)
    else setPending(options)
  }

  return (
    <>
      <div className="hand">
        {cards.map((card) => {
          const options = movesForCard(legalMoves, card.id)
          return (
            <div className="hand-card" key={card.id}>
              <Card
                card={card}
                disabled={options.length === 0}
                onPlay={() => choose(options)}
              />
            </div>
          )
        })}
      </div>
      {pending !== null && (
        <ColourPicker
          options={pending}
          onChoose={(move) => {
            setPending(null)
            onPlay(move)
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Ajouter les styles**

Ajouter à `apps/web/src/styles/app.css` :

```css
.hand {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  padding-top: 0.5rem;
}

.hand-card {
  width: 68px;
  flex: none;
}

.hand-card + .hand-card {
  margin-left: -18px;
}

.picker-veil {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(8 18 15 / 0.72);
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1.25rem;
  border-radius: var(--r-md);
  background: var(--felt);
  border: 1px solid var(--felt-edge);
  color: var(--bone);
}

.picker-title {
  margin: 0;
  font-size: var(--step-1);
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.65rem;
}

.swatch {
  appearance: none;
  border: 3px solid transparent;
  border-radius: var(--r-sm);
  min-width: 84px;
  min-height: 84px;
  display: grid;
  place-items: center;
  gap: 0.2rem;
  cursor: pointer;
  color: var(--bone);
  font-family: var(--display);
  font-size: var(--step--1);
  transition: transform 160ms ease;
}

.swatch:hover {
  transform: translateY(-3px);
}
```

- [ ] **Step 6: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/components && npm run verify`
Expected: 15 tests PASS pour ces deux fichiers, `verify` en code 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components apps/web/src/styles/app.css
git commit -m "feat(web): add hand with legal-move gating and colour picker"
```

---

### Task 7: Chat et journal, un seul flux

**Files:**
- Create: `apps/web/src/components/ChatPanel.tsx`
- Create: `apps/web/src/lib/describe-event.ts`
- Test: `apps/web/src/components/ChatPanel.test.tsx`, `apps/web/src/lib/describe-event.test.ts`

**Interfaces:**
- Consumes: `FeedEntry` (Task 2), `GameEvent` (`@uno/protocol`)
- Produces:
  - `describeEvent(event: GameEvent, nameOf: (seat: number) => string): string | null`
  - `<ChatPanel feed={FeedEntry[]} mySeat={number} nameOf={(seat) => string} onSend={(text: string) => void} />`

Décision retenue aux maquettes : **un seul panneau, deux natures de message**. Lire deux flux concurrents pendant son tour est pire qu'en lire un. Deux points qui comptent : le compteur de non-lus ne compte **que le chat**, et ouvrir le panneau ne prend **pas** le focus.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/lib/describe-event.test.ts` :

```ts
import type { Card, CardId } from '@uno/engine'
import { describe, expect, it } from 'vitest'
import { describeEvent } from './describe-event.js'

const nameOf = (seat: number) => ['Ana', 'Ben', 'Cleo'][seat] ?? `Seat ${seat}`
const card: Card = { id: 'c' as CardId, kind: 'draw2', color: 'B' }

describe('describeEvent', () => {
  it('names the player who played a card', () => {
    expect(describeEvent({ type: 'cardPlayed', seat: 1, card }, nameOf)).toBe(
      'Ben played a Blue draw two',
    )
  })

  it('uses singular and plural correctly for drawn cards', () => {
    expect(describeEvent({ type: 'cardsDrawn', seat: 0, count: 1 }, nameOf)).toBe('Ana drew a card')
    expect(describeEvent({ type: 'cardsDrawn', seat: 0, count: 4 }, nameOf)).toBe('Ana drew 4 cards')
  })

  it('describes the uno call and its penalty', () => {
    expect(describeEvent({ type: 'unoCalled', seat: 2 }, nameOf)).toBe('Cleo called UNO')
    expect(describeEvent({ type: 'unoPenalty', seat: 2, count: 2 }, nameOf)).toBe(
      'Cleo forgot to call UNO and drew 2',
    )
  })

  it('describes presence changes', () => {
    expect(describeEvent({ type: 'seatDisconnected', seat: 1 }, nameOf)).toBe('Ben lost connection')
    expect(describeEvent({ type: 'seatReconnected', seat: 1 }, nameOf)).toBe('Ben is back')
    expect(describeEvent({ type: 'seatLeft', seat: 1 }, nameOf)).toBe('Ben left the game')
  })

  it('distinguishes a win from an abandoned game', () => {
    expect(describeEvent({ type: 'gameOver', winner: 0 }, nameOf)).toBe('Ana wins')
    expect(describeEvent({ type: 'gameOver', winner: null }, nameOf)).toBe(
      'Game abandoned — not enough players',
    )
  })

  it('describes a restart', () => {
    expect(describeEvent({ type: 'gameRestarted' }, nameOf)).toBe('A new game was dealt')
  })

  it('falls back to a seat number for an unknown seat', () => {
    expect(describeEvent({ type: 'unoCalled', seat: 9 }, nameOf)).toBe('Seat 9 called UNO')
  })
})
```

`apps/web/src/components/ChatPanel.test.tsx` :

```tsx
import type { FeedEntry } from '../hooks/game-reducer.js'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel.js'

const nameOf = (seat: number) => ['Ana', 'Ben'][seat] ?? `Seat ${seat}`

const feed: FeedEntry[] = [
  { id: 1, kind: 'event', event: { type: 'unoCalled', seat: 1 } },
  { id: 2, kind: 'chat', seat: 1, name: 'Ben', text: 'close one' },
  { id: 3, kind: 'chat', seat: 0, name: 'Ana', text: 'not really' },
]

const setup = (overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) => {
  const props = { feed, mySeat: 0, nameOf, onSend: vi.fn(), ...overrides }
  render(<ChatPanel {...props} />)
  return props
}

describe('ChatPanel', () => {
  it('interleaves chat and system lines in one stream', () => {
    setup()
    expect(screen.getByText(/called UNO/i)).toBeTruthy()
    expect(screen.getByText('close one')).toBeTruthy()
  })

  it('marks system lines so they never read as speech', () => {
    const { container } = setup()
    expect(container.querySelectorAll('[data-system]')).toHaveLength(1)
  })

  it('attributes another player’s message', () => {
    setup()
    expect(screen.getByText('Ben')).toBeTruthy()
  })

  it('does not label your own messages with your name', () => {
    setup()
    expect(screen.queryByText('Ana')).toBeNull()
  })

  it('sends a trimmed message', async () => {
    const { onSend } = setup()
    await userEvent.type(screen.getByLabelText(/message the table/i), '  hello  ')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('hello')
  })

  it('refuses to send an empty message', async () => {
    const { onSend } = setup()
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('clears the field after sending', async () => {
    setup()
    const field = screen.getByLabelText(/message the table/i)
    await userEvent.type(field, 'hi{Enter}')
    expect((field as HTMLInputElement).value).toBe('')
  })

  it('collapses and reopens', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }))
    expect(screen.queryByLabelText(/message the table/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /table/i }))
    expect(screen.getByLabelText(/message the table/i)).toBeTruthy()
  })

  it('counts only chat as unread while collapsed', async () => {
    const { rerender } = render(
      <ChatPanel feed={[]} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }))
    rerender(<ChatPanel feed={feed} mySeat={0} nameOf={nameOf} onSend={vi.fn()} />)
    // One chat line from Ben; the UNO event and Ana's own line do not count.
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('does not steal focus when opened', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /collapse/i }))
    await userEvent.click(screen.getByRole('button', { name: /table/i }))
    expect(document.activeElement).not.toBe(screen.getByLabelText(/message the table/i))
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/components/ChatPanel.test.tsx apps/web/src/lib/describe-event.test.ts`
Expected: FAIL — les deux modules sont introuvables.

- [ ] **Step 3: Implémenter la description des événements**

`apps/web/src/lib/describe-event.ts` :

```ts
import type { Color } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'

const COLOR_NAME: Record<Color, string> = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' }

function cardName(card: GameEvent extends { card: infer C } ? C : never): string {
  switch (card.kind) {
    case 'number':
      return `${COLOR_NAME[card.color]} ${card.value}`
    case 'skip':
      return `${COLOR_NAME[card.color]} skip`
    case 'reverse':
      return `${COLOR_NAME[card.color]} reverse`
    case 'draw2':
      return `${COLOR_NAME[card.color]} draw two`
    case 'wild':
      return 'Wild'
    case 'wild4':
      return 'Wild draw four'
  }
}

/**
 * Turns a server event into a line a player understands. Written from the
 * player's side of the screen: names, not seat indices, wherever one is known.
 */
export function describeEvent(event: GameEvent, nameOf: (seat: number) => string): string | null {
  switch (event.type) {
    case 'cardPlayed':
      return `${nameOf(event.seat)} played a ${cardName(event.card)}`
    case 'cardsDrawn':
      return event.count === 1
        ? `${nameOf(event.seat)} drew a card`
        : `${nameOf(event.seat)} drew ${event.count} cards`
    case 'unoCalled':
      return `${nameOf(event.seat)} called UNO`
    case 'unoPenalty':
      return `${nameOf(event.seat)} forgot to call UNO and drew ${event.count}`
    case 'seatDisconnected':
      return `${nameOf(event.seat)} lost connection`
    case 'seatReconnected':
      return `${nameOf(event.seat)} is back`
    case 'seatLeft':
      return `${nameOf(event.seat)} left the game`
    case 'gameOver':
      return event.winner === null
        ? 'Game abandoned — not enough players'
        : `${nameOf(event.winner)} wins`
    case 'gameRestarted':
      return 'A new game was dealt'
  }
}
```

- [ ] **Step 4: Implémenter le panneau**

`apps/web/src/components/ChatPanel.tsx` :

```tsx
import { MAX_CHAT_LENGTH } from '@uno/protocol'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { FeedEntry } from '../hooks/game-reducer.js'
import { describeEvent } from '../lib/describe-event.js'

const SEAT_PIGMENT = ['var(--red)', 'var(--blue)', 'var(--yellow)', 'var(--green)']

type ChatPanelProps = {
  feed: FeedEntry[]
  mySeat: number
  nameOf: (seat: number) => string
  onSend: (text: string) => void
}

export function ChatPanel({ feed, mySeat, nameOf, onSend }: ChatPanelProps) {
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const seenRef = useRef(0)
  const [unread, setUnread] = useState(0)

  /* Unread counts chat from other people only. A badge that ticks up every time
     somebody draws a card trains people to ignore it. */
  const chatCount = feed.filter((entry) => entry.kind === 'chat' && entry.seat !== mySeat).length

  useEffect(() => {
    if (open) {
      seenRef.current = chatCount
      setUnread(0)
      return
    }
    setUnread(Math.max(0, chatCount - seenRef.current))
  }, [chatCount, open])

  useEffect(() => {
    if (!open) return
    const body = bodyRef.current
    if (body !== null) body.scrollTop = body.scrollHeight
  }, [feed, open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text.length === 0) return
    onSend(text)
    setDraft('')
  }

  if (!open) {
    return (
      <button type="button" className="chat-tab" onClick={() => setOpen(true)}>
        Table
        {unread > 0 && <span className="unread">{unread}</span>}
      </button>
    )
  }

  return (
    <section className="chat-panel" aria-label="Table chat and log">
      <header className="chat-head">
        <span>Table</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(false)}
          aria-label="Collapse the table panel"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </header>

      <div className="chat-body" ref={bodyRef}>
        {feed.map((entry) => {
          if (entry.kind === 'event') {
            const text = describeEvent(entry.event, nameOf)
            if (text === null) return null
            return (
              <p className="sys-line" data-system="" key={entry.id}>
                {text}
              </p>
            )
          }
          const mine = entry.seat === mySeat
          return (
            <div className={mine ? 'msg msg-mine' : 'msg'} key={entry.id}>
              <div className="msg-bubble">
                {!mine && (
                  <span className="msg-who" style={{ color: SEAT_PIGMENT[entry.seat % 4] }}>
                    {entry.name}
                  </span>
                )}
                <span>{entry.text}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* No autoFocus: stealing the keyboard mid-turn would break playing cards
          by keyboard. */}
      <form className="chat-foot" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="chat-input">
          Message the table
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          placeholder="Say something…"
        />
        <button type="submit" className="btn btn-primary">
          Send
        </button>
      </form>
    </section>
  )
}
```

- [ ] **Step 5: Ajouter les styles**

Ajouter à `apps/web/src/styles/app.css` :

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.chat-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 420px;
  border-radius: var(--r-md);
  background: var(--felt);
  border: 1px solid var(--felt-edge);
  color: var(--bone);
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--felt-edge);
  font-family: var(--display);
  font-size: var(--step--1);
}

.chat-head > button {
  margin-left: auto;
}

.icon-btn {
  appearance: none;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
}

.icon-btn:hover {
  background: rgb(245 241 232 / 0.12);
}

.chat-body {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.9rem;
  overflow-y: auto;
  font-size: var(--step--1);
}

.msg {
  display: flex;
}

.msg-mine {
  flex-direction: row-reverse;
}

.msg-bubble {
  max-width: 82%;
  padding: 0.4rem 0.65rem;
  border-radius: 12px 12px 12px 3px;
  background: rgb(245 241 232 / 0.1);
}

.msg-mine .msg-bubble {
  border-radius: 12px 12px 3px 12px;
  background: color-mix(in srgb, var(--green) 45%, transparent);
}

.msg-who {
  display: block;
  font-weight: 700;
  font-size: 0.72rem;
  margin-bottom: 0.1rem;
}

.sys-line {
  margin: 0;
  font-size: 0.74rem;
  opacity: 0.66;
}

.chat-foot {
  display: flex;
  gap: 0.5rem;
  padding: 0.6rem;
  border-top: 1px solid var(--felt-edge);
}

.chat-foot input {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: var(--step--1);
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgb(245 241 232 / 0.22);
  background: rgb(0 0 0 / 0.3);
  color: var(--bone);
}

.chat-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  background: var(--felt);
  border: 1px solid var(--felt-edge);
  color: var(--bone);
  font-family: var(--display);
  font-size: var(--step--1);
  cursor: pointer;
}

.unread {
  min-width: 20px;
  height: 20px;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--red);
  color: var(--bone);
  display: grid;
  place-items: center;
  font-family: var(--data);
  font-size: 0.68rem;
  font-weight: 700;
}
```

- [ ] **Step 6: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/components/ChatPanel.test.tsx apps/web/src/lib/describe-event.test.ts && npm run verify`
Expected: 18 tests PASS pour ces deux fichiers, `verify` en code 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src apps/web/src/styles/app.css
git commit -m "feat(web): add merged chat and game log panel"
```

---

### Task 8: Table, fin de partie, assemblage de l'application

**Files:**
- Create: `apps/web/src/components/GameOver.tsx`, `apps/web/src/components/Toaster.tsx`
- Create: `apps/web/src/screens/Table.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/components/GameOver.test.tsx`, `apps/web/src/screens/Table.test.tsx`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces:
  - `<GameOver view={PlayerView} nameOf={(seat) => string} isHost={boolean} onRestart={() => void} onLeave={() => void} />`
  - `<Toaster toasts={Toast[]} onDismiss={(id: number) => void} />`
  - `<Table view={PlayerView} mySeat={number} … />`
  - `App` assemble `useGameSocket` et les trois écrans

Les sièges sont disposés **relativement au spectateur** : ta main est toujours en bas. Le moteur garde des indices stables, donc c'est le client qui fait tourner l'arrangement, pas la donnée.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/components/GameOver.test.tsx` :

```tsx
import type { Card, CardId } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameOver } from './GameOver.js'

const top: Card = { id: 't' as CardId, kind: 'number', color: 'R', value: 3 }
const nameOf = (seat: number) => ['You', 'Ben', 'Cleo'][seat] ?? `Seat ${seat}`

const finished = (winner: number | null): PlayerView =>
  ({
    you: { seat: 0, hand: [top, top], legalMoves: [] },
    opponents: [
      { seat: 1, name: 'Ben', handCount: 5, status: 'active' },
      { seat: 2, name: 'Cleo', handCount: 0, status: 'active' },
    ],
    discardTop: top,
    currentColor: 'R',
    pendingDraw: null,
    currentSeat: 0,
    direction: 1,
    drawPileCount: 10,
    phase: 'finished',
    winner,
  }) as PlayerView

describe('GameOver', () => {
  it('names the winner', () => {
    render(
      <GameOver view={finished(2)} nameOf={nameOf} isHost onRestart={vi.fn()} onLeave={vi.fn()} />,
    )
    expect(screen.getByRole('heading', { name: /cleo wins/i })).toBeTruthy()
  })

  it('lists final counts, lowest first', () => {
    render(
      <GameOver view={finished(2)} nameOf={nameOf} isHost onRestart={vi.fn()} onLeave={vi.fn()} />,
    )
    const rows = screen.getAllByRole('listitem').map((row) => row.textContent ?? '')
    expect(rows[0]).toMatch(/cleo/i)
    expect(rows[rows.length - 1]).toMatch(/ben/i)
  })

  it('says the game was abandoned when there is no winner', () => {
    render(
      <GameOver
        view={finished(null)}
        nameOf={nameOf}
        isHost={false}
        onRestart={vi.fn()}
        onLeave={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: /abandoned/i })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('offers a restart to the host', async () => {
    const onRestart = vi.fn()
    render(
      <GameOver view={finished(2)} nameOf={nameOf} isHost onRestart={onRestart} onLeave={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /play again/i }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('tells a guest who can restart instead of showing a dead button', () => {
    render(
      <GameOver
        view={finished(2)}
        nameOf={nameOf}
        isHost={false}
        onRestart={vi.fn()}
        onLeave={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /play again/i })).toBeNull()
    expect(screen.getByText(/host/i)).toBeTruthy()
  })

  it('can always leave', async () => {
    const onLeave = vi.fn()
    render(
      <GameOver view={finished(null)} nameOf={nameOf} isHost onRestart={vi.fn()} onLeave={onLeave} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /leave|lobby/i }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
```

`apps/web/src/screens/Table.test.tsx` :

```tsx
import type { Card, CardId } from '@uno/engine'
import type { PlayerView } from '@uno/protocol'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Table } from './Table.js'

const top: Card = { id: 'top' as CardId, kind: 'number', color: 'R', value: 3 }
const mine: Card = { id: 'mine' as CardId, kind: 'number', color: 'R', value: 5 }

const viewWith = (overrides: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: { seat: 0, hand: [mine], legalMoves: [{ type: 'play', cardId: mine.id }, { type: 'draw' }] },
    opponents: [
      { seat: 1, name: 'Ben', handCount: 4, status: 'active' },
      { seat: 2, name: 'Cleo', handCount: 2, status: 'active' },
      { seat: 3, name: 'Dan', handCount: 7, status: 'active' },
    ],
    discardTop: top,
    currentColor: 'R',
    pendingDraw: null,
    currentSeat: 0,
    direction: 1,
    drawPileCount: 20,
    phase: 'playing',
    winner: null,
    ...overrides,
  }) as PlayerView

const setup = (view: PlayerView) => {
  const props = {
    view,
    lobby: null,
    feed: [],
    toasts: [],
    onPlay: vi.fn(),
    onRestart: vi.fn(),
    onLeave: vi.fn(),
    onSend: vi.fn(),
    onDismissToast: vi.fn(),
  }
  render(<Table {...props} />)
  return props
}

describe('Table', () => {
  it('shows every opponent', () => {
    setup(viewWith())
    for (const name of ['Ben', 'Cleo', 'Dan']) expect(screen.getByText(name)).toBeTruthy()
  })

  it('plays a card from your hand', async () => {
    const { onPlay } = setup(viewWith())
    await userEvent.click(screen.getByRole('button', { name: /red 5/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'play', cardId: mine.id })
  })

  it('enables draw only when it is a legal move', async () => {
    const { onPlay } = setup(viewWith())
    await userEvent.click(screen.getByRole('button', { name: /draw/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'draw' })
  })

  it('disables draw when it is not your turn', () => {
    setup(viewWith({ currentSeat: 1, you: { seat: 0, hand: [mine], legalMoves: [] } } as Partial<PlayerView>))
    expect(screen.getByRole('button', { name: /draw/i })).toHaveProperty('disabled', true)
  })

  it('offers UNO only when calling it is legal', () => {
    setup(viewWith())
    expect(screen.queryByRole('button', { name: /uno/i })).toBeNull()
  })

  it('shows the UNO control when the move is offered', async () => {
    const { onPlay } = setup(
      viewWith({
        you: { seat: 0, hand: [mine, mine], legalMoves: [{ type: 'callUno' }] },
      } as Partial<PlayerView>),
    )
    await userEvent.click(screen.getByRole('button', { name: /uno/i }))
    expect(onPlay).toHaveBeenCalledWith({ type: 'callUno' })
  })

  it('labels the accept-draw control with the debt it costs', () => {
    setup(
      viewWith({
        pendingDraw: { amount: 4, kind: 'draw2' },
        you: { seat: 0, hand: [mine], legalMoves: [{ type: 'acceptDraw' }] },
      } as Partial<PlayerView>),
    )
    expect(screen.getByRole('button', { name: /take 4/i })).toBeTruthy()
  })

  it('covers the table with the end screen once finished', () => {
    setup(viewWith({ phase: 'finished', winner: 1 }))
    expect(screen.getByRole('heading', { name: /wins/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/components/GameOver.test.tsx apps/web/src/screens/Table.test.tsx`
Expected: FAIL — les modules sont introuvables.

- [ ] **Step 3: Implémenter la fin de partie**

`apps/web/src/components/GameOver.tsx` :

```tsx
import type { PlayerView } from '@uno/protocol'

type GameOverProps = {
  view: PlayerView
  nameOf: (seat: number) => string
  isHost: boolean
  onRestart: () => void
  onLeave: () => void
}

export function GameOver({ view, nameOf, isHost, onRestart, onLeave }: GameOverProps) {
  const abandoned = view.winner === null

  /* Final counts come from fields that already exist. Nobody's actual cards are
     revealed, even after the game ends, so this needs no protocol change. */
  const standings = [
    { seat: view.you.seat, count: view.you.hand.length },
    ...view.opponents.map((opponent) => ({ seat: opponent.seat, count: opponent.handCount })),
  ].sort((a, b) => a.count - b.count)

  return (
    <div className="over-veil">
      <div className="over-card" role="dialog" aria-modal="true">
        {abandoned ? (
          <>
            <h2>Game abandoned</h2>
            <p className="hint">
              A game needs two players, so this one ends with no winner.
            </p>
          </>
        ) : (
          <>
            <h2>{nameOf(view.winner ?? -1)} wins</h2>
            <ul className="standings">
              {standings.map((row) => (
                <li key={row.seat} className={row.count === 0 ? 'standing standing-won' : 'standing'}>
                  <span>{nameOf(row.seat)}</span>
                  <span className="standing-count">{row.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="over-actions">
          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={onRestart}>
              Play again
            </button>
          ) : (
            <p className="hint">Waiting for the host to deal again.</p>
          )}
          <button type="button" className="btn" onClick={onLeave}>
            Leave table
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implémenter les toasts**

`apps/web/src/components/Toaster.tsx` :

```tsx
import type { Toast } from '../hooks/game-reducer.js'

type ToasterProps = {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

/** Live region, not a modal: a message must never block the game thread the way
 *  the prototype's `alert()` did. */
export function Toaster({ toasts, onDismiss }: ToasterProps) {
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          <div>
            <b>{toast.title}</b>
            <span>{toast.detail}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onDismiss(toast.id)}
            aria-label={`Dismiss: ${toast.title}`}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Implémenter la table**

`apps/web/src/screens/Table.tsx` :

```tsx
import type { Move } from '@uno/engine'
import type { LobbyView, PlayerView } from '@uno/protocol'
import { CentreStack } from '../components/CentreStack.js'
import { ChatPanel } from '../components/ChatPanel.js'
import { GameOver } from '../components/GameOver.js'
import { Hand } from '../components/Hand.js'
import { Seat } from '../components/Seat.js'
import { Toaster } from '../components/Toaster.js'
import type { FeedEntry, Toast } from '../hooks/game-reducer.js'

type TableProps = {
  view: PlayerView
  lobby: LobbyView | null
  feed: FeedEntry[]
  toasts: Toast[]
  onPlay: (move: Move) => void
  onRestart: () => void
  onLeave: () => void
  onSend: (text: string) => void
  onDismissToast: (id: number) => void
}

/** Seats are laid out relative to the viewer: your hand is always at the bottom
 *  edge. The engine keeps seat numbers stable, so the client rotates the
 *  arrangement rather than the data. */
const AREAS = ['west', 'north', 'east'] as const

export function Table({
  view,
  lobby,
  feed,
  toasts,
  onPlay,
  onRestart,
  onLeave,
  onSend,
  onDismissToast,
}: TableProps) {
  const myTurn = view.currentSeat === view.you.seat
  const canDraw = view.you.legalMoves.some((move) => move.type === 'draw')
  const acceptDraw = view.you.legalMoves.find((move) => move.type === 'acceptDraw')
  const canCallUno = view.you.legalMoves.some((move) => move.type === 'callUno')

  const nameOf = (seat: number): string => {
    if (seat === view.you.seat) return 'You'
    const opponent = view.opponents.find((candidate) => candidate.seat === seat)
    if (opponent !== undefined) return opponent.name
    return lobby?.seats.find((candidate) => candidate.seat === seat)?.name ?? `Seat ${seat}`
  }

  const isHost = lobby !== null && lobby.hostSeat === view.you.seat

  return (
    <main className="table-screen">
      <div className="table-surface">
        <div className="table-grid">
          {view.opponents.slice(0, 3).map((opponent, index) => (
            <div className={`area-${AREAS[index] ?? 'north'}`} key={opponent.seat}>
              <Seat
                name={opponent.name}
                handCount={opponent.handCount}
                status={opponent.status}
                isTurn={view.currentSeat === opponent.seat}
                orientation={index === 1 ? 'horizontal' : 'vertical'}
              />
            </div>
          ))}

          <div className="area-centre">
            <CentreStack view={view} />
          </div>

          <div className="area-south">
            <div className="controls">
              {acceptDraw !== undefined ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onPlay(acceptDraw)}
                >
                  Take {view.pendingDraw?.amount ?? 0}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={!canDraw}
                  onClick={() => onPlay({ type: 'draw' })}
                >
                  Draw card
                </button>
              )}
              {/* The UNO control only exists when calling it is a legal move. */}
              {canCallUno && (
                <button
                  type="button"
                  className="btn btn-uno"
                  onClick={() => onPlay({ type: 'callUno' })}
                >
                  UNO!
                </button>
              )}
            </div>

            <Hand cards={view.you.hand} legalMoves={view.you.legalMoves} onPlay={onPlay} />

            <p className={myTurn ? 'plate plate-turn' : 'plate'}>
              <span className="presence presence-active" aria-hidden="true" />
              <span className="plate-name">You</span>
              <span className="plate-count">{view.you.hand.length}</span>
              {myTurn && <span className="plate-note">your turn</span>}
            </p>
          </div>
        </div>
      </div>

      <ChatPanel feed={feed} mySeat={view.you.seat} nameOf={nameOf} onSend={onSend} />
      <Toaster toasts={toasts} onDismiss={onDismissToast} />

      {view.phase === 'finished' && (
        <GameOver
          view={view}
          nameOf={nameOf}
          isHost={isHost}
          onRestart={onRestart}
          onLeave={onLeave}
        />
      )}
    </main>
  )
}
```

- [ ] **Step 6: Assembler l'application**

`apps/web/src/App.tsx` :

```tsx
import { readRoomCodeFromUrl } from './lib/room-url.js'
import { Home } from './screens/Home.js'
import { Lobby } from './screens/Lobby.js'
import { Table } from './screens/Table.js'
import { Toaster } from './components/Toaster.js'
import { useGameSocket } from './hooks/useGameSocket.js'

/** The screen is a function of what the server pushed. There is no client-side
 *  navigation state to fall out of step with the game. */
export function App() {
  const { state, actions } = useGameSocket()

  if (state.connection === 'lost') {
    return (
      <main className="home">
        <h1>UNO</h1>
        <p className="banner banner-bad" role="alert">
          Connection lost. Trying to reconnect…
        </p>
      </main>
    )
  }

  if (state.screen === 'table' && state.view !== null) {
    return (
      <Table
        view={state.view}
        lobby={state.lobby}
        feed={state.feed}
        toasts={state.toasts}
        onPlay={actions.playMove}
        onRestart={actions.restartGame}
        onLeave={actions.leave}
        onSend={actions.sendChat}
        onDismissToast={actions.dismissToast}
      />
    )
  }

  if (state.screen === 'lobby' && state.lobby !== null && state.seat !== null) {
    return (
      <>
        <Lobby
          lobby={state.lobby}
          mySeat={state.seat}
          onStart={actions.startGame}
          onLeave={actions.leave}
        />
        <Toaster toasts={state.toasts} onDismiss={actions.dismissToast} />
      </>
    )
  }

  return (
    <Home
      onCreate={actions.createRoom}
      onJoin={actions.joinRoom}
      error={state.error}
      prefilledCode={readRoomCodeFromUrl()}
    />
  )
}
```

Remplacer le test `apps/web/src/App.test.tsx` du plan C1, devenu obsolète — `App` monte désormais une socket. Le remplacer par :

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}))

const { App } = await import('./App.js')

describe('App', () => {
  it('starts on the home screen', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /uno/i })).toBeTruthy()
  })
})
```

- [ ] **Step 7: Ajouter les styles de table et de fin**

Ajouter à `apps/web/src/styles/app.css` :

```css
.table-screen {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: clamp(0.75rem, 3vw, 1.5rem);
  max-width: 1100px;
  margin: 0 auto;
}

.table-surface {
  position: relative;
  border-radius: var(--r-lg);
  border: 1px solid var(--felt-edge);
  background: radial-gradient(ellipse 80% 60% at 50% 45%, var(--felt-edge), var(--felt) 70%);
  color: var(--bone);
  padding: clamp(1rem, 3vw, 1.75rem);
}

.table-grid {
  display: grid;
  grid-template-areas:
    '.    north .'
    'west centre east'
    '.    south .';
  grid-template-columns: minmax(56px, 0.7fr) 1.6fr minmax(56px, 0.7fr);
  gap: clamp(0.5rem, 2vw, 1.25rem);
  align-items: center;
  justify-items: center;
  min-height: 430px;
}

.area-north {
  grid-area: north;
}
.area-west {
  grid-area: west;
}
.area-east {
  grid-area: east;
}
.area-centre {
  grid-area: centre;
}
.area-south {
  grid-area: south;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.controls {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}

.btn-uno {
  background: var(--red);
  border-color: transparent;
  color: var(--bone);
  font-weight: 600;
  letter-spacing: 0.05em;
}

.over-veil {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1rem;
  border-radius: var(--r-lg);
  background: rgb(8 18 15 / 0.82);
}

.over-card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: clamp(1.25rem, 4vw, 2rem);
  text-align: center;
  border-radius: var(--r-md);
  background: var(--felt);
  border: 1px solid var(--felt-edge);
  color: var(--bone);
  box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.7);
}

.standings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
}

.standing {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border-radius: var(--r-sm);
  background: rgb(245 241 232 / 0.06);
  font-size: var(--step--1);
}

.standing-won {
  background: color-mix(in srgb, var(--green) 30%, transparent);
  font-weight: 600;
}

.standing-count {
  margin-left: auto;
  font-family: var(--data);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.over-actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.toaster {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: min(360px, calc(100vw - 2rem));
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.7rem 0.5rem 0.7rem 1rem;
  border-radius: var(--r-md);
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-left: 4px solid var(--accent);
  font-size: var(--step--1);
}

.toast b {
  display: block;
  font-family: var(--display);
}

.toast-warn {
  border-left-color: var(--yellow);
}
.toast-bad {
  border-left-color: var(--red);
}

@media (max-width: 620px) {
  .table-grid {
    grid-template-areas:
      'north'
      'centre'
      'south';
    grid-template-columns: 1fr;
    min-height: 0;
  }

  /* Below this width three fanned side seats do not fit; they collapse into the
     north row rather than squeezing the centre out of the viewport. */
  .area-west,
  .area-east {
    grid-area: north;
  }
}
```

- [ ] **Step 8: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web && npm run verify && npm run build`
Expected: tous les tests du client PASS, `verify` et `build` en code 0.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): assemble table, end-of-game screen and app shell"
```

---

### Task 9: Tests de bout en bout Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/game.spec.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: le build client et le serveur construits
- Produces: `npm run e2e` — lance le serveur, ouvre plusieurs contextes navigateur, joue une partie

Playwright teste ce qu'aucun test unitaire ne peut : **trois navigateurs réels autour d'une même table**. Chaque joueur est un `browser.newContext()` distinct, donc un `localStorage` et une socket distincts — indispensable pour vérifier la reconnexion.

- [ ] **Step 1: Écrire le test qui échoue**

`e2e/game.spec.ts` :

```ts
import { expect, test, type Browser, type Page } from '@playwright/test'

/** One player is one browser context: its own localStorage, its own socket. */
async function openPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

async function createGame(page: Page, name: string): Promise<string> {
  await page.goto('/')
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Create a game' }).click()
  const code = await page.locator('.code-display').textContent()
  if (code === null) throw new Error('no room code was shown')
  return code.trim()
}

async function joinGame(page: Page, code: string, name: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Your name').fill(name)
  await page.getByLabel('Game code').fill(code)
  await page.getByRole('button', { name: 'Join game' }).click()
}

test('three players play a hand together', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guestOne = await openPlayer(browser)
  const guestTwo = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guestOne, code, 'Ben')
  await joinGame(guestTwo, code, 'Cleo')

  // Everyone sees the full roster before the game starts.
  await expect(host.getByText('Cleo')).toBeVisible()
  await expect(guestTwo.getByText('Ana')).toBeVisible()

  await host.getByRole('button', { name: 'Start game' }).click()

  // Each player holds seven cards and sees only their own.
  for (const page of [host, guestOne, guestTwo]) {
    await expect(page.locator('.hand-card')).toHaveCount(7)
  }

  // Exactly one seat has the turn, and it is announced in text.
  await expect(host.getByText(/your turn|their turn/).first()).toBeVisible()

  // The direction of play is named, not merely drawn.
  await expect(host.getByText(/clockwise/i)).toBeVisible()
})

test('a player who reloads keeps their seat and their hand', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(guest.locator('.hand-card')).toHaveCount(7)

  const before = await guest.locator('.hand-card [role="img"]').first().getAttribute('aria-label')

  await guest.reload()

  // The session token in localStorage reclaims the seat, hand intact.
  await expect(guest.locator('.hand-card')).toHaveCount(7)
  const after = await guest.locator('.hand-card [role="img"]').first().getAttribute('aria-label')
  expect(after).toBe(before)
})

test('a stranger cannot see anybody else’s cards', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Ben')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host.locator('.hand-card')).toHaveCount(7)

  const guestLabels = await guest.locator('.hand-card [role="img"]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label')),
  )
  const hostMarkup = await host.content()

  // No card the guest holds may appear anywhere in the host's document.
  for (const label of guestLabels) {
    if (label === null) continue
    expect(hostMarkup).not.toContain(label)
  }
})

test('the game code is shareable through the URL', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  expect(host.url()).toContain(`room=${code}`)

  // Landing on the shared URL prefills the code.
  await guest.goto(`/?room=${code}`)
  await expect(guest.getByLabel('Game code')).toHaveValue(code)
})

test('an unknown code is refused with a readable message', async ({ browser }) => {
  const page = await openPlayer(browser)
  await joinGame(page, 'ZZZZZZ', 'Nobody')
  await expect(page.getByRole('alert')).toContainText(/no game with that code/i)
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run e2e`
Expected: FAIL — le script `e2e` n'existe pas.

- [ ] **Step 3: Installer Playwright**

```bash
npm install -D @playwright/test@^1.62.1
npx playwright install --with-deps chromium
```

- [ ] **Step 4: Configurer Playwright**

`playwright.config.ts` :

```ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 5099

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  workers: 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /* The real server, serving the real client build. A dev server would test a
     different artefact from the one that ships. */
  webServer: {
    command: 'npm run build && node apps/server/dist/index.js',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      STATIC_ROOT: 'apps/web/dist',
      GRACE_PERIOD_MS: '60000',
    },
  },
})
```

`npm run build` construit les workspaces TypeScript ; il faut aussi que le client soit bâti. Ajouter au `package.json` racine, dans `scripts` :

```json
    "build": "tsc --build tsconfig.build.json && npm run build -w @uno/web",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
```

- [ ] **Step 5: Ignorer les artefacts**

Ajouter à `.gitignore` :

```
playwright-report/
test-results/
.playwright/
```

Et à `.prettierignore` :

```
playwright-report/
test-results/
```

- [ ] **Step 6: Lancer les tests**

Run: `npm run e2e`
Expected: 5 tests PASS.

Le test « a stranger cannot see anybody else's cards » est le plus important du dépôt : il vérifie sur le document réel, pas sur un objet en mémoire, qu'aucune carte adverse n'atteint le navigateur.

- [ ] **Step 7: Ajouter le job à la CI**

Dans `.github/workflows/ci.yml`, ajouter un job après `coverage` :

```yaml
  e2e:
    name: End to end
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts e2e .github/workflows/ci.yml .gitignore .prettierignore package.json package-lock.json
git commit -m "test(e2e): add Playwright multi-context game, reconnection and leak tests"
```

---

### Task 10: Image Docker et déploiement

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `compose.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm run build`, `STATIC_ROOT` (plan C1 Task 3)
- Produces: une image unique servant l'API, les WebSockets et le client

Image multi-stage, utilisateur non-root, dépendances de production uniquement. Un `HEALTHCHECK` sur `/healthz`, la sonde que la Task 3 a explicitement protégée du fallback SPA.

- [ ] **Step 1: Écrire le `.dockerignore`**

`.dockerignore` :

```
node_modules
**/node_modules
**/dist
**/dist-types
coverage
playwright-report
test-results
.git
.github
docs
e2e
*.tsbuildinfo
.env
.env.*
```

- [ ] **Step 2: Écrire le Dockerfile**

`Dockerfile` :

```dockerfile
# syntax=docker/dockerfile:1

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first: the dependency layer is then cached across source changes.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY tsconfig.base.json tsconfig.json tsconfig.build.json ./
COPY packages packages
COPY apps apps
RUN npm run build

# Drop dev dependencies so only what runs gets copied forward.
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5000 \
    STATIC_ROOT=/app/web

# node:alpine already ships an unprivileged `node` user; use it rather than
# inventing another.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/engine/dist ./packages/engine/dist
COPY --from=build --chown=node:node /app/packages/engine/package.json ./packages/engine/
COPY --from=build --chown=node:node /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=build --chown=node:node /app/packages/protocol/package.json ./packages/protocol/
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/
COPY --from=build --chown=node:node /app/apps/web/dist ./web
COPY --from=build --chown=node:node /app/package.json ./

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
```

- [ ] **Step 3: Écrire le fichier compose**

`compose.yaml` :

```yaml
services:
  uno:
    build: .
    image: uno-multiplayer:local
    ports:
      - '5000:5000'
    environment:
      # Same origin serves the client, so no CORS allowlist is needed.
      CORS_ORIGIN: ''
      GRACE_PERIOD_MS: '60000'
      MAX_ROOMS: '500'
      LOG_LEVEL: 'info'
    restart: unless-stopped
    # State lives in memory: never scale this past one replica. Two replicas
    # would split rooms across processes that cannot see each other.
    deploy:
      replicas: 1
```

- [ ] **Step 4: Construire et vérifier l'image**

```bash
docker build -t uno-multiplayer:local .
docker run --rm -d --name uno-check -p 5099:5000 uno-multiplayer:local
```

Puis vérifier, avec un contrôle explicite du code de sortie :

```bash
for i in $(seq 1 40); do curl -sf http://127.0.0.1:5099/healthz >/dev/null && break; sleep 0.5; done
curl -s http://127.0.0.1:5099/healthz
curl -s http://127.0.0.1:5099/ | head -c 200
docker exec uno-check id -u
docker stop uno-check
```

Expected: `{"status":"ok"}`, du HTML contenant `<div id="root">`, et un uid **différent de 0**.

- [ ] **Step 5: Ajouter le job Docker à la CI**

Dans `.github/workflows/ci.yml`, ajouter :

```yaml
  docker:
    name: Docker image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker build -t uno-multiplayer:ci .
      - name: Boot the image and probe it
        run: |
          docker run --rm -d --name uno-ci -p 5099:5000 uno-multiplayer:ci
          for i in $(seq 1 40); do
            curl -sf http://127.0.0.1:5099/healthz >/dev/null && break
            sleep 0.5
          done
          curl -sf http://127.0.0.1:5099/healthz
          curl -sf http://127.0.0.1:5099/ | grep -q 'id="root"'
          test "$(docker exec uno-ci id -u)" != "0"
          docker stop uno-ci
```

- [ ] **Step 6: Mettre à jour le README**

Cocher la feuille de route :

```markdown
- [x] `apps/web` — SVG cards, four-seat table, lobby, chat
- [x] Playwright end-to-end tests across multiple browser contexts
- [x] Dockerfile and deployment
```

Remplacer l'encadré d'état en tête de fichier par :

```markdown
Online UNO for 2 to 4 players. Server-authoritative, written in TypeScript.
```

Et ajouter une section avant `## Licence` :

```markdown
## Running it

```bash
docker compose up --build
```

Then open <http://localhost:5000>. Create a game, share the code, and the URL
carries it: `http://localhost:5000/?room=K7QM2X` prefills the field.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `CORS_ORIGIN` | empty | Comma-separated allowlist. Empty means same-origin only |
| `GRACE_PERIOD_MS` | `60000` | How long a disconnected player keeps their seat |
| `MAX_ROOMS` | `500` | Cap on concurrent rooms, bounding memory |
| `STATIC_ROOT` | `/app/web` in the image | Built client to serve. Empty serves the API alone |
| `LOG_LEVEL` | `info` | pino level |

### One replica, on purpose

Game state lives in memory. There is no Redis adapter and no sticky-session
setup, so **do not scale past a single replica** — two processes would each hold
half the rooms and neither would know about the other. A restart drops games in
progress. At a few concurrent tables that is a deliberate trade for having no
datastore to run, back up, or pay for.
```

- [ ] **Step 7: Vérification finale du dépôt**

Run: `npm run verify && npm run build && npm run e2e`
Expected: les trois en code 0.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore compose.yaml .github/workflows/ci.yml README.md
git commit -m "feat(deploy): add multi-stage Docker image and deployment docs"
```

---

## Critère de fin du plan C2

```bash
npm run verify && npm run build && npm run e2e
```

Les trois passent, et :

- Une partie de 2 à 4 joueurs se joue dans un navigateur, de l'accueil à l'écran de fin.
- Aucune carte adverse n'apparaît dans le document d'un autre joueur — vérifié par Playwright sur le HTML réel.
- Un rechargement de page conserve le siège et la main exacte.
- `docker compose up --build` sert le jeu sur le port 5000, en utilisateur non-root, avec un `HEALTHCHECK` vivant.
- La CI couvre lint, types, format, tests unitaires sur trois versions de Node, couverture, bout en bout et construction d'image.

## Auto-review du plan C2

**Couverture de la spec.** §2.7 client → Tasks 1 à 8. §3.2 protocole côté client → Task 2. §3.3 consommation de `PlayerView` → Tasks 5, 6, 8. §3.6 reconnexion par jeton → Tasks 1, 2, et vérifiée en Task 9. §4.1 aucun `alert`/`prompt` → Tasks 6 et 8. §4.3 E2E → Task 9. §4.4 Docker et déploiement → Task 10.

**Maquettes couvertes.** Section 01–02 cartes → plan C1 Task 5. Section 03 jetons de forme → plan C1 Task 5. Sections 04–05 table → Tasks 5 et 8. Section 06 lobby → Task 4. Section 07 sélecteur et toasts → Tasks 6 et 8. Section 08 fin de partie → Task 8. Section 09 chat → Task 7. Section 10 câblage → l'ensemble.

**Cohérence des types.** `FeedEntry` et `Toast` sont définis dans `game-reducer.ts` et importés de là partout. `movesForCard` retourne `Extract<Move, { type: 'play' }>[]`, le type que `ColourPicker` consomme. `nameOf(seat)` a la même signature dans `Table`, `ChatPanel`, `GameOver` et `describeEvent`. Les pigments sont toujours des variables CSS, jamais des littéraux hexadécimaux dans le TSX. Le viewBox des cartes reste `0 0 120 168`.

**Un point de vigilance signalé.** La Task 8 remplace le test `App.test.tsx` écrit au plan C1 : `App` monte désormais une socket, donc le test doit la simuler. C'est explicite dans la task plutôt que laissé à découvrir par un échec.
