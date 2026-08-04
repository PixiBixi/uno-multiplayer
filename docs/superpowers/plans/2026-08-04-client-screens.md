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

*Tasks 7 à 10 — chat et journal, fin de partie et assemblage de la table, Playwright, Docker et notes de déploiement — sont rédigées à la suite de ce document.*
