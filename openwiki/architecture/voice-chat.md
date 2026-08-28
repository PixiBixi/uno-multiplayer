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

## Shouting UNO calls it

Saying the word "uno" calls it. `apps/web/src/lib/voice/shout-listener.ts` runs a
`SpeechRecognition` instance on the local microphone; `apps/web/src/lib/voice/hears-uno.ts`
is a pure function that decides whether a transcript counts. The listener does not
know what `armed` means, it only reports that the microphone heard the word, and
`useShoutUno` decides whether that fires `callUno`. That split is what lets the
recogniser's lifecycle be tested without a game view, and the matching rules be
tested as a plain table of strings.

**The matcher excludes the one word that would rebuild the bug.** `hearsUno`
normalises a transcript (lowercase, accents stripped, punctuation collapsed to
spaces) and checks it against a per-locale list of what recognisers actually return
for a shouted "uno" - `una`, `oono`, `u no` in English; `ouno`, `ou no`, `juno` and
more in French. "you know" is deliberately absent from the English list: it is the
closest homophone and also one of the most common fillers in English speech, so
accepting it would reopen the exact bug this design replaced.

**Four availability states, one per browser reality:**

| State          | Meaning                                         | What the player gets                                                                |
| -------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `local`        | On-device recognition is installed              | On by default, no consent asked - nothing leaves the machine                        |
| `downloadable` | The on-device model can be installed but isn't  | A button in `VoicePanel.tsx` that calls `installShout`, from a user gesture         |
| `cloud`        | Only the vendor's cloud engine is available     | Off until the player ticks the box, which names the browser vendor as the recipient |
| `unsupported`  | No `SpeechRecognition`, or a refused microphone | Nothing; the UNO button remains, exactly as for a player with no microphone         |

A refused microphone lands on `unsupported` too. `createShoutListener` stops for good
on `not-allowed` and calls `onDenied`, which `useShoutUno` turns into `unsupported`:
same outcome for the player, same fallback, and the panel stops claiming to listen. The
refusal outlives a re-probe, which would otherwise still report the browser capable.

On-device is preferred wherever it exists: the rest of voice chat keeps audio inside
the mesh, and a cloud engine sends the microphone to the browser vendor, which is the
one thing nothing else in this feature does. That is why cloud only turns on when the
player explicitly opts in, never by default.

**The recogniser warms up at three cards, wider than the armed window.** `armed`
comes from `legalMoves` and opens at two cards, or at one while vulnerable; the
recogniser itself starts at `SHOUT_PREWARM_CARDS` (three) in `Table.tsx`. Starting it
exactly on `armed` would be tighter, but in cloud mode `start()` costs a few hundred
milliseconds and the shout arrives right as the window opens, so the recogniser has
to already be listening or it misses it.

**The restart on `onend` is the feature, not an edge case - do not remove it.** A
continuous recogniser stops itself: Chrome ends the session after a few seconds of
silence, and a network blip ends it too. Neither surfaces as anything a player can
see. Without the restart, the shout works for the first twenty seconds of a game and
then dies silently, which is worse than never shipping it. A session that lasted
`STABLE_MS` (5s) or more is a normal silence timeout, not a failure: it resets the
backoff and restarts at once, with no gap where a shout can be lost. Only a session
that ends straight away is treated as a real failure loop, and repeated immediate
ends back off (300ms up to a 5s cap) so that loop does not spin the CPU.

**Mute stops the recogniser.** `SpeechRecognition` opens its own capture rather than
reusing the `MediaStream` that `useVoice` already holds, so `track.enabled = false`
does not touch it - a muted player would otherwise still be transcribed. `useShoutUno`
only runs the listener while voice is joined **and** not muted, so pressing mute keeps
its old meaning: stop listening to me.

**The end of a round stops it too.** `Table` stays mounted under the `GameOver` overlay
and the winner holds no cards, so the hand-length window alone would leave the
recogniser running through the whole post-game chat. The prewarm therefore also checks
`view.phase === 'playing'`. In cloud mode that gap is microphone audio going to the
browser vendor outside anything the consent covers.

**`armed` still comes from `legalMoves`, unchanged.** The client learns no rule it was
not already sent - the server said the call was legal, and refuses it otherwise, so a
shout at the wrong moment costs nothing. See
[Server authority](server-authority.md).

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

| File                                          | Responsibility                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/lib/voice/peer-manager.ts`      | Every `RTCPeerConnection`; the offerer rule                                   |
| `apps/web/src/lib/voice/speaking-detector.ts` | `AnalyserNode` per stream, own seat included                                  |
| `apps/web/src/hooks/useVoice.ts`              | Adapts the two to React and to the socket                                     |
| `apps/web/src/components/VoicePanel.tsx`      | Join, roster, self and peer rows                                              |
| `apps/web/src/lib/voice/hears-uno.ts`         | Pure match: does this transcript count as "uno"                               |
| `apps/web/src/lib/voice/shout-listener.ts`    | Owns the `SpeechRecognition` instance and its restart/backoff                 |
| `apps/web/src/hooks/useShoutUno.ts`           | Arms the window from `legalMoves`, prewarms the listener, fires the call once |

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
