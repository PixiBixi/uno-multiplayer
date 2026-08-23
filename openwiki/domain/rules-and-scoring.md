# Rules and scoring

The rules live in `packages/engine`, which is pure: no I/O, no networking, no
dependencies. Everything here is a function from values to values, which is why the
whole rule set is testable without a clock, a socket or a browser.

## Rules decided explicitly

Official UNO plus draw stacking. The points the official rules leave ambiguous are
pinned down deliberately, and this is the full list:

- **Draw stacking is strictly same-type.** A +2 answers a +2 and a +4 answers a +4,
  never across. Colour is irrelevant when raising. `PendingDraw.kind` mirrors the
  card's own `kind`, which turns that rule into a plain equality check.
- **Reverse with two active players acts as a skip**, per the official rule.
- **The starting card is the first number card from the top** of the shuffled deck
  (`packages/engine/src/init.ts`). Deterministic, with no unbounded loop and no extra
  draw: action cards encountered above it stay where they are in the pile.
- **An empty draw pile is refilled from the discard pile minus its top card**, which
  is reshuffled in place of the exhausted one. If that is still not enough, the draw
  is capped at what is actually available rather than failing - `takeFromTop` takes
  `Math.min(count, pile.length)`, so a draw can come up short but never invents cards.
- **First empty hand wins the round**, which ends immediately.
- **Drawing voluntarily does not end your turn when the card can be played.** That is
  the official rule and it is on by default; the table used to end the turn on any
  voluntary draw, which was a deliberate simplification and also slightly wrong. See
  "Playing the card you drew" below.
- **Calling UNO is legal only during your own turn, before playing.** Going down to
  one card without it costs two cards, applied automatically - unless the table
  opted into the Liar call-out below, which makes the penalty manual.
- **A 7 and a 0 are ordinary number cards** unless the table opted into Seven-Zero,
  also below.
- **Only the seat on turn may lay a card down**, unless the table opted into jump-in
  - which is the one option that changes that, and the one that also moves the turn.

Deliberately not implemented: the strict Mattel +4 challenge, which needs a bluff UI
and hand inspection.

## Table rules

`TableRules` in `packages/engine/src/types.ts`, set by the host in the lobby - see
[Room lifecycle](room-lifecycle.md#configuring-the-table). The three
house rules are off by default; `playDrawnCard` is on, because it is not a house rule but
the rulebook - the `false`s beside it are not a pattern to copy. It lives in the engine
rather than beside `MatchPace` in the protocol, unlike the clock: a time limit is a house
setting the engine never sees, while these change what the rules ARE and the reducer has
to read them.

Each flag is Zod-defaulted at the socket boundary on its own, not only the object as
a whole. A client built when `liar` was the only option sends `{ liar }`; rejecting
that would break a client that can play perfectly well and is simply asking for a
table without the newer rule.

### The Liar call-out

`liar` is what the flag is called in the engine and on the wire. It is not what the
player reads: the button says **Caught!** in English and **Contre-UNO !** in French,
because forgetting to say UNO is an omission and a button that calls a friend a liar
reads badly at a table of four. Expect the two names for the same thing, and keep the
player-facing one out of the code.

With `liar` on, a seat that reaches one card without calling UNO becomes
`vulnerable` instead of drawing two, and any other **active** seat may play
`{ type: 'callOut', target }` to charge it the same `UNO_PENALTY`.

Three things about it are worth knowing before touching that code:

- **It is the only move legal off turn.** `legalMoves` used to return `[]` for any
  seat that is not `currentSeat`; that early return is now conditional, and an
  off-turn seat gets call-outs and nothing else. `applyMove`'s turn check exempts
  `callOut` and nothing else.
- **The window is bounded to the end of the accused seat's next turn**, and closes
  in `passTurn` - the one place a turn ends. Without a bound a player could be
  accused ten minutes later, which is a trap rather than a game. It is a field on
  the seat and not a timer, because the engine has no clock and `Room` is
  timer-free.
- **A wrong accusation cannot be made**, since the move is only offered while the
  target is genuinely vulnerable. Penalising a bad guess was rejected: it punishes
  paying attention badly instead of rewarding paying attention well.
- **The turn order is untouched.** A call-out is a side effect on one hand and never
  ends a round, which keeps it out of the turn-advance logic entirely. The escape is
  to call UNO on your own next turn, before playing - a late call still counts.

`sameMove` compares the target as well as the type. Without that, a legal call-out
against one seat would authorise one against any seat - the sort of gap the single
`legalMoves` gate exists to prevent.

### Seven-Zero

With `sevenZero` on, a **7** swaps hands with a player of the mover's choice and a
**0** passes every hand one seat along in the current direction of play.

Choosing whom to swap with is a second decision after playing a card, so it reuses
the shape a wild's colour already has rather than inventing one:
`legalMoves` emits one `{ type: 'play', cardId, swapWith }` per legal target, and the
client renders a picker from the moves it was given. `sameMove` therefore compares
`swapWith` too - without it, two different targets look like the same move and a 7
offered against one seat authorises taking any seat's hand.

Four things about it are worth knowing before touching that code:

- **The effect is applied after the win check.** First empty hand wins,
  unconditionally, so a 7 or a 0 played as a last card ends the round and no hand
  moves. `legalMoves` offers no target for that card, since there is nothing to
  choose. The alternative - swapping the win away - makes a 7 unplayable as a last
  card, which is a trap rather than a rule.
- **Only active seats take part**, as swap targets and in the rotation alike. A seat
  that has left holds nothing, so swapping into it would hand somebody a free win; a
  seat merely disconnected is holding its hand until the grace period ends, and
  giving it away would bring the player back to a hand chosen by an event they never
  saw. A 7 with nobody else active falls back to an ordinary card rather than
  becoming unplayable.
- **The rotation reads `direction`**, which is why a reverse played earlier in the
  round changes where hands go, and why rotating at two players is a swap. `advance`
  is a rotation of exactly the active seats, so the mapping is a bijection and
  conservation holds by construction. At two players a 7 likewise has exactly one
  legal target, so it always swaps rather than being quietly made a no-op - that
  would silently change what the card is worth.
- **No automatic UNO penalty is ever charged on a play that permutes hands.** With
  `liar` on, every seat whose hand moved has its window recomputed from what it now
  holds - one card uncalled opens one, anything else shuts one, because being accused
  of holding a card you no longer hold is a bug. Without `liar`, nothing is charged
  at all: the automatic penalty punishes an omission, and nobody can be said to have
  failed to declare a hand they were handed. It also keeps draws and permutations off
  the same move, which is what lets `diffEvents` stay a hand-size diff instead of
  having to compare card ids.

Events are `handsSwapped { seat, with }` and `handsRotated { direction }`, derived in
`diffEvents` from the card and the table's rules rather than from hand sizes - a swap
between two seats holding four cards each changes no count at all.

### Jump-in

With `jumpIn` on, a card **identical** to the discard top - same colour and same
value, or same colour and same kind - may be played out of turn, and `currentSeat`
becomes the jumper.

It is the riskiest of the three because it inverts the assumption the rest of the
engine rests on and also rewrites the thing every other move reads. Six things are
worth knowing before touching that code:

- **It reuses `play` rather than adding a move type.** A jump-in is the same card
  resolving the same way from a different seat, so `applyPlay` needed nothing: it
  already advances from the seat that moved, not from `currentSeat`. It also means
  the client needed no new idea - `Hand` renders a card as playable when a `play`
  references it, and that was already true off turn. The alternative, a `jumpIn`
  variant, would have duplicated every branch of `applyPlay` in the type system for
  no behavioural difference. So the card's own effect applies from the jumper's seat
  exactly as it would have on their own turn: a jumped skip skips the seat after
  them, a jumped reverse turns the table round from them, and a jumped 7 on a
  Seven-Zero table offers its swap targets. Play continues in the current direction
  from the jumper, and the seats in between simply lose their turn - that is the
  point of the rule.
- **`applyMove`'s turn check now exempts two moves**, not one: a `callOut` always,
  and a `play` on a table that opted in. Which of the off-turn plays are real
  jump-ins is left entirely to the single `legalMoves` gate, so a bad one comes back
  as `illegal_move` and not `not_your_turn` - on a jump-in table an off-turn play is
  a category of legal move, and refusing it for being off turn would name the wrong
  reason.
- **A jump-in begins the jumper's turn before the card resolves**, which clears
  `unoCalled`. That is deliberate and it is the rule: an off-turn seat is offered
  call-outs and jump-ins and nothing else, so a jumper has no moment at which to
  declare, and a declaration made on an earlier turn must not quietly cover a card
  laid down on this one. Landing on one card by jumping in is an uncalled UNO - two
  cards, or an open window on a Liar table. It also closes the jumper's own window,
  since its turn has just ended, which is the same escape calling UNO gives.
- **Nothing at all is offered while a draw is pending.** Not even a same-kind card,
  which `isPlayable` would allow: the stacking rule is "strictly the same type", and
  a jump-in interleaved with it would make that mean nothing. Guarded by a property
  test rather than only a unit test, because whether a stacked draw ever coincides
  with somebody holding the twin of the card that stacked it is a question about the
  deal.
- **Wilds are never jumpable, in either position.** They have no colour, so matching
  on kind alone would make every wild identical to every other one.
- **Termination holds, and that was the thing at risk.** Every jump-in spends a card,
  and a UNO deck holds exactly two copies of any jumpable card - one 0 per colour, so
  a 0 has no twin at all. So at most one seat can ever hold a jump-in against a given
  top, no jump-in can be answered by another on the same card, and no chain is longer
  than one. The property tests assert it under a policy that takes every jump-in
  offered, which is the unfavourable policy: on a table without `liar`, jumping down
  to one card costs the two cards it just saved.

The event is `jumpedIn { seat }`, derived in `diffEvents` from `before.currentSeat`
rather than after - the turn has moved to the jumper by then, that being the whole
effect of the rule. It counts towards nothing: the card is already counted by the
`cardPlayed` that follows it.

A consequence worth recording, because the spec assumed otherwise: **the race between
two players jumping the same card cannot happen.** The twin of a card is in exactly
one place, so only one seat is ever holding one. What can race is the same seat asking
twice, and a jump-in arriving beside the play of the seat whose turn it was - both are
driven over a real socket, and both come down to the server applying whichever it
reads first.

### Playing the card you drew

The one option here that is **on by default**, and the only one that is not a house rule:
with `playDrawnCard` on, a voluntary draw whose card can be played does not end the turn.
The seat may lay that card down, or `{ type: 'pass' }`.

It reverses a documented decision rather than adding a variant, which is why the default
differs. The flag survives for the groups who learned the game the other way, and because
the sub-state is worth being able to switch off.

`GameState.drawnCard` is the whole of that sub-state: the id of the card just drawn, and
null the rest of the time. Seven things about it are worth knowing before touching that
code:

- **Only that card is offered.** `legalMoves` emits the plays for `drawnCard` alone, plus
  a `pass`. Offering the rest of the hand would make drawing a free extra turn, which is a
  different game - and it is guarded by a property over every intermediate state, not only
  by unit tests, because whether a seat ever draws into a hand holding three other
  playable cards is a question about the deal.
- **There is no sub-state when the drawn card is unplayable.** The turn ends immediately,
  as it always did, and the same when the pile could not pay the draw at all. A choice
  appears only when there is one, so the option costs no click on an ordinary draw.
- **`acceptDraw` grants nothing.** Taking a stacked +2 or +4 is a penalty and the official
  rules do not let you play out of one. The cards arriving almost always include something
  playable, which is exactly why it needs saying.
- **`pass` is a move.** Drawing no longer ends a turn, so something must, and it is
  explicit rather than inferred from a timeout - an idle player and a deliberate one are
  not the same thing. It reuses `passTurn`, so the Liar window closes with it like any
  other turn ending.
- **`beginTurn` clears it, which is why every path does.** Every turn change in the game
  funnels through `beginTurn`, so no caller has to remember. The three paths that do not
  reach it clear the field by hand: the win check in `applyPlay`, `markSeatLeft`, and
  `skipDisconnectedTurn` - which can break out of its loop when nobody else is active. A
  stale value would let a seat play a card it no longer holds.
- **No jump-in while the decision stands**, and `callUno` stays legal. The turn is
  unresolved, the same reasoning that forbids jumping a pending draw; but the seat is on
  turn and has not played, and drawing to two cards then playing to one is an ordinary way
  to reach one card.
- **Termination holds, and it was the invariant at risk.** Re-entering the sub-state needs
  a second voluntary draw, and `draw` is not offered inside it, so every available move
  either spends a card or ends the turn. The property tests assert it under a policy that
  draws far more often than a sensible player would and lays down everything it draws.

The event is `turnPassed { seat }`, read from the move in `diffEvents` for the same reason
a call-out is: nothing else about the state changed, so the hand-size diff has nothing to
find. It counts towards nothing - declining to play is not a statistic - and it is silent,
because the draw it follows has already sounded.

On the client the drawn card needed no new idea, since `Hand` renders a card as playable
when a `play` references it. The **End turn** control did: it takes the draw button's place
rather than sitting beside a dead one, because a player who draws and sees nothing change
concludes the table has hung. It is named for what it does rather than "pass", which in a
card game reads as declining to draw.

Two interactions with Blazing, both in `RoomManager`:

- `armTurn` **does not restart the clock** while `Room.decidingOnDrawnCard`, so the seat
  keeps the time it had left to play rather than gaining a fresh allowance for drawing.
  Only while a timer is really live, though: after one has fired the map no longer holds
  it, so a forced draw landing in the sub-state still arms a new clock - a preserved
  deadline already in the past would never fire again and the table would sit there.
- `forceTurnMove` prefers `pass` over everything else. Forcing a second draw would punish
  the clock twice, and `draw` is not on offer in the sub-state anyway, so without `pass`
  first the clock would expire against the same seat for ever. That failure was caught by
  an existing absentee test rather than by a new one.

## Scoring a match

`packages/engine/src/match.ts`. A table plays a **match** of **rounds**. The host
picks how it ends in the lobby, up until the first deal:

```ts
type MatchGoal = { kind: 'points'; target: number } | { kind: 'rounds'; count: number }
```

A one-round match _is_ a single game. There is no third variant for it, because a
mode meaning "stop after one round" is what a one-round match already is.

Scoring is official Mattel: the winner of a round takes the total value of every
card left in the other hands - number cards at face value, Skip/Reverse/Draw Two at
20, both wilds at 50. `cardPoints` is the single source for that table and is read
by the help panel too, so the interface cannot disagree with the scoring it
describes.

Edges the official rules leave open, decided here:

| Point                   | Decision                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Round with no winner    | Awards nothing and ends the match. Scoring a round nobody finished would mean inventing a rule.                                       |
| Tie on totals           | Possible in rounds mode. Every seat on the winning total shares the win; sudden death would turn "best of 3" into an unbounded match. |
| Tie on points           | Impossible - only the round winner scores, so only one seat can cross the target.                                                     |
| A player who leaves     | Keeps what they earned, and their remaining cards still count for whoever went out.                                                   |
| Next round vs new match | Two distinct host actions. Letting one mean both depending on hidden state is how a player loses a scoreboard by accident.            |

`MatchState` deliberately lives **outside** `GameState`. A round has no business
knowing it belongs to a match, and the property tests that guard the round rules
should not have to carry match state through them.

## Blazing: an optional clock

`MatchPace` is `{ turnSeconds } | null`, and lives in the protocol rather than the
engine - a time limit is a house setting, not a rule of UNO, and the engine stays
free of clocks.

It exists because an idle player used to freeze the table forever: the only timer
was the disconnect grace period, so somebody who stayed connected and simply
stopped playing blocked everyone with no way out. It is opt-in rather than universal
because a clock changes the game rather than protecting it.

When time runs out the server plays **draw** - deliberately, even for a seat holding
something playable. Choosing a card for someone is choosing their move; drawing is
the one action that is always legal, always neutral, and never spends a card they
were saving. A stacked draw against them makes `draw` illegal, so `acceptDraw` is
the same decision taken on their behalf. Nothing is forced when the seat could only
have called UNO: that penalty belongs to the player who forgot, not to the clock.

A seat already deciding what to do with a card it drew is **passed** rather than made to
draw again, and its countdown is not restarted for having drawn. Both are covered under
"Playing the card you drew" above.

## Changing a rule

- The rules are guarded by property tests (`packages/engine/src/invariants.test.ts`)
  playing hundreds of randomised games and asserting that the 108 cards are conserved
  at every step with distinct ids across hands, draw pile and discard; that no move
  `legalMoves` offers is ever rejected by `applyMove`; that `currentSeat` always
  points at an active seat while a game is in progress; and that under greedy play
  every game terminates with a winner holding no cards. Run them before believing a
  rule change is safe.
- Property tests found a real freeze in `advance` that hand-written tests missed,
  and equally they _missed_ a bug where a single active seat froze the turn, because
  they never disconnect anyone. They are strong evidence, not proof.
- The union narrowing trap: `card.kind === 'wild' || card.kind === 'wild4'` written
  inline does **not** narrow the union, so reading `card.color` afterwards fails to
  compile. Use the exported `isWild` predicate. This codebase walked into it three
  separate times before the predicate existed.
- `Omit` does not distribute over a union, so `Omit<GameEvent, 'x'>` silently
  collapses to the shared keys. There is an `OmitEach` helper for that.
