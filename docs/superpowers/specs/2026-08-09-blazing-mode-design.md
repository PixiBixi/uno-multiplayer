# Blazing mode design

**Goal:** an optional per-turn time limit, chosen by the host, plus a short
countdown between rounds so a fast match keeps moving on its own.

## Why it is a mode and not a rule

An idle player currently freezes the table forever. The only timer in the server is
the disconnect grace period; somebody who stays connected and simply stops playing
blocks everyone, including the host, with no way out.

The fix could have been a timeout on every table. It is opt-in instead, because a
turn limit changes the game rather than protecting it: thinking time is part of
UNO, and a group playing over dinner does not want a clock. The host decides.

## The shape

Blazing is about pace, `MatchGoal` is about how a match ends. They are independent,
so it is a separate field rather than a third goal variant:

```ts
type MatchPace = { turnSeconds: number; betweenRoundsSeconds: number } | null
```

`null` is the default and means what happens today: no clock at all.

Bounds are enforced at the socket boundary, not only in the lobby: `turnSeconds`
3–120. Below three seconds nobody can read their hand; above two minutes it stops
being a limit and starts being a memory leak with a countdown.

`betweenRoundsSeconds` is fixed at 5 rather than exposed. It exists so a fast match
does not stall on the host clicking Next round, and a second dial for it would be a
setting nobody has an opinion about.

## What happens when the clock runs out

The server plays **draw** for the seat on turn — deliberately, even when that seat
had a card it could have played. Picking a card for someone is choosing their move;
drawing is the one action that is always legal, always neutral, and never spends a
card they were saving. It ends their turn, which is the whole point.

When a draw is already pending against them (a stacked +2 or +4), the forced move is
`acceptDraw` instead: `draw` is not legal in that state, and accepting is the same
decision made for them.

Nothing is forced when the seat could only have called UNO. That penalty belongs to
the player who forgot, not to the clock.

## Where the timer lives

In `RoomManager`, never in `Room`. `Room` is deliberately synchronous and
timer-free, which is what makes the whole lifecycle testable without a clock, and
the grace period already demonstrates the pattern: timers behind an injectable
interface, expiry delivered to the socket layer through a callback that broadcasts.

The turn timer is re-armed after anything that can change whose turn it is — a
move, a forced move, a deal, a disconnection — and cancelled when the round ends or
the room empties. The between-rounds timer is armed when a round ends and the match
continues, and it deals the next round itself rather than waiting for the host.

## What the client shows

A countdown on the table for the seat on turn, and a countdown on the round-over
card. Both are driven by a deadline sent in the view rather than by a duration the
client counts down from: a client that misses a frame, sleeps a tab, or reconnects
mid-turn must not disagree with the server about when time runs out. The server
remains the only authority on the deadline; the client only renders the remainder.

Under `prefers-reduced-motion` the countdown still ticks — it carries information,
not decoration — but it does not pulse.
