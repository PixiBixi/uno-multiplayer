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

| Point                         | Decision                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Draw stacking                 | **Strictly same type**: +2 answers +2, +4 answers +4, no crossover. Colour is irrelevant when raising.                                                                   |
| Reverse with 2 active players | Acts as a skip (official rule).                                                                                                                                          |
| Starting card                 | The first number card from the top of the shuffled deck. Deterministic, no unbounded loop.                                                                               |
| Drawing voluntarily           | Ends your turn. No "you may now play the card you drew" sub-state.                                                                                                       |
| Calling UNO                   | Legal only during your own turn, before playing. Going down to one card without it costs two cards — automatically, unless the table plays with the Liar call-out below. |
| Playing out of turn           | Not possible, unless the table plays with jump-in below.                                                                                                                 |
| Empty draw pile               | The discard pile minus its top card is reshuffled into a new draw pile. If that is still not enough, the draw is capped at what is available.                            |
| Victory                       | First empty hand wins the round; the round ends immediately.                                                                                                             |
| Card conservation             | Hands + draw pile + discard pile always total 108 cards with distinct ids. Enforced by a property test.                                                                  |

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

Not implemented, deliberately: the strict Mattel +4 challenge, which needs a bluff
UI and hand inspection.

### The Liar call-out

An optional house rule, chosen by the host when creating the table and off by
default: **forgetting to call UNO costs nothing unless somebody says so.** The
automatic penalty removes the part of UNO people actually enjoy — watching each
other — so this hands it back.

A seat becomes open to an accusation the moment it drops to one card without having
called UNO. Any other player may then press **Liar!** beside that seat, and the
accused draws the same two cards the automatic rule charged.

| Point                       | Decision                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How long the window is open | Until the end of the accused seat's **next** turn. Unbounded, a player could be accused ten minutes later, which is not a game but a trap.              |
| Whose turn may accuse       | Anybody's. This is the only move in the game that is legal **off turn** — an accusation you could make only on your own turn would be useless.          |
| A wrong accusation          | Cannot happen: the move is only offered while the target really is open to one. Penalising a bad guess punishes paying attention badly, which is worse. |
| The turn order              | Untouched. A call-out is a side effect on one hand and never ends a round, which keeps it out of the turn-advance logic entirely.                       |
| Escaping it                 | Call UNO on your own next turn, before playing. A late call still counts.                                                                               |
| How it is tracked           | A `vulnerable` flag on the seat, not a timer. The window is measured in turns, which the engine already counts, and the engine has no clock.            |

### Seven-Zero

The other optional house rule, also off by default: **a 7 swaps your hand with a
player you choose, and a 0 sends every hand one seat along** in the current
direction of play.

Choosing whom to swap with is a second decision after playing the card, exactly like
choosing a colour after a wild, so it reuses that shape. `legalMoves` emits one
`play` move per legal target and the client renders a picker from what it was
offered — it neither knows that a 7 swaps nor who a legal target is.

| Point                      | Decision                                                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who may be swapped with    | Any other **active** seat. Not one that has left — its hand went back to the pile, so swapping into it would hand somebody a free win — and not one merely disconnected either.                                                                             |
| Two players                | A 7 has exactly one legal target, so it always swaps. Not quietly made a no-op: that would silently change what the card is worth.                                                                                                                          |
| A 0 with two players       | Rotating two hands is a swap, which is correct.                                                                                                                                                                                                             |
| Direction                  | The rotation follows `direction`, so a reverse played earlier in the round changes where the hands go.                                                                                                                                                      |
| A 7 or 0 as your last card | The round ends and no hand moves. First empty hand wins, unconditionally — a 7 that could swap the win away would be unplayable as a last card, which is a trap rather than a rule.                                                                         |
| UNO after hands move       | Whoever is left holding one card uncalled becomes open to a call-out, if the table also plays the Liar rule. Nobody draws the automatic penalty for it: you cannot fail to declare a hand you were handed, and a window is escapable on your own next turn. |
| Card conservation          | Untouched. Hands are permuted and nothing is created, which the property tests assert across generated games with the option on.                                                                                                                            |
| Nobody else active         | A 7 falls back to an ordinary card rather than becoming unplayable, and a 0 rotates nothing.                                                                                                                                                                |

### Jump-in

The third optional house rule, also off by default: **holding a card identical to
the one just played, you may lay it down out of turn** — and play then carries on
from you. Identical means same colour _and_ same value, or same colour and the same
kind of action card.

It is the only rule here that touches the assumption the rest of the engine rests
on, that only the seat on turn can act, and the only one that MOVES the turn. A
jump-in is a `play` like any other, submitted by a seat whose turn it is not; the
client renders it because the server put it in that seat's `legalMoves` and for no
other reason.

| Point                   | Decision                                                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wilds                   | Never jumpable, in either position. A wild has no colour, so matching on kind alone would make every wild identical to every other one.                                                                                                                                        |
| Whose turn afterwards   | The jumper's — a jump-in **is** their turn. Play continues in the current direction from their seat, and the seats in between simply lose their turn. That is the point of the rule.                                                                                           |
| The card's own effect   | Applies from the jumper's seat, exactly as it would have on their own turn: a jumped skip skips the seat after them, a jumped reverse turns the table round from them, a jumped 7 on a Seven-Zero table offers its swap targets.                                               |
| While a draw is pending | **Refused.** A stacked +2/+4 has strict same-type answer rules of its own, and a jump-in interleaved with them would make "strictly same type" mean nothing. The seat on turn keeps its pending-draw moves and nobody else is offered anything.                                |
| Calling UNO             | You cannot. An off-turn seat is offered call-outs and jump-ins and nothing else, so a jump-in that lands you on one card is always an uncalled UNO — two cards, or an open window on a Liar table. A declaration made on an earlier turn does not cover it.                    |
| A 0                     | Can never be jumped, and not by rule: a UNO deck holds one 0 per colour, so a 0 has no twin. Every other card has exactly one.                                                                                                                                                 |
| Races                   | The server is the only authority and applies whichever move it reads first; the loser gets `illegal_move`, which the client already reports. Two seats can never hold a jump-in against the same card, since its twin is in one place only.                                    |
| Termination             | Every jump-in spends a card, and no jump-in can be answered by another on the same card, so play always progresses. Asserted by the property tests under a policy that takes every jump-in on offer — the unfavourable one, since jumping down to one card cannot be declared. |

## Language

The interface is available in English and French. A browser asking for French gets
it; a chip on the home screen switches instantly and the choice is remembered. The
chips sit in the right-hand column, under the card-values panel.

Every catalogue entry that varies is a function rather than a template, because a
template can only express the grammar of whichever language was written first.
English builds "Ana wins" from a name and an s; French builds "Ana gagne" from a
different stem, and "You win" becomes "Tu gagnes" where the verb changes rather
than the pronoun. English pluralises at zero and French does not. Adding a language
means adding one file that satisfies `Messages`; the tests check that no catalogue
has drifted from another.

**`lib/` and `hooks/` are not exempt, and that is where the first sweep stopped.**
Two sets of strings survived it because the search covered `components/` and
`screens/` only: the hand-sort labels, which `lib/sort-hand.ts` kept in a
`Record<HandSort, string>` of its own right beside the three keys the catalogues
already had, and every toast title and detail, which `hooks/game-reducer.ts` held as
English literals. Both now come from the catalogue.

A pure module cannot read a React context, so the catalogue arrives as an argument:
`gameReducer(state, action, messages)`, the same shape
`describeEvent(event, nameOf, mySeat, messages)` already had. Importing one
catalogue into a reducer instead would pick a language at build time and no chip
could change it. `useGameSocket` closes the current catalogue over the reducer it
hands to `useReducer`, so switching language switches the language of the next toast.

## Card themes

Four card faces, chosen per player: **Classic**, **Flat**, **Letterpress** and
**Neon**. Pick one from the four miniature previews on the home screen — in the
right-hand column beneath the card values, beside the language chips — or cycle
through them from the button next to the mute toggle on the table.

It is a display preference, not a table option, and that is the whole reason it is
cheap. A theme changes what one player sees, so two people at the same table can run
different ones and the game is identical. Nothing crosses the wire: no `TableRules`,
no `room:create` field, no protocol type, no server code. It lives in `localStorage`
beside the hand-sort mode and the mute flag, and an unrecognised stored value falls
back to Classic rather than to a hand of blank cards.

Each theme's decisions are data in `apps/web/src/lib/card-themes.ts` — ground, ink,
numeral font and size, whether the oval is drawn, how the tokens are placed — and
`Card.tsx` reads them. Only what needs a different _structure_ is a branch there:
the oval, the stroked border, the glow. Same reasoning as `lib/palette.ts`.

Two things hold in all four:

- **The colourblind shape tokens stay.** Circle, square, triangle, diamond, per
  colour. Colour is never the only signal in this project, and a theme does not get
  to opt out of that. Where a pigment is too pale for its stock to show a shape —
  yellow on cream measures 1.55:1 — the token keeps the colour and gains an ink
  outline rather than losing either.
- **The accessible label never changes.** "Red 7", "Wild draw four — not playable
  this turn". That is game state; the face it is drawn on is not. A test asserts the
  label is identical under all four themes.

### Neon had to be fixed before it could ship

It was first drawn as the boldest of the four with an explicit caveat: the glow cost
contrast and it was the least legible of them. Offering an option already known to be
the weakest is not a choice, it is a trap. Two changes inverted that, and both were
measured rather than eyeballed — the numeral is cream on a near-black ground, and the
glow is a blurred copy **behind** the glyph at half opacity rather than a shadow
bleeding through it, so the colour the eye receives inside the numeral is the
numeral's own.

Measured from rendered pixels in Chromium, on the fully-covered interior of a
numeral against the ground directly beneath it — hiding the glyph and re-sampling,
so a glowing theme is measured against its own halo and not against the card:

| Theme       | Worst numeral contrast | Where                                 |
| ----------- | ---------------------- | ------------------------------------- |
| Classic     | 1.67:1                 | yellow numeral on the bone oval       |
| Flat        | 4.98:1                 | white numeral on red                  |
| Letterpress | 15.6:1                 | ink numeral on paper stock            |
| Neon        | 5.3:1                  | cream numeral against the yellow glow |

Neon is now the second most legible of the four rather than the worst. The numbers
are the 5th percentile of fully-covered glyph pixels; the single worst pixel sits
around 2% lower, which is the screenshot encode rounding rather than anything a
player can see. Antialiased edge pixels are excluded on purpose — their ratio is a
fact about antialiasing, not about legibility.

The floor for the three new themes is 4.5:1 on every colour, asserted in
`apps/web/src/lib/card-themes.test.ts` from the same declared colours the browser
paints — so it holds without a browser and cannot rot. `palette.test.ts` fails if
those values ever drift from `tokens.css`.

**Classic is exempt, deliberately and in writing.** It is the card everybody already
has — a pigment numeral on a rotated bone oval — and the requirement was that it look
exactly as it does today, so a player who never opens the preference notices nothing.
Its yellow at 1.67:1 is a property of the printed card, and Flat exists partly as the
answer for anyone who wants the legible version of it.

Flat's light ink is pure white rather than the printed cream for the same measured
reason: on the fixed red pigment, cream reaches 4.42:1 and no ink choice on that
ground clears 4.5, while white reaches 4.98:1.

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
- [x] The Liar call-out: an optional table rule for a manual UNO penalty
- [x] Seven-Zero: an optional table rule where a 7 swaps hands and a 0 rotates them
- [x] Jump-in: an optional table rule for playing an identical card out of turn
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

### Two defects a screenshot could not have settled

Both came in as player reports and both were resolved by reading numbers out of a
real browser, after its animations had finished. `e2e/layout.spec.ts` and one spec
in `e2e/game.spec.ts` now hold the numbers.

**The language and card-theme controls were below the fold.** They sat at the
bottom of the home screen's left column, behind the name field, the match format,
Blazing, three house rules, the create button and the join form. Measured at
1440 × 900, that column ran to 1202 px and the theme previews ended at **1272 px** —
372 px past a 900 px-tall window, with the page loaded and unscrolled. Players
reported never finding them. Meanwhile the right column held the card-values panel
and then nothing: 330 px of content and roughly 490 px of void beneath it.

Both controls moved into that void. Measured again, same viewport: the previews now
run 428 → 478 px and the language chips 498 → 542 px, both fully inside the fold
without scrolling. At 430 × 940 the layout is one column, the two controls follow
the help panel, `scrollWidth` equals `innerWidth` at 430 px, and the previews keep a
44 px tap target. Nothing was shrunk or hidden to make room.

**The draw pile turned into a blank pale rectangle.** Reported with the fanned
opponent backs beside it drawing correctly, which pointed away from the card and
towards the pile. It was `.pile-draw::after` — the ghost card that peels off the top
on a draw. It declared `background: var(--bone)`, `inset: 0` and an animation from
0.55 opacity to 0, but no `opacity` of its own and no `animation-fill-mode`. With
the default `none`, the element reverts to its un-animated opacity the moment the
420 ms animation ends: the initial value, **1**. And `.pile-draw` is deliberately
never removed, since `drawNonce > 0` for the rest of the game — so an opaque cream
rectangle covered the pile permanently after the first draw.

That explains every part of the report. The `UNO` text was still in the DOM, so
inspecting the markup found nothing; the fanned backs have no `::after`; and on
Letterpress the stock is `#efe9db` against the overlay's `#f5f1e8`, near enough that
the veil is invisible — which is why a check on that theme came back clean. Under
`prefers-reduced-motion` the animation is 0.01 ms, so the pile went pale
immediately. One line fixes it: `opacity: 0` in the base rule, as `.fx-flash` above
it already states for the same reason.

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
