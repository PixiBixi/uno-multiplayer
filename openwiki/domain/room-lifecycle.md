# Room lifecycle

A room is a lobby, then a match. `apps/server/src/rooms/room.ts` owns one;
`room-manager.ts` owns the directory of them and every timer.

## Room is synchronous and timer-free, on purpose

`Room` knows nothing of Socket.IO or `setTimeout`. That is what makes the whole
lifecycle — joining, starting, moves, disconnection, grace expiry, forced turns —
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
  A room can be un-startable and already dealt, because somebody left mid-match — there
  is a test built on exactly that room, and gating on `canStart` would reopen the rules
  at the one moment they must not move. Equally, a table with one player cannot deal and
  is precisely a table whose host has time to set the rules.
- **Partial**, `{ goal?, pace?, rules? }`. A field absent from the payload is left as it
  is, so toggling one rule cannot write back a goal the client read a moment earlier.
  `pace` is the one field where absent and `null` differ: null takes the clock off the
  table, absent leaves whatever clock it has. `rules` is replaced wholesale, so a client
  sending one flag would reset the other three — the client sends the whole object.
- **Reports no event**, and therefore takes no `record()` path. There is no narrative
  feed in a lobby and nothing here belongs in the match statistics.

Two things the handler gets right and a naive one would not. It broadcasts `room:state`
to **every** member rather than answering the sender — a guest watching the host toggle
Jump-in is the entire point, and a sender-only refresh passes a careless test and fails
the feature. And it does not `retime`: nothing in a lobby can move a turn, and a pace set
there is a number the deal will read, not a running clock. A lobby that armed one would
be counting down against a seat holding no cards.

Since `room:state` carries the whole view, a reconnecting player gets the current
configuration with no extra path — which is asserted rather than assumed, because a
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
players where one had already left, `viewFor(2)` returned `null` — that player was
present, holding seven cards, and received no view of the game at all.

The deal now goes to **every** member seat, then reconciles the absent ones:

- A player gone for good has their hand returned to the pile, which both preserves
  the 108-card invariant and means they score nothing for the round.
- Someone merely disconnected keeps their hand, because the grace period may still
  bring them back to it.

Scores and statistics are indexed by seat, so this is not cosmetic.

## Presence, and the three ways a room ends

| State          | Meaning                                      |
| -------------- | -------------------------------------------- |
| `active`       | Connected and playing                        |
| `disconnected` | Socket gone, grace period running, hand kept |
| `left`         | Gone for good; `rejoin` refuses the seat     |

`Room.isEmpty()` means "no sockets attached right now" — which is **also true of a
table whose players are mid-reload**. `Room.abandoned` means nobody could come back
even if they tried: every member has left, or nobody ever sat down.

The distinction matters because `purge()` uses both. A room has to have _stayed_
empty for a full grace period before being reclaimed, and coming back clears the
stamp so an earlier absence cannot count toward a later one. An abandoned room goes
at once, because holding it would protect nobody.

Before that distinction existed, purge ran on the same 60 s cadence as the grace
period and won whenever its tick landed first — cancelling the very grace timers it
was pre-empting, and losing the game for anyone who reloaded at the wrong moment.

## Leaving

`room:leave` exists because leaving used to be a client-only idea: the button
cleared local state and the server was never told. The seat kept a dead socket id
forever, so `isEmpty()` was permanently false and the room could never be
reclaimed — one leaked room per leave until `MAX_ROOMS` was reached and every new
game was refused. The socket also stayed in the old Socket.IO room, so whoever
walked away kept receiving that table's chat and events.

It takes the same path as an unexpected disconnect, minus the grace period:
somebody who pressed Leave is not coming back to that seat.

## Timers

Two clocks, both armed from one place in `handlers.ts` (`retime`), called after
anything that can change whose turn it is:

- **The turn clock**, on a Blazing table, forcing a draw when it expires — or a `pass`,
  for a seat already deciding what to do with a card it drew. `armTurn` also leaves that
  countdown alone rather than restarting it, since a voluntary draw did not end the turn.
- **The between-rounds clock**, dealing the next round five seconds after the last
  one ended. Five is fixed rather than exposed as a setting: a second dial for it
  would be one nobody has an opinion about.

Both arms are safe to call unconditionally: each clears itself when the room is not
in its state, so a table with no pace ends up with no timers and null deadlines.

**Arming guards must match dealing guards.** The between-rounds guard was once only
`betweenRounds`, while dealing also requires two active members. A round ending
with one player left made the deal fail, changed nothing about the room, and the
caller armed it again — every five seconds for the life of the process, pushing a
countdown that could never resolve.

Deadlines go to the client as **absolute epoch stamps**, never as durations. A
client that drops frames, sleeps a tab or reconnects mid-turn would otherwise drift
away from the server about when time is up.

## Rate limiting

Keyed on the Socket.IO connection, **not** on the client IP. That is what keeps it
correct behind a reverse proxy where every request arrives from the same address.
Buckets are forgotten on disconnect, so the map does not grow.

`trustProxy` follows `BEHIND_TLS`, and trusts exactly **one** hop when it is set.
Behind a proxy every request arrives from the proxy's own address, so without it the
log records the same container IP for every visitor. One hop rather than `true`
means the address is the peer the proxy itself saw; anything further left in
`X-Forwarded-For` came from the client and stays untrusted. Off by default, because
a directly-exposed server would otherwise believe whatever a client claimed.

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
