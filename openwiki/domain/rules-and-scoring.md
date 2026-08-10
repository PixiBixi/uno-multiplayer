# Rules and scoring

The rules live in `packages/engine`, which is pure: no I/O, no networking, no
dependencies. Everything here is a function from values to values, which is why the
whole rule set is testable without a clock, a socket or a browser.

## Rules decided explicitly

Official UNO plus draw stacking. The points the official rules leave ambiguous were
pinned down deliberately; the README carries the full table, and the ones most
likely to surprise you are:

- **Draw stacking is strictly same-type.** A +2 answers a +2 and a +4 answers a +4,
  never across. Colour is irrelevant when raising. `PendingDraw.kind` mirrors the
  card's own `kind`, which turns that rule into a plain equality check.
- **Reverse with two active players acts as a skip**, per the official rule.
- **Drawing voluntarily ends your turn.** There is no "you may now play the card
  you drew" sub-state, which removes a whole class of UI and protocol complexity.
- **Calling UNO is legal only during your own turn, before playing.** Going down to
  one card without it costs two cards, applied automatically — unless the table
  opted into the Liar call-out below, which makes the penalty manual.

Deliberately not implemented: the strict Mattel +4 challenge (it needs a bluff UI
and hand inspection), the 7-0 variant, and jump-in.

## Table rules: the Liar call-out

`TableRules` in `packages/engine/src/types.ts`, chosen by the host at creation and
off by default. It lives in the engine rather than beside `MatchPace` in the
protocol, unlike the clock: a time limit is a house setting the engine never sees,
while this one changes what the rules ARE and the reducer has to read it.

With `liar` on, a seat that reaches one card without calling UNO becomes
`vulnerable` instead of drawing two, and any other **active** seat may play
`{ type: 'callOut', target }` to charge it the same `UNO_PENALTY`.

Three things about it are worth knowing before touching that code:

- **It is the only move legal off turn.** `legalMoves` used to return `[]` for any
  seat that is not `currentSeat`; that early return is now conditional, and an
  off-turn seat gets call-outs and nothing else. `applyMove`'s turn check exempts
  `callOut` and nothing else.
- **The window is bounded to the end of the accused seat's next turn**, and closes
  in `passTurn` — the one place a turn ends. Without a bound a player could be
  accused ten minutes later, which is a trap rather than a game. It is a field on
  the seat and not a timer, because the engine has no clock and `Room` is
  timer-free.
- **A wrong accusation cannot be made**, since the move is only offered while the
  target is genuinely vulnerable. Penalising a bad guess was rejected: it punishes
  paying attention badly instead of rewarding paying attention well.

`sameMove` compares the target as well as the type. Without that, a legal call-out
against one seat would authorise one against any seat — the sort of gap the single
`legalMoves` gate exists to prevent.

## Scoring a match

`packages/engine/src/match.ts`. A table plays a **match** of **rounds**. The host
picks how it ends when creating the table:

```ts
type MatchGoal = { kind: 'points'; target: number } | { kind: 'rounds'; count: number }
```

A one-round match _is_ a single game. There is no third variant for it, because a
mode meaning "stop after one round" is what a one-round match already is.

Scoring is official Mattel: the winner of a round takes the total value of every
card left in the other hands — number cards at face value, Skip/Reverse/Draw Two at
20, both wilds at 50. `cardPoints` is the single source for that table and is read
by the help panel too, so the interface cannot disagree with the scoring it
describes.

Edges the official rules leave open, decided here:

| Point                | Decision                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Round with no winner | Awards nothing and ends the match. Scoring a round nobody finished would mean inventing a rule.                                       |
| Tie on totals        | Possible in rounds mode. Every seat on the winning total shares the win; sudden death would turn "best of 3" into an unbounded match. |
| Tie on points        | Impossible — only the round winner scores, so only one seat can cross the target.                                                     |
| A player who leaves  | Keeps what they earned, and their remaining cards still count for whoever went out.                                                   |

`MatchState` deliberately lives **outside** `GameState`. A round has no business
knowing it belongs to a match, and the property tests that guard the round rules
should not have to carry match state through them.

## Blazing: an optional clock

`MatchPace` is `{ turnSeconds } | null`, and lives in the protocol rather than the
engine — a time limit is a house setting, not a rule of UNO, and the engine stays
free of clocks.

It exists because an idle player used to freeze the table forever: the only timer
was the disconnect grace period, so somebody who stayed connected and simply
stopped playing blocked everyone with no way out. It is opt-in rather than universal
because a clock changes the game rather than protecting it.

When time runs out the server plays **draw** — deliberately, even for a seat holding
something playable. Choosing a card for someone is choosing their move; drawing is
the one action that is always legal, always neutral, and never spends a card they
were saving. A stacked draw against them makes `draw` illegal, so `acceptDraw` is
the same decision taken on their behalf. Nothing is forced when the seat could only
have called UNO: that penalty belongs to the player who forgot, not to the clock.

## Changing a rule

- The rules are guarded by property tests (`packages/engine/src/invariants.test.ts`)
  asserting card conservation — 108 cards with distinct ids across hands, draw pile
  and discard — plus termination and the legality of every move `legalMoves` offers.
  Run them before believing a rule change is safe.
- Property tests found a real freeze in `advance` that hand-written tests missed,
  and equally they _missed_ a bug where a single active seat froze the turn, because
  they never disconnect anyone. They are strong evidence, not proof.
- The union narrowing trap: `card.kind === 'wild' || card.kind === 'wild4'` written
  inline does **not** narrow the union, so reading `card.color` afterwards fails to
  compile. Use the exported `isWild` predicate. This codebase walked into it three
  separate times before the predicate existed.
- `Omit` does not distribute over a union, so `Omit<GameEvent, 'x'>` silently
  collapses to the shared keys. There is an `OmitEach` helper for that.
