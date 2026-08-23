# A bot, and whether offline play is possible

## The short answer

Offline play is not only possible, it is close to free - and the reason is a
decision taken on day one for a completely different purpose.

`packages/engine` is **pure**: no I/O, no networking, no Node built-ins, no
dependencies at all. `initGame`, `legalMoves` and `applyMove` are functions from
values to values, with a seeded PRNG whose state lives inside the game state. The
web client already imports that package - today only for types, `isWild` and
`cardPoints`, but nothing stops it importing the rest. It runs in a browser
unchanged.

The second half is the client. It was built to know no rules: the server computes
`legalMoves` and ships a redacted `PlayerView`, and the client renders that and
emits intents. It never asks *why* a move is legal. So the client cannot tell
where its views come from.

Put those together and offline is not a port. It is a second implementation of one
small interface.

## What actually has to be built

`useGameSocket` returns `{ state, actions }`. Everything in the tree below it -
`App`, `Table`, `Hand`, `GameOver`, the effects and sound hooks - depends on that
shape and on nothing else. So:

```
useGameSocket   →  a real server over Socket.IO      (today)
useLocalGame    →  the engine + a bot, in the tab    (new)
```

Both return the same `{ state, actions }`. `App` picks between them once, at the
top. No component below changes.

`useLocalGame` needs roughly:

- a `Room`-shaped object holding a `GameState`, a `MatchState`, and the stats
  tally - all three already pure, all three already tested
- `redactFor`, which lives in `apps/server/src/views.ts` and imports nothing from
  Fastify or Socket.IO. It would move to a shared place; that is the only file
  that has to relocate.
- a turn loop: apply the human's move, then let each bot seat move in order, with
  a small delay so the table feels played rather than computed

Estimated: one new hook, one moved file, no changes to the engine, no changes to
any component.

## What offline does NOT get

Worth being straight about, because these are the reasons to keep the server:

- **No other people.** Obviously, but it is the whole point of the project.
- **No reconnection guarantees.** State lives in a tab. Closing it ends the game
  unless it is persisted to `localStorage`, which is extra work and a new class of
  bug (a saved game from an older version of the rules).
- **Cheating becomes possible.** The engine in the tab holds every hand. Nothing
  stops a determined player reading them from the console. Offline, that matters
  to nobody; it is worth stating so the property is not assumed to survive.

## The bot

### Where it runs

The same policy function serves both, because it takes a `PlayerView`:

```ts
function chooseMove(view: PlayerView, difficulty: Difficulty): Move
```

**Taking the view rather than the GameState is the important decision.** A bot
handed the full state could read every hand, and would eventually be tempted to.
Handed a `PlayerView`, it structurally cannot: opponents are a card count. It sees
exactly what a human sees, and any accusation that it cheats can be answered by
pointing at the type.

It also makes the bot pure and testable, and lets the identical function run on the
server for a bot filling an online seat, or in the tab for offline play.

### The policy

Three levels, all built from the same handful of rules:

**Easy** - pick uniformly at random from `legalMoves`. Calls UNO only sometimes,
which makes it beatable and occasionally lucky. Two lines.

**Fair** - the one worth most, and still simple:

1. Always call UNO when legal. Forgetting is a human failing, not a design.
2. Prefer to shed weight: play the highest-scoring legal card, since scoring is by
   what is left in hand. `cardPoints` already exists in the engine.
3. Keep wilds back. Play a coloured card if one is legal; a wild is an escape
   hatch, and spending it early wastes the only card that is always playable.
4. When choosing a colour for a wild, choose the colour it holds most of.
5. Drop a Draw Two or Skip on the player who is closest to winning - `handCount`
   is in the view.

**Sharp** - Fair plus rough card counting: track what has been played from the
discard feed and avoid choosing a colour that is nearly exhausted, since the
others are unlikely to hold it. Note honestly that this is where effort stops
paying: UNO is mostly luck, and a bot that is much better than Fair is not more
fun to play against.

### Making it feel like a player

A bot that answers in a millisecond reads as a machine and makes the table feel
fake. Give it a think time drawn from a small range - say 700ms to 2.2s, longer
when its hand is large - and let it use the existing `turnTimedOut` path rather
than any special case. On a Blazing table it should think faster than the clock,
which falls out for free if the range is capped below `turnSeconds`.

### Testing it

The parts that are worth testing are testable because the policy is pure:

- Never returns a move outside `legalMoves` - a property test over random views,
  which is how the engine's own invariants are guarded.
- Fair never plays a wild while a coloured card is legal.
- Fair always calls UNO when the move is available.
- A whole match of four bots terminates, and card conservation still holds -
  reusing the existing property-test harness.

That last one is the valuable one: a bot playing itself thousands of times is by
far the cheapest way to find rule bugs, and it would have caught the `advance`
freeze found earlier by hand.

## Recommended order

1. **`chooseMove`, Fair only**, pure, with the property tests above. Nothing is
   wired up yet, and the engine gains a self-play harness immediately.
2. **A bot seat on the server**, so an online table can be filled to three. Small:
   a seat with no socket, whose turn triggers `chooseMove` on a timer that already
   exists.
3. **Offline mode**, once the bot is proven, since it is the piece with the most
   new surface and the least urgency.

Easy and Sharp are worth adding only after somebody has actually played Fair
enough to say whether it is too strong or too weak. Guessing that in advance is
how difficulty settings end up meaningless.
