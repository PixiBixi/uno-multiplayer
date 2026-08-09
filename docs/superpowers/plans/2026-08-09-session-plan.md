# Overnight work plan

Ordered by what would hurt a real player most, not by what is most interesting.

## 1. Three verified defects (do first)

Found by a performance review and reproduced before touching anything.

### 1a. `room:leave` does not exist — HIGH

`useGameSocket.leave` clears local state and tells the server nothing. There is no
`room:leave` in the contract and no `socket.leave()` anywhere in production code.

Two consequences, both confirmed by a failing test written before the fix:

- The seat keeps a dead socket id forever, so `Room.isEmpty()` is permanently
  false and `purge()` can never reclaim the room. One leaked room per leave until
  `MAX_ROOMS` is hit and every new game is refused.
- The socket stays in the old socket.io room, so a player who left keeps receiving
  the chat and events of a table they walked away from.

Fix: add `room:leave` to the contract; on the server do what the disconnect path
does, plus `socket.leave(code)` and `presences.delete`. Client emits it before
dispatching `left`.

### 1b. `armNextRound` re-arms forever — HIGH

The arming guard is `betweenRounds`; the dealing guard also requires two active
members. When a round ends with one player left, the deal fails, nothing about the
room changes, and `retime` arms it again — every five seconds, for the life of the
process, pushing a view each time with a countdown that never resolves.

Fix: make the arming guard match the dealing guard. Same shape on the turn clock.

### 1c. `purge()` ignores the grace window — MEDIUM

A room is "empty" the instant every socket id is null, which includes players still
inside their grace period. Purge runs every 60 s and the grace period is 60 s, so
purge wins whenever its tick lands first — and it cancels the grace timers it is
pre-empting. A player who reloads at the wrong moment loses the game.

Fix: remember when a room went empty and require it to have stayed empty for a
grace period before reclaiming it.

## 2. Duplicated lookup tables (style review)

`COLOR_NAME` in four files, `PIGMENT` in four, `SEAT_PIGMENT` in two. Exactly the
failure that already bit this project with the card-scoring table, which is now
read from one place. Nothing guards these: rename a colour and the UI contradicts
itself with no test failing.

Also: `highestId` copied into two hooks, six copies of the presence lookup in
`handlers.ts`, and `ENGINE_VERSION` exported with no consumer.

## 3. Features asked for

- **Liar button** — the UNO call-out becomes something players do rather than an
  automatic penalty. A rule change; see the accompanying spec.
- **7-0** — a table option: 7 swaps hands with a chosen player, 0 rotates every
  hand in the direction of play.
- **Jump-in** — a table option: an identical card may be played out of turn.
  Highest risk of everything here, because it inverts the turn model the engine
  rests on. Last, and only if the rest is solid.

## 4. Test audit

Go back over the features already shipped and look for what has no coverage,
rather than adding more tests to what is already covered. Particularly: the
reconnection path, rate limiting, the redaction boundary, and the client reducer.

## 5. Documentation

An architecture wiki, then the README and CLAUDE.md brought back in line with what
the code now does.
