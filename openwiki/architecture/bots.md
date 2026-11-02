# Bots

Bots fill empty seats in the lobby, and a Normal bot stands in for a human who drops
mid-match. The decision is pure and lives in the engine; the pacing lives in
`RoomManager`. A bot is only ever asked what a human in its seat could answer.

The design and every measurement behind it are in
[`docs/superpowers/specs/2026-11-01-bots-design.md`](../../docs/superpowers/specs/2026-11-01-bots-design.md).

## The BotView boundary

`packages/engine/src/bot/view.ts` defines `BotView`: the seat's own hand and
`legalMoves`, the public table (discard pile, colour, direction, pending draw, hand
counts, statuses, rules) and a small `RoundHistory` (which seat drew voluntarily on which
colour). `botViewFor(state, seat, history)` builds it from the full state, and
`botMove(view, level, rng)` takes only that.

The point is the type: `BotView` has no field that can hold another hand or the order of
the draw pile, so "does the bot cheat?" is answered by the compiler rather than by
reading the policy. `belote-multiplayer` passes the full state and restricts itself in a
`knowledgeFor` function; that version was rejected because it is one careless read away
from cheating. The move returned is always one of `legalMoves`, which a property test
pins at every level under every rule combination.

`recordMove` updates the history after each move. Only a voluntary draw says anything
about a hand (the seat likely holds none of the colour it drew on); paying a pending draw
says nothing.

## Levels

| Level  | Plays                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Easy   | A random legal move, drawing only when it has no play. Calls UNO half the time, calls out half the time                                                 |
| Normal | Always calls UNO, sheds high-scoring cards first, keeps wilds while a coloured card is legal, names the colour it holds most, calls out whenever it can |
| Hard   | Normal plus card counting to avoid a colour that is nearly exhausted, holding +2, +4, skips and reverses for the seat closest to winning, and jump-in   |

Easy never draws at will because a bot that draws instead of playing makes rounds
unbounded. A bot standing in for a disconnected human plays at Normal.

**God Level** was tried and dropped: a Monte Carlo bot sampling the unseen cards did not
beat three Hard bots by a significant margin on four of five rule sets. The numbers are in
[God Level, measured and dropped](../../docs/superpowers/specs/2026-11-01-bots-design.md#god-level-measured-and-dropped).
A level ships only once it is measured to beat the one below it.

## Timing

Delays are drawn from a Gaussian clamped to a range (`packages/engine/src/bot/timing.ts`),
once per window, so a bot reads as human and a missed UNO is not called out 5 ms later.

| Delay                                     | Range      | Mean: Easy / Normal / Hard |
| ----------------------------------------- | ---------- | -------------------------- |
| Own turn                                  | 0.8 to 3 s | 2.2 / 1.8 / 1.4 s          |
| Reaction (call-out, late UNO)             | 2 to 10 s  | 7 / 5 / 3 s                |
| Jump-in (Hard only, never Easy or Normal) | 1 to 3 s   | 1.8 s                      |

Jump-in has its own faster range because its window closes as soon as the next seat plays,
which takes a bot 0.8 to 3 s: on the reaction range no bot would ever get in. A reaction
that finds its window closed when it fires is dropped, since `legalMoves` no longer offers
it.

`RoomManager` owns the timers, behind the same injectable `Timers` as the other clocks, so
tests never wait. Its delay stream has its own seed, so timing never shifts a deal.

- **Blazing caps the delay.** A bot never plays closer than one second to the end of the
  turn clock, so it never times out. A bot's own turn never restarts or cancels the clock.
- **Absent grace.** A stand-in waits 15 s before its first move, on the first absent turn
  only: `min(15 s, turnSeconds - 1 s)` on a Blazing table.
- **`BOT_DELAY_FACTOR`** (0.01 to 1, default 1) multiplies every bot delay and the grace.
  Production leaves it at 1; the e2e suite sets 0.05 so a match finishes in seconds.
- **No human connected, nothing moves.** No bot move, turn clock, next round or UNO grace
  is armed while every human is detached, so a table of bots cannot play on unwatched.

## Seats and presence

The seat rules (who is a bot, when a joiner replaces one, `canStart`) and the stand-in
behaviour are in [Room lifecycle](../domain/room-lifecycle.md). Two invariants matter here.
A bot-played seat is **active for every rule**, Seven-Zero and `turnOrder` included, so no
rule needs a special case for it. And `Room` stays synchronous and timer-free: it exposes
`botStep()` to play the seat on turn, and `RoomManager` decides when to call it.

## The tournament

```bash
npm run tournament     # builds, then plays; slow
```

`scripts/tournament.mjs` plays one bot of level L against three of level L-1 on official
rules and on each house rule, over 10 seeds (from 20261101) of 10 000 rounds, and prints the
stronger seat's win rate and average points as mean and standard deviation across seeds.
The engine does the playing (`packages/engine/src/bot/tournament.ts`) on a virtual clock.

What it measures is the **card policy and jump-in**, plus a model of the server's UNO grace
race (3 s). It does not measure reaction speed: Normal and above never forget UNO, so their
off-turn delays only matter for call-outs and jump-ins.

The criterion, decided with the user: a level earns its place when its win rate is
**significantly over 25% parity** (the share of one seat among four). A small version runs
in `verify` as a property test: four bots always finish a match, cards are conserved and no
bot move is rejected.

Results (win rate of the single stronger seat, mean and standard deviation):

| Pair             | Rule set          | Win rate    |
| ---------------- | ----------------- | ----------- |
| Normal vs 3 Easy | defaults          | 36.6% (0.6) |
| Normal vs 3 Easy | liar              | 48.1% (0.5) |
| Normal vs 3 Easy | sevenZero         | 34.2% (0.4) |
| Normal vs 3 Easy | jumpIn            | 36.6% (0.6) |
| Normal vs 3 Easy | playDrawnCard off | 35.5% (0.6) |
| Hard vs 3 Normal | defaults          | 27.6% (0.6) |
| Hard vs 3 Normal | liar              | 27.6% (0.6) |
| Hard vs 3 Normal | sevenZero         | 27.4% (0.5) |
| Hard vs 3 Normal | jumpIn            | 29.8% (0.7) |
| Hard vs 3 Normal | playDrawnCard off | 27.5% (0.5) |

Every pair clears parity by far more than its spread. Hard sits at about 28% against
Normal, a modest edge the user chose to keep rather than merge the two levels. Defaults
and liar are identical for Hard against Normal because every bot from Normal up calls UNO
in time, so nothing on a liar table ever differs. For the same reason Normal against Easy
on jumpIn equals defaults: neither level jumps in.

## Where to be careful

- Never give `BotView` a field built from another seat's hand or the draw pile order. The
  whole design rests on its type being unable to hold them.
- A new reaction kind needs an entry in the timing table, a window in `RoomManager` and a
  guard for the window having closed.
- Re-run `npm run tournament` after touching `policy.ts`: a heuristic that reads better can
  play worse, and the levels are only ordered by measurement.
