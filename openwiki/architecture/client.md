# The client

React and Vite, in `apps/web`. It renders whatever the server pushed and emits
intents. There is no client-side navigation state that could fall out of step with
the game: `App.tsx` picks a screen from `state.connection` and what the server sent.

## The one seam that matters

`useGameSocket` returns `{ state, actions }`. Everything below — `Table`, `Hand`,
`GameOver`, the effect and sound hooks — depends on that shape and nothing else.

That is what would make offline play cheap: a second hook returning the same shape,
backed by the engine running in the tab. See
`docs/superpowers/specs/2026-08-09-bot-and-offline-analysis.md`.

## Layers, and why they are split

**`lib/` is pure.** Decisions live here as functions with no React in them:
`sounds.ts` decides which cue an event deserves, `play-effects.ts` which flourish,
`sort-hand.ts` how to order a hand, `describe-event.ts` what the log says,
`card-themes.ts` what a card face looks like. All are unit-tested without a browser.

**`hooks/` owns bookkeeping.** `useTableEffects` and `useTableSounds` both track
"what have I already reacted to", which is subtler than it sounds: a reconnect
arrives with the whole feed backlog at once, and replaying it would produce a storm
of animations and a minute of sound. Both start their high-water mark at whatever
is already on screen.

**`components/` and `screens/` render.** `PlayEffects` is deliberately presentational
and `aria-hidden`, because every fact it dramatises also appears in the accessible
log.

Note the two hooks read different sources on purpose. Effects read the **view**,
because a wild's burst needs the colour that was chosen and the feed may not have
caught up. Sound reads the **feed**, because a cue only needs the card's kind. That
asymmetry is intentional; do not "fix" it.

## Card themes

Four faces — classic, flat, letterpress, neon — chosen by **each player**, in
`localStorage` beside the hand-sort mode and the mute flag. It is a display
preference, not a table option: two people at the same table can run different ones
and the game is identical, so nothing about it crosses the wire. No protocol type, no
`room:create` field, no server code, no socket test.

Each theme's decisions are data in `lib/card-themes.ts` and `Card.tsx` reads them —
the same reason `palette.ts` exists. Only what needs a different _structure_ is a
branch in the component: whether the oval is drawn, whether the panel is filled or
outlined, whether the numeral carries a glow. A value that merely differs per theme
is a table entry.

Three rules constrain any fifth theme somebody adds:

- **The shape tokens stay.** Colour is never the only signal here, and a theme does
  not get to opt out. Where a pigment is too pale for its stock, the token keeps the
  colour and gains an outline — letterpress does this, because a yellow diamond on
  cream measures 1.55:1 and a shape nobody can see is the same as no shape.
- **The accessible label does not change with it.** The label is game state; the face
  is a preference. Asserted for all four themes in `Card.test.tsx`.
- **Contrast is measured, not judged.** `card-themes.test.ts` holds every theme but
  classic to 4.5:1 for the numeral against the ground directly beneath it, computed
  from the declared colours so no browser is needed. Classic is exempt in writing: it
  is the printed card everybody already has and its yellow measures 1.67:1, which is
  a property of that card and not of the theme mechanism.

The numbers were also verified against rendered pixels in Chromium — hide the glyph,
re-screenshot, and diff, so a glowing theme is measured against its own halo rather
than against the card behind it. That is what turned neon from the least legible of
the four into the second most: the glow became a blurred copy _behind_ the glyph
instead of a shadow through it. See the card themes section of the README for the
four figures.

The preference reaches every card through a context in
`components/CardThemeProvider.tsx` rather than a read inside `Card`, because the
cycler on the table has to repaint the hand, the discard pile and the draw pile at
once. `Card` also takes an optional `theme` prop, which only the home screen's
previews pass: each preview renders the real `Card` so it cannot drift from the face
it is offering.

## Sound

Everything is synthesised with the Web Audio API in `lib/audio-engine.ts` —
oscillators and envelopes, no audio files at all. No binaries in the repository, no
licences, and each sound is a few numbers to tune.

Two traps encoded there:

- An `AudioContext` is born suspended and stays mute until a user gesture. The
  first cue of a session races that unlock — measurement showed the context is not
  even constructed until then — so `play` resumes and _then_ emits.
- Endings come in pairs, `roundWon`/`roundOver` and `matchWon`/`matchOver`. One
  cue for both congratulates the loser.

Nothing in `audio-engine.ts` is unit-testable, since jsdom has no Web Audio. It is
checked in a real browser by wrapping `AudioContext` and asserting oscillators
actually start.

## Internationalisation

`i18n/` holds English and French. **Every catalogue entry that varies is a
function, not a template with holes in it.** That is the whole design.

English builds "Ana wins" from a name and an `s`; French builds "Ana gagne" from a
different stem, and "You win" becomes "Tu gagnes" where the verb changes rather
than the pronoun. English pluralises at zero, French does not — "0 cards" but
"0 carte". A catalogue of fragments joined by the caller can only ever express the
grammar of whichever language was written first, usually English and invisibly.

So the unit of translation is a whole sentence and each language owns how it is
built. Events a player performs all take `isYou`, because French needs it where
English does not: "Toi a posé" is wrong and has to become "Tu as posé". English
ignores the argument, which is stated once rather than argued with per parameter.

Adding a language means adding a file that satisfies `Messages`. The tests assert
that every catalogue covers exactly the same keys and leaves nothing empty, which
is the part that rots.

**`lib/` and `hooks/` are where a sweep for leftover English forgets to look.** A
pure module has no JSX in it, which makes it easy to read past — and two of them
kept their own English: `sort-hand.ts` had a `Record<HandSort, string>` of labels
beside the three keys `table.sortDealt`/`sortColour`/`sortValue` already covered, and
`game-reducer.ts` wrote every toast as a literal. Both are fixed, and the shape of
the fix is the rule for the next one: a pure module cannot read a context, so it
**takes `Messages` as a parameter** — `gameReducer(state, action, messages)`, exactly
as `describeEvent` does. Importing a catalogue into `lib/` or `hooks/` would pin the
language at build time and no control could change it. `useGameSocket` closes the
current catalogue over the reducer it hands `useReducer`.

## Accessibility, briefly

Colour is never the only signal — cards carry shape tokens in every one of the four
themes, and the log says in words what the animations dramatise. Tap targets are
44px, the card-theme controls included. The countdown is a live
region that only becomes assertive in its last seconds, because a polite update
every second would queue up behind itself in a screen reader. `prefers-reduced-motion`
removes the pulse but not the number, because the number carries information.

## Things that have gone wrong here before

- **A stale `dist/`** meant a new client against an old server; the view arrived
  without a field and the whole table went blank. There is now an error boundary
  outside `App`, so a bad render explains itself and offers a reload that rejoins.
- **Duplicated lookup tables.** Colour names and swatches were defined in four
  files each. They now live in `lib/palette.ts`. When you need a table in two
  places, that is the pattern.
- **Layout judged by eye.** Several defects were only visible by measuring computed
  styles or DOM geometry in a real browser — and one "bug" turned out to be a
  screenshot taken mid-transition. Sample after animations settle, or deliberately
  mid-flight at a timestamp computed from the keyframes.
- **An animation with no resting state.** `.pile-draw::after` is the ghost card that
  peels off the draw pile. It set `background: var(--bone)` and an animation running
  0.55 → 0 opacity, but no `opacity` of its own and no `animation-fill-mode` — so
  when the 420ms animation ended the element snapped back to the initial value, 1,
  and covered the pile with an opaque cream rectangle for the rest of the game (the
  class is never removed; `drawNonce > 0` forever). It was reported as the pile
  "rendering blank and pale". **Any decorative overlay states its own resting value
  in the base rule**, the way `.fx-flash` does; a keyframe's 100% is not a resting
  state unless the fill mode says so. Measured after the animation settles in
  `e2e/game.spec.ts`.
- **Controls at the bottom of a growing column.** The language and card-theme
  preferences ended 372px below a 900px fold once the home screen's left column had
  grown to seven blocks, while the right column held one panel and a screen-high
  void. Nobody found them. `e2e/layout.spec.ts` now measures both viewports; the
  cheapest fix for "it does not fit" is usually the empty half of the page, not
  making something smaller.
