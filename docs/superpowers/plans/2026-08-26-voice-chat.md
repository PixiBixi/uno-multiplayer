# Voice Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the two to four players at a table hear each other over a WebRTC mesh, without audio ever touching the server and without the voice layer being able to break a game.

**Architecture:** The server relays SDP and ICE between seats and mints ephemeral TURN credentials; it never parses SDP and never carries audio. Voice membership lives in a `VoiceRoom` map in the socket layer, so `packages/engine` and `Room` learn nothing about it. On the client, a peer manager owns every `RTCPeerConnection`, a hook adapts it to React, and a panel renders it.

**Tech Stack:** TypeScript, socket.io, Zod, Node `node:crypto` (HMAC-SHA1), browser WebRTC and Web Audio APIs, React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-voice-chat-design.md`

## Global Constraints

- `packages/engine` stays pure: no I/O, no networking, no dependencies. No task in this plan modifies it.
- `Room` stays synchronous and timer-free. No task in this plan modifies `apps/server/src/rooms/`.
- Member seat number == engine seat index. Voice is keyed by seat number throughout.
- The client knows no rules. Voice adds no rule evaluation to the client.
- `npm run verify` must pass before every commit. Check the exit code; piping to `tail` swallows it.
- Conventional Commits, one commit per scope. Do not bundle unrelated changes.
- Code, comments and commit messages in English.
- Comments are 1-3 lines: state the decision and why it must not be undone. No inline investigation.
- No new runtime dependency in any package. HMAC comes from `node:crypto`, which ships with Node.
- A new client action needs a protocol type, a Zod schema, a `socket.on` handler **and** the client emit. The handler is the piece that gets forgotten.

---

### Task 1: Voice protocol types and schemas

**Files:**

- Modify: `packages/protocol/src/views.ts` (add three constants near `MAX_CHAT_LENGTH` on line 7)
- Modify: `packages/protocol/src/events.ts` (add error codes, types, and the six events)
- Modify: `packages/protocol/src/schemas.ts` (add two exported schemas)
- Test: `packages/protocol/src/schemas.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `VoicePeer`, `IceServer`, `VoiceSignal`, `MAX_SDP_LENGTH`, `MAX_CANDIDATE_LENGTH`, `MAX_SDP_MID_LENGTH`, `voiceSignalSendSchema`, `voiceMuteSchema`, error codes `voice_not_joined` and `voice_peer_unavailable`, and the `voice:*` entries on `ClientToServer` / `ServerToClient`.

- [ ] **Step 1: Write the failing test**

Append to `packages/protocol/src/schemas.test.ts`:

```ts
describe('voiceSignalSendSchema', () => {
  it('accepts an offer for a legal seat', () => {
    const parsed = voiceSignalSendSchema.safeParse({
      toSeat: 2,
      signal: { kind: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n' },
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a candidate with null sdpMid and sdpMLineIndex', () => {
    const parsed = voiceSignalSendSchema.safeParse({
      toSeat: 0,
      signal: { kind: 'candidate', candidate: 'candidate:1 1 udp 2 1.2.3.4 5 typ host', sdpMid: null, sdpMLineIndex: null },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a seat outside the table', () => {
    const parsed = voiceSignalSendSchema.safeParse({
      toSeat: MAX_SEATS,
      signal: { kind: 'offer', sdp: 'v=0' },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an sdp large enough to be an attack rather than a session', () => {
    const parsed = voiceSignalSendSchema.safeParse({
      toSeat: 1,
      signal: { kind: 'offer', sdp: 'v'.repeat(MAX_SDP_LENGTH + 1) },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an unknown signal kind', () => {
    const parsed = voiceSignalSendSchema.safeParse({
      toSeat: 1,
      signal: { kind: 'renegotiate', sdp: 'v=0' },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('voiceMuteSchema', () => {
  it('accepts a boolean', () => {
    expect(voiceMuteSchema.safeParse({ muted: true }).success).toBe(true)
  })

  it('rejects a string that merely looks like one', () => {
    expect(voiceMuteSchema.safeParse({ muted: 'true' }).success).toBe(false)
  })
})
```

Extend the existing import at the top of that file so it also pulls `voiceSignalSendSchema` and `voiceMuteSchema` from `./schemas.js`, and `MAX_SDP_LENGTH` and `MAX_SEATS` from `./views.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/protocol/src/schemas.test.ts`
Expected: FAIL, the import of `voiceSignalSendSchema` does not resolve.

- [ ] **Step 3: Add the constants**

In `packages/protocol/src/views.ts`, directly after `export const MAX_CHAT_LENGTH = 200`:

```ts
/* Bounded because these strings are relayed to another player untouched. A real
   audio-only offer is a few kilobytes; anything past this is not a session. */
export const MAX_SDP_LENGTH = 16_384
export const MAX_CANDIDATE_LENGTH = 512
export const MAX_SDP_MID_LENGTH = 16
```

- [ ] **Step 4: Add the protocol types**

In `packages/protocol/src/events.ts`, add to the `ErrorCode` union:

```ts
  | 'voice_not_joined'
  | 'voice_peer_unavailable'
```

Then add, above `export type ClientToServer`:

```ts
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
```

Add to `ClientToServer`:

```ts
  /**
   * Joins the voice session. The client must already hold a microphone stream:
   * a denied permission has to cost nothing on the server.
   */
  'voice:join': (
    payload: Empty,
    ack: Ack<{ iceServers: IceServer[]; peers: VoicePeer[] }>,
  ) => void
  'voice:leave': (payload: Empty, ack: Ack) => void
  /** Relayed verbatim to `toSeat`, which must be in the same room's voice session. */
  'voice:signal': (payload: { toSeat: number; signal: VoiceSignal }, ack: Ack) => void
  /**
   * Own microphone off. Broadcast because a muted mic produces silence that is
   * indistinguishable from a player who is simply not talking.
   */
  'voice:mute': (payload: { muted: boolean }, ack: Ack) => void
```

Add to `ServerToClient`:

```ts
  'voice:peers': (peers: VoicePeer[]) => void
  'voice:signal': (payload: { fromSeat: number; signal: VoiceSignal }) => void
```

- [ ] **Step 5: Add the schemas**

In `packages/protocol/src/schemas.ts`, add `MAX_CANDIDATE_LENGTH`, `MAX_SDP_LENGTH` and `MAX_SDP_MID_LENGTH` to the existing import from `./views.js`, then append:

```ts
const voiceSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('offer'), sdp: z.string().min(1).max(MAX_SDP_LENGTH) }),
  z.object({ kind: z.literal('answer'), sdp: z.string().min(1).max(MAX_SDP_LENGTH) }),
  z.object({
    kind: z.literal('candidate'),
    candidate: z.string().max(MAX_CANDIDATE_LENGTH),
    sdpMid: z.string().max(MAX_SDP_MID_LENGTH).nullable(),
    sdpMLineIndex: z.number().int().min(0).max(16).nullable(),
  }),
])

export const voiceSignalSendSchema = z.object({ toSeat: seatNumber, signal: voiceSignalSchema })

export const voiceMuteSchema = z.object({ muted: z.boolean() })
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/protocol/src/schemas.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add packages/protocol/src
git commit -m "feat(protocol): voice signalling events and schemas"
```

---

### Task 2: TURN credential minting and configuration

**Files:**

- Modify: `apps/server/src/config.ts` (env schema, `Config` type, `loadConfig` body)
- Create: `apps/server/src/sockets/turn-credentials.ts`
- Test: `apps/server/src/sockets/turn-credentials.test.ts`
- Test: `apps/server/src/config.test.ts`

**Interfaces:**

- Consumes: `IceServer` from Task 1.
- Produces: `TurnConfig`, `mintIceServers(config, roomCode, now?)` returning `IceServer[]`; `Config` gains `turnUrl: string | null`, `turnSecret: string | null`, `turnTtlSeconds: number`, `stunUrl: string | null`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/sockets/turn-credentials.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mintIceServers, type TurnConfig } from './turn-credentials.js'

const full: TurnConfig = {
  turnUrl: 'turn:turn.example.com:3478',
  turnSecret: 'test-secret',
  turnTtlSeconds: 86_400,
  stunUrl: 'stun:stun.example.com:3478',
}

describe('mintIceServers', () => {
  it('produces the exact coturn REST credential for a known secret and clock', () => {
    const servers = mintIceServers(full, 'ABCDEF', () => 0)
    expect(servers).toContainEqual({
      urls: ['turn:turn.example.com:3478'],
      username: '86400:ABCDEF',
      credential: 'w7nN9a6dg0s6aZuK9l76b2ekQ/o=',
    })
  })

  it('lists the stun server first so ICE tries the free path before the relay', () => {
    const servers = mintIceServers(full, 'ABCDEF', () => 0)
    expect(servers[0]).toEqual({ urls: ['stun:stun.example.com:3478'] })
  })

  it('expires the username ttl seconds after now', () => {
    const servers = mintIceServers(full, 'ABCDEF', () => 10_000)
    expect(servers[1]?.username).toBe('86410:ABCDEF')
  })

  it('omits turn entirely when no secret is configured', () => {
    const servers = mintIceServers({ ...full, turnSecret: null }, 'ABCDEF', () => 0)
    expect(servers).toEqual([{ urls: ['stun:stun.example.com:3478'] }])
  })

  it('returns an empty list when nothing is configured', () => {
    const servers = mintIceServers(
      { turnUrl: null, turnSecret: null, turnTtlSeconds: 86_400, stunUrl: null },
      'ABCDEF',
      () => 0,
    )
    expect(servers).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/src/sockets/turn-credentials.test.ts`
Expected: FAIL, `./turn-credentials.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/server/src/sockets/turn-credentials.ts`:

```ts
import { createHmac } from 'node:crypto'
import type { IceServer } from '@uno/protocol'

export type TurnConfig = {
  turnUrl: string | null
  turnSecret: string | null
  turnTtlSeconds: number
  stunUrl: string | null
}

/**
 * coturn's REST API scheme (`use-auth-secret`): the username carries its own
 * expiry, so the relay validates it with the shared secret and stores nothing.
 * HMAC-SHA1 is not a choice, it is what RFC 5389 long-term credentials specify.
 */
export function mintIceServers(
  config: TurnConfig,
  roomCode: string,
  now: () => number = () => Date.now(),
): IceServer[] {
  const servers: IceServer[] = []

  // STUN first: ICE should find the free path before it pays for a relay.
  if (config.stunUrl !== null) servers.push({ urls: [config.stunUrl] })
  if (config.turnUrl === null || config.turnSecret === null) return servers

  const username = `${Math.floor(now() / 1000) + config.turnTtlSeconds}:${roomCode}`
  const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64')
  servers.push({ urls: [config.turnUrl], username, credential })
  return servers
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/src/sockets/turn-credentials.test.ts`
Expected: PASS, all five.

- [ ] **Step 5: Add the configuration**

In `apps/server/src/config.ts`, add to `envSchema` after the `CHAT_PER_SECOND` entry:

```ts
  /**
   * WebRTC voice. Empty disables the part it configures rather than failing the
   * boot: a table with no TURN still plays, it just loses the players whose NAT
   * needs a relay.
   */
  TURN_URL: z.string().default(''),
  /** Shared with coturn's `static-auth-secret`. The only coupling between them. */
  TURN_SECRET: z.string().default(''),
  TURN_TTL_SECONDS: z.coerce.number().int().min(60).default(86_400),
  STUN_URL: z.string().default(''),
```

Add to the `Config` type:

```ts
  turnUrl: string | null
  turnSecret: string | null
  turnTtlSeconds: number
  stunUrl: string | null
```

Add to the object `loadConfig` returns:

```ts
    turnUrl: parsed.TURN_URL.trim().length > 0 ? parsed.TURN_URL.trim() : null,
    turnSecret: parsed.TURN_SECRET.length > 0 ? parsed.TURN_SECRET : null,
    turnTtlSeconds: parsed.TURN_TTL_SECONDS,
    stunUrl: parsed.STUN_URL.trim().length > 0 ? parsed.STUN_URL.trim() : null,
```

- [ ] **Step 6: Test the configuration**

Append to `apps/server/src/config.test.ts`:

```ts
describe('voice configuration', () => {
  it('defaults every voice setting to disabled', () => {
    const config = loadConfig({ NODE_ENV: 'test' })
    expect(config.turnUrl).toBeNull()
    expect(config.turnSecret).toBeNull()
    expect(config.stunUrl).toBeNull()
    expect(config.turnTtlSeconds).toBe(86_400)
  })

  it('reads a configured relay', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      TURN_URL: 'turn:turn.example.com:3478',
      TURN_SECRET: 'shhh',
    })
    expect(config.turnUrl).toBe('turn:turn.example.com:3478')
    expect(config.turnSecret).toBe('shhh')
  })

  it('refuses a ttl short enough to expire mid-match', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', TURN_TTL_SECONDS: '30' })).toThrow()
  })
})
```

Run: `npx vitest run apps/server/src/config.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add apps/server/src/config.ts apps/server/src/config.test.ts apps/server/src/sockets/turn-credentials.ts apps/server/src/sockets/turn-credentials.test.ts
git commit -m "feat(server): mint ephemeral TURN credentials from a shared secret"
```

---

### Task 3: VoiceRoom membership state

**Files:**

- Create: `apps/server/src/sockets/voice-room.ts`
- Test: `apps/server/src/sockets/voice-room.test.ts`

**Interfaces:**

- Consumes: `VoicePeer` from Task 1.
- Produces: `createVoiceRooms()` returning `VoiceRooms` with `in(roomCode): VoiceRoom`, `drop(roomCode): void`, `size(): number`; `VoiceRoom` with `join(seat)`, `leave(seat)`, `setMuted(seat, muted)`, `has(seat): boolean`, `peers(): VoicePeer[]`, `peersExcept(seat): VoicePeer[]`, `size(): number`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/sockets/voice-room.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createVoiceRooms } from './voice-room.js'

describe('voice rooms', () => {
  it('starts empty and reports members after a join', () => {
    const rooms = createVoiceRooms()
    const room = rooms.in('ABCDEF')
    expect(room.peers()).toEqual([])
    room.join(0)
    room.join(2)
    expect(room.peers()).toEqual([
      { seat: 0, muted: false },
      { seat: 2, muted: false },
    ])
  })

  it('orders peers by seat regardless of join order', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(3)
    room.join(1)
    expect(room.peers().map((peer) => peer.seat)).toEqual([1, 3])
  })

  it('joining twice does not duplicate a seat or reset its mute', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(1)
    room.setMuted(1, true)
    room.join(1)
    expect(room.peers()).toEqual([{ seat: 1, muted: true }])
  })

  it('excludes the asking seat from its own peer list', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(0)
    room.join(1)
    expect(room.peersExcept(0)).toEqual([{ seat: 1, muted: false }])
  })

  it('forgets a seat on leave', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.join(0)
    room.leave(0)
    expect(room.has(0)).toBe(false)
    expect(room.peers()).toEqual([])
  })

  it('ignores mute and leave for a seat that never joined', () => {
    const room = createVoiceRooms().in('ABCDEF')
    room.setMuted(2, true)
    room.leave(2)
    expect(room.peers()).toEqual([])
  })

  it('keeps rooms independent and drops them on request', () => {
    const rooms = createVoiceRooms()
    rooms.in('AAAAAA').join(0)
    rooms.in('BBBBBB').join(1)
    expect(rooms.in('AAAAAA').peers()).toEqual([{ seat: 0, muted: false }])
    expect(rooms.size()).toBe(2)
    rooms.drop('AAAAAA')
    expect(rooms.size()).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/server/src/sockets/voice-room.test.ts`
Expected: FAIL, `./voice-room.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/server/src/sockets/voice-room.ts`:

```ts
import type { VoicePeer } from '@uno/protocol'

export type VoiceRoom = {
  join(seat: number): void
  leave(seat: number): void
  setMuted(seat: number, muted: boolean): void
  has(seat: number): boolean
  peers(): VoicePeer[]
  peersExcept(seat: number): VoicePeer[]
  size(): number
}

export type VoiceRooms = {
  in(roomCode: string): VoiceRoom
  drop(roomCode: string): void
  size(): number
}

function createVoiceRoom(): VoiceRoom {
  // Seat to muted. Deliberately not on Room: Room is the game, and a voice
  // session that owns none of the game state can be removed without touching it.
  const members = new Map<number, boolean>()

  const peers = (): VoicePeer[] =>
    [...members.entries()]
      .map(([seat, muted]) => ({ seat, muted }))
      .sort((left, right) => left.seat - right.seat)

  return {
    join(seat) {
      // Re-joining must not reset the mute a player set a moment ago.
      if (!members.has(seat)) members.set(seat, false)
    },
    leave(seat) {
      members.delete(seat)
    },
    setMuted(seat, muted) {
      if (members.has(seat)) members.set(seat, muted)
    },
    has: (seat) => members.has(seat),
    peers,
    peersExcept: (seat) => peers().filter((peer) => peer.seat !== seat),
    size: () => members.size,
  }
}

export function createVoiceRooms(): VoiceRooms {
  const rooms = new Map<string, VoiceRoom>()

  return {
    in(roomCode) {
      const existing = rooms.get(roomCode)
      if (existing !== undefined) return existing
      const created = createVoiceRoom()
      rooms.set(roomCode, created)
      return created
    },
    drop(roomCode) {
      rooms.delete(roomCode)
    },
    size: () => rooms.size,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/server/src/sockets/voice-room.test.ts`
Expected: PASS, all seven.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add apps/server/src/sockets/voice-room.ts apps/server/src/sockets/voice-room.test.ts
git commit -m "feat(server): voice session membership kept outside Room"
```

---

### Task 4: Voice socket handlers

This is the task where the project's recorded trap lives. Testing the schema and testing the client proves nothing about the wire between them; the `socket.on` handler is the piece that gets forgotten. Every test here goes through a real socket.

**Files:**

- Create: `apps/server/src/sockets/types.ts`
- Create: `apps/server/src/sockets/voice.ts`
- Modify: `apps/server/src/sockets/handlers.ts` (use the extracted types, register voice, clean up on release and disconnect)
- Test: `apps/server/src/sockets/handlers-voice.test.ts`

**Interfaces:**

- Consumes: `voiceSignalSendSchema`, `voiceMuteSchema`, `VoicePeer`, `IceServer` (Task 1); `mintIceServers` (Task 2); `createVoiceRooms`, `VoiceRooms` (Task 3); `createRateLimiter` from `../security/rate-limit.js`.
- Produces: `TypedServer`, `TypedSocket`, `Presence`, `AckFailure` exported from `sockets/types.ts`; `registerVoiceHandlers(options)` and `leaveVoice(options)` from `sockets/voice.ts`.

- [ ] **Step 1: Extract the shared socket types**

Create `apps/server/src/sockets/types.ts`:

```ts
import type { ClientToServer, ErrorCode, ServerToClient } from '@uno/protocol'
import type { Server, Socket } from 'socket.io'
import type { Room } from '../rooms/room.js'

export type TypedServer = Server<ClientToServer, ServerToClient>
export type TypedSocket = Socket<ClientToServer, ServerToClient>
export type AckFailure = { ok: false; error: ErrorCode }

/** Which room and seat a live socket belongs to. */
export type Presence = { room: Room; seat: number }
```

In `apps/server/src/sockets/handlers.ts`, delete the four local declarations of `TypedServer`, `TypedSocket`, `AckFailure` and `Presence` (lines 22-28) and import them instead:

```ts
import type { AckFailure, Presence, TypedServer, TypedSocket } from './types.js'
```

Run: `npm run typecheck; echo "EXIT=$?"`
Expected: EXIT=0, nothing else changed.

- [ ] **Step 2: Write the failing test**

Create `apps/server/src/sockets/handlers-voice.test.ts`. It reuses the harness shape from `handlers.test.ts`:

```ts
import { DEFAULT_MATCH_GOAL, type VoicePeer } from '@uno/protocol'
import { createServer, type Server as HttpServer } from 'node:http'
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
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    TURN_URL: 'turn:turn.example.com:3478',
    TURN_SECRET: 'test-secret',
  })
  httpServer = createServer()
  ioServer = registerSocketHandlers(
    httpServer,
    new RoomManager({ maxRooms: 10, gracePeriodMs: config.gracePeriodMs, seedSource: () => 42 }),
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

const once = <T>(client: Socket, event: string): Promise<T> =>
  new Promise((resolve) => client.once(event, resolve))

type JoinVoiceAck =
  | { ok: true; iceServers: { urls: string[]; username?: string }[]; peers: VoicePeer[] }
  | { ok: false; error: string }
type PlainAck = { ok: true } | { ok: false; error: string }

/** Seats two players at one table and returns their sockets, seat 0 first. */
const seatTwo = async (): Promise<[Socket, Socket]> => {
  const host = newClient()
  const created = await emit<{ ok: true; roomCode: string } | { ok: false }>(host, 'room:create', {
    playerName: 'Ana',
    goal: DEFAULT_MATCH_GOAL,
    pace: null,
  })
  if (!created.ok) throw new Error('room:create failed')
  const guest = newClient()
  const joined = await emit<PlainAck>(guest, 'room:join', {
    roomCode: created.roomCode,
    playerName: 'Bo',
  })
  if (!joined.ok) throw new Error('room:join failed')
  return [host, guest]
}

describe('voice signalling over sockets', () => {
  it('returns minted ice servers and an empty peer list to the first joiner', async () => {
    const [host] = await seatTwo()
    const ack = await emit<JoinVoiceAck>(host, 'voice:join', {})
    if (!ack.ok) throw new Error(ack.error)
    expect(ack.peers).toEqual([])
    expect(ack.iceServers[0]?.urls).toEqual(['turn:turn.example.com:3478'])
    expect(ack.iceServers[0]?.username).toMatch(/^\d+:[A-Z0-9]{6}$/)
  })

  it('tells the second joiner about the first', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    const ack = await emit<JoinVoiceAck>(guest, 'voice:join', {})
    if (!ack.ok) throw new Error(ack.error)
    expect(ack.peers).toEqual([{ seat: 0, muted: false }])
  })

  it('broadcasts the roster to everyone already in the session', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    const roster = once<VoicePeer[]>(host, 'voice:peers')
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    expect(await roster).toEqual([
      { seat: 0, muted: false },
      { seat: 1, muted: false },
    ])
  })

  it('relays a signal to the addressed seat, tagged with the sender', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const delivered = once<{ fromSeat: number; signal: { kind: string; sdp: string } }>(
      guest,
      'voice:signal',
    )
    const ack = await emit<PlainAck>(host, 'voice:signal', {
      toSeat: 1,
      signal: { kind: 'offer', sdp: 'v=0\r\n' },
    })
    expect(ack.ok).toBe(true)
    expect(await delivered).toEqual({ fromSeat: 0, signal: { kind: 'offer', sdp: 'v=0\r\n' } })
  })

  it('refuses to signal before joining', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const ack = await emit<PlainAck>(host, 'voice:signal', {
      toSeat: 1,
      signal: { kind: 'offer', sdp: 'v=0\r\n' },
    })
    expect(ack).toEqual({ ok: false, error: 'voice_not_joined' })
  })

  it('refuses to signal a seat that has not joined voice', async () => {
    const [host] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    const ack = await emit<PlainAck>(host, 'voice:signal', {
      toSeat: 1,
      signal: { kind: 'offer', sdp: 'v=0\r\n' },
    })
    expect(ack).toEqual({ ok: false, error: 'voice_peer_unavailable' })
  })

  it('rejects a malformed signal without disturbing the session', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const ack = await emit<PlainAck>(host, 'voice:signal', { toSeat: 1, signal: { kind: 'nope' } })
    expect(ack).toEqual({ ok: false, error: 'invalid_payload' })
  })

  it('broadcasts a mute to the room', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const roster = once<VoicePeer[]>(guest, 'voice:peers')
    await emit<PlainAck>(host, 'voice:mute', { muted: true })
    expect(await roster).toEqual([
      { seat: 0, muted: true },
      { seat: 1, muted: false },
    ])
  })

  it('drops a seat from the roster when it leaves voice but stays at the table', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const roster = once<VoicePeer[]>(guest, 'voice:peers')
    await emit<PlainAck>(host, 'voice:leave', {})
    expect(await roster).toEqual([{ seat: 1, muted: false }])
  })

  it('drops a seat from the roster when its socket disconnects', async () => {
    const [host, guest] = await seatTwo()
    await emit<JoinVoiceAck>(host, 'voice:join', {})
    await emit<JoinVoiceAck>(guest, 'voice:join', {})
    const roster = once<VoicePeer[]>(guest, 'voice:peers')
    host.disconnect()
    expect(await roster).toEqual([{ seat: 1, muted: false }])
  })

  it('refuses voice:join from a socket with no seat', async () => {
    const stranger = newClient()
    const ack = await emit<JoinVoiceAck>(stranger, 'voice:join', {})
    expect(ack).toEqual({ ok: false, error: 'room_not_found' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run apps/server/src/sockets/handlers-voice.test.ts`
Expected: FAIL, every `voice:*` emit times out or acks `invalid_payload`, because no handler is registered.

- [ ] **Step 4: Write the voice handlers**

Create `apps/server/src/sockets/voice.ts`:

```ts
import { voiceMuteSchema, voiceSignalSendSchema } from '@uno/protocol'
import type { ZodType } from 'zod'
import type { Config } from '../config.js'
import { logger } from '../logger.js'
import type { RateLimiter } from '../security/rate-limit.js'
import { mintIceServers } from './turn-credentials.js'
import type { AckFailure, Presence, TypedServer, TypedSocket } from './types.js'
import type { VoiceRooms } from './voice-room.js'

type VoiceContext = {
  io: TypedServer
  voiceRooms: VoiceRooms
  config: Config
  limiter: RateLimiter
  presenceOf: (socketId: string) => Presence | undefined
}

/** Pushes the current roster to every socket in the room, sender included. */
function broadcastPeers(context: VoiceContext, presence: Presence): void {
  context.io
    .to(presence.room.code)
    .emit('voice:peers', context.voiceRooms.in(presence.room.code).peers())
}

/**
 * Removes a socket's seat from its voice session. Called from `voice:leave`, and
 * from the two paths where a socket goes away without saying anything.
 *
 * Voice gets no reconnect grace period: the game seat's grace protects a match in
 * progress, while a peer connection that has already dropped is better rebuilt.
 */
export function leaveVoice(context: VoiceContext, socket: TypedSocket): void {
  const presence = context.presenceOf(socket.id)
  if (presence === undefined) return
  const room = context.voiceRooms.in(presence.room.code)
  if (!room.has(presence.seat)) return

  room.leave(presence.seat)
  context.limiter.forget(socket.id)
  if (room.size() === 0) context.voiceRooms.drop(presence.room.code)
  broadcastPeers(context, presence)
}

export function registerVoiceHandlers(
  context: VoiceContext,
  socket: TypedSocket,
  helpers: {
    attempt: (ack: unknown, run: () => void) => void
    parsePayload: <T>(schema: ZodType<T>, payload: unknown) => T | null
    emptyPayloadSchema: ZodType<Record<string, never>>
    seated: (ack: (result: AckFailure) => void) => Presence | null
  },
): void {
  const { attempt, parsePayload, emptyPayloadSchema, seated } = helpers

  socket.on('voice:join', (payload, ack) => {
    attempt(ack, () => {
      if (parsePayload(emptyPayloadSchema, payload) === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      const presence = seated(ack)
      if (presence === null) return

      const room = context.voiceRooms.in(presence.room.code)
      // Read the peers before joining: a joiner must not be told about itself.
      const peers = room.peersExcept(presence.seat)
      room.join(presence.seat)
      ack({
        ok: true,
        iceServers: mintIceServers(context.config, presence.room.code),
        peers,
      })
      broadcastPeers(context, presence)
    })
  })

  socket.on('voice:leave', (payload, ack) => {
    attempt(ack, () => {
      if (parsePayload(emptyPayloadSchema, payload) === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      // Leaving twice is not worth reporting: there is simply nothing to remove.
      leaveVoice(context, socket)
      ack({ ok: true })
    })
  })

  socket.on('voice:signal', (payload, ack) => {
    attempt(ack, () => {
      const data = parsePayload(voiceSignalSendSchema, payload)
      if (data === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      const presence = seated(ack)
      if (presence === null) return
      if (!context.limiter.allow(socket.id)) {
        ack({ ok: false, error: 'rate_limited' })
        return
      }

      const room = context.voiceRooms.in(presence.room.code)
      if (!room.has(presence.seat)) {
        ack({ ok: false, error: 'voice_not_joined' })
        return
      }
      /* The target is checked against this room's session, never taken on trust:
         a seat number from a client is an index into somebody else's table. */
      if (data.toSeat === presence.seat || !room.has(data.toSeat)) {
        ack({ ok: false, error: 'voice_peer_unavailable' })
        return
      }
      const targetSocketId = presence.room.memberAt(data.toSeat)?.socketId
      if (targetSocketId == null) {
        ack({ ok: false, error: 'voice_peer_unavailable' })
        return
      }

      ack({ ok: true })
      // Relayed verbatim. The server does not parse SDP and must not start.
      context.io
        .to(targetSocketId)
        .emit('voice:signal', { fromSeat: presence.seat, signal: data.signal })
    })
  })

  socket.on('voice:mute', (payload, ack) => {
    attempt(ack, () => {
      const data = parsePayload(voiceMuteSchema, payload)
      if (data === null) {
        ack({ ok: false, error: 'invalid_payload' })
        return
      }
      const presence = seated(ack)
      if (presence === null) return

      const room = context.voiceRooms.in(presence.room.code)
      if (!room.has(presence.seat)) {
        ack({ ok: false, error: 'voice_not_joined' })
        return
      }
      room.setMuted(presence.seat, data.muted)
      ack({ ok: true })
      broadcastPeers(context, presence)
      logger.debug({ seat: presence.seat, muted: data.muted }, 'voice mute changed')
    })
  })
}
```

- [ ] **Step 5: Wire it into handlers.ts**

Add the imports:

```ts
import { registerVoiceHandlers, leaveVoice } from './voice.js'
import { createVoiceRooms } from './voice-room.js'
```

Beside the other limiters inside `registerSocketHandlers`, add the session state. Signalling bursts on join and then goes quiet, so the bucket is sized for a burst rather than a rate:

```ts
  const voiceRooms = createVoiceRooms()
  /* One join in a four-player mesh emits an offer, an answer and a dozen or so
     candidates per pair. Generous for that burst, hostile to a signal flood. */
  const voiceLimiter = createRateLimiter({ capacity: 120, refillPerSecond: 10 })
```

Immediately after `const presences = new Map...` is declared, define the accessor the voice context needs:

```ts
  const voiceContext = {
    io,
    voiceRooms,
    config,
    limiter: voiceLimiter,
    presenceOf: (socketId: string) => presences.get(socketId),
  }
```

Inside `release`, after `chatLimiter.forget(socket.id)`, add:

```ts
    // Before `presences.delete` below: leaveVoice resolves the room through it.
    leaveVoice(voiceContext, socket)
```

Verify that line sits **above** the existing `presences.delete(socket.id)` call in `release`; if it does not, move it there.

In the `disconnect` handler, add the same call as the first statement inside `attempt`, before `moveLimiter.forget(socket.id)`:

```ts
        leaveVoice(voiceContext, socket)
```

Finally, inside the `io.on('connection', ...)` block, immediately after `seated` is defined, register the handlers:

```ts
    registerVoiceHandlers(voiceContext, socket, {
      attempt,
      parsePayload,
      emptyPayloadSchema,
      seated,
    })
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run apps/server/src/sockets/`
Expected: PASS, including every pre-existing handler test.

- [ ] **Step 7: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add apps/server/src/sockets
git commit -m "feat(server): relay voice signalling between seats"
```

---

### Task 5: Client peer manager

**Files:**

- Create: `apps/web/src/lib/voice/peer-manager.ts`
- Test: `apps/web/src/lib/voice/peer-manager.test.ts`

**Interfaces:**

- Consumes: `VoiceSignal`, `IceServer` from Task 1.
- Produces: `createPeerManager(options): PeerManager` with `connect(seat)`, `accept(fromSeat, signal)`, `disconnect(seat)`, `destroy()`, `seats()`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/voice/peer-manager.test.ts`:

```ts
import type { VoiceSignal } from '@uno/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeerManager } from './peer-manager.js'

/** Enough of RTCPeerConnection to drive the manager without a browser. */
class FakeConnection {
  static instances: FakeConnection[] = []
  localDescription: { type: string; sdp: string } | null = null
  remoteDescriptions: { type: string; sdp: string }[] = []
  addedCandidates: unknown[] = []
  addedTracks: unknown[] = []
  connectionState = 'new'
  closed = false
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null

  constructor(public config: RTCConfiguration) {
    FakeConnection.instances.push(this)
  }

  addTrack(track: unknown): void {
    this.addedTracks.push(track)
  }
  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: 'offer', sdp: 'FAKE-OFFER' }
  }
  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: 'FAKE-ANSWER' }
  }
  async setLocalDescription(description: { type: string; sdp: string }): Promise<void> {
    this.localDescription = description
  }
  async setRemoteDescription(description: { type: string; sdp: string }): Promise<void> {
    this.remoteDescriptions.push(description)
  }
  async addIceCandidate(candidate: unknown): Promise<void> {
    this.addedCandidates.push(candidate)
  }
  close(): void {
    this.closed = true
  }
}

const fakeStream = { getTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream

const build = (selfSeat: number) => {
  const sendSignal = vi.fn<(toSeat: number, signal: VoiceSignal) => void>()
  const onRemoteStream = vi.fn<(seat: number, stream: MediaStream) => void>()
  const onStateChange = vi.fn<(seat: number, state: RTCPeerConnectionState) => void>()
  const manager = createPeerManager({
    selfSeat,
    iceServers: [{ urls: ['stun:example.com'] }],
    localStream: fakeStream,
    sendSignal,
    onRemoteStream,
    onStateChange,
    createConnection: (config) => new FakeConnection(config) as unknown as RTCPeerConnection,
  })
  return { manager, sendSignal, onRemoteStream, onStateChange }
}

beforeEach(() => {
  FakeConnection.instances = []
})

describe('peer manager negotiation', () => {
  it('sends the offer when this seat is the lower of the pair', async () => {
    const { manager, sendSignal } = build(0)
    await manager.connect(2)
    expect(sendSignal).toHaveBeenCalledWith(2, { kind: 'offer', sdp: 'FAKE-OFFER' })
  })

  it('stays silent and waits when this seat is the higher of the pair', async () => {
    const { manager, sendSignal } = build(3)
    await manager.connect(1)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('answers an offer it receives', async () => {
    const { manager, sendSignal } = build(3)
    await manager.accept(1, { kind: 'offer', sdp: 'THEIR-OFFER' })
    expect(sendSignal).toHaveBeenCalledWith(1, { kind: 'answer', sdp: 'FAKE-ANSWER' })
    expect(FakeConnection.instances[0]?.remoteDescriptions).toEqual([
      { type: 'offer', sdp: 'THEIR-OFFER' },
    ])
  })

  it('applies an answer to the connection it already opened', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    await manager.accept(2, { kind: 'answer', sdp: 'THEIR-ANSWER' })
    expect(FakeConnection.instances).toHaveLength(1)
    expect(FakeConnection.instances[0]?.remoteDescriptions).toEqual([
      { type: 'answer', sdp: 'THEIR-ANSWER' },
    ])
  })

  it('adds a received candidate', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    await manager.accept(2, {
      kind: 'candidate',
      candidate: 'candidate:1 1 udp 2 1.2.3.4 5 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })
    expect(FakeConnection.instances[0]?.addedCandidates).toHaveLength(1)
  })

  it('publishes its own candidates as signals', async () => {
    const { manager, sendSignal } = build(0)
    await manager.connect(2)
    sendSignal.mockClear()
    FakeConnection.instances[0]?.onicecandidate?.({
      candidate: {
        candidate: 'candidate:1 1 udp 2 1.2.3.4 5 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      } as RTCIceCandidate,
    })
    expect(sendSignal).toHaveBeenCalledWith(2, {
      kind: 'candidate',
      candidate: 'candidate:1 1 udp 2 1.2.3.4 5 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })
  })

  it('ignores the null candidate that marks the end of gathering', async () => {
    const { manager, sendSignal } = build(0)
    await manager.connect(2)
    sendSignal.mockClear()
    FakeConnection.instances[0]?.onicecandidate?.({ candidate: null })
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('reports a remote stream against its seat', async () => {
    const { manager, onRemoteStream } = build(0)
    await manager.connect(2)
    const remote = { id: 'remote' } as unknown as MediaStream
    FakeConnection.instances[0]?.ontrack?.({ streams: [remote] })
    expect(onRemoteStream).toHaveBeenCalledWith(2, remote)
  })

  it('reports connection state changes against its seat', async () => {
    const { manager, onStateChange } = build(0)
    await manager.connect(2)
    const connection = FakeConnection.instances[0]
    if (connection === undefined) throw new Error('expected a connection')
    connection.connectionState = 'failed'
    connection.onconnectionstatechange?.()
    expect(onStateChange).toHaveBeenCalledWith(2, 'failed')
  })

  it('reuses one connection per seat', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    await manager.connect(2)
    expect(FakeConnection.instances).toHaveLength(1)
  })

  it('closes and forgets a seat on disconnect', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    manager.disconnect(2)
    expect(FakeConnection.instances[0]?.closed).toBe(true)
    expect(manager.seats()).toEqual([])
  })

  it('closes every connection on destroy', async () => {
    const { manager } = build(0)
    await manager.connect(1)
    await manager.connect(2)
    manager.destroy()
    expect(FakeConnection.instances.every((instance) => instance.closed)).toBe(true)
    expect(manager.seats()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/lib/voice/peer-manager.test.ts`
Expected: FAIL, `./peer-manager.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/voice/peer-manager.ts`:

```ts
import type { IceServer, VoiceSignal } from '@uno/protocol'

export type PeerManagerOptions = {
  selfSeat: number
  iceServers: IceServer[]
  localStream: MediaStream
  sendSignal: (toSeat: number, signal: VoiceSignal) => void
  onRemoteStream: (seat: number, stream: MediaStream) => void
  onStateChange: (seat: number, state: RTCPeerConnectionState) => void
  /** Injected so the negotiation logic is testable without a browser. */
  createConnection?: (config: RTCConfiguration) => RTCPeerConnection
}

export type PeerManager = {
  connect(seat: number): Promise<void>
  accept(fromSeat: number, signal: VoiceSignal): Promise<void>
  disconnect(seat: number): void
  destroy(): void
  seats(): number[]
}

export function createPeerManager(options: PeerManagerOptions): PeerManager {
  const create =
    options.createConnection ?? ((config: RTCConfiguration) => new RTCPeerConnection(config))
  const connections = new Map<number, RTCPeerConnection>()

  const open = (seat: number): RTCPeerConnection => {
    const existing = connections.get(seat)
    if (existing !== undefined) return existing

    const connection = create({ iceServers: options.iceServers })
    for (const track of options.localStream.getTracks()) {
      connection.addTrack(track, options.localStream)
    }
    connection.onicecandidate = (event) => {
      // A null candidate marks the end of gathering, not something to relay.
      if (event.candidate === null) return
      options.sendSignal(seat, {
        kind: 'candidate',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      })
    }
    connection.ontrack = (event) => {
      const [stream] = event.streams
      if (stream !== undefined) options.onRemoteStream(seat, stream)
    }
    connection.onconnectionstatechange = () => {
      options.onStateChange(seat, connection.connectionState)
    }
    connections.set(seat, connection)
    return connection
  }

  return {
    /**
     * The lower seat number offers, the higher one answers. Seat numbers are
     * already stable and agreed by everyone, so glare cannot happen and there is
     * no recovery path to get wrong. Do NOT make this symmetric.
     */
    async connect(seat) {
      if (connections.has(seat)) return
      const connection = open(seat)
      if (options.selfSeat > seat) return

      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      options.sendSignal(seat, { kind: 'offer', sdp: offer.sdp ?? '' })
    },

    async accept(fromSeat, signal) {
      const connection = open(fromSeat)
      if (signal.kind === 'candidate') {
        await connection.addIceCandidate({
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
        })
        return
      }
      await connection.setRemoteDescription({ type: signal.kind, sdp: signal.sdp })
      if (signal.kind === 'answer') return

      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      options.sendSignal(fromSeat, { kind: 'answer', sdp: answer.sdp ?? '' })
    },

    disconnect(seat) {
      connections.get(seat)?.close()
      connections.delete(seat)
    },

    destroy() {
      for (const connection of connections.values()) connection.close()
      connections.clear()
    },

    seats: () => [...connections.keys()].sort((left, right) => left - right),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/lib/voice/peer-manager.test.ts`
Expected: PASS, all twelve.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add apps/web/src/lib/voice
git commit -m "feat(web): WebRTC peer manager with a deterministic offerer"
```

---

### Task 6: Speaking detector

**Files:**

- Create: `apps/web/src/lib/voice/speaking-detector.ts`
- Test: `apps/web/src/lib/voice/speaking-detector.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `createSpeakingDetector(options): SpeakingDetector | null` with `watch(seat, stream)`, `unwatch(seat)`, `sample()`, `destroy()`. Options are `{ onChange, threshold?, context?, autoStart? }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/voice/speaking-detector.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createSpeakingDetector } from './speaking-detector.js'

/** Drives the detector from a scripted sequence of loudness readings. */
const scriptedContext = (levels: number[]) => {
  let index = 0
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 4,
    getByteTimeDomainData(target: Uint8Array) {
      const level = levels[Math.min(index, levels.length - 1)] ?? 0
      index += 1
      // 128 is silence in time-domain byte data; deviation from it is amplitude.
      target.fill(128 + level)
    },
    disconnect: vi.fn(),
  }
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  return {
    context: {
      createAnalyser: () => analyser,
      createMediaStreamSource: () => source,
      close: vi.fn(),
      state: 'running',
    } as unknown as AudioContext,
    source,
  }
}

const fakeStream = {} as MediaStream

describe('speaking detector', () => {
  it('reports speaking when the level crosses the threshold', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([40])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    expect(onChange).toHaveBeenCalledWith(1, true)
  })

  it('stays silent below the threshold', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([2])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits only on transitions, not on every sample', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([40, 40, 40])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    detector.sample()
    detector.sample()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reports the fall back to silence', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([40, 1])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    detector.sample()
    expect(onChange).toHaveBeenNthCalledWith(2, 1, false)
  })

  it('disconnects the source it created when a seat stops being watched', () => {
    const { context, source } = scriptedContext([0])
    const detector = createSpeakingDetector({
      onChange: vi.fn(),
      threshold: 10,
      context,
      autoStart: false,
    })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.unwatch(1)
    expect(source.disconnect).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/lib/voice/speaking-detector.test.ts`
Expected: FAIL, `./speaking-detector.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/voice/speaking-detector.ts`:

```ts
export type SpeakingDetector = {
  watch(seat: number, stream: MediaStream): void
  unwatch(seat: number): void
  /** Exposed so tests can step the loop instead of waiting on animation frames. */
  sample(): void
  destroy(): void
}

export type SpeakingDetectorOptions = {
  onChange: (seat: number, speaking: boolean) => void
  /** Deviation from silence, in the 0-127 range of time-domain byte data. */
  threshold?: number
  context?: AudioContext
  /** False in tests, which drive `sample` directly. */
  autoStart?: boolean
}

type Watched = {
  analyser: AnalyserNode
  source: MediaStreamAudioSourceNode
  buffer: Uint8Array
  speaking: boolean
}

/**
 * Who is talking is computed from the audio each client already receives, so
 * nothing about it travels over the wire. Publishing a speaking flag instead
 * would emit several messages per second per player to carry information every
 * client can derive locally.
 */
export function createSpeakingDetector(
  options: SpeakingDetectorOptions,
): SpeakingDetector | null {
  const threshold = options.threshold ?? 12
  const context =
    options.context ??
    (typeof window !== 'undefined' && 'AudioContext' in window ? new AudioContext() : null)
  if (context === null) return null

  const watched = new Map<number, Watched>()
  let frame: number | null = null

  const sample = (): void => {
    for (const [seat, entry] of watched) {
      entry.analyser.getByteTimeDomainData(entry.buffer)
      let peak = 0
      for (const value of entry.buffer) peak = Math.max(peak, Math.abs(value - 128))
      const speaking = peak >= threshold
      if (speaking === entry.speaking) continue
      entry.speaking = speaking
      options.onChange(seat, speaking)
    }
  }

  const loop = (): void => {
    sample()
    frame = requestAnimationFrame(loop)
  }
  if (options.autoStart !== false && typeof requestAnimationFrame === 'function') loop()

  return {
    watch(seat, stream) {
      if (watched.has(seat)) return
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      watched.set(seat, {
        analyser,
        source,
        buffer: new Uint8Array(analyser.frequencyBinCount),
        speaking: false,
      })
    },
    unwatch(seat) {
      const entry = watched.get(seat)
      if (entry === undefined) return
      entry.source.disconnect()
      entry.analyser.disconnect()
      watched.delete(seat)
    },
    sample,
    destroy() {
      if (frame !== null) cancelAnimationFrame(frame)
      for (const seat of [...watched.keys()]) {
        const entry = watched.get(seat)
        entry?.source.disconnect()
        entry?.analyser.disconnect()
        watched.delete(seat)
      }
      // Only a context this module created is ours to close.
      if (options.context === undefined) void context.close()
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/lib/voice/speaking-detector.test.ts`
Expected: PASS, all five.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add apps/web/src/lib/voice/speaking-detector.ts apps/web/src/lib/voice/speaking-detector.test.ts
git commit -m "feat(web): detect who is speaking from received audio"
```

---

### Task 7: useVoice hook

**Files:**

- Create: `apps/web/src/hooks/useVoice.ts`
- Test: `apps/web/src/hooks/useVoice.test.ts`
- Modify: `apps/web/src/hooks/useGameSocket.ts` (expose `socketRef`)

**Interfaces:**

- Consumes: `createPeerManager` (Task 5), `createSpeakingDetector` (Task 6), the `voice:*` protocol from Task 1.
- Produces: `useVoice({ socketRef, selfSeat })` returning `VoiceState = { status, peers, streams, speaking, connectionStates, join, leave, toggleMute, muted }`; `useGameSocket()` gains a third returned key, `socketRef`.

**Why a ref and not a socket.** `useGameSocket` keeps its socket in a `useRef` and creates it inside an effect, so it is null on the first render. Handing out the ref rather than `.current` gives `useVoice` a stable identity to depend on and keeps the "one socket for the app's lifetime" invariant intact. Voice **must** share the game socket: the server resolves a voice member through that socket's presence.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useVoice.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react'
import type { VoicePeer } from '@uno/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoice } from './useVoice.js'

/** A socket.io stand-in that lets a test deliver server events by hand. */
const fakeSocket = () => {
  const listeners = new Map<string, (payload: unknown) => void>()
  return {
    on: (event: string, handler: (payload: unknown) => void) => listeners.set(event, handler),
    off: (event: string) => listeners.delete(event),
    emit: vi.fn((event: string, _payload: unknown, ack?: (result: unknown) => void) => {
      if (event === 'voice:join') ack?.({ ok: true, iceServers: [], peers: [] })
      else ack?.({ ok: true })
    }),
    deliver: (event: string, payload: unknown) => listeners.get(event)?.(payload),
  }
}

const fakeStream = { getTracks: () => [{ kind: 'audio', enabled: true }] } as unknown as MediaStream

/** `useVoice` takes the ref, not the socket: the real one is null on first render. */
const refTo = (socket: ReturnType<typeof fakeSocket>) =>
  ({ current: socket }) as unknown as Parameters<typeof useVoice>[0]['socketRef']

beforeEach(() => {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn(async () => fakeStream) },
  })
})

describe('useVoice', () => {
  it('starts idle', () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    expect(result.current.status).toBe('idle')
  })

  it('asks for the microphone before it tells the server anything', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(socket.emit).toHaveBeenCalledWith('voice:join', {}, expect.any(Function))
    await waitFor(() => expect(result.current.status).toBe('joined'))
  })

  it('reports a denied microphone without emitting anything', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new Error('NotAllowedError')
        }),
      },
    })
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    expect(result.current.status).toBe('denied')
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('tracks the roster the server broadcasts', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    const roster: VoicePeer[] = [
      { seat: 0, muted: false },
      { seat: 1, muted: true },
    ]
    act(() => socket.deliver('voice:peers', roster))
    await waitFor(() => expect(result.current.peers).toEqual(roster))
  })

  it('emits a mute and flips its own flag', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    act(() => result.current.toggleMute())
    await waitFor(() => expect(result.current.muted).toBe(true))
    expect(socket.emit).toHaveBeenCalledWith('voice:mute', { muted: true }, expect.any(Function))
  })

  it('emits voice:leave and returns to idle', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    act(() => result.current.leave())
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(socket.emit).toHaveBeenCalledWith('voice:leave', {}, expect.any(Function))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/hooks/useVoice.test.ts`
Expected: FAIL, `./useVoice.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/hooks/useVoice.ts`:

```ts
import type { ClientToServer, ServerToClient, VoicePeer, VoiceSignal } from '@uno/protocol'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'
import { createPeerManager, type PeerManager } from '../lib/voice/peer-manager.js'
import { createSpeakingDetector, type SpeakingDetector } from '../lib/voice/speaking-detector.js'

export type VoiceStatus = 'idle' | 'joining' | 'joined' | 'denied' | 'unsupported'

type VoiceSocket = Socket<ServerToClient, ClientToServer>

export function useVoice(options: {
  socketRef: RefObject<VoiceSocket | null>
  selfSeat: number
}) {
  const { socketRef, selfSeat } = options
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [streams, setStreams] = useState<Record<number, MediaStream>>({})
  const [speaking, setSpeaking] = useState<Record<number, boolean>>({})
  const [connectionStates, setConnectionStates] = useState<Record<number, RTCPeerConnectionState>>(
    {},
  )
  const [muted, setMuted] = useState(false)

  const managerRef = useRef<PeerManager | null>(null)
  const detectorRef = useRef<SpeakingDetector | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const teardown = useCallback(() => {
    managerRef.current?.destroy()
    managerRef.current = null
    detectorRef.current?.destroy()
    detectorRef.current = null
    for (const track of localStreamRef.current?.getTracks() ?? []) track.stop()
    localStreamRef.current = null
    setStreams({})
    setSpeaking({})
    setConnectionStates({})
    setMuted(false)
  }, [])

  const join = useCallback(async () => {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
      setStatus('unsupported')
      return
    }
    setStatus('joining')

    let localStream: MediaStream
    try {
      // The microphone is asked for first: a denial must cost nothing on the server.
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStatus('denied')
      return
    }
    localStreamRef.current = localStream

    socketRef.current?.emit('voice:join', {}, (result) => {
      if (!result.ok) {
        teardown()
        setStatus('idle')
        return
      }
      const manager = createPeerManager({
        selfSeat,
        iceServers: result.iceServers,
        localStream,
        sendSignal: (toSeat, signal) => socketRef.current?.emit('voice:signal', { toSeat, signal }, () => {}),
        onRemoteStream: (seat, stream) => {
          setStreams((current) => ({ ...current, [seat]: stream }))
          detectorRef.current?.watch(seat, stream)
        },
        onStateChange: (seat, state) =>
          setConnectionStates((current) => ({ ...current, [seat]: state })),
      })
      managerRef.current = manager
      detectorRef.current = createSpeakingDetector({
        onChange: (seat, isSpeaking) =>
          setSpeaking((current) => ({ ...current, [seat]: isSpeaking })),
      })
      setStatus('joined')
      for (const peer of result.peers) void manager.connect(peer.seat)
    })
  }, [selfSeat, socketRef, teardown])

  const leave = useCallback(() => {
    socketRef.current?.emit('voice:leave', {}, () => {})
    teardown()
    setStatus('idle')
  }, [socketRef, teardown])

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    for (const track of localStreamRef.current?.getTracks() ?? []) track.enabled = !next
    socketRef.current?.emit('voice:mute', { muted: next }, () => {})
  }, [muted, socketRef])

  useEffect(() => {
    const onPeers = (roster: VoicePeer[]): void => {
      setPeers(roster)
      const manager = managerRef.current
      if (manager === null) return
      const present = new Set(roster.map((peer) => peer.seat))
      // A seat that left the roster takes its peer connection with it.
      for (const seat of manager.seats()) {
        if (present.has(seat)) continue
        manager.disconnect(seat)
        detectorRef.current?.unwatch(seat)
        setStreams((current) => {
          const { [seat]: _gone, ...rest } = current
          return rest
        })
      }
      for (const peer of roster) {
        if (peer.seat !== selfSeat) void manager.connect(peer.seat)
      }
    }

    const onSignal = (payload: { fromSeat: number; signal: VoiceSignal }): void => {
      void managerRef.current?.accept(payload.fromSeat, payload.signal)
    }

    socketRef.current?.on('voice:peers', onPeers)
    socketRef.current?.on('voice:signal', onSignal)
    return () => {
      socketRef.current?.off('voice:peers', onPeers)
      socketRef.current?.off('voice:signal', onSignal)
    }
  }, [selfSeat, socketRef])

  // A dropped socket takes the peers with it; the client rejoins explicitly.
  useEffect(() => {
    const onDisconnect = (): void => {
      teardown()
      setStatus('idle')
    }
    socketRef.current?.on('disconnect', onDisconnect)
    return () => {
      socketRef.current?.off('disconnect', onDisconnect)
    }
  }, [socketRef, teardown])

  useEffect(() => teardown, [teardown])

  return { status, peers, streams, speaking, connectionStates, join, leave, toggleMute, muted }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/hooks/useVoice.test.ts`
Expected: PASS, all six.

- [ ] **Step 5: Verify and commit**

- [ ] **Step 5: Expose the socket from useGameSocket**

Voice must ride the same socket as the game, because the server resolves a voice
member through that socket's presence. `useGameSocket` currently keeps its socket
private. In `apps/web/src/hooks/useGameSocket.ts`, change the returned object to
add the ref:

```ts
  return {
    state,
    socketRef,
    actions: {
```

Nothing else in that file changes. `socketRef` is already declared and already
stable across renders.

Run: `npx vitest run apps/web/src/hooks/useGameSocket.test.ts`
Expected: PASS, unchanged.

- [ ] **Step 6: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add apps/web/src/hooks/useVoice.ts apps/web/src/hooks/useVoice.test.ts apps/web/src/hooks/useGameSocket.ts
git commit -m "feat(web): useVoice hook wiring peers to the socket"
```

---

### Task 8: VoicePanel and table wiring

**Files:**

- Create: `apps/web/src/components/VoicePanel.tsx`
- Create: `apps/web/src/components/VoicePanel.test.tsx`
- Modify: `apps/web/src/App.tsx` (call `useVoice`, pass it down)
- Modify: `apps/web/src/screens/Table.tsx` (new `voice` prop, render the panel beside `ChatPanel`)
- Modify: `apps/web/src/screens/Table.test.tsx` (idle voice stub for the existing cases)

**Interfaces:**

- Consumes: `useVoice` from Task 7.
- Produces: `<VoicePanel voice={...} seatNames={...} selfSeat={...} />`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/VoicePanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VoicePanel } from './VoicePanel.js'

const baseVoice = {
  status: 'idle' as const,
  peers: [],
  streams: {},
  speaking: {},
  connectionStates: {},
  muted: false,
  join: vi.fn(),
  leave: vi.fn(),
  toggleMute: vi.fn(),
}

const names = ['Ana', 'Bo', 'Cy', 'Di']

describe('VoicePanel', () => {
  it('offers to join when idle', () => {
    render(<VoicePanel voice={baseVoice} seatNames={names} selfSeat={0} />)
    expect(screen.getByRole('button', { name: /join voice/i })).toBeInTheDocument()
  })

  it('calls join when clicked', async () => {
    const join = vi.fn()
    render(<VoicePanel voice={{ ...baseVoice, join }} seatNames={names} selfSeat={0} />)
    await userEvent.click(screen.getByRole('button', { name: /join voice/i }))
    expect(join).toHaveBeenCalled()
  })

  it('explains a denied microphone instead of failing silently', () => {
    render(<VoicePanel voice={{ ...baseVoice, status: 'denied' }} seatNames={names} selfSeat={0} />)
    expect(screen.getByText(/microphone/i)).toBeInTheDocument()
  })

  it('renders nothing at all when the browser cannot do voice', () => {
    const { container } = render(
      <VoicePanel voice={{ ...baseVoice, status: 'unsupported' }} seatNames={names} selfSeat={0} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the other players once joined', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: false },
          ],
        }}
        seatNames={names}
        selfSeat={0}
      />,
    )
    expect(screen.getByText('Bo')).toBeInTheDocument()
  })

  it('marks a peer whose own mic is off', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: true },
          ],
        }}
        seatNames={names}
        selfSeat={0}
      />,
    )
    expect(screen.getByLabelText(/Bo has muted their microphone/i)).toBeInTheDocument()
  })

  it('says voice is unavailable with a peer whose connection failed', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: false },
          ],
          connectionStates: { 1: 'failed' },
        }}
        seatNames={names}
        selfSeat={0}
      />,
    )
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/components/VoicePanel.test.tsx`
Expected: FAIL, `./VoicePanel.js` does not exist.

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/VoicePanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { useVoice } from '../hooks/useVoice.js'

type VoiceState = ReturnType<typeof useVoice>

/**
 * Plays one peer's audio. `srcObject` cannot be expressed as a prop, which is
 * why this needs a ref rather than being a plain `<audio src=...>`.
 */
function PeerAudio({ stream, muted }: { stream: MediaStream; muted: boolean }): JSX.Element {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (ref.current === null) return
    ref.current.srcObject = stream
  }, [stream])
  return <audio ref={ref} autoPlay muted={muted} />
}

export function VoicePanel({
  voice,
  seatNames,
  selfSeat,
}: {
  voice: VoiceState
  seatNames: string[]
  selfSeat: number
}): JSX.Element | null {
  // Muting someone is local and never broadcast: who I decline to listen to is
  // nobody else's business.
  const [locallyMuted, setLocallyMuted] = useState<Record<number, boolean>>({})

  if (voice.status === 'unsupported') return null

  if (voice.status === 'denied') {
    return (
      <section aria-label="Voice chat">
        <p>No microphone. You can still hear the others once they join.</p>
      </section>
    )
  }

  if (voice.status !== 'joined') {
    return (
      <section aria-label="Voice chat">
        <button type="button" onClick={() => void voice.join()} disabled={voice.status === 'joining'}>
          Join voice
        </button>
      </section>
    )
  }

  const others = voice.peers.filter((peer) => peer.seat !== selfSeat)

  return (
    <section aria-label="Voice chat">
      <button type="button" onClick={voice.toggleMute}>
        {voice.muted ? 'Unmute' : 'Mute'}
      </button>
      <button type="button" onClick={voice.leave}>
        Leave voice
      </button>
      <ul>
        {others.map((peer) => {
          const name = seatNames[peer.seat] ?? `Seat ${peer.seat}`
          const state = voice.connectionStates[peer.seat]
          const stream = voice.streams[peer.seat]
          return (
            <li key={peer.seat} data-speaking={voice.speaking[peer.seat] === true}>
              <span>{name}</span>
              {peer.muted && <span aria-label={`${name} has muted their microphone`}>muted</span>}
              {(state === 'failed' || state === 'disconnected') && (
                <span>Voice unavailable with {name}</span>
              )}
              <button
                type="button"
                onClick={() =>
                  setLocallyMuted((current) => ({
                    ...current,
                    [peer.seat]: current[peer.seat] !== true,
                  }))
                }
              >
                {locallyMuted[peer.seat] === true ? `Unmute ${name}` : `Mute ${name}`}
              </button>
              {stream !== undefined && (
                <PeerAudio stream={stream} muted={locallyMuted[peer.seat] === true} />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/components/VoicePanel.test.tsx`
Expected: PASS, all seven.

- [ ] **Step 5: Wire it into the table**

`Table` is presentational: it receives callbacks and holds no socket, and that
stays true. The hook is called in `App.tsx`, where `useGameSocket` already lives,
and its result is passed down as one prop.

In `apps/web/src/App.tsx`, add the imports and the call:

```tsx
import { useVoice } from './hooks/useVoice.js'
```

```tsx
  const { state, actions, socketRef } = useGameSocket()
  const voice = useVoice({ socketRef, selfSeat: state.seat ?? 0 })
```

Then pass it to the table, alongside the props it already receives:

```tsx
        voice={voice}
```

In `apps/web/src/screens/Table.tsx`, add the import and the prop:

```tsx
import { VoicePanel } from '../components/VoicePanel.js'
import type { useVoice } from '../hooks/useVoice.js'
```

Add to `TableProps`:

```ts
  voice: ReturnType<typeof useVoice>
```

Add `voice` to the destructured parameter list, then render the panel directly
after the existing `<ChatPanel ... />` on line 297. `nameOf` is already defined in
this component and already resolves a seat to a display name:

```tsx
          <VoicePanel
            voice={voice}
            seatNames={[0, 1, 2, 3].map((seat) => nameOf(seat))}
            selfSeat={view.you.seat}
          />
```

Existing `Table.test.tsx` cases construct the component directly and will not
compile without the new prop. Add a shared idle voice stub to that file and pass
it in each render:

```tsx
const idleVoice = {
  status: 'idle' as const,
  peers: [],
  streams: {},
  speaking: {},
  connectionStates: {},
  muted: false,
  join: async () => {},
  leave: () => {},
  toggleMute: () => {},
}
```

Run: `npx vitest run apps/web/src/screens/Table.test.tsx apps/web/src/App.test.tsx`
Expected: PASS, the existing table tests are otherwise unaffected.

- [ ] **Step 6: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
git add apps/web/src/components/VoicePanel.tsx apps/web/src/components/VoicePanel.test.tsx apps/web/src/App.tsx apps/web/src/screens/Table.tsx apps/web/src/screens/Table.test.tsx
git commit -m "feat(web): voice panel with per-player mute and speaking cues"
```

---

### Task 9: End-to-end test, deployment and documentation

**Files:**

- Create: `e2e/voice.spec.ts`
- Modify: `playwright.config.ts` (fake media device launch flags)
- Modify: `README.md` (the four new environment variables and what happens without them)
- Modify: `compose.traefik.yaml` (the two variables on the app service)

**Interfaces:**

- Consumes: everything from Tasks 1 to 8.
- Produces: no code interface, this is the acceptance gate.

- [ ] **Step 1: Give Playwright a fake microphone**

In `playwright.config.ts`, add to the Chromium project's `use` block:

```ts
      launchOptions: {
        /* Without a fake device, getUserMedia has nothing to return in CI and
           every voice assertion fails for a reason unrelated to the code. */
        args: [
          '--use-fake-device-for-media-stream',
          '--use-fake-ui-for-media-stream',
          '--autoplay-policy=no-user-gesture-required',
        ],
      },
```

- [ ] **Step 2: Write the failing end-to-end test**

Create `e2e/voice.spec.ts`. The three helpers are copied verbatim from
`e2e/game.spec.ts` rather than imported, because that is how every existing spec
in this directory does it:

```ts
import { expect, test, type Browser, type Page } from '@playwright/test'

/** One player is one browser context: its own localStorage, its own socket. */
async function openPlayer(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ permissions: ['microphone'] })
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

test('two players reach a connected voice link', async ({ browser }) => {
  const host = await openPlayer(browser)
  const guest = await openPlayer(browser)

  const code = await createGame(host, 'Ana')
  await joinGame(guest, code, 'Bo')
  await host.getByRole('button', { name: 'Start game' }).click()

  await host.getByRole('button', { name: /join voice/i }).click()
  await guest.getByRole('button', { name: /join voice/i }).click()

  // The roster is server state and settles first.
  await expect(host.getByText('Bo')).toBeVisible()

  // The connection state is the assertion that matters: it proves ICE completed
  // between two real browsers, which no unit test can establish.
  await expect
    .poll(
      async () =>
        host.evaluate(() =>
          document.querySelector('[data-voice-state]')?.getAttribute('data-voice-state'),
        ),
      { timeout: 20_000 },
    )
    .toBe('connected')

  await expect(host.getByText(/unavailable/i)).toHaveCount(0)
})
```

For that assertion to have something to read, add `data-voice-state={state ?? 'new'}` to the `<li>` in `VoicePanel.tsx` created in Task 8.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test e2e/voice.spec.ts`
Expected: FAIL if `data-voice-state` was not added, or if any part of the chain is broken. This is the test that catches a missing `socket.on`.

- [ ] **Step 4: Make it pass**

Add the `data-voice-state` attribute, then re-run.

Run: `npx playwright test e2e/voice.spec.ts`
Expected: PASS.

- [ ] **Step 5: Document the configuration**

Add to the environment variable table in `README.md`:

| Variable           | Default | Meaning                                                                        |
| ------------------ | ------- | ------------------------------------------------------------------------------ |
| `TURN_URL`         | empty   | TURN relay, e.g. `turn:turn.example.com:3478`. Empty means STUN only            |
| `TURN_SECRET`      | empty   | Shared with coturn's `static-auth-secret`. Empty disables TURN                  |
| `TURN_TTL_SECONDS` | `86400` | Lifetime of a minted credential                                                 |
| `STUN_URL`         | empty   | STUN server. Worth setting even with TURN, as a fallback if the relay is down   |

Add a short paragraph stating that voice chat requires HTTPS, because `getUserMedia` only exists in a secure context and `localhost` is the only exemption. A LAN deployment reached at `http://192.168.x.x:5050` plays fine but has no microphone.

- [ ] **Step 6: Wire the deployment**

In `compose.traefik.yaml`, add to the app service's `environment` block:

```yaml
      TURN_URL: '${TURN_URL:-}'
      TURN_SECRET: '${TURN_SECRET:-}'
      STUN_URL: '${STUN_URL:-}'
```

`TURN_SECRET` must equal coturn's `static-auth-secret`. On the self-hosted target that secret is at `/root/coturn/turn_secret`; the spec's deployment section records the rest.

- [ ] **Step 7: Verify and commit**

```bash
npm run verify; echo "EXIT=$?"
npx playwright test; echo "E2E_EXIT=$?"
git add e2e/voice.spec.ts playwright.config.ts apps/web/src/components/VoicePanel.tsx
git commit -m "test(voice): end-to-end voice link between two browsers"
git add README.md compose.traefik.yaml
git commit -m "docs(voice): document the TURN configuration"
```

- [ ] **Step 8: Confirm the two things that cannot be checked by reading code**

Serve the app over HTTPS and open it in a real browser, then confirm:

1. No CSP violation appears in the console. `connect-src` is not expected to govern WebRTC and streams are attached via `srcObject`, so `apps/server/src/http.ts` should need no change. If a violation does appear, that file is where it is fixed.
2. The microphone permission prompt appears, meaning no `Permissions-Policy` header is blocking it.

Record the outcome in the spec's "To verify during implementation" section and commit that edit with `docs(voice):`.

---

## Notes for the executor

- The spec is the argument; this plan is the sequence. Read `docs/superpowers/specs/2026-08-26-voice-chat-design.md` before Task 1.
- Tasks 1 to 4 are the server and can be reviewed and merged before any client work starts. Tasks 5 to 8 are the client. Task 9 is the acceptance gate and needs all of them.
- If a task reveals that the spec is wrong, stop and say so rather than improvising. The lower-seat-offers rule and the decision to keep voice out of `Room` are load-bearing.
