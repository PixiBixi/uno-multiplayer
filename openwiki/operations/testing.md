# Testing

```bash
npm run verify   # lint + typecheck + unit tests
npm run e2e      # Playwright against a real build
```

Around 990 unit tests and 22 end-to-end specs. CI runs lint/format/types, the unit
suite on Node 22/24/26, coverage, e2e, and a Docker build-and-probe.

## Which tool for which claim

| Claim                               | Tested by                                                               |
| ----------------------------------- | ----------------------------------------------------------------------- |
| A rule holds for any game           | `fast-check` property tests in `packages/engine/src/invariants.test.ts` |
| A pure decision is right            | Plain unit tests beside the module in `lib/`                            |
| A room behaves over its lifecycle   | `Room` driven directly - synchronous, no clock                          |
| A timer fires when it should        | `RoomManager` with injected timers and an injected clock                |
| The wire actually carries something | Socket tests through a real Socket.IO connection                        |
| A layout works                      | Playwright, measuring geometry - not screenshots                        |
| A sound plays                       | A real browser with `AudioContext` wrapped                              |

Two projects are configured in `vitest.config.ts` - `node` and `web` (jsdom) -
because the server and the client resolve modules differently and need different
globals.

The engine is pure functions over immutable state, so each rule is a short unit test
with no network and no React, and the property tests sit on top of that suite rather
than replacing it. The conservation invariant alone would have caught the worst bug in
the predecessor project, where an in-place shuffle of a module-level array stripped 15
cards from the deck on every game - which is the argument for asserting it on every
intermediate state rather than only at the end.

## The blind spot to keep in mind

**Testing both ends of a chain proves nothing about the wire between them.** Two
bugs shipped through exactly this gap:

- `Room.nextRound()` had passing tests and the client emitted `game:nextRound`, but
  no `socket.on` handler existed. The button silently did nothing.
- The view carried match standings and `GameOver` was tested with standings handed
  to it, but nothing asserted the view _arriving over a socket_ had them. A stale
  server produced a crash no test could have caught.

`apps/server/src/sockets/handlers-match.test.ts` and `handlers-leave.test.ts` close
both by driving real connections. When adding a client action, write the socket
test, not only the `Room` test. `handlers-liar.test.ts`,
`handlers-sevenzero.test.ts`, `handlers-jumpin.test.ts` and `handlers-drawncard.test.ts`
do the same for the four table rules - each drives a real round until the server offers
the move, then plays it over the wire. All four carry an explicit 20s timeout and raise
`MOVE_BURST`, because a scripted round outruns both vitest's 5s default and a rate
limit sized for a person.

The drawn-card drive is the fourth, and it hunts its moment by DRAWING on every turn
rather than playing: the sub-state exists only after a voluntary draw whose card happens to
be playable, so a drive that played its cards would almost never reach it. Like the jump-in
drive it deals further rounds rather than giving up at the end of one, for the same reason -
the seed is random per test and a test that fails on an unlucky shuffle is a test nobody can
read.

The jump-in drive differs in two ways worth copying if you add a fifth option. It
cannot play "around" the move it is hunting the way the Seven-Zero drive does - the
chance to jump exists only while one particular card is on top, so the check happens
after every single move. And it deals further rounds rather than giving up at the end
of one: the room's seed is random per test, whether the twin of a card ever reaches a
hand at a usable moment is a property of the deal, and a test that fails on an unlucky
shuffle is a test nobody can read. Two flakes of exactly that shape were found by
running the file fourteen times, not once - the other being a jumper landing on one
card, which back then made the hand grow rather than shrink, because the forgotten-UNO
penalty was charged on the spot.

## Test your tests

Several tests here were confirmed to _catch_ the defect rather than merely pass
beside it, by reintroducing the bug and watching them fail. It takes a minute and
is the difference between a guard and a decoration:

- Deleting the `game:nextRound` handler fails four socket tests.
- Forcing a play instead of a draw on timeout fails two Blazing tests.
- Bypassing the statistics funnel on the move path fails two tally tests.
- Dropping the chosen table rules on the `room:create` path fails two Liar socket
  tests; making a call-out legal against a seat that is not vulnerable fails twelve
  across the engine, the room and the wire; hiding the call-out button while the
  move is offered fails four in the browser suite; and withholding the late `callUno`
  from a vulnerable seat off turn fails four across the engine and the wire.
- Ten mutations were re-run against Seven-Zero. The instructive ones: ignoring
  `swapWith` in `sameMove` fails seven, rotating against `direction` fails five,
  making a departed seat a legal swap target fails six, deriving no hands-moved event
  in the room fails four, charging a forgotten UNO on a play that permutes hands
  fails five, and never rendering the target picker fails three in the browser suite.
  Worth noting what the property tests did **not** catch: swapping with a seat that
  has left conserves the deck perfectly well, so only the unit tests refuse it.
- Eleven mutations were re-run against jump-in. The instructive ones: making a wild
  jumpable fails three, matching on value while ignoring colour fails six, allowing a
  jump-in while a draw is pending fails three, leaving `currentSeat` where it was
  fails nine, not beginning the jumper's turn - so a stale UNO call covers the jump -
  fails two, dropping the `rules.jumpIn` check in either `legalMoves` or the off-turn
  exemption fails three and four, deriving no `jumpedIn` in the room fails two,
  removing the Zod flag fails nine and the typecheck with it, offering jump-ins to the
  seat on turn as well fails one, and never rendering the client's note fails one.
  Two of those are worth dwelling on. Leaving `currentSeat` unchanged after a jump-in
  fails nine unit tests and **not one property test** - play still terminates and the
  deck still conserves, so only tests that say where the turn should be will refuse
  it. And allowing a jump-in during a pending draw was caught by two unit tests but
  originally by no property test at all, because the harness rarely reaches a stacked
  draw with the right twin in the right hand; the property that asserts it directly
  over every intermediate state was added for that reason and catches it.

- Twelve mutations were re-run against playing the drawn card. The instructive ones:
  offering the whole hand instead of the drawn card fails 6, leaving `drawnCard` set across
  a turn change fails 33, dropping the `pass` from `forceTurnMove` fails 2, granting the
  decision after `acceptDraw` fails 3, granting it on an unplayable card fails 5, removing
  the Zod `pass` branch fails 3 and takes the socket drive with it, deriving no
  `turnPassed` fails 2, never rendering the End turn control fails 2, and defaulting the
  option off - treating the official rule as a house rule - fails 14.

  Three of them are worth dwelling on, because two of the guards were decorations until the
  mutant said so. Reordering `forceTurnMove` to prefer `acceptDraw` and `draw` ahead of
  `pass` fails **nothing**, and correctly: neither is on offer in the sub-state, so the
  reordering cannot change what is chosen - the mutation that bites is deleting `pass`
  from the list altogether. Removing the guard that stops `armTurn` restarting the clock
  also failed nothing at first, because with a frozen fake clock `now() + turnSeconds`
  recomputes to the number it replaced; the drive now burns a second of fake time per turn,
  and the mutant fails. And allowing a jump-in mid-decision failed only a unit test at
  first, even at 600 property runs, because the harness took every jump-in on offer - so no
  twin was ever still in a hand by the time somebody drew, and the property asserting none
  is offered was vacuously true. Declining one jump-in in three fixed it, and the property
  now catches the mutant at 300 runs.

- Six mutations were re-run against the lobby owning the configuration. Letting a
  non-host configure fails 2, one of them over a real socket; configuring after the deal
  fails 3; broadcasting to the sender only fails 6; gating on `canStart` instead of on the
  match having begun fails 4; and replacing the shared Zod schemas with `z.any()` fails 6,
  four in the protocol and two on the wire.

  The sixth is the interesting one. Rendering a guest's rule list from a second hardcoded
  copy fails 4 - but only because the copy was written the way a stale copy really goes
  wrong, omitting jump-in. A duplicate that is still character-identical to the original
  cannot be caught behaviourally at all, and the test says so in its own comment rather
  than implying more reach than it has. What it does catch is the two modes disagreeing on
  the rules, the labels or their order, which is the moment a copy stops being harmless.

  Also worth noting what a Room-level test cannot reach. `room:configure` with a protocol
  type, a schema and a client emit but no `socket.on` behind it is a control that silently
  does nothing, and socket.io answers an unknown event by never calling the ack - so the
  first assertion in the socket file is that an answer arrives at all. That is the failure
  this repository has already shipped once.

Equally worth knowing: some things **cannot** drift and so cannot be tested for. The
help panel reads `cardPoints` from the engine, and so do its tests - change the
engine and both move together. There is nothing to catch, which is the point.

## Traps this suite has already fallen into

- **Timeouts under load.** Property tests measuring ~1.1s alone crossed vitest's 5s
  default while the rest of the suite competed for cores, failing runs that had
  found nothing wrong. Long-running suites carry explicit generous timeouts rather
  than reduced coverage.
- **Rate limits.** Playing a round at machine speed outruns a budget sized for a
  human. Tests that do so raise `MOVE_BURST`; the limiter has its own tests.
- **Views landing out of step.** A move broadcasts to every player but they do not
  arrive at the same instant. Waiting only on the mover's view leaves the other
  stale, which silently ends a driving loop mid-round.
- **Screenshots taken mid-animation.** A sort control looked wrong in a screenshot
  and was correct; measuring computed styles after transitions settle showed no bug
  existed. Measure, and measure at a moment you chose.
- **An infinite animation never resolves `finished`.** Specs settle the page by
  awaiting `document.getAnimations()` before measuring anything. Two animations on the
  table loop forever, the urgent clock and the lit south bar, and awaiting theirs times
  the spec out rather than failing it. `e2e/settle.ts` filters
  `iterations === Infinity` out; neither of those moves layout. It is a shared module
  because it was not: one copy learned the filter, the copy inside `game.spec.ts` did
  not, and the next forever-looping animation hung it for thirty seconds.
- **jsdom is not a browser.** No `localStorage` (there is a shim in `test-setup.ts`),
  no Web Audio, and `select()` does not move focus the way a real browser does - a
  difference that surfaced a genuine implicit dependency in the clipboard fallback.
- **`<details>` keeps its content in the DOM when closed.** "Collapsed" is a question
  about the `open` property, not about whether text can be found.

## End-to-end

Playwright drives one browser context per player, so hidden information is tested
for real: one spec asserts no opponent's card is ever in another player's document.
Specs run against a production build served by the real server, because a dev
server exercises a different artefact from the one that ships.
