# Server authority

The single decision the rest of the project follows from: **the server owns the
state, owns the rules, and sends each player only what that player may see.**

This is a rewrite of a prototype where the server was a bare relay - it broadcast
whatever state a client sent it. Three consequences of that design could not be
patched: any client could declare itself the winner, both players' full hands were
sent to everyone and hidden with a CSS card back, and the same move logic appeared
sixteen times in one function with the copies drifted apart.

## The client knows no rules

The server computes what is legal and ships it inside each player's view
(`packages/protocol/src/views.ts`):

```ts
type PlayerView = {
  you: { seat: number; hand: Card[]; legalMoves: Move[] }
  opponents: { seat: number; name: string; handCount: number; status: SeatStatus }[]
  rules: TableRules
  discardTop: Card
  currentColor: Color
  currentSeat: number
  direction: 1 | -1
  turnOrder: number[]
  // ... plus match standings and, on a Blazing table, deadlines
}
```

`turnOrder` is the reason this list has a field a client could have computed. Who
plays after the seat on turn is derivable from `direction` and the opponent
statuses - and deriving it would be a rule living in the client, which is the one
thing this design does not allow. So `turnOrder(state)` lives in the engine
(`packages/engine/src/rules.ts`) and the answer travels in the view.

It walks one full lap of the ring rather than taking `activeCount` steps of
`advance`. A disconnected seat can be on turn for a moment - `skipDisconnectedTurn`
moves play off it - and such a seat is not in `activeCount`, so counting steps
dropped the last player off the list.

It is the order **if the seat on turn lays a plain card**. A skip, a reverse, a +2
or a 7/0 rewrites it the moment it is played, which is why the table renders it
under the heading "Up next" and never as a next player.

The client renders that and emits intents. It never evaluates a rule. Three
properties follow directly:

- **No rule duplication**, so copies cannot drift.
- **No desynchronisation**, because a view is a complete idempotent state rather
  than a delta - no sequence numbers, no gap detection, no resync path.
- **Cheating is structurally impossible**: `opponents` carries a count and never
  card contents, and a move is only accepted if it appears in the server's own
  `legalMoves`.

The cost is one network round trip per move, 30-100 ms, which is imperceptible in
a turn-based card game.

`apps/server/src/views.ts` is where redaction happens. It is a pure function of a
`GameState`, a seat, and the match progress, which is why it is the one server file
that could move into a shared package if offline play is ever built.

## Events are derived, never hand-written

`apps/server/src/rooms/room.ts` builds the narrative feed by **diffing the state
before and after a move** (`diffEvents`). An event therefore cannot contradict the
state it describes.

Two consequences worth knowing before adding an event:

- The end-of-match statistics are counted from this feed rather than from separate
  counters, precisely because the feed cannot lie about what happened.
- A room produces events from eight different methods, so all of them funnel
  through a single `record()` call that keeps the tally. Missing one under-counts
  silently - there is a test that replays a real round and cross-checks the totals,
  and it fails if the funnel is bypassed.

## Three engine invariants

**`applyMove` never throws.** Every failure is a returned `Result`. An illegal move
is a value, not an exception, which is what makes a malformed payload unable to
take the process down.

**The RNG is seeded and its state lives in the game state.** A game is fully
replayable from `(seed, moves[])`. Tests are deterministic and a production bug can
be reproduced from logs. It is also why shuffling cannot corrupt a shared deck -
nothing is mutated in place.

**Seats are stable.** Each seat carries `active`, `disconnected` or `left`, and a
player leaving triggers no reindexing. That claim was once true only of the engine:
the server used to deal to the active members only, which renumbered the engine
relative to member seats and left the highest-numbered player with no view at all.
See [Room lifecycle](../domain/room-lifecycle.md).

## The wire boundary

Every client-to-server payload is validated with Zod at the socket boundary
(`packages/protocol/src/schemas.ts`), including the bounds on table options - a
points target, a rounds count, seconds per turn. Enforcing those only in the lobby
would be enforcing them nowhere, and that is doubly true now the lobby is where those
options are chosen: `roomConfigureSchema` composes the same `matchGoalSchema`,
`matchPaceSchema` and `tableRulesSchema` objects `roomCreateSchema` does, rather than
restating the numbers. A second copy of `MIN_POINTS_TARGET` drifts one field at a time,
so a test compares the two schemas' verdicts on the same values instead of trusting
them to agree.

Server-to-client payloads are **not** validated. That is a deliberate asymmetry:
the server is trusted, and a schema kept in step with every view field would be a
second thing to maintain. The client instead has an error boundary so a malformed
view degrades to an explanation rather than a blank page.

## Changing things here

- `LobbyView` carries the whole table configuration - `goal`, `pace`, `rules` and
  `configurable` - because a guest who cannot see the rules discovers Seven-Zero when
  their hand changes owner. That is not a hole in "the client knows no rules": it renders
  them and never reasons about them. `configurable` is derived by the server and is
  presentation only; the guard is re-checked when `room:configure` is handled, since a
  host can press Start and toggle a rule in the same breath.
- `rules` rides on `PlayerView` as well, and that duplication is deliberate. A rule read
  once before the deal is not one anybody recalls twenty minutes later - a manual UNO
  penalty was reported as a bug, and the game was right. Sent on the view rather than
  cached client-side from the lobby, because a reload mid-game receives a `PlayerView` and
  no lobby at all. `TableRules` is still declared once, in `@uno/engine`; both views
  re-export it rather than restating what a rule is. Four booleans against a view of
  roughly 1.4 KB, on a field that never changes between frames, is close to free once the
  socket deflates them.
- Adding a field to `PlayerView` means touching `packages/protocol/src/views.ts`,
  `apps/server/src/views.ts`, and every test fixture that builds a view. The
  typechecker will find them all.
- Adding a `GameEvent` variant makes several exhaustive switches fail to compile -
  in `describe-event.ts`, `sounds.ts` and `stats.ts`. That is the point; fill them
  in rather than adding a default case.
- Adding a client-to-server event needs four pieces: the type in `events.ts`, a
  schema in `schemas.ts`, a `socket.on` in `handlers.ts`, and the client emit. The
  handler is the one that has been forgotten before, and the button silently did
  nothing. Drive new actions through a socket in a test, not only through the
  `Room` API.
