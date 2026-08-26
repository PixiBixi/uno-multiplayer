# Voice chat

Players at a table can hear each other. Audio travels directly between browsers over
a WebRTC mesh and never reaches the server, which relays only the handful of messages
two peers need to introduce themselves.

The whole feature is an amenity, never a prerequisite. Every failure is scoped to one
player or one pair, and the game continues underneath it.

## Why a mesh

Two to four players is at most six peer connections, each carrying one Opus stream of
roughly 40 kbps. A mesh costs the server nothing but signalling and keeps audio off it
entirely. An SFU would be a second process to operate and would only start paying for
itself at a table size this game does not have.

## The server relays and nothing else

`apps/server/src/sockets/voice.ts` validates the shape of a signal with Zod, checks the
sender is seated, checks the target is a seat in the **same** room that has joined
voice, and forwards the payload verbatim. It does not parse SDP and must not start.

The target is checked rather than trusted for the same reason the game checks moves: a
seat number arriving from a client is an index into somebody else's table.

Four client events and two server events, in `packages/protocol/src/events.ts`:

| Event          | Direction | Purpose                                                      |
| -------------- | --------- | ------------------------------------------------------------ |
| `voice:join`   | client    | Joins; the ack carries the ICE servers and the current peers |
| `voice:leave`  | client    | Leaves                                                       |
| `voice:signal` | client    | Relayed to one seat                                          |
| `voice:mute`   | client    | Own microphone off, broadcast                                |
| `voice:peers`  | server    | The roster, re-sent on every change                          |
| `voice:signal` | server    | A relayed signal, tagged with the sender's seat              |

`voice:signal` has its own token bucket, sized for the burst a join produces rather
than for a rate: a four-player mesh emits a few dozen messages when the last player
arrives, then goes quiet.

## Voice state is not room state

Membership and mute live in `apps/server/src/sockets/voice-room.ts`, in a map keyed by
room code. `Room` never learns voice exists, and neither does `packages/engine`.

Two reasons this boundary is worth keeping. `Room` is already large and the invariant
that it is [synchronous and timer-free](../domain/room-lifecycle.md) protects the whole
test suite. And a feature that owns no game state can be disabled or rewritten without
reading a line of game code.

Re-joining preserves an existing mute rather than resetting it, so a reconnect cannot
silently reopen a microphone its owner had closed.

## Two decisions that removed code rather than adding it

**Offer collision is designed out.** In a mesh both peers can send an offer at once,
and the usual answer is perfect negotiation. Instead, **the lower seat number offers
and the higher one answers**. Seat numbers are already stable and agreed by everyone,
so the race cannot occur and there is no recovery path to get wrong. Do not make
`connect` in `apps/web/src/lib/voice/peer-manager.ts` symmetric.

**Who is speaking never crosses the wire.** Each client runs an `AnalyserNode` over the
streams it already receives, plus its own local stream, and lights the indicator
locally. Publishing a speaking flag instead would emit several messages per second per
player, need its own rate limit, and carry information every client can derive from
audio it already has.

Mute is the exception and does travel, because a closed microphone produces silence
that is indistinguishable from a player who is simply not talking.

## TURN credentials

coturn runs with `use-auth-secret`, so there is no static user to leak. The server
mints an ephemeral credential per join in
`apps/server/src/sockets/turn-credentials.ts`:

```
username   = "<unix-expiry>:<room-code>"
credential = base64(HMAC-SHA1(TURN_SECRET, username))
```

`TURN_SECRET` is the only thing the app and the relay share, and it is not a network
coupling: the server never connects to coturn, it computes an HMAC. That is what makes
the whole thing testable offline against a known-answer vector with an injected clock.

Configuration, the optional `coturn` service and the open-relay trap are in
[Deploying](../operations/deploying.md).

## The client

| File                                          | Responsibility                               |
| --------------------------------------------- | -------------------------------------------- |
| `apps/web/src/lib/voice/peer-manager.ts`      | Every `RTCPeerConnection`; the offerer rule  |
| `apps/web/src/lib/voice/speaking-detector.ts` | `AnalyserNode` per stream, own seat included |
| `apps/web/src/hooks/useVoice.ts`              | Adapts the two to React and to the socket    |
| `apps/web/src/components/VoicePanel.tsx`      | Join, roster, self and peer rows             |

Voice rides the game socket rather than opening its own, because the server resolves a
voice member through that socket's presence. `useGameSocket` therefore returns its
`socketRef` alongside `state` and `actions`, and `App` calls `useVoice` and passes the
result to `Table` as one prop. `Table` stays presentational and holds no socket.

The microphone is requested **before** anything is emitted, so a denied permission
costs the server nothing.

## When it fails

| Failure                     | Result                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Microphone denied or absent | That player hears the others and does not speak                                                |
| Browser without WebRTC      | The panel renders nothing at all                                                               |
| ICE fails for one pair      | Only that pair is silent; the row says so                                                      |
| Socket disconnect           | Peers are torn down and rebuilt when the client rejoins                                        |
| coturn unreachable          | It serves STUN too, so ICE is left with host candidates unless `STUN_URL` names another server |
| `TURN_SECRET` unset         | STUN only; players behind a symmetric NAT lose voice, nobody else does                         |

Voice deliberately gets **no reconnect grace period**, unlike a game seat. A 60 second
grace protects a match in progress; a peer connection that has already dropped is
better rebuilt than waited for.

## Changing this area

- A new client event needs a protocol type, a Zod schema, a `socket.on` handler **and**
  the client emit. The handler is the piece that gets forgotten, and testing both ends
  proves nothing about the wire. `handlers-voice.test.ts` goes through a real socket.
- **Your own row in the panel must not carry `data-voice-state`.** The end-to-end test
  polls the first one in the document; a self row with the attribute shadows the real
  peer and never reaches `connected`. A unit test guards this.
- Voice needs HTTPS. `getUserMedia` exists only in a secure context and `localhost` is
  the sole exemption, so a LAN deployment plays normally and has no microphone.
- Two peers on one machine pair on host candidates and never touch the relay. A local
  test proves the feature, not coturn.
- Run `npm run verify`, then `npx playwright test e2e/voice.spec.ts`, which drives two
  real browser contexts to a `connected` peer connection. See [Testing](../operations/testing.md).

The design and the implementation plan, including what was verified and what is still
open, are in `docs/superpowers/specs/2026-08-26-voice-chat-design.md` and
`docs/superpowers/plans/2026-08-26-voice-chat.md`.
