# Match scoring design

**Goal:** play a match of several rounds, scored by the official UNO rules, with the
host choosing how the match ends.

## The format

The host configures a goal when creating the table:

```ts
type MatchGoal = { kind: 'points'; target: number } | { kind: 'rounds'; count: number }
```

`{ kind: 'rounds', count: 1 }` is a single game. That falls out of the model rather
than needing a third mode, which is why there is no `'single'` variant — a mode
that means "stop after one round" is what a one-round match already is.

Bounds are enforced at the socket boundary, not merely in the lobby UI: a client
can send whatever it likes. Points `50–2000`, rounds `1–20`.

## Scoring

Official Mattel scoring: the winner of a round takes the total value of every card
left in the other players' hands. Number cards score their face value, Skip /
Reverse / Draw Two score 20, Wild and Wild Draw Four score 50.

`cardPoints` already exists in `apps/web/src/lib/sort-hand.ts`, where it was written
to sort a hand by weight. It moves to the engine, which is where a rule belongs, and
the client imports it from there. Two copies of a scoring table is one copy too many.

## Where the score lives

`GameState` keeps modelling exactly one round, untouched. A new pure module
`packages/engine/src/match.ts` holds the match bookkeeping:

```ts
type MatchState = { goal: MatchGoal; scores: number[]; round: number }

function roundPoints(game: GameState): number[]        // per-seat award for a finished round
function applyRound(match: MatchState, game: GameState): MatchState
function matchWinners(match: MatchState): number[] | null   // null while the match continues
```

The alternative was extending `GameState` with cumulative scores. Rejected: the
round rules are the part covered by property tests asserting card conservation, and
threading match-level state through them would widen that surface for no gain. A
round does not need to know it is part of a match.

The server's `Room` owns the `MatchState`; the engine stays pure.

## Between rounds

The host deals the next round, consistent with the host-starts-when-ready decision
taken for the lobby. No timer: a scoreboard that vanishes on its own is a scoreboard
nobody read.

## Decisions on the edges

**A round nobody finished** — `winner === null`, which happens when too few players
remain — awards no points and ends the match. Awarding points for an unfinished
round would mean inventing a rule; stopping is honest.

**A tie on totals after the last round** is possible in `rounds` mode, and the
official rules say nothing about it. The match reports every seat on the winning
total, and the UI says it is a tie. Sudden death was the alternative and it is worse:
it turns "best of 3" into an unbounded match.

**A tie is impossible in `points` mode.** Only the round winner scores, so only one
seat can cross the target in a given round. `matchWinners` still returns an array, so
both modes share one shape.

**A seat that leaves mid-match** keeps the points it earned — they are history — and
stops earning more. The match ends when fewer than two seats remain active, through
the same path as an unfinished round.
