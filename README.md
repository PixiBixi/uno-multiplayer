# UNO Multiplayer

Online UNO for 2 to 4 players. Server-authoritative, written in TypeScript.

Play it with `docker compose up --build`, then open <http://localhost:5050>.

## Why this exists

This is a ground-up rewrite. The predecessor was a two-player prototype where
the server was a bare relay: it broadcast whatever game state a client sent it,
without validating anything. That design had three consequences that no amount
of patching fixes.

- **Cheating was trivial.** Any client could emit a state declaring itself the
  winner.
- **Hidden information was not hidden.** Both players' full hands and the entire
  draw pile were sent to every client; opponents' cards were concealed with a
  CSS card-back image.
- **The rules were duplicated.** The same move logic appeared sixteen times in
  one 810-line function, and the copies had drifted apart.

Here the server owns the state, owns the rules, and sends each player only what
that player is allowed to see.

## Architecture

```
packages/engine     Pure rules engine — no I/O, no networking, no dependencies
packages/protocol   Wire contract: views, events, payload schemas
apps/server         Fastify + Socket.IO orchestration
apps/web            Vite + React client
```

Inside `apps/server`, `Room` is deliberately **synchronous and timer-free**: it
knows nothing of Socket.IO or `setTimeout`, so the whole lifecycle — joining,
starting, moves, disconnection, grace expiry — is testable without a clock or a
network. Timers live only in `RoomManager`, behind an injectable interface.

The `game:event` feed (for animations and the in-game log) is **derived** by
diffing the state before and after a move, never hand-emitted. An event therefore
cannot contradict the state it describes.

### The client knows no rules

The server computes the legal moves and ships them inside each player's view:

```ts
type PlayerView = {
  you: { seat: number; hand: Card[]; legalMoves: Move[] }
  opponents: { seat: number; name: string; handCount: number; status: SeatStatus }[]
  discardTop: Card
  currentColor: Color
  pendingDraw: { amount: number; kind: 'draw2' | 'wild4' } | null
  // ...
}
```

The client renders that and emits intents. It never evaluates a rule. Three
properties follow directly:

- **No rule duplication**, so the copies cannot drift.
- **No desynchronisation**, because a view is a complete idempotent state rather
  than a delta — no sequence numbers, no gap detection, no resync path.
- **Cheating is structurally impossible**: `opponents` carries a card count and
  never card contents, and a move is only accepted if it appears in the server's
  own `legalMoves`.

The cost is one network round trip per move, 30–100 ms. In a turn-based card
game that is imperceptible.

### Three engine invariants

**`applyMove` never throws.** Every failure is a returned `Result`. An illegal
move is a value, not an exception — which is what makes a malformed payload
unable to take the process down.

**The RNG is seeded and its state lives in the game state.** A game is fully
replayable from `(seed, moves[])`. Tests are deterministic, and a production bug
can be reproduced from the logs. It is also why shuffling cannot corrupt a
shared deck: nothing is mutated in place.

**Seats are stable.** Each seat carries a `status` of `active`, `disconnected` or
`left`. A player who leaves triggers no reindexing; turn advance simply skips
inactive seats. That removes a whole class of index bugs and lets a disconnected
player keep their place.

## Rules implemented

Official rules plus draw stacking, with these points pinned down explicitly:

| Point                         | Decision                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Draw stacking                 | **Strictly same type**: +2 answers +2, +4 answers +4, no crossover. Colour is irrelevant when raising.                                        |
| Reverse with 2 active players | Acts as a skip (official rule).                                                                                                               |
| Starting card                 | The first number card from the top of the shuffled deck. Deterministic, no unbounded loop.                                                    |
| Drawing voluntarily           | Ends your turn. No "you may now play the card you drew" sub-state.                                                                            |
| Calling UNO                   | Legal only during your own turn, before playing. Going down to one card without it costs two cards.                                           |
| Empty draw pile               | The discard pile minus its top card is reshuffled into a new draw pile. If that is still not enough, the draw is capped at what is available. |
| Victory                       | First empty hand wins the round; the round ends immediately.                                                                                  |
| Card conservation             | Hands + draw pile + discard pile always total 108 cards with distinct ids. Enforced by a property test.                                       |

### Scoring a match

A table plays a match of rounds, and the host sets how it ends when creating it:
first to a points target, or a fixed number of rounds. **A one-round match is a
single game** — there is no separate mode for it, because a mode meaning "stop
after one round" is what a one-round match already is.

Scoring is official Mattel: the winner of a round takes the total value of every
card left in the other hands, number cards at face value, Skip / Reverse / Draw Two
at 20, both wilds at 50.

| Point                   | Decision                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Round with no winner    | Awards nothing and ends the match. Scoring a round nobody finished would mean inventing a rule.                            |
| Tie on totals           | Possible in rounds mode, and unaddressed by the official rules. Every seat on the winning total shares the win.            |
| Tie on points           | Impossible: only the round winner scores, so only one seat can cross the target.                                           |
| A player who leaves     | Keeps the points they earned, and their remaining cards still count for whoever went out.                                  |
| Next round vs new match | Two distinct host actions. Letting one mean both depending on hidden state is how a player loses a scoreboard by accident. |

Not implemented, deliberately: the strict Mattel +4 challenge (it needs a bluff
UI and hand inspection), the 7-0 variant, and jump-in.

## Language

The interface is available in English and French. A browser asking for French gets
it; a chip on the home screen switches instantly and the choice is remembered.

Every catalogue entry that varies is a function rather than a template, because a
template can only express the grammar of whichever language was written first.
English builds "Ana wins" from a name and an s; French builds "Ana gagne" from a
different stem, and "You win" becomes "Tu gagnes" where the verb changes rather
than the pronoun. English pluralises at zero and French does not. Adding a language
means adding one file that satisfies `Messages`; the tests check that no catalogue
has drifted from another.

## Development

Requires Node 22 or later. The repo pins the Active LTS in `.nvmrc`.

```bash
npm install
npm run verify      # lint + typecheck + test, the same gate CI runs
```

### Running it locally

The client is served by Vite on its own port and proxies the socket handshake to
the API, so both have to be up. Build once, then two terminals:

```bash
npm run build                 # once, so the server has dist/ to run

# terminal 1 — API and WebSockets on http://localhost:5050
npm start -w @uno/server

# terminal 2 — client with hot reload on http://localhost:5173
npm run dev -w @uno/web
```

Open <http://localhost:5173>. Vite forwards `/socket.io` and `/healthz` to 5050.

**Port 5050, not 5000.** On macOS, Control Center binds port 5000 for the AirPlay
receiver, so a 5000 default fails on any Mac with AirPlay enabled.

If you are editing **server** code, add a third terminal so the compiled output
keeps up — `npm run dev -w @uno/server` watches `dist/`, and nothing writes to
`dist/` on its own:

```bash
npm run watch                 # tsc --build --watch
```

| Script                     | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `npm run verify`           | Lint, typecheck and test — run this before pushing |
| `npm test`                 | Vitest once                                        |
| `npm run test:watch`       | Vitest in watch mode                               |
| `npm run test:coverage`    | Coverage report into `coverage/`                   |
| `npm run lint`             | ESLint with type-aware rules                       |
| `npm run typecheck`        | Types across the whole repo, tests included        |
| `npm run build`            | Emit `dist/` for the publishable packages          |
| `npm run format`           | Prettier write                                     |
| `npm start -w @uno/server` | Run the built server (build first)                 |

### Testing approach

The engine is pure functions over immutable state, so each rule is a short unit
test with no network and no React. On top of the unit suite, property-based
tests with fast-check play hundreds of randomised games and assert that:

- the 108 cards are conserved at every step of every game;
- no move produced by `legalMoves` is ever rejected by `applyMove`;
- `currentSeat` always points at an active seat while a game is in progress;
- under greedy play, every game terminates with a winner holding no cards.

The conservation invariant alone would have caught the worst bug in the
predecessor, where an in-place shuffle of a module-level array stripped 15 cards
from the deck on every game.

### Toolchain notes

TypeScript is pinned to 6.x rather than 7.x on purpose: `typescript-eslint`
declares a peer range of `<6.1.0`, and a type-aware linter running against an
unsupported compiler fails silently rather than loudly. A slightly older
compiler with working typed lint rules beats the reverse.

`tsconfig.json` covers the whole repo including tests and config files — it is
what the editor, ESLint and `typecheck` read. `tsconfig.build.json` is the
emit-only solution and excludes tests.

## Roadmap

- [x] Monorepo, toolchain, CI
- [x] `packages/engine` — rules, seeded RNG, property tests
- [x] `packages/protocol` — views, events, payload schemas
- [x] `apps/server` — rooms, seat sessions, reconnection, rate limiting
- [x] `apps/web` — SVG cards, four-seat table, lobby, chat
- [x] Playwright end-to-end tests across multiple browser contexts
- [x] Dockerfile and deployment
- [x] Match scoring: points target or fixed rounds, official card values
- [x] Sound: synthesised cues for play, draws, action cards, UNO, turn and endings
- [x] Blazing: an optional per-turn clock, with rounds that deal themselves
- [x] End-of-match awards, counted from the event feed
- [x] English and French, with each language owning its own grammar
- [x] An error boundary, so a bad render explains itself instead of blanking
- [ ] **Your own hand falls below the fold on a phone** — see below
- [ ] Deploy it somewhere real and play a game with actual people
- [ ] A bot, so a table can be tried alone or filled to three

### Blazing

An optional per-turn clock, chosen by the host when creating the table. It exists
because an idle player used to freeze the game forever: the only timer in the
server was the disconnect grace period, so somebody who stayed connected and simply
stopped playing blocked everyone, including the host, with no way out.

It is opt-in rather than a rule on every table, because a clock changes the game
rather than protecting it — thinking time is part of UNO, and a group playing over
dinner does not want one.

| Point                            | Decision                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When time runs out               | The server plays **draw**, even for a seat holding something playable. Choosing a card for someone is choosing their move; drawing is always legal, always neutral, and never spends a card they were saving. |
| With a draw stacked against them | `acceptDraw` instead, since `draw` is not legal in that state.                                                                                                                                                |
| When they could only call UNO    | Nothing is forced. That penalty belongs to the player who forgot, not to the clock.                                                                                                                           |
| Between rounds                   | Five seconds, then the next round deals itself. Fixed rather than exposed: a second dial for it would be a setting nobody has an opinion about.                                                               |
| Where the timer lives            | `RoomManager`, never `Room` — `Room` stays synchronous and timer-free, which is what keeps the whole lifecycle testable without a clock.                                                                      |

The countdown is driven by a **deadline** in the view, not a duration the client
counts down from. A client that drops frames, sleeps a tab or reconnects mid-turn
would otherwise drift away from the server about when time is up; reading the
remainder of an absolute stamp cannot drift.

### Sound

Every cue is synthesised with the Web Audio API — `apps/web/src/lib/audio-engine.ts`
is oscillators and envelopes, not a single audio file. That keeps binary assets out
of the repository and the image, avoids licence questions, and makes each sound a
few numbers to edit rather than a clip to re-record.

The split matters for testing. `sounds.ts` decides _which_ cue an event deserves
and is a pure function, tested like any other; `audio-engine.ts` turns a name into
noise and is unit-testable by nothing, since jsdom has no Web Audio. It is checked
in a real browser instead, by wrapping `AudioContext` and asserting oscillators
actually start.

Two details that are easy to get wrong:

- **An AudioContext is born suspended** and stays mute until a user gesture. The
  first cue of a session therefore races the unlock — measurement showed the
  context is not even constructed until then — so `play` resumes and _then_ emits
  rather than dropping the sound.
- **Winning and watching someone win are different events.** Endings come in
  pairs, `roundWon`/`roundOver` and `matchWon`/`matchOver`, because a single cue
  for both congratulates the loser.

Sound is on by default with a mute toggle on the felt, persisted in
`localStorage`. Nothing can play before the click that creates or joins a table,
so opening the page is never a surprise.

### Known issue: the hand is off-screen on a phone

Measured on an iPhone 13 viewport (390 × 844) with a game in progress:

```
horizontalOverflow: false      undersizedTapTargets: []
handCards: 7                   pageScrollsVertically: true
```

The good half holds — nothing overflows sideways and every tap target clears
44 px. But the seven cards wrap onto a second row that the viewport cuts off, so a
player has to scroll to see their own hand, which is the one thing that should
never be hidden. The cause is above it: the deck, the direction pill, **Draw card**
and the three sort buttons each take a full row before the hand gets any height.

Scrolling the hand horizontally in one row is the likely fix, rather than letting
it wrap. Worth checking against a real browser's geometry rather than by eye — and
worth sampling _after_ transitions settle, since this project has twice been
fooled by a screenshot taken mid-fade.

An architecture wiki lives in [`openwiki/`](openwiki/quickstart.md) — start there
for how the pieces fit together and what to watch out for when changing each area.

Design documents live in `docs/superpowers/`: the
[design spec](docs/superpowers/specs/2026-08-04-uno-multiplayer-design.md) records
the decisions and the reasoning, and the
[implementation plan](docs/superpowers/plans/2026-08-04-engine-foundations.md)
covers the work done so far.

## Deploying it

```bash
docker compose up --build
```

Then open <http://localhost:5050>. Create a game and the lobby offers two ways to
share it: **Copy code** for a code to read out loud, and **Copy link** for
`http://localhost:5050/?room=K7QM2X`, which prefills the field for whoever opens
it.

Copying works over plain HTTP as well as HTTPS. `navigator.clipboard` does not
exist outside a secure context, so `apps/web/src/lib/clipboard.ts` falls back to a
selection-based copy — without it the buttons would work on localhost and silently
do nothing on a self-hosted instance reached by IP.

| Variable                         | Default                 | Purpose                                                            |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `PORT`                           | `5050`                  | Listen port. Not 5000: macOS Control Center binds that for AirPlay |
| `HOST`                           | `0.0.0.0`               | Listen address                                                     |
| `CORS_ORIGIN`                    | empty                   | Comma-separated allowlist. Empty means same-origin only            |
| `BEHIND_TLS`                     | `false`                 | Set `true` when players reach you over HTTPS. See below            |
| `GRACE_PERIOD_MS`                | `60000`                 | How long a disconnected player keeps their seat                    |
| `MAX_ROOMS`                      | `500`                   | Cap on concurrent rooms, bounding memory                           |
| `STATIC_ROOT`                    | `/app/web` in the image | Built client to serve. Empty serves the API alone                  |
| `MOVE_BURST` / `MOVE_PER_SECOND` | `20` / `2`              | Move rate limit, sized for a human                                 |
| `CHAT_BURST` / `CHAT_PER_SECOND` | `5` / `0.5`             | Chat rate limit, tighter                                           |
| `LOG_LEVEL`                      | `info`                  | pino level                                                         |

### `BEHIND_TLS`

Set it to `true` when players reach the server over HTTPS, including through a
reverse proxy that terminates TLS. It turns on the two security headers that
assume TLS — HSTS, and the CSP's `upgrade-insecure-requests`.

It defaults to `false` because those headers do not merely add nothing without
TLS, they break the app. `upgrade-insecure-requests` rewrites every asset request
to `https://`, so a server reached at `http://192.168.1.20:5050` answers with CSS
and JS URLs that have no TLS behind them: `ERR_SSL_PROTOCOL_ERROR`, and a blank
page. HSTS is merely dishonest by comparison — browsers ignore it over plain http.

Both are helmet defaults, which `apps/server/src/http.ts` now switches off unless
this flag says otherwise.

### Behind Traefik

`compose.traefik.yaml` is ready to use — replace the hostname, the cert resolver
and the network name:

```bash
docker compose -f compose.traefik.yaml up -d --build
```

**No WebSocket configuration is needed.** Traefik proxies the upgrade itself,
unlike nginx, where forgetting `Upgrade` and `Connection` headers is the classic
way to break Socket.IO. This is verified rather than assumed: the full Playwright
suite plays complete multi-player games through a real Traefik with only the four
routing labels in that file.

```bash
# What that verification looks like, against any deployed instance
E2E_BASE_URL="https://uno.example.com" npx playwright test
```

Three things that do matter:

- **`BEHIND_TLS=true`.** Traefik terminates TLS, so the container speaks plain
  HTTP while players arrive over HTTPS. Without the flag the app drops HSTS.
- **No `ports:` mapping.** Traefik reaches the container over the shared network.
  Publishing 5050 on the host adds a plain-HTTP way in that bypasses TLS.
- **`external: true` on the network.** Without it compose creates a second network
  that Traefik never watches, and every request 404s.

Rate limiting is keyed on the Socket.IO connection, not on the client IP, so it
behaves correctly when every request arrives from Traefik's address. `trustProxy`
is deliberately left off: nothing keys on IP, so enabling it would only let a
client spoof `X-Forwarded-For` into the logs.

On **Docker 29 or newer**, Traefik releases before v3.6 fail to read the Docker
provider at all — `client version 1.24 is too old` in the Traefik log, and every
route 404s. Either upgrade Traefik or set `DOCKER_API_VERSION=1.44` on it.

### One replica, on purpose

Game state lives in memory. There is no Redis adapter and no sticky-session
setup, so **do not scale past a single replica** — two processes would each hold
half the rooms and neither would know about the other. A restart drops games in
progress. At a few concurrent tables that is a deliberate trade for having no
datastore to run, back up, or pay for.

## Licence

ISC. See [LICENSE](LICENSE).
