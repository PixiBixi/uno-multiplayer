# Bots

Builds on the analysis in `2026-08-09-bot-and-offline-analysis.md`. Offline play stays
out of scope; everything here runs on the server.

## Intent

Three situations the table cannot handle today:

- **A player alone** wants to play, or try the game, with no friends around.
- **A table of two or three** wants the full four-seat game: the host fills the empty
  seats with bots.
- **A player drops mid-match**: today their turns are skipped and, after the grace
  period, their hand goes back to the pile. The match limps on short-handed. Instead,
  a bot plays their seat until they come back.

Success: a solo player can open a table, add three bots, and play a whole match that
feels like playing people - bots that hesitate, sometimes miss things, and can be
beaten at the easy end and are hard to beat at the top.

## Goals

- Bots as a seat occupant, added by the host in the lobby, at one of several levels.
- A table may deal with **one human** and at least one bot. Four seats maximum, as now.
- A disconnected human's seat is played by a bot until the human returns.
- Bot timing that reads as human, on its own turn and off turn.
- A self-play tournament that measures each level's real strength.

## Non-goals

- Offline play in the browser.
- More than four seats.
- Bots in voice chat, bots writing in the chat.
- Bots on a table with no human: when the last human is gone, the table stops (see
  Presence).

## Anti-goals

These would make the feature a failure even if it works:

- **A bot that cheats.** A bot must decide from what a human in its seat could know: its
  own hand, the public table, the public event history. Never another hand, never the
  draw pile order.
- **A bot with machine reflexes.** A bot calling out a missed UNO 5 ms after it happens
  makes every slip fatal and breaks the Liar rule. Off-turn reactions must be slow
  enough that humans can win the race.
- **Bots that drag the game.** Solo against three bots must not mean waiting half a
  minute between your own turns.
- **Difficulty labels that mean nothing.** A level is only shipped once measured to be
  stronger than the one below it.

## Levels

Names in the interface: Easy / Normal / Hard, and **God Level**. French: Facile /
Normal / Difficile / God Level (the name is kept as is in French).

- **Easy** - a uniformly random legal move. Calls UNO only sometimes. Calls out
  sometimes, slowly.
- **Normal** - always calls UNO; sheds high-scoring cards first (`cardPoints`); keeps
  wilds while a coloured card is legal; picks the colour it holds most of; calls out
  when it notices.
- **Hard** - Normal plus: counts cards from the public history to avoid naming a colour
  that is nearly exhausted; saves +2, +4, skips and reverses for the seat closest to
  winning (`handCount`); uses jump-in and Seven-Zero deliberately (swap with the
  smallest hand, play a 0 when the rotation helps it).
- **God Level** - Monte Carlo, on the pattern of `belote-multiplayer`
  (`packages/engine/src/bot.ts`, `monteCarloPlay`): sample deals of the unseen cards
  that fit everything this seat has seen (hand counts, cards played, colours a seat has
  shown it lacks by drawing), play each legal move to the end of the round with Normal
  bots, keep the move with the best average score margin. **Only shipped if the
  tournament shows it beats Hard by a clear margin**; if it does not, it is dropped and
  the result is recorded in this spec.

A bot standing in for a disconnected human plays at **Normal**.

## Timing

All delays are drawn from a Gaussian clamped to a range, with the mean set by level.
They are server-side, behind the existing injectable `Timers`, so tests never wait.

| Delay | Range | Mean by level |
| --- | --- | --- |
| Own turn: think before playing | 0.8 s to 3 s | Easy 2.2 s, Normal 1.8 s, Hard and God 1.4 s |
| Off turn: call-out, late UNO | 2 s to 10 s | Easy 7 s, Normal 5 s, Hard and God 3 s |
| Off turn: jump-in | 1 s to 3 s | Hard and God 1.8 s; Easy and Normal never jump in |

Jump-in has its own, faster range because its window closes as soon as the next seat
plays, which a bot does within 0.8 s to 3 s: on the 2 s to 10 s range no bot would ever
jump in. (Decided with the user.)

Standard deviation around 1.5 s for off-turn reactions and around 0.5 s for own turn
(builder's call to tune). A reaction is scheduled when its window opens and is dropped
if the window has closed by the time it fires (the engine already refuses a stale
`callOut` or jump-in through `legalMoves`). Even on its fast range, a bot
sometimes misses a jump-in to the next seat: that is intended. Easy may also skip a
reaction altogether.

On a Blazing table, a bot's own-turn delay is capped below `turnSeconds` so a bot never
times out.

## The decision function

Pure, in the engine, decided from what the seat can see:

```ts
botMove(view: BotView, level: BotLevel, rng): Move
```

`BotView` is the seat's own hand and `legalMoves`, the public table (discard top,
colour, direction, pending draw, hand counts, statuses, rules) and the public history
of the round (every card played and by whom, every voluntary draw). It never contains
another hand or the draw pile. Whether `BotView` is the protocol `PlayerView` plus a
history, or an engine-side type built by a `botViewFor(state, seat, history)`
function, is the builder's call; what matters is that the bot's input type
structurally cannot hold hidden cards, so "does the bot cheat?" is answered by the
type. (`belote-multiplayer` passes the full state and restricts itself in
`knowledgeFor`; that is the version this design rejects.)

God Level is the one place that builds full game states, and it builds them only from
the `BotView` by sampling the unseen cards, never from the real state.

The move returned must always be one of `legalMoves`.

## Seats

A seat holds a **human**, a **bot** (with a level), or is **empty**, as in
`belote-multiplayer` (`apps/server/src/rooms/room.ts`, `Slot`; `SeatOccupant` in its
protocol). In the lobby, the host can put a bot on an empty seat, change its level, or
remove it. Guests see the bots and their level. Bots get a name from a fixed list.

A human joining a room whose free seats are all taken by bots: builder's call between
refusing (`room_full`) and replacing a bot; the default is that a joiner **replaces the
last-added bot** while the table is still in the lobby, and is refused once the match
has started.

`canStart` becomes: at least one human and at least two filled seats.

Seat number stays equal to engine seat index. Scores, statistics and end-of-match
awards include bots like any seat.

## Presence: a bot stands in

Replaces the current skip-then-remove behaviour for a disconnected human:

- When a disconnected human's turn comes, a Normal bot plays it after a short grace
  (15 s, as `ABSENT_TURN_GRACE_MS` in `belote-multiplayer`), with an event
  (`botTookOver`) the table shows once. The grace applies to the **first** absent turn
  only: once the bot has taken over, later turns use ordinary bot timing until the human
  returns, so a dropped player does not cost the table 15 s per turn. On a Blazing table
  the grace is `min(15 s, turnSeconds - 1 s)`, so the bot plays before the turn clock
  forces a draw. (Design call.)
- The bot also reacts off turn for that seat, with Normal timing.
- The human who reconnects with their session token takes the seat back at once,
  whatever the bot did in between. This holds for the **whole match**, not only during
  the current grace period.
- **Leave** (the button) hands the seat to a bot for the rest of the match. The leaver
  cannot come back to it.
- A seat played by a bot is an active seat for every rule: it takes turns, it is a
  Seven-Zero target and part of the rotation, it appears in `turnOrder`.
- The view shows such a seat as the human's name with a "bot playing" marker.
- **When no human is left connected**, the table stops: no bot moves while no human is
  attached, and the room is purged as it is today once it has stayed empty for the
  grace period.

Grace expiry no longer returns a hand to the pile during a match: the seat simply stays
bot-played. Across `game:restart` (a new match dealt directly, without a lobby), a
stand-in seat stays a stand-in its human can still reclaim, and a seat whose human
pressed Leave becomes an ordinary Normal bot. (Design call.)

How the engine seat statuses (`active`, `disconnected`, `left`) map onto this is the
builder's call, with the constraint above that a bot-played seat behaves as active.
The wiki pages `openwiki/domain/room-lifecycle.md` and
`openwiki/domain/rules-and-scoring.md` (Seven-Zero, "only active seats take part")
describe the behaviour this replaces and must be updated with it.

## The tournament

A script (not part of `verify`) that plays thousands of rounds of four bots at mixed
levels on official rules and on each house rule, and prints win rate and average
points per level. It is how levels are tuned and how God Level earns its place.

Strength is measured as the win rate of one bot of level L against three bots of level
L-1, on each rule set, across at least 10 independent seeds of 10 000 rounds each,
reported as mean and standard deviation across seeds: a level earns its place when it
beats three bots of the level below by a **statistically significant margin over parity
(25%)**. The same criterion applies to God Level against Hard. Late UNO is only the Easy
bot's concern (Normal and above always call in time), so an Easy bot sometimes paying
the penalty on a table without call-outs is accepted. (Design calls.)

The tournament measures card policy and jump-in, not reaction speed: Normal and above
never forget UNO, so their faster off-turn delays only matter for call-outs and jump-ins.

God Level runs on the main thread with a **fixed sample count**, not a time box (time
boxes make tests nondeterministic), calibrated so a move takes under 150 ms at p90 on
the production host. The tournament runs with that same sample count. No worker thread
unless measurement shows the cap cannot be met. (Design call.)

A smaller version runs as a property test in `verify`: four bots always finish a match,
card conservation holds, no bot move is ever rejected.

Results of `npm run tournament` (10 seeds from 20261101, 10 000 rounds per seed, UNO
grace 3 s), win rate of the single stronger seat, mean and standard deviation across
seeds:

| Pair | Rule set | Win rate (mean, sd) | Rounds |
| --- | --- | --- | --- |
| Normal vs 3 Easy | defaults | 36.6% (0.6) | 10 x 10 000 |
| Normal vs 3 Easy | liar | 48.1% (0.5) | 10 x 10 000 |
| Normal vs 3 Easy | sevenZero | 34.2% (0.4) | 10 x 10 000 |
| Normal vs 3 Easy | jumpIn | 36.6% (0.6) | 10 x 10 000 |
| Normal vs 3 Easy | playDrawnCard off | 35.5% (0.6) | 10 x 10 000 |
| Hard vs 3 Normal | defaults | 27.6% (0.6) | 10 x 10 000 |
| Hard vs 3 Normal | liar | 27.6% (0.6) | 10 x 10 000 |
| Hard vs 3 Normal | sevenZero | 27.4% (0.5) | 10 x 10 000 |
| Hard vs 3 Normal | jumpIn | 29.8% (0.7) | 10 x 10 000 |
| Hard vs 3 Normal | playDrawnCard off | 27.5% (0.5) | 10 x 10 000 |

Every pair clears parity by far more than its spread. The user chose to keep Hard at
about 28% against Normal rather than merge the two levels. (Decided with the user.)

## Testing

- Property: `botMove` never returns a move outside `legalMoves`, at every level, under
  every combination of table rules.
- Unit: Normal never plays a wild while a coloured card is legal; Normal always calls
  UNO when it can; a stale reaction is dropped.
- Server: a disconnected human's turn is played after the grace; reconnecting takes the
  seat back; a table with only bots left stops; Blazing never times out a bot.
- E2E: one human starts a table with three bots and plays to the end of a round.

## Left to the builder

- The exact shape of `BotView` and where the public history is kept.
- Tuning of the heuristics and the Gaussian parameters, from tournament results.
- Bot names list, and the lobby UI for adding bots, within the existing lobby layout.
- How a bot's own-turn and off-turn timers fit into `RoomManager` alongside the turn,
  between-rounds and UNO grace clocks.
- Order of delivery. Suggested: decision function with Easy, Normal and Hard plus
  tournament; then bot seats in the lobby; then stand-ins; God Level last.
