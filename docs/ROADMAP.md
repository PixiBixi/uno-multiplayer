# Roadmap

What is built, what is not, and the defects that are known and still open. The
reasoning behind each delivered feature lives in the wiki - this file records the
order things happened in and what remains, not how they work.

## Delivered

- [x] Monorepo, toolchain, CI
- [x] `packages/engine` - rules, seeded RNG, property tests
- [x] `packages/protocol` - views, events, payload schemas
- [x] `apps/server` - rooms, seat sessions, reconnection, rate limiting
- [x] `apps/web` - SVG cards, four-seat table, lobby, chat
- [x] Playwright end-to-end tests across multiple browser contexts
- [x] Dockerfile and deployment
- [x] Match scoring: points target or fixed rounds, official card values
- [x] Sound: synthesised cues for play, draws, action cards, UNO, turn and endings
- [x] Blazing: an optional per-turn clock, with rounds that deal themselves
- [x] The Liar call-out: an optional table rule for a manual UNO penalty
- [x] Seven-Zero: an optional table rule where a 7 swaps hands and a 0 rotates them
- [x] Jump-in: an optional table rule for playing an identical card out of turn
- [x] Playing the card you drew - the official rule, on by default
- [x] End-of-match awards, counted from the event feed
- [x] English and French, with each language owning its own grammar
- [x] An error boundary, so a bad render explains itself instead of blanking
- [x] The lobby owns the table configuration, so a guest can see the rules first
- [x] Card themes: four card faces, chosen per player
- [x] Deploy it somewhere real - live at <https://uno.jdelgado.fr>

Where the reasoning for each lives:

| Feature                                  | Read                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| The rules, the four table rules, scoring | `openwiki/domain/rules-and-scoring.md`                   |
| Blazing, timers, rooms and seats         | `openwiki/domain/room-lifecycle.md`                      |
| Sound, card themes, language, layout     | `openwiki/architecture/client.md`                        |
| Views, events, engine invariants         | `openwiki/architecture/server-authority.md`              |
| One design document per feature          | `docs/superpowers/specs/`                                |

## Open

- [ ] **Your own hand falls below the fold on a phone** - see below
- [ ] Play a full game on the deployed instance with actual people
- [ ] A bot, so a table can be tried alone or filled to three

## Known issue: the hand is off-screen on a phone

Measured on an iPhone 13 viewport (390 × 844) with a game in progress:

```
horizontalOverflow: false      undersizedTapTargets: []
handCards: 7                   pageScrollsVertically: true
```

The good half holds - nothing overflows sideways and every tap target clears 44 px.
But the seven cards wrap onto a second row that the viewport cuts off, so a player
has to scroll to see their own hand, which is the one thing that should never be
hidden. The cause is above it: the deck, the direction pill, **Draw card** and the
three sort buttons each take a full row before the hand gets any height.

Scrolling the hand horizontally in one row is the likely fix, rather than letting it
wrap. Worth checking against a real browser's geometry rather than by eye - and worth
sampling _after_ transitions settle, since this project has twice been fooled by a
screenshot taken mid-fade.

## Two defects a screenshot could not have settled

Both came in as player reports and both were resolved by reading numbers out of a
real browser, after its animations had finished. `e2e/layout.spec.ts` and one spec in
`e2e/game.spec.ts` now hold the numbers. Recorded here because the method is the
lesson; the fixes themselves are described in `openwiki/architecture/client.md`.

**The language and card-theme controls were below the fold.** They sat at the bottom
of the home screen's left column, behind the name field, the match format, Blazing,
three house rules, the create button and the join form. Measured at 1440 × 900, that
column ran to 1202 px and the theme previews ended at **1272 px** - 372 px past a
900 px-tall window, with the page loaded and unscrolled. Players reported never
finding them. Meanwhile the right column held the card-values panel and then nothing:
330 px of content and roughly 490 px of void beneath it.

Both controls moved into that void. Measured again, same viewport: the previews now
run 428 → 478 px and the language chips 498 → 542 px, both fully inside the fold
without scrolling. At 430 × 940 the layout is one column, the two controls follow the
help panel, `scrollWidth` equals `innerWidth` at 430 px, and the previews keep a
44 px tap target. Nothing was shrunk or hidden to make room.

The column that crowded them out is gone: the match format, Blazing and the four
rules all live in the lobby now. The measurements above still hold - the controls
stayed in the second column, which is where players found them.

**The lobby then inherited the problem, and the same answer.** It took the whole
configuration on and roughly doubled. Measured at 390 × 844: the page runs 1732 px,
so it scrolls, and what matters is what does not need the scroll. The roster starts
inside the fold and **Start** ends inside it, because the settings went in below
rather than above; `scrollWidth` equals `innerWidth` at 390 px and nothing overflows
sideways; and the points table is capped at 338 px with its own scroll container,
asserted to really scroll rather than merely to declare an overflow it never uses.
The seats are what a lobby is for, so they are never what gets capped. Past 900 px it
is two columns, the rules sit to the right of the roster rather than under it, and
**Start** is inside a 900 px fold with the page unscrolled.

**The draw pile turned into a blank pale rectangle.** Reported with the fanned
opponent backs beside it drawing correctly, which pointed away from the card and
towards the pile. It was `.pile-draw::after` - the ghost card that peels off the top
on a draw. It declared `background: var(--bone)`, `inset: 0` and an animation from
0.55 opacity to 0, but no `opacity` of its own and no `animation-fill-mode`. With the
default `none`, the element reverts to its un-animated opacity the moment the 420 ms
animation ends: the initial value, **1**. And `.pile-draw` is deliberately never
removed, since `drawNonce > 0` for the rest of the game - so an opaque cream
rectangle covered the pile permanently after the first draw.

That explains every part of the report. The `UNO` text was still in the DOM, so
inspecting the markup found nothing; the fanned backs have no `::after`; and on
Letterpress the stock is `#efe9db` against the overlay's `#f5f1e8`, near enough that
the veil is invisible - which is why a check on that theme came back clean. Under
`prefers-reduced-motion` the animation is 0.01 ms, so the pile went pale immediately.
One line fixes it: `opacity: 0` in the base rule, as `.fx-flash` above it already
states for the same reason.
