# Voice chat design

Date: 2026-08-26
Status: approved, not implemented

## Goal

Let the two to four players at a table hear each other while they play, without
routing audio through the server and without the voice layer ever being able to
break a game.

## Non-goals

- Recording, transcription, or persistence of any kind. Audio is never stored.
- Video.
- Spectator audio. Only seated players join the voice session.
- Replacing the text chat. `chat:send` stays exactly as it is; voice sits beside it.
- Server-side mixing or an SFU. At four players a mesh is smaller and simpler.

## Decisions and why

### Mesh, not a media server

Four players is six peer connections, each carrying one Opus stream of roughly
40 kbps. A mesh costs the server nothing but signalling, and it keeps audio off
the server entirely. An SFU would be more code, another process to operate, and
it would only start paying for itself at a table size this game does not have.

### The engine and `Room` are untouched

`packages/engine` stays pure: voice is not a rule and the reducer never learns it
exists. `Room` does not learn either. Voice membership and mute state live in a
separate `VoiceRoom` structure in the socket layer, keyed by room code.

Two reasons. `Room` is already 25 KB and the invariant that it is synchronous and
timer-free is worth protecting. And a voice feature that owns none of the game
state can be deleted, disabled, or rewritten without reading a line of game code.

### The "who is speaking" indicator never touches the network

Each client attaches an `AnalyserNode` to the streams it **receives** and lights
the indicator locally. Nothing is transmitted.

The obvious alternative, publishing a speaking flag over the socket, would emit
several messages per second per player and would need its own rate limit, all to
carry information every client can compute from audio it already has.

Mute state is the exception and does travel, because a muted microphone produces
silence that is indistinguishable from a player who is simply not talking. The
other players need to see why.

### Offer collision is designed out, not handled

In a mesh, two peers can send an offer simultaneously (glare). Rather than
implementing perfect negotiation, the rule is: **the lower seat number sends the
offer, the higher one answers.**

Seat numbers are already stable, already agreed by everyone, and already the
project's indexing key. The race cannot occur, so there is no recovery path to
get right.

## Where the code lives

| Path | Responsibility |
| --- | --- |
| `packages/engine` | nothing, deliberately |
| `packages/protocol/src/events.ts` | `voice:*` event types |
| `packages/protocol/src/schemas.ts` | Zod schemas for the four client events |
| `apps/server/src/sockets/voice.ts` | new file: relay, `VoiceRoom` state, rate limiting |
| `apps/server/src/sockets/turn-credentials.ts` | new file: HMAC credential minting |
| `apps/server/src/config.ts` | `TURN_URL`, `TURN_SECRET`, `TURN_TTL_SECONDS` |
| `apps/web/src/lib/voice/` | new dir: peer manager, all `RTCPeerConnection` code |
| `apps/web/src/hooks/useVoice.ts` | thin hook over the peer manager |
| `apps/web/src/components/VoicePanel.tsx` | join button, per-player mute, indicators |

`handlers.ts` is already 17.8 KB. Voice goes in its own module, registered from
the same place the other handlers are.

## Protocol

### Client to server

```ts
'voice:join':   (payload: Empty, ack: Ack<{ iceServers: IceServer[]; peers: VoicePeer[] }>) => void
'voice:leave':  (payload: Empty, ack: Ack) => void
'voice:signal': (payload: { toSeat: number; signal: VoiceSignal }, ack: Ack) => void
'voice:mute':   (payload: { muted: boolean }, ack: Ack) => void
```

### Server to client

```ts
'voice:peers':  (peers: VoicePeer[]) => void
'voice:signal': (payload: { fromSeat: number; signal: VoiceSignal }) => void
```

### Types

```ts
type VoicePeer = { seat: number; muted: boolean }
type IceServer = { urls: string[]; username?: string; credential?: string }
type VoiceSignal =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }
```

### What the server does and does not do

It does not parse SDP. It validates the shape with Zod, checks that the sender is
seated, checks that `toSeat` is a seat in the **same** room and has joined voice,
then relays. Same posture as the game: nobody is trusted about which room they
are in.

New error codes: `voice_not_joined` (signalling before `voice:join`) and
`voice_peer_unavailable` (`toSeat` is not in the voice session).

`voice:signal` gets its own token bucket, sized for the burst that a join
produces. A four-player mesh generates on the order of a few dozen messages when
the last player joins, then goes quiet. Reuses `createRateLimiter`.

## Peer lifecycle

1. Player clicks join. The client calls `getUserMedia({ audio: true })` **first**,
   so a denial costs nothing on the server.
2. `voice:join` returns the ICE servers and the current peers.
3. For each existing peer, the lower seat creates the offer.
4. `voice:peers` is broadcast to the room so everyone updates the roster.
5. `voice:leave`, a disconnect, or leaving the seat tears down that player's peer
   connections and re-broadcasts the roster.

A socket disconnect drops the player from `VoiceRoom` immediately. Voice does not
get the reconnect grace period the game seat gets: a 60 second grace on a game
seat protects a match in progress, while a voice link that has already dropped is
better rebuilt than waited for. On reconnect the client rejoins voice explicitly.

## TURN credentials

coturn runs with `use-auth-secret`, so there is no static user. The uno server
mints ephemeral credentials in the `voice:join` acknowledgement:

```
username   = "<unix-expiry>:<room-code>"
credential = base64(HMAC-SHA1(TURN_SECRET, username))
```

`TURN_SECRET` is shared with coturn and is the only coupling between the two
services. It is not a network coupling: the uno server never connects to coturn,
it computes an HMAC. That makes it testable offline with an injected clock, the
way `RoomManager` already injects its clock source.

If `TURN_SECRET` is unset the server ships STUN only and logs it once at boot.
Voice still works for most players; see degradation.

## Degradation

Voice is an amenity, never a prerequisite. Every failure is scoped to one player
or one pair, and the game continues.

| Failure | Result |
| --- | --- |
| Microphone denied or absent | That player hears others, does not speak. Others see a "no microphone" icon |
| Browser without WebRTC | The voice button is not rendered. No effect on the game |
| ICE fails for one pair | Only that pair is silent. Other links hold. UI says voice is unavailable with that player |
| Socket disconnect | Peers are torn down, rebuilt on rejoin |
| coturn down | It serves both STUN and TURN, so ICE is left with host candidates unless `STUN_URL` names another server. Works on a shared network, rarely across the internet |
| `TURN_SECRET` unset | STUN only. Players behind symmetric NAT get no voice, everyone else is fine |

The governing rule: **no voice error path touches `Room` or the progress of the
game.** If voice breaks, what is lost is voice.

## UI

A `VoicePanel` beside the existing `ChatPanel`, holding a join/leave control, a
self-mute toggle, and one row per peer with a speaking indicator, a mute-them
control, and a connection state.

Muting another player is local only: it sets `.muted` on that peer's audio
element. It is not broadcast, because who I choose not to listen to is nobody
else's business.

The join click is also what satisfies the browser autoplay policy, so remote
audio elements are created and resumed inside that gesture. `lib/audio-engine.ts`
already handles the same constraint for sound effects and is the precedent to
follow.

## Configuration and deployment

New environment variables on the uno container, parsed in `config.ts` with the
existing Zod schema:

| Variable | Default | Meaning |
| --- | --- | --- |
| `TURN_URL` | `''` | e.g. `turn:perso-ovh.jd.uluberl.eu:3478`. Empty disables TURN |
| `TURN_SECRET` | `''` | Shared with coturn. Empty disables TURN |
| `TURN_TTL_SECONDS` | `86400` | Credential lifetime |
| `STUN_URL` | `''` | Optional extra STUN server |

The infrastructure is already deployed and verified (2026-08-26): coturn on
`perso-ovh.jd.uluberl.eu`, host networking, listening on `51.38.34.75:3478`,
relay range 49160-49200, config at `/root/coturn/turnserver.conf`, secret at
`/root/coturn/turn_secret`.

Verified from outside: inbound UDP is unfiltered on 3478, 5349 and 49160; a STUN
binding request succeeds; an unauthenticated ALLOCATE is refused with 401 and
realm `jdelgado.fr`; an authenticated ALLOCATE relays with zero loss on ports
inside the declared range.

**Operational trap worth repeating.** coturn logs a warning and falls back to an
unauthenticated open relay when it cannot read its config file. The image runs as
`nobody` (uid 65534), so a root-owned `600` config produces exactly that. After
any config change, verify the config was actually loaded: `ss -lunp | grep
turnserver` must show only the public IP, and an unauthenticated ALLOCATE must
return 401. Empty `docker logs` is not evidence of health.

## Testing

- **Schemas**: unit tests alongside `schemas.test.ts`, including rejection of a
  `toSeat` that is out of range and of an oversized SDP.
- **Relay handlers**: unit tests with `socket.io-client`, following the existing
  `handlers-*.test.ts`. This is where the project's recorded trap lives: a new
  client action needs a protocol type, a schema, a `socket.on` handler **and** the
  client emit, and the handler is the piece that gets forgotten. Testing both ends
  proves nothing about the wire.
- **Credential minting**: deterministic HMAC against an injected clock, with a
  known-answer vector so a refactor cannot silently change the format.
- **Peer manager**: unit tests against a fake `RTCPeerConnection`, covering the
  lower-seat-offers rule, teardown on leave, and rebuild on rejoin.
- **E2E**: Playwright with `--use-fake-device-for-media-stream` and
  `--use-fake-ui-for-media-stream`, two players reaching `connected`. The only
  test that proves the whole chain holds together.

## Verified during implementation

- **CSP: no change needed.** The end-to-end test drives two Chromium contexts
  against the real server with its real helmet CSP, and the peer connection
  reaches `connected` with no violation. `connect-src` does not govern WebRTC and
  streams are attached via `srcObject` rather than a URL, so `http.ts` is
  untouched. Established over `http://127.0.0.1`, where the CSP is identical
  except for `upgrade-insecure-requests`, which governs asset URLs and not ICE.
- **Permissions-Policy: nothing blocks the microphone.** `getUserMedia` resolves
  in that same run. helmet emits no `Permissions-Policy` by default, and such a
  header would block capture regardless of how the prompt is answered, so its
  absence is what the passing test demonstrates.

## Still to verify

- **iOS Safari.** Historically the weakest WebRTC target, and the one platform
  the suite cannot reach. Worth a manual check on a real phone before anyone is
  told voice works everywhere.
- **A relayed call.** The end-to-end test runs on loopback, where ICE succeeds on
  host candidates and never touches coturn. The relay itself is verified
  separately (an authenticated allocation with zero loss), but the two have not
  yet been exercised together by two players on genuinely different networks.
