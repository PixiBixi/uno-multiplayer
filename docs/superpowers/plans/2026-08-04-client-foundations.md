# Plan C1 — Fin du serveur, fondations client, cartes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combler les deux manques serveur révélés par les maquettes, puis livrer le squelette Vite/React et le composant `Card` en SVG, testés.

**Architecture:** Le serveur gagne `Room.restart()` et le service des fichiers statiques. Le client est une application Vite/React sans routeur ni gestionnaire d'état externe : l'écran est une fonction de ce que le serveur a poussé.

**Tech Stack:** React 19.2, Vite 8.2, Vitest 4 + Testing Library 16, `@fastify/static` 10.

**Spec:** `docs/superpowers/specs/2026-08-04-uno-multiplayer-design.md` §2.7, §4.4
**Maquettes:** l'artifact publié — le SVG des cartes y est déjà validé et sert de référence.

**Prérequis:** plans A et B livrés sur `main`.

## Global Constraints

- Node 22+, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Aucune règle de jeu dans le client.** Il affiche `PlayerView` et émet des intentions.
- **Aucun état de jeu local.** Pas de copie de la main, pas de calcul de jouabilité.
- Pas de routeur, pas de Redux/Zustand : le routage tient en un paramètre d'URL, l'état en un `useReducer`.
- Une seule socket, dans un `useRef`, fermée par `socket.disconnect()` au démontage.
- Jamais `alert()` ni `prompt()`.
- Couleur jamais seule porteuse d'information : chaque pigment a un glyphe.
- Commentaires, identifiants et commits **en anglais**.
- `npm run verify` passe à la fin de chaque task.

## Structure de fichiers

| Fichier | Responsabilité |
|---|---|
| `apps/server/src/rooms/room.ts` | *(modifié)* ajout de `restart()` |
| `apps/server/src/sockets/handlers.ts` | *(modifié)* événement `game:restart` |
| `packages/protocol/src/events.ts` | *(modifié)* `game:restart`, `gameRestarted` |
| `apps/server/src/http.ts` | *(modifié)* statiques + fallback SPA |
| `apps/web/vite.config.ts` | Build, proxy socket en développement |
| `apps/web/src/main.tsx` | Point de montage |
| `apps/web/src/styles/tokens.css` | Pigments et mobilier, thèmes clair/sombre |
| `apps/web/src/components/Card.tsx` | La carte en SVG, paramétrée |
| `apps/web/src/components/CardBack.tsx` | Dos de carte |

---

### Task 1: `Room.restart()`

**Files:**
- Modify: `apps/server/src/rooms/room.ts`
- Test: `apps/server/src/rooms/room-restart.test.ts`

**Interfaces:**
- Consumes: `initGame` (`@uno/engine`)
- Produces: `restart(bySeat: number, nextSeed: number): Result<GameEvent[], ErrorCode>`

Le trou trouvé par la maquette : le bouton « Play again » ne reposait sur rien. La graine est un **paramètre**, pas un tirage interne — sinon `Room` cesse d'être déterministe et testable sans horloge.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/server/src/rooms/room-restart.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { Room } from './room.js'

const started = (...names: string[]) => {
  const room = new Room('ABC234', 42)
  names.forEach((name, i) => {
    const joined = room.join(name, `socket-${i}`)
    if (!joined.okay) throw new Error(joined.error)
  })
  const begun = room.start(0)
  if (!begun.okay) throw new Error(begun.error)
  return room
}

/** Plays greedily until the game ends, so restart runs on a real finished game. */
const finish = (room: Room) => {
  for (let turn = 0; turn < 600 && room.phase === 'playing'; turn++) {
    const seat = room.viewFor(0)?.currentSeat ?? 0
    const moves = room.viewFor(seat)?.you.legalMoves ?? []
    const move =
      moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) break
    const applied = room.move(seat, move)
    if (!applied.okay) throw new Error(applied.error)
  }
  return room
}

describe('Room.restart', () => {
  it('refuses while a game is still running', () => {
    expect(started('Ana', 'Ben').restart(0, 7)).toEqual({
      okay: false,
      error: 'game_already_started',
    })
  })

  it('refuses before any game has been played', () => {
    const room = new Room('ABC234', 42)
    room.join('Ana', 'socket-0')
    room.join('Ben', 'socket-1')
    expect(room.restart(0, 7)).toEqual({ okay: false, error: 'game_not_started' })
  })

  it('refuses a non-host', () => {
    const room = finish(started('Ana', 'Ben'))
    expect(room.restart(1, 7)).toEqual({ okay: false, error: 'not_host' })
  })

  it('deals a fresh game to the same seats', () => {
    const room = finish(started('Ana', 'Ben', 'Cleo'))
    const restarted = room.restart(0, 99)
    expect(restarted.okay).toBe(true)
    expect(room.phase).toBe('playing')
    for (const seat of [0, 1, 2]) expect(room.viewFor(seat)?.you.hand).toHaveLength(7)
    expect(room.lobbyView().seats.map((s) => s.name)).toEqual(['Ana', 'Ben', 'Cleo'])
  })

  it('uses the seed it is given, so the deal is reproducible', () => {
    const a = finish(started('Ana', 'Ben'))
    const b = finish(started('Ana', 'Ben'))
    a.restart(0, 12345)
    b.restart(0, 12345)
    expect(a.viewFor(0)?.you.hand).toEqual(b.viewFor(0)?.you.hand)
  })

  it('emits a gameRestarted event', () => {
    const room = finish(started('Ana', 'Ben'))
    const restarted = room.restart(0, 7)
    if (!restarted.okay) throw new Error(restarted.error)
    expect(restarted.value).toContainEqual({ type: 'gameRestarted' })
  })

  it('leaves out seats that left for good', () => {
    const room = finish(started('Ana', 'Ben', 'Cleo'))
    room.disconnect('socket-2')
    room.expireGrace(2)
    const restarted = room.restart(0, 7)
    expect(restarted.okay).toBe(true)
    expect(room.viewFor(2)).toBeNull()
  })

  it('refuses when fewer than two seats remain active', () => {
    const room = finish(started('Ana', 'Ben'))
    room.disconnect('socket-1')
    room.expireGrace(1)
    expect(room.restart(0, 7)).toEqual({ okay: false, error: 'too_few_players' })
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/server/src/rooms/room-restart.test.ts`
Expected: FAIL — `restart` n'existe pas.

- [ ] **Step 3: Ajouter `gameRestarted` au protocole**

Dans `packages/protocol/src/events.ts`, ajouter le variant à `GameEvent`, après `gameOver` :

```ts
  | { type: 'gameRestarted' }
```

- [ ] **Step 4: Implémenter `restart`**

Dans `apps/server/src/rooms/room.ts`, ajouter après `start` :

```ts
  /**
   * A fresh deal for the seats still present. The seed arrives as a parameter
   * rather than being drawn here: a Room that draws its own randomness stops
   * being reproducible, and every test would need a clock.
   */
  restart(bySeat: number, nextSeed: number): Result<GameEvent[], ErrorCode> {
    if (this.game === null) return err('game_not_started')
    if (this.game.phase !== 'finished') return err('game_already_started')
    if (bySeat !== this.host) return err('not_host')

    const active = this.members.filter((m) => m.status === 'active')
    if (active.length < MIN_SEATS) return err('too_few_players')

    const init = initGame({ names: active.map((m) => m.name), seed: nextSeed })
    if (!init.okay) return err('too_few_players')

    this.game = init.value
    return ok([{ type: 'gameRestarted' }])
  }
```

Note : `initGame` ne reçoit que les sièges actifs, donc les indices du moteur se resserrent tandis que `members` garde les siens. Le test « leaves out seats that left for good » verrouille ce comportement — `viewFor(2)` retourne `null` parce que le moteur ne connaît plus ce siège.

- [ ] **Step 5: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/server/src/rooms/room-restart.test.ts && npm run verify`
Expected: 8 tests PASS, `verify` en code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/rooms/room.ts apps/server/src/rooms/room-restart.test.ts packages/protocol/src/events.ts
git commit -m "feat(server): add host-driven game restart"
```

---

### Task 2: Câbler `game:restart` sur la socket

**Files:**
- Modify: `packages/protocol/src/events.ts`
- Modify: `apps/server/src/rooms/room-manager.ts`
- Modify: `apps/server/src/sockets/handlers.ts`
- Test: `apps/server/src/sockets/handlers-restart.test.ts`

**Interfaces:**
- Consumes: `Room.restart` (Task 1)
- Produces:
  - événement client `'game:restart': (payload: Empty, ack: Ack) => void`
  - `RoomManager.nextSeed(): number` — expose la source de graines au handler

- [ ] **Step 1: Écrire le test qui échoue**

`apps/server/src/sockets/handlers-restart.test.ts` :

```ts
import { createServer, type Server as HttpServer } from 'node:http'
import type { PlayerView } from '@uno/protocol'
import { io as connect, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { RoomManager } from '../rooms/room-manager.js'
import { registerSocketHandlers } from './handlers.js'

let httpServer: HttpServer
let ioServer: ReturnType<typeof registerSocketHandlers>
let url: string
const clients: Socket[] = []

beforeEach(async () => {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })
  httpServer = createServer()
  ioServer = registerSocketHandlers(
    httpServer,
    new RoomManager({ maxRooms: 10, gracePeriodMs: 5000 }),
    config,
  )
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

const newClient = (): Socket => {
  const client = connect(url, { transports: ['websocket'], forceNew: true })
  clients.push(client)
  return client
}
const emit = <T>(client: Socket, event: string, payload: unknown): Promise<T> =>
  new Promise((resolve) => client.emit(event, payload, resolve))
const nextView = (client: Socket): Promise<PlayerView> =>
  new Promise((resolve) => client.once('game:view', resolve))

type PlainAck = { ok: true } | { ok: false; error: string }
type CreateAck = { ok: true; roomCode: string } | { ok: false }

/** Drives a real two-player game to its end over the wire. */
const playToEnd = async (host: Socket, guest: Socket) => {
  let view = await nextView(host)
  for (let turn = 0; turn < 600 && view.phase === 'playing'; turn++) {
    const actor = view.currentSeat === 0 ? host : guest
    const seatView = view.currentSeat === 0 ? view : await Promise.resolve(view)
    const moves = seatView.you.seat === view.currentSeat ? seatView.you.legalMoves : []
    const move =
      moves.find((m) => m.type === 'callUno') ?? moves.find((m) => m.type === 'play') ?? moves[0]
    if (move === undefined) break
    const settled = Promise.all([nextView(host), nextView(guest)])
    await emit<PlainAck>(actor, 'game:move', { move })
    const [hostView] = await settled
    view = hostView
  }
  return view
}

describe('game:restart over sockets', () => {
  it('refuses a restart while the game is running', async () => {
    const host = newClient()
    const created = await emit<CreateAck>(host, 'room:create', { playerName: 'Ana' })
    if (!created.ok) throw new Error('create failed')
    const guest = newClient()
    await emit<PlainAck>(guest, 'room:join', { roomCode: created.roomCode, playerName: 'Ben' })
    const dealt = nextView(host)
    await emit<PlainAck>(host, 'game:start', {})
    await dealt

    expect(await emit<PlainAck>(host, 'game:restart', {})).toEqual({
      ok: false,
      error: 'game_already_started',
    })
  })

  it('refuses a restart from a client that never joined', async () => {
    const stranger = newClient()
    expect(await emit<PlainAck>(stranger, 'game:restart', {})).toEqual({
      ok: false,
      error: 'room_not_found',
    })
    expect(stranger.connected).toBe(true)
  })

  it('deals a fresh game and pushes new views to everyone', async () => {
    const host = newClient()
    const created = await emit<CreateAck>(host, 'room:create', { playerName: 'Ana' })
    if (!created.ok) throw new Error('create failed')
    const guest = newClient()
    await emit<PlainAck>(guest, 'room:join', { roomCode: created.roomCode, playerName: 'Ben' })

    const dealt = nextView(host)
    await emit<PlainAck>(host, 'game:start', {})
    await dealt
    const finished = await playToEnd(host, guest)
    expect(finished.phase).toBe('finished')

    const fresh = Promise.all([nextView(host), nextView(guest)])
    expect(await emit<PlainAck>(host, 'game:restart', {})).toEqual({ ok: true })
    const [hostView, guestView] = await fresh
    expect(hostView.phase).toBe('playing')
    expect(hostView.you.hand).toHaveLength(7)
    expect(guestView.you.hand).toHaveLength(7)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run apps/server/src/sockets/handlers-restart.test.ts`
Expected: FAIL — l'événement `game:restart` n'est pas géré, l'ack n'arrive jamais.

- [ ] **Step 3: Déclarer l'événement dans le protocole**

Dans `packages/protocol/src/events.ts`, ajouter à `ClientToServer`, après `'game:start'` :

```ts
  'game:restart': (payload: Empty, ack: Ack) => void
```

- [ ] **Step 4: Exposer la source de graines**

Dans `apps/server/src/rooms/room-manager.ts`, ajouter à la classe :

```ts
  /** The seed source, so a restart can draw one without owning randomness. */
  nextSeed(): number {
    return this.seedSource()
  }
```

- [ ] **Step 5: Ajouter le handler**

Dans `apps/server/src/sockets/handlers.ts`, après le bloc `socket.on('game:start', …)` :

```ts
    socket.on('game:restart', (payload, ack) => {
      attempt(ack, () => {
        if (parsePayload(emptyPayloadSchema, payload) === null) {
          ack({ ok: false, error: 'invalid_payload' })
          return
        }
        const presence = presences.get(socket.id)
        if (presence === undefined) {
          ack({ ok: false, error: 'room_not_found' })
          return
        }
        const restarted = presence.room.restart(presence.seat, rooms.nextSeed())
        if (!restarted.okay) {
          ack({ ok: false, error: restarted.error })
          return
        }
        ack({ ok: true })
        broadcastEvents(presence.room, restarted.value)
        broadcastLobby(presence.room)
        broadcastViews(presence.room)
      })
    })
```

- [ ] **Step 6: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/server/src/sockets/handlers-restart.test.ts && npm run verify`
Expected: 3 tests PASS, `verify` en code 0.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/sockets apps/server/src/rooms/room-manager.ts packages/protocol/src/events.ts
git commit -m "feat(server): expose game restart over the socket"
```

---

### Task 3: Servir le client depuis Fastify

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/http.ts`
- Test: `apps/server/src/http-static.test.ts`

**Interfaces:**
- Consumes: `Config` (plan B)
- Produces:
  - `Config.staticRoot: string | null` — dossier du build client, `null` pour ne rien servir
  - `buildApp` sert les fichiers et retombe sur `index.html` pour toute route inconnue

Le fallback SPA doit **exclure** `/healthz` et `/socket.io`, sinon une sonde de santé reçoit du HTML.

- [ ] **Step 1: Écrire le test qui échoue**

`apps/server/src/http-static.test.ts` :

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'
import { buildApp } from './http.js'

type App = Awaited<ReturnType<typeof buildApp>>
let app: App | null = null

afterEach(async () => {
  await app?.close()
  app = null
})

/** A throwaway client build: index.html plus one asset. */
const fakeBuild = () => {
  const dir = mkdtempSync(join(tmpdir(), 'uno-web-'))
  writeFileSync(join(dir, 'index.html'), '<div id="root">app shell</div>')
  writeFileSync(join(dir, 'app.js'), 'console.log("bundle")')
  return dir
}

const appWith = async (env: NodeJS.ProcessEnv) => {
  app = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env }))
  return app
}

describe('static serving', () => {
  it('serves index.html at the root', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('app shell')
  })

  it('serves a built asset', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/app.js' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('bundle')
  })

  it('falls back to index.html for a client route', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/play' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('app shell')
  })

  it('never lets the fallback swallow the health check', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/healthz' })
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('still answers 404 when no static root is configured', async () => {
    const instance = await appWith({})
    expect((await instance.inject({ method: 'GET', url: '/play' })).statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run apps/server/src/http-static.test.ts`
Expected: FAIL — 404 à la racine, `STATIC_ROOT` est ignoré.

- [ ] **Step 3: Installer la dépendance**

Run: `npm install @fastify/static@^10.1.2 -w @uno/server`

- [ ] **Step 4: Ajouter `STATIC_ROOT` à la configuration**

Dans `apps/server/src/config.ts`, ajouter au schéma :

```ts
  /** Absolute or relative path to the built client. Empty means serve nothing. */
  STATIC_ROOT: z.string().default(''),
```

Ajouter au type `Config` :

```ts
  staticRoot: string | null
```

Et au retour de `loadConfig` :

```ts
    staticRoot: parsed.STATIC_ROOT.trim().length > 0 ? parsed.STATIC_ROOT.trim() : null,
```

- [ ] **Step 5: Servir les fichiers**

Dans `apps/server/src/http.ts`, ajouter l'import :

```ts
import fastifyStatic from '@fastify/static'
import { resolve } from 'node:path'
```

Puis, après l'enregistrement de `cors` et **avant** `app.get('/healthz', …)` — l'ordre n'importe pas pour Fastify, mais garder la sonde visible en tête du fichier aide à la lecture — ajouter à la fin de `buildApp`, juste avant `return app` :

```ts
  if (config.staticRoot !== null) {
    await app.register(fastifyStatic, { root: resolve(config.staticRoot), wildcard: false })

    // Single-page fallback. Scoped to GET and explicitly excluding the paths
    // that must never receive HTML: a health probe answered with an app shell
    // reads as healthy to nothing.
    app.setNotFoundHandler((request, reply) => {
      const isApi = request.url.startsWith('/healthz') || request.url.startsWith('/socket.io')
      if (request.method !== 'GET' || isApi) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.sendFile('index.html')
    })
  }
```

- [ ] **Step 6: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/server/src/http-static.test.ts && npm run verify`
Expected: 5 tests PASS, `verify` en code 0.

- [ ] **Step 7: Documenter la variable**

Ajouter à `apps/server/.env.example` :

```dotenv
# Path to the built client. Empty serves no static files (API-only).
STATIC_ROOT=
```

- [ ] **Step 8: Commit**

```bash
git add apps/server package.json package-lock.json
git commit -m "feat(server): serve the built client with an SPA fallback"
```

---

### Task 4: Squelette du client

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.build.json`, `apps/web/vite.config.ts`
- Create: `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- Create: `apps/web/src/styles/tokens.css`, `apps/web/src/styles/app.css`
- Modify: `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `eslint.config.js`
- Test: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: rien
- Produces: workspace `@uno/web`, `npm run build -w @uno/web` produit `dist/`, tests React exécutables sous Vitest + jsdom

- [ ] **Step 1: Écrire le test qui échoue**

`apps/web/src/App.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App.js'

describe('App', () => {
  it('renders the product name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /uno/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run apps/web/src/App.test.tsx`
Expected: FAIL — le workspace n'existe pas.

- [ ] **Step 3: Créer le workspace**

`apps/web/package.json` :

```json
{
  "name": "@uno/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "UNO multiplayer web client",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@uno/protocol": "*",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "socket.io-client": "^4.8.3"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "@vitejs/plugin-react": "^6.0.5",
    "jsdom": "^30.0.1",
    "vite": "^8.2.0"
  }
}
```

`apps/web/tsconfig.build.json` :

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist-types",
    "composite": true,
    "noEmit": false,
    "emitDeclarationOnly": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["vite/client"]
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"],
  "references": [{ "path": "../../packages/protocol/tsconfig.build.json" }]
}
```

Vite produit le bundle ; ce projet TypeScript n'émet que des déclarations, pour que `tsc --build` puisse vérifier le client sans dupliquer le travail du bundler.

`apps/web/vite.config.ts` :

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  server: {
    port: 5173,
    // In development the client runs on its own port, so the socket handshake
    // is proxied to the API rather than hard-coding an endpoint in the bundle.
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true },
      '/healthz': { target: 'http://127.0.0.1:5000' },
    },
  },
})
```

`apps/web/index.html` :

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>UNO Multiplayer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Écrire les jetons de style**

`apps/web/src/styles/tokens.css` :

```css
:root {
  /* Card pigments. Fixed across themes: a card is a printed object, and a red
     card does not become cyan at night. */
  --red: #d2321e;
  --green: #1e9e4a;
  --blue: #1565b8;
  --yellow: #f0b310;
  --bone: #f5f1e8;
  --ink: #14100e;

  /* Furniture. Green-biased neutrals, pulled toward the felt. */
  --ground: #f2f4ef;
  --panel: #ffffff;
  --panel-edge: #d6dcd2;
  --felt: #1b3730;
  --felt-edge: #2c4d44;
  --text: #17211d;
  --text-dim: #566158;
  --accent: #1e9e4a;

  --step--1: 0.8125rem;
  --step-0: 1rem;
  --step-1: 1.3rem;
  --step-2: 1.85rem;
  --step-3: 2.6rem;

  --r-sm: 6px;
  --r-md: 12px;
  --r-lg: 20px;

  --display: ui-rounded, 'SF Pro Rounded', 'Segoe UI Variable', system-ui, sans-serif;
  --body: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --data: ui-monospace, 'SF Mono', Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --ground: #101a17;
    --panel: #172420;
    --panel-edge: #26372f;
    --text: #e6ece7;
    --text-dim: #93a29a;
    --accent: #3fc46b;
  }
}

:root[data-theme='dark'] {
  --ground: #101a17;
  --panel: #172420;
  --panel-edge: #26372f;
  --text: #e6ece7;
  --text-dim: #93a29a;
  --accent: #3fc46b;
}

:root[data-theme='light'] {
  --ground: #f2f4ef;
  --panel: #ffffff;
  --panel-edge: #d6dcd2;
  --text: #17211d;
  --text-dim: #566158;
  --accent: #1e9e4a;
}
```

`apps/web/src/styles/app.css` :

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--ground);
  color: var(--text);
  font-family: var(--body);
  font-size: var(--step-0);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

h1,
h2,
h3 {
  font-family: var(--display);
  margin: 0;
  line-height: 1.15;
  text-wrap: balance;
}

:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Écrire le point d'entrée**

`apps/web/src/App.tsx` :

```tsx
export function App() {
  return (
    <main>
      <h1>UNO Multiplayer</h1>
    </main>
  )
}
```

`apps/web/src/main.tsx` :

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './styles/tokens.css'
import './styles/app.css'

const host = document.getElementById('root')
if (host === null) throw new Error('missing #root element')

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 6: Brancher le workspace sur l'outillage**

Dans `tsconfig.json` racine, étendre `include` et `paths` :

```json
  "include": ["packages/*/src/**/*", "apps/*/src/**/*", "*.config.ts", "apps/*/*.config.ts"],
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "paths": {
      "@uno/engine": ["./packages/engine/src/index.ts"],
      "@uno/protocol": ["./packages/protocol/src/index.ts"]
    }
  }
```

Dans `tsconfig.build.json` racine, ajouter la référence :

```json
    { "path": "apps/web/tsconfig.build.json" }
```

Dans `vitest.config.ts`, passer à des projets pour que seul le client tourne sous jsdom :

```ts
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const alias = {
  '@uno/engine': fromRoot('./packages/engine/src/index.ts'),
  '@uno/protocol': fromRoot('./packages/protocol/src/index.ts'),
}

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/test-helpers.ts', '**/main.tsx'],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
    ],
  },
})
```

Dans `eslint.config.js`, autoriser le JSX et les globales navigateur pour le client, en ajoutant un bloc avant celui des fichiers de configuration :

```js
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', history: 'readonly' },
    },
  },
```

- [ ] **Step 7: Installer et vérifier**

Run: `npm install && npx vitest run apps/web/src/App.test.tsx && npm run verify && npm run build`
Expected: 1 test PASS, `verify` et `build` en code 0, et `apps/web/dist/index.html` existe après `npm run build -w @uno/web`.

- [ ] **Step 8: Commit**

```bash
git add apps/web tsconfig.json tsconfig.build.json vitest.config.ts eslint.config.js package.json package-lock.json
git commit -m "feat(web): scaffold Vite React client with design tokens"
```

---

### Task 5: Le composant `Card`

**Files:**
- Create: `apps/web/src/components/Card.tsx`
- Create: `apps/web/src/components/CardBack.tsx`
- Test: `apps/web/src/components/Card.test.tsx`

**Interfaces:**
- Consumes: `Card as CardData`, `Color` (`@uno/engine` via `@uno/protocol`)
- Produces:
  - `<Card card={CardData} onPlay?={() => void} disabled?={boolean} />`
  - `<CardBack />`
  - `cardLabel(card: CardData): string` — texte accessible, exporté pour être testé

Le SVG est repris des maquettes validées. Deux points non négociables : chaque glyphe est centré via `dominantBaseline="central"` sur le centre de l'ellipse, et chaque pigment porte un **jeton de forme** — la couleur ne peut pas être le seul canal, puisque la couleur *est* la règle.

- [ ] **Step 1: Écrire les tests qui échouent**

`apps/web/src/components/Card.test.tsx` :

```tsx
import type { Card as CardData, CardId } from '@uno/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Card, cardLabel } from './Card.js'

const id = (value: string) => value as CardId
const num = (value: 0 | 7): CardData => ({ id: id('c1'), kind: 'number', color: 'R', value })

describe('cardLabel', () => {
  it('names a number card by colour and value', () => {
    expect(cardLabel(num(7))).toBe('Red 7')
  })

  it('names each action card', () => {
    expect(cardLabel({ id: id('a'), kind: 'skip', color: 'G' })).toBe('Green skip')
    expect(cardLabel({ id: id('b'), kind: 'reverse', color: 'B' })).toBe('Blue reverse')
    expect(cardLabel({ id: id('c'), kind: 'draw2', color: 'Y' })).toBe('Yellow draw two')
    expect(cardLabel({ id: id('d'), kind: 'wild' })).toBe('Wild')
    expect(cardLabel({ id: id('e'), kind: 'wild4' })).toBe('Wild draw four')
  })
})

describe('Card', () => {
  it('renders a button labelled by the card', () => {
    render(<Card card={num(7)} onPlay={() => undefined} />)
    expect(screen.getByRole('button', { name: /red 7/i })).toBeTruthy()
  })

  it('calls onPlay when clicked', async () => {
    const onPlay = vi.fn()
    render(<Card card={num(7)} onPlay={onPlay} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('is disabled and says why when not playable', async () => {
    const onPlay = vi.fn()
    render(<Card card={num(7)} onPlay={onPlay} disabled />)
    const button = screen.getByRole('button')
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-label')).toMatch(/not playable/i)
    await userEvent.click(button)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('renders static markup with no button when no handler is given', () => {
    render(<Card card={num(7)} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('img', { name: /red 7/i })).toBeTruthy()
  })

  it('carries a shape token so colour is never the only signal', () => {
    const { container } = render(<Card card={num(7)} />)
    expect(container.querySelectorAll('[data-token]').length).toBeGreaterThan(0)
  })

  it('gives each pigment a distinct shape token', () => {
    const tokenOf = (color: 'R' | 'G' | 'B' | 'Y') => {
      const { container } = render(
        <Card card={{ id: id('x'), kind: 'number', color, value: 5 }} />,
      )
      return container.querySelector('[data-token]')?.getAttribute('data-token')
    }
    const tokens = [tokenOf('R'), tokenOf('G'), tokenOf('B'), tokenOf('Y')]
    expect(new Set(tokens).size).toBe(4)
  })

  it('draws four quadrants on a wild', () => {
    const { container } = render(<Card card={{ id: id('w'), kind: 'wild' }} />)
    expect(container.querySelectorAll('[data-quadrant]')).toHaveLength(4)
  })

  it('keeps the +4 label inside the card', () => {
    const { container } = render(<Card card={{ id: id('w4'), kind: 'wild4' }} />)
    const label = container.querySelector('[data-plusfour]')
    expect(label?.getAttribute('y')).toBe('107')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run apps/web/src/components/Card.test.tsx`
Expected: FAIL — `./Card.js` introuvable.

- [ ] **Step 3: Implémenter la carte**

`apps/web/src/components/Card.tsx` :

```tsx
import type { Card as CardData, Color } from '@uno/engine'

const PIGMENT: Record<Color, string> = {
  R: 'var(--red)',
  G: 'var(--green)',
  B: 'var(--blue)',
  Y: 'var(--yellow)',
}
const BONE = 'var(--bone)'
const INK = 'var(--ink)'
const COLOR_NAME: Record<Color, string> = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' }

/** Shape per pigment: the non-chromatic channel. Colour is the rule in UNO, so
 *  it cannot also be the only way to read a card. */
const SHAPE: Record<Color, 'circle' | 'triangle' | 'square' | 'diamond'> = {
  R: 'circle',
  G: 'triangle',
  B: 'square',
  Y: 'diamond',
}

export function cardLabel(card: CardData): string {
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

function cornerLabel(card: CardData): string {
  switch (card.kind) {
    case 'number':
      return String(card.value)
    case 'draw2':
      return '+2'
    case 'wild4':
      return '+4'
    case 'skip':
      return '⊘'
    case 'reverse':
      return '⇅'
    case 'wild':
      return '◉'
  }
}

function ShapeToken({ color, x, y }: { color: Color; x: number; y: number }) {
  const shape = SHAPE[color]
  const r = 5.5
  const common = { fill: BONE, 'data-token': shape }
  if (shape === 'circle') return <circle cx={x} cy={y} r={r} {...common} />
  if (shape === 'square') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1} {...common} />
  if (shape === 'triangle') return <path d={`M${x} ${y - r}L${x + r} ${y + r * 0.8}H${x - r}Z`} {...common} />
  return <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} {...common} />
}

function Quadrants({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const wedges: Array<[string, string]> = [
    [`M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`, PIGMENT.R],
    [`M${cx} ${cy} L${cx + r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy + r} Z`, PIGMENT.Y],
    [`M${cx} ${cy} L${cx} ${cy + r} A${r} ${r} 0 0 1 ${cx - r} ${cy} Z`, PIGMENT.G],
    [`M${cx} ${cy} L${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r} Z`, PIGMENT.B],
  ]
  return (
    <>
      {wedges.map(([d, fill], index) => (
        <path key={index} d={d} fill={fill} data-quadrant={index} />
      ))}
    </>
  )
}

/** Every glyph is centred on the ellipse centre (60, 84) with
 *  dominantBaseline, never by guessing a baseline offset. */
function FaceMark({ card, fill }: { card: CardData; fill: string }) {
  const centred = { textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
  const stroke = {
    stroke: fill,
    strokeWidth: 9,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (card.kind) {
    case 'number':
      return (
        <text x={60} y={84} {...centred} fontSize={66} fontWeight={600} fill={fill}>
          {card.value}
        </text>
      )
    case 'draw2':
      return (
        <text x={60} y={84} {...centred} fontSize={46} fontWeight={600} fill={fill}>
          +2
        </text>
      )
    case 'skip':
      return (
        <g {...stroke}>
          <circle cx={60} cy={84} r={23} />
          <line x1={43} y1={67} x2={77} y2={101} />
        </g>
      )
    case 'reverse':
      return (
        <g {...stroke}>
          <path d="M47 105V65" />
          <path d="M38 74L47 63L56 74" />
          <path d="M73 63V103" />
          <path d="M64 94L73 105L82 94" />
        </g>
      )
    case 'wild':
      return <Quadrants cx={60} cy={84} r={26} />
    case 'wild4':
      return (
        <>
          <Quadrants cx={60} cy={71} r={19} />
          <text
            x={60}
            y={107}
            {...centred}
            fontSize={26}
            fontWeight={600}
            fill={INK}
            data-plusfour=""
          >
            +4
          </text>
        </>
      )
  }
}

type CardProps = {
  card: CardData
  onPlay?: () => void
  disabled?: boolean
}

export function Card({ card, onPlay, disabled = false }: CardProps) {
  const isWild = card.kind === 'wild' || card.kind === 'wild4'
  const pigment = isWild ? INK : PIGMENT[card.color]
  const faceFill = isWild ? BONE : pigment
  const tokenColor: Color = isWild ? 'R' : card.color
  const label = disabled ? `${cardLabel(card)} — not playable this turn` : cardLabel(card)

  const face = (
    <svg
      viewBox="0 0 120 168"
      role="img"
      aria-label={label}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      fontFamily="var(--display)"
    >
      <rect x={0} y={0} width={120} height={168} rx={11} fill={BONE} />
      <rect x={6} y={6} width={108} height={156} rx={7} fill={pigment} />
      <ellipse cx={60} cy={84} rx={52} ry={30} fill={BONE} transform="rotate(-27 60 84)" />
      <FaceMark card={card} fill={faceFill} />
      <g fontSize={17} fontWeight={600} fill={BONE} textAnchor="middle" dominantBaseline="central">
        <text x={32} y={26}>{cornerLabel(card)}</text>
        {/* The bottom-right marks are the top-left marks rotated about the card
            centre — the way a real card is printed. */}
        <g transform="rotate(180 60 84)">
          <text x={32} y={26}>{cornerLabel(card)}</text>
        </g>
      </g>
      <ShapeToken color={tokenColor} x={20} y={22} />
      <g transform="rotate(180 60 84)">
        <ShapeToken color={tokenColor} x={20} y={22} />
      </g>
    </svg>
  )

  if (onPlay === undefined) return face

  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={disabled}
      aria-label={label}
      className="card-button"
    >
      {face}
    </button>
  )
}
```

`apps/web/src/components/CardBack.tsx` :

```tsx
export function CardBack() {
  return (
    <svg
      viewBox="0 0 120 168"
      role="img"
      aria-label="Face-down card"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      fontFamily="var(--display)"
    >
      <rect x={0} y={0} width={120} height={168} rx={11} fill="var(--bone)" />
      <rect x={6} y={6} width={108} height={156} rx={7} fill="var(--ink)" />
      <ellipse cx={60} cy={84} rx={50} ry={28} fill="var(--red)" transform="rotate(-27 60 84)" />
      <text
        x={60}
        y={84}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={30}
        fontWeight={600}
        fill="var(--bone)"
        transform="rotate(-27 60 84)"
      >
        UNO
      </text>
    </svg>
  )
}
```

- [ ] **Step 4: Ajouter le style du bouton de carte**

Ajouter à `apps/web/src/styles/app.css` :

```css
.card-button {
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  display: block;
  width: 100%;
  border-radius: 9px;
  cursor: pointer;
  transition:
    transform 180ms ease,
    filter 180ms ease;
}

.card-button:hover:not(:disabled),
.card-button:focus-visible:not(:disabled) {
  transform: translateY(-8px);
  filter: drop-shadow(0 10px 14px rgb(0 0 0 / 0.35));
}

/* Dimmed AND desaturated: opacity alone is unreliable against dark felt. */
.card-button:disabled {
  cursor: not-allowed;
  filter: grayscale(0.65) brightness(0.72);
}
```

- [ ] **Step 5: Lancer les tests et la vérification complète**

Run: `npx vitest run apps/web/src/components/Card.test.tsx && npm run verify`
Expected: 10 tests PASS, `verify` en code 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components apps/web/src/styles/app.css
git commit -m "feat(web): add parameterised SVG card with colour-blind shape tokens"
```

---

## Critère de fin du plan C1

```bash
npm run verify && npm run build
```

Les deux passent, et :

- L'hôte peut relancer une partie terminée, côté `Room` et sur la socket.
- Fastify sert un build client avec fallback SPA, sans avaler `/healthz` ni `/socket.io`.
- `@uno/web` se construit, et ses tests tournent sous jsdom dans un projet Vitest distinct.
- `Card` couvre les 54 faces, chaque pigment portant un jeton de forme distinct.

## Auto-review du plan C1

**Couverture.** Le trou « Play again » relevé par les maquettes → Tasks 1 et 2. §4.4 service des statiques → Task 3. §2.7 squelette client, jetons, thèmes → Task 4. Cartes SVG → Task 5.

**Reste au plan C2** : `useGameSocket` et le stockage de session, écrans Home / Lobby / Table, main et flux de jeu, sélecteur de couleur, chat et journal, écrans de fin, Playwright, Dockerfile et notes de déploiement.

**Cohérence des types.** `Result` garde `okay` comme discriminant. Les acks socket restent en `ok`. `restart(bySeat, nextSeed)` prend la graine en paramètre, la source vivant dans `RoomManager.nextSeed()`. `Config.staticRoot` est `string | null`, jamais la chaîne vide. Le viewBox des cartes est `0 0 120 168` partout, centre d'ellipse `(60, 84)`.
