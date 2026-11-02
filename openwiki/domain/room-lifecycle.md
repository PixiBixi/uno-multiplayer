# Room lifecycle

A room is a lobby, then a match. `apps/server/src/rooms/room.ts` owns one;
`room-manager.ts` owns the directory of them and every timer.

## Room is synchronous and timer-free, on purpose

`Room` knows nothing of Socket.IO or `setTimeout`. That is what makes the whole
lifecycle - joining, starting, moves, disconnection, grace expiry, forced turns -
testable without a clock or a network.

It _holds_ deadlines it is handed, exactly as it is handed a seed, but it never
computes one. `RoomManager` owns the timers behind an injectable interface, and its
clock source is injectable too, so tests drive time by hand and never wait.

If you find yourself wanting a timer inside `Room`, that is the signal to put it in
`RoomManager` and pass the result in.

## Configuring the table

The goal, the pace and the rules are the host's, set from the **lobby** rather than at
creation, and frozen by the first deal. `room:create` still accepts all three and the
home screen sends the defaults; the payload stays because it is already validated and
already tested, and removing it would break a client mid-deploy for no gain.

`Room.configure(bySeat, changes)` holds the whole rule:

- **Host only.** Anybody else gets `not_host` and the table does not move.
- **Only before the match has begun**, which is `match === null`. Not before each
  round: a match spans rounds and carries a score, so flipping Seven-Zero at round
  three would rewrite a contest already partly played. A late change gets
  `game_already_started`.
- **Explicitly not `canStart`.** That counts filled seats and is a different question.
  A room can be un-startable and already dealt, because somebody left mid-match - there
  is a test built on exactly that room, and gating on `canStart` would reopen the rules
  at the one moment they must not move. Equally, a table with one player cannot deal and
  is precisely a table whose host has time to set the rules.
- **Partial**, `{ goal?, pace?, rules? }`. A field absent from the payload is left as it
  is, so toggling one rule cannot write back a goal the client read a moment earlier.
  `pace` is the one field where absent and `null` differ: null takes the clock off the
  table, absent leaves whatever clock it has. `rules` is replaced wholesale, so a client
  sending one flag would reset the other three - the client sends the whole object.
- **Reports no event**, and therefore takes no `record()` path. There is no narrative
  feed in a lobby and nothing here belongs in the match statistics.

Two things the handler gets right and a naive one would not. It broadcasts `room:state`
to **every** member rather than answering the sender - a guest watching the host toggle
Jump-in is the entire point, and a sender-only refresh passes a careless test and fails
the feature. And it does not `retime`: nothing in a lobby can move a turn, and a pace set
there is a number the deal will read, not a running clock. A lobby that armed one would
be counting down against a seat holding no cards.

Since `room:state` carries the whole view, a reconnecting player gets the current
configuration with no extra path - which is asserted rather than assumed, because a
client rejoining into stale rules is a client playing a different game.

`game:restart` unlocks nothing. It requires a finished round and deals immediately, so it
never returns anybody to a lobby and there is no moment after it at which the table is
unconfigured.

## Members and seats

A **member** is a person in the room (socket, session token, status). A **seat** is
their place in the engine's game. They are the same number, and keeping them so is
load-bearing.

They were not always. `start()` used to deal to the active members only, which
renumbered the engine the moment anybody was absent at deal time. With three
players where one had already left, `viewFor(2)` returned `null` - that player was
present, holding seven cards, and received no view of the game at all.

The deal now goes to **every** member seat, and every dealt seat stays active in the
engine for the whole match, whoever is at the keyboard: a disconnected human's seat is
played by a stand-in bot (see Presence), a departed one by a bot for good. Nothing is
returned to the pile and nothing is skipped, so the 108-card invariant holds without a
reconciliation step.

Scores and statistics are indexed by seat, so this is not cosmetic.

A seat holds a **human**, a **bot** with a level, or nothing. The host adds, re-levels and
removes bots in the lobby (`room:addBot`, `room:setBotLevel`, `room:removeBot`); the host
seat is always human. `canStart` is at least one human and at least two filled seats. A
human who joins a full lobby replaces the **last-added** bot, and is refused with
`room_full` once the match has begun. See [Bots](../architecture/bots.md) for what a bot
decides and when it acts.

A seat vacated in the **lobby** is handed to the next joiner rather than kept, and stays
empty otherwise (a leaving human is not replaced by a bot before the deal): nothing is
dealt or scored there, so seat numbers still match engine indices, and three departures
no longer leave a table reporting `room_full` with only the host seated. A socket is
seated at most once, so a double-tapped `room:join` cannot leave a second seat whose
socket id never disconnects.

## Presence, and the three ways a room ends

| State          | Meaning                                           |
| -------------- | ------------------------------------------------- |
| `active`       | Connected and playing                             |
| `disconnected` | Socket gone; a stand-in plays the seat, hand kept |
| `left`         | Gone for good; `rejoin` refuses the seat          |

Mid-match, **the engine seat stays active whatever the member's status**: a bot-played
seat takes turns, is a Seven-Zero target and sits in `turnOrder`, so nothing is skipped.
The old behaviour skipped a disconnected seat and, when the grace period ran out, returned
its hand to the pile; both are gone.

### The stand-in

When a disconnected human's turn comes, a Normal bot plays it after a **15 s** grace and
the table sees one `botTookOver` event. The grace covers the **first** absent turn only;
once the bot has taken over, later turns use ordinary bot timing until the human returns,
so a dropped player does not cost the table 15 s a turn. On a Blazing table the grace is
`min(15 s, turnSeconds - 1 s)`, so the bot plays before the turn clock forces a draw. The
bot reacts off turn for that seat too, at Normal timing.

Reconnecting with the session token takes the seat back at once, **for the whole match**,
whatever the bot did meanwhile. The grace period expiring mid-match no longer changes
anything: the seat simply stays bot-played, and the view shows it as the human's name with
a "Bot playing" marker.

**With no human connected the table stops**: no bot moves, no turn clock, no next round,
no UNO grace. Bots alone would play a match nobody watches, so the room waits and is
purged as before once it has stayed empty for the grace period.

`Room.isEmpty()` means "no sockets attached right now" - which is **also true of a
table whose players are mid-reload**. `Room.abandoned` means nobody could come back
even if they tried: every member has left, or nobody ever sat down.

The distinction matters because `purge()` uses both. A room has to have _stayed_
empty for a full grace period before being reclaimed, and coming back clears the
stamp so an earlier absence cannot count toward a later one. An abandoned room goes
at once, because holding it would protect nobody.

Before that distinction existed, purge ran on the same 60 s cadence as the grace
period and won whenever its tick landed first - cancelling the very grace timers it
was pre-empting, and losing the game for anyone who reloaded at the wrong moment.

## Leaving

`room:leave` exists because leaving used to be a client-only idea: the button
cleared local state and the server was never told. The seat kept a dead socket id
forever, so `isEmpty()` was permanently false and the room could never be
reclaimed - one leaked room per leave until `MAX_ROOMS` was reached and every new
game was refused. The socket also stayed in the old Socket.IO room, so whoever
walked away kept receiving that table's chat and events.

It takes the same path as an unexpected disconnect, minus the grace period:
somebody who pressed Leave is not coming back to that seat. Mid-match the seat goes to a
bot **for good**: the session token is rotated on restart, so the leaver cannot rejoin it.
Across `game:restart` a stand-in stays a stand-in its human can reclaim, while a seat whose
human left becomes an ordinary Normal bot.

A **second tab** rejoining a seat takes it over. `rejoin` reports the socket it replaced
(`supersededSocketId`), and the handler evicts that one from voice, presence and the
limiters, then disconnects it; otherwise the old tab kept moving and chatting as the seat
and pulled it out of voice when closed.

## Timers

Three clocks, all armed from one place in `handlers.ts` (`retime`), called after
anything that can change whose turn it is:

- **The turn clock**, on a Blazing table, forcing a draw when it expires - or a `pass`,
  for a seat already deciding what to do with a card it drew. `armTurn` also leaves that
  countdown alone rather than restarting it, since a voluntary draw did not end the turn.
- **The between-rounds clock**, dealing the next round five seconds after the last
  one ended. Five is fixed rather than exposed as a setting: a second dial for it
  would be one nobody has an opinion about.
- **The UNO grace clock**, three seconds for a seat that played down to one card to say
  it, and only on a table without call-outs - elsewhere an opponent shuts that window.
  See [the three seconds that follow](rules-and-scoring.md#forgetting-uno-and-the-three-seconds-that-follow)
  for who pays what; the clock is here because `Room` may not hold one.

A fourth kind of timer belongs to bots: `RoomManager` holds one per bot-played seat on turn,
and one per open reaction window (call-out, late UNO, jump-in), with the delays of
[Bots](../architecture/bots.md#timing). They arm nothing while no human is connected, never
touch the turn clock, and under Blazing a bot's delay is capped to the time left on the
clock minus one second, so a bot never times out. `BOT_DELAY_FACTOR` (0.01 to 1, default 1)
scales every bot delay and the absent grace; it exists to keep e2e runs short.

All three arms are safe to call unconditionally: each clears itself when the room is not
in its state, so a table with no pace ends up with no turn timer and null deadlines, and
one with call-outs never arms a grace clock at all.

**A presence change never restarts a clock.** `retime(room, 'presence')`, used by rejoin,
disconnect and grace expiry, goes through `keepTurn`, `keepNextRound` and `keepUnoGrace`
in `room-manager.ts`, which leave a running clock alone while what it times is unchanged.
Through `armTurn`, a seat on turn could re-emit `room:rejoin` to stall a paced table
forever, hold back the next deal, or dodge the forgotten-UNO penalty. A move still goes
through the `arm*` path, so a skip handing the turn back to the same seat gets a fresh
clock. `purge()` cancels all of them, the UNO grace clock included, and fires `onPurge`
so the socket layer drops the room's voice session.

[Voice chat](../architecture/voice-chat.md) has no clock of its own and deliberately no
grace period. A disconnected socket leaves the voice session at once while its seat is
still being held: the grace period protects a match in progress, and a peer connection
that has already dropped is better rebuilt than waited for.

**Arming guards must match dealing guards.** The between-rounds guard was once only
`betweenRounds`, while dealing also requires two active members. A round ending
with one player left made the deal fail, changed nothing about the room, and the
caller armed it again - every five seconds for the life of the process, pushing a
countdown that could never resolve.

Deadlines go to the client as **absolute epoch stamps**, never as durations. A
client that drops frames, sleeps a tab or reconnects mid-turn would otherwise drift
away from the server about when time is up.

## Rate limiting

Keyed on the Socket.IO connection, **not** on the client IP. That is what keeps it
correct behind a reverse proxy where every request arrives from the same address.
Buckets are forgotten on disconnect, so the map does not grow.

Moves, chat, creation and voice signals each have a bucket. `room:configure`,
`game:start`, `game:nextRound`, `game:restart` and `room:rejoin` share **one** control
bucket, since each re-broadcasts the table and alternating event names must not buy extra
allowance. Every handler opens the same way through the helpers in `handlers.ts`: parse
the payload, find the seat, charge the bucket (`admit`, built on `parsed` and `within`),
in that order. A middleware fills in a no-op ack, so an event sent without a callback still
broadcasts.

The handshake is checked too, because a WebSocket upgrade is exempt from CORS.
`allowRequest` in `handlers.ts`, through `isAllowedOrigin` in `apps/server/src/security/origin.ts`, accepts no `Origin` (a non-browser
client), an `Origin` matching `Host`, or one listed in `CORS_ORIGIN`. Frames are capped at
64 KiB (`maxHttpBufferSize`), four times the largest legal SDP.

`trustProxy` follows `BEHIND_TLS`, and trusts the header by the peer's **address**
when it is set: `loopback,uniquelocal`. Behind a proxy every request arrives from the
proxy's own address, so without it the log records the same container IP for every
visitor. Off by default, because a directly-exposed server would otherwise believe
whatever a client claimed.

It said **one hop** until fastify 5.12.1, which made a numeric `trustProxy` fail closed
outright - GHSA-3m5p-2c4r-xxw2, X-Forwarded-\* spoofing under trustProxy hop-count. The
reason is worth keeping: a hop count says how many entries to believe and nothing about
WHO sent them, so a client reaching the process directly could pad the header until it
was believed. The upgrade turned our `1` into the same thing as `false`, silently, and
`http.test.ts` is what caught it - in a Dependabot PR, before it shipped.

Addresses are the check a count could not make. `loopback` covers a proxy on the same
host and `inject()` in the tests, `uniquelocal` the private ranges a docker network hands
out; a public peer is never trusted. The address reported is still the rightmost entry
that is not itself a trusted proxy, which is the peer the proxy actually saw.

Note this is safe _in addition_ because the deployed container publishes no ports
and sits only on the proxy network, so nothing but the proxy can reach it to forge
the header in the first place.

## Where to be careful

- Any new event-producing method on `Room` must return through `this.record(...)`,
  or the match statistics under-count silently.
- Any new client action needs a `socket.on` handler as well as a protocol type, a
  schema and a client emit. The handler is the piece that has been forgotten.
- After any state change that can move the turn, call `retime(room)` before
  broadcasting, so the deadline players receive is already the next seat's.
