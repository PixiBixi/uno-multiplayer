# The client

React and Vite, in `apps/web`. It renders whatever the server pushed and emits
intents. There is no client-side navigation state that could fall out of step with
the game: `App.tsx` picks a screen from `state.connection` and what the server sent.

## The one seam that matters

`useGameSocket` returns `{ state, actions }`. Everything below - `Table`, `Hand`,
`GameOver`, the effect and sound hooks - depends on that shape and nothing else.

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

## The lobby owns the table configuration

`Home.tsx` collects a name and a game code. Everything about the table - the goal, the
pace, the four rules, and the points table in full - is in `Lobby.tsx`, where the host
adjusts it while waiting and everybody about to play can read it. `Home` used to carry 21
controls and 2.42 phone screens with the game-code field last, which is the wrong order
for a screen most people arrive at in order to join - on three players, two are joining.
It is now 10 controls and 1.25 screens at 390 × 844, with the code field at y=391
instead of below the fold.

The rule explanations sit behind a per-rule disclosure, because four paragraphs on
permanent display is what made the home screen a wall of text, and in the lobby the
reader has already chosen to look. The points table is the exception and is shown in
full: the host is choosing a points target two panels up, and "how many rounds does
500 take" is what those numbers answer.

Three constraints hold that in place:

- **One component for both modes.** `TableRulesPanel` holds the rule list, its labels and
  its explanations, and is rendered for the host and for a guest. A second read-only copy
  passes every test the day it is written and then goes stale - a fifth rule added to the
  host's switches and forgotten in the guest's would leave half the table reading a game
  nobody is playing, and no type checker can see it. Its own test asserts the two modes
  agree on the rules, the labels and the order, which is the property a drifted copy
  breaks; a copy still character-identical to the original is behaviourally undetectable
  and the test says so rather than pretending otherwise.
- **Read-only is the absence of a control, not a disabled one.** `onChange` being absent
  is what decides, so a guest's panel renders no input at all and there is nothing for a
  stray event to reach. A greyed checkbox would also tell a guest "you could change this,
  but not now", which is false, and it drops out of the tab order on the one surface where
  reading is the whole point.
- **Every control renders from the lobby view**, never from local state, so a change the
  server refuses reverts itself instead of leaving the screen disagreeing with the table.
  The only state held locally is what the wire cannot carry: the inactive goal variant's
  number, and the seconds to restore when Blazing is switched back on. The visible cost is
  one round trip before a switch moves. Playwright's `.check()` will not tolerate that and
  the specs use `.click()` - the shorthand failing is this design showing through.

Whether the host's controls appear at all is `lobby.configurable`, which the server derives
from the match having begun. It is presentation; the server checks the same condition again
when the event arrives.

Configuring the table is the lobby's job, but **stating what it plays by is also the
table's**. `RulesInPlay` renders a strip at the foot of the opponents rail from `view.rules`, which is why that
field is on `PlayerView` and not only on `LobbyView` - see
[Server authority](server-authority.md#changing-things-here). It shows **all four rules
always, with their state**, and the first attempt did the opposite: only the unusual ones,
on the argument that a strip repeating itself every game becomes noise. The argument is
sound and the design still failed, for a reason worth keeping - an ordinary table then
rendered nothing, and nothing is indistinguishable from a feature that was never deployed.
The person who asked for it looked at a table and could not tell. A confirmation that costs
one row is worth more than a row saved. State is carried by the word, not the tick: the
mark is `aria-hidden` and each chip carries an on/off word in a visually-hidden span, the
same reason the card faces carry shape tokens.

Card theme and language stayed on the home screen, because they are not table
configuration - see below.

## Card themes

Five faces - poster, classic, flat, letterpress, neon - chosen by **each player**, in
`localStorage` beside the hand-sort mode, the mute flag and the palette. An unrecognised
stored value falls back to the default rather than to a hand of blank cards.

`poster` is the one that ships: the pigment fills the card edge to edge, the numeral
drops into the bottom-left corner at poster scale with its baseline BELOW the viewBox so
the card's own border crops it, and the shape token moves to the top-right where a fanned
hand does not cover it. It is the only face whose `layout` is `'corner'` and the only one
whose `stock` is `'pigment'` rather than a colour - a face with no edge of its own, where
the gap between cards does the separating.

`classic` is no longer the default, deliberately: it is the printed card, its yellow
numeral measures 1.67:1, and a face that fails a contrast floor is not one to ship to
somebody who never opened the preference. It stays on offer for anyone who wants it. It is a display
preference, not a table option: two people at the same table can run different ones
and the game is identical, so nothing about it crosses the wire. No protocol type, no
`room:create` field, no server code, no socket test.

A player picks one from the previews on the home screen - a two-up grid in the
right-hand column, each card labelled with its name and what it is for - or cycles
through them from the button next to the mute toggle in the table's masthead.

Each theme's decisions are data in `lib/card-themes.ts` and `Card.tsx` reads them -
the same reason `palette.ts` exists. Only what needs a different _structure_ is a
branch in the component: whether the oval is drawn, whether the panel is filled or
outlined, whether the numeral carries a glow. A value that merely differs per theme
is a table entry.

Three rules constrain any fifth theme somebody adds:

- **The shape tokens stay.** Colour is never the only signal here, and a theme does
  not get to opt out. Where a pigment is too pale for its stock, the token keeps the
  colour and gains an outline - letterpress does this, because a yellow diamond on
  cream measures 1.55:1 and a shape nobody can see is the same as no shape.
- **The accessible label does not change with it.** The label is game state; the face
  is a preference. Asserted for every theme in `Card.test.tsx`.
- **Contrast is measured, not judged.** `card-themes.test.ts` holds every theme but
  classic - the default included, which is the point of changing it - to 4.5:1 for the numeral against the ground directly beneath it, computed
  from the declared colours so no browser is needed. Classic is exempt in writing: it
  is the printed card everybody already has and its yellow measures 1.67:1, which is
  a property of that card and not of the theme mechanism.

The numbers were also verified against rendered pixels in Chromium - hide the glyph,
re-screenshot, and diff, so a glowing theme is measured against its own halo rather
than against the card behind it:

| Theme       | Worst numeral contrast | Where                                 |
| ----------- | ---------------------- | ------------------------------------- |
| poster      | 4.98:1                 | white numeral on red                  |
| classic     | 1.67:1                 | yellow numeral on the bone oval       |
| flat        | 4.98:1                 | white numeral on red                  |
| letterpress | 15.6:1                 | ink numeral on paper stock            |
| neon        | 5.3:1                  | cream numeral against the yellow glow |

The figures are the 5th percentile of fully-covered glyph pixels; the single worst
pixel sits around 2% lower, which is screenshot encode rounding rather than anything
a player can see. Antialiased edge pixels are excluded on purpose - their ratio is a
fact about antialiasing, not about legibility.

That measurement is what turned neon from the least legible of the four into the
second most. It was first drawn as the boldest with an explicit caveat that the glow
cost contrast, and offering an option already known to be the weakest is not a choice
but a trap. Two changes inverted it: the numeral became cream on a near-black ground,
and the glow became a blurred copy _behind_ the glyph at half opacity rather than a
shadow bleeding through it, so the colour the eye receives inside the numeral is the
numeral's own. Flat's light ink is pure white rather than the printed cream for the
same measured reason - on the fixed red pigment cream reaches only 4.42:1, while
white reaches 4.98:1.

`palette.test.ts` fails if any of those declared colours ever drift from
`tokens.css`, so the floor cannot rot behind a passing suite.

The preference reaches every card through a context in
`components/CardThemeProvider.tsx` rather than a read inside `Card`, because the
cycler on the table has to repaint the hand, the discard pile and the draw pile at
once. `Card` also takes an optional `theme` prop, which only the home screen's
previews pass: each preview renders the real `Card` so it cannot drift from the face
it is offering.

## Sound

Everything is synthesised with the Web Audio API in `lib/audio-engine.ts` -
oscillators and envelopes, no audio files at all. No binaries in the repository, no
licences, and each sound is a few numbers to tune.

Two traps encoded there:

- An `AudioContext` is born suspended and stays mute until a user gesture. The
  first cue of a session races that unlock - measurement showed the context is not
  even constructed until then - so `play` resumes and _then_ emits.
- Endings come in pairs, `roundWon`/`roundOver` and `matchWon`/`matchOver`. One
  cue for both congratulates the loser.

Nothing in `audio-engine.ts` is unit-testable, since jsdom has no Web Audio. It is
checked in a real browser by wrapping `AudioContext` and asserting oscillators
actually start.

## Palette

Paper, ink, or the machine's own setting, in `localStorage` beside the card face.
`ColourModeProvider` writes `data-theme` on the document root, which is what `tokens.css`
keys its two explicit palettes on; `system` REMOVES the attribute rather than setting it
to anything, because the media query is the fallback and an attribute present but
matching neither palette is a trap for the next selector written against it. It sets
`color-scheme` alongside, or a page forced to ink still draws light native scrollbars.

`system` is the default and a real option: somebody who told their OS they want dark has
already answered. The other two exist because that setting is often not a preference
about a game - a laptop on a schedule flips at sunset - so the switch is on the home
screen AND in the table's masthead, reachable mid-match.

Sound is on by default, with a mute toggle in the masthead persisted in `localStorage`.
Nothing can play before the click that creates or joins a table, so opening the page
is never a surprise.

## Internationalisation

`i18n/` holds English and French. A browser asking for French gets it; a chip on the
home screen - right-hand column, under the card-values panel - switches instantly and
the choice is remembered. Like the card theme it is a per-player display preference
that crosses no wire.

**Every catalogue entry that varies is a function, not a template with holes in it.**
That is the whole design.

English builds "Ana wins" from a name and an `s`; French builds "Ana gagne" from a
different stem, and "You win" becomes "Tu gagnes" where the verb changes rather
than the pronoun. English pluralises at zero, French does not - "0 cards" but
"0 carte". A catalogue of fragments joined by the caller can only ever express the
grammar of whichever language was written first, usually English and invisibly.

So the unit of translation is a whole sentence and each language owns how it is
built. Events a player performs all take `isYou`, because French needs it where
English does not: "Toi a posé" is wrong and has to become "Tu as posé". English
ignores the argument, which is stated once rather than argued with per parameter.

Adding a language means adding a file that satisfies `Messages`. The tests assert
that every catalogue covers exactly the same keys and leaves nothing empty, which
is the part that rots.

**A pure module cannot read a context, so it takes `Messages` as a parameter.**
`gameReducer(state, action, messages)`, `describeEvent(event, nameOf, mySeat, messages)`,
`cardLabel(card, disabled, messages)`. Importing a catalogue into `lib/` - or into an
exported function in `components/` - would pin the language at build time and no
control could change it. `useGameSocket` closes the current catalogue over the reducer
it hands `useReducer`.

### How to know the sweep is finished

Three sweeps have now declared this complete. The first two were wrong, and both were
wrong the same way: they grepped for the handful of strings they had just fixed, found
none, and reported zero English left. That proves a fix was applied and nothing else.

So the question is settled by tests rather than by looking, and there are two of them
because neither is sufficient alone:

- **`i18n/no-english.test.ts`** parses every module in `components/`, `screens/` and
  `App.tsx` with the TypeScript compiler and makes every string literal justify
  itself. Two rules: nothing a person reads or a screen reader speaks - JSX text, and
  `aria-label`, `title`, `placeholder`, `alt` - may contain a word; and no literal
  anywhere in those files may read as English, meaning a phrase, a trailing ellipsis,
  or a lone SHOUTED or Capitalised word. The syntax is what decides: `aria-label`
  reaches a human, `className` does not, and `'btn btn-primary'` is two English words
  to any heuristic that does not know which attribute it sits in. Lower-case single
  words are deliberately allowed, because `'circle'`, `'stroke'` and `'wild4'` are
  what these modules are made of. `UNO` is the one allowed word: it is the brand.
- **`e2e/i18n.spec.ts`** plays a game in a `fr-FR` browser and searches the rendered
  page - visible text _and_ every accessible name - for a list of English-only words.
  A string can be absent from every component and still arrive in English from a table
  two modules away, which is exactly what happened.

Three habits of a missed string, all found this way:

- **A lookup table in `lib/`.** `palette.ts` held `COLOR_NAME`, an English
  `Record<Color, string>` that `Card`, `CentreStack` and `ColourPicker` all read - so
  a French player's discard pile said "Green in play" and every card in their hand
  announced itself as "Red 7". It is gone; naming is `messages.colour()` and
  `messages.card()`, and `palette.ts` keeps only values. `sort-hand.ts` had made the
  same mistake with its labels earlier.
- **A `Record` rendered through a variable.** `Seat.tsx` kept `'reconnecting…'` and
  `'left the game'` in a `Record<SeatStatus, string>`. No JSX, no attribute, nothing
  for a reviewer's eye to catch - which is why the guard checks every literal in the
  file and not only the ones in markup.
- **An accessible name.** The largest class by far, and invisible to anyone reading
  the screen: card labels, `Choose the new colour`, `Match format`, `Dismiss: …`,
  `Face-down card`. A sighted review of a French page shows none of them.

Two constraints worth knowing before touching this:

- **A card's accessible label is game state, and must not move with the card theme.**
  It now depends on the language, which is the other axis; `Card.test.tsx` asserts it
  is identical across all four faces in both languages.
- **Never assert on an English string to establish a non-language fact.** The leak
  test in `e2e/game.spec.ts` counted face-up cards as "those whose label is not
  `Face-down card`". Translating that label would have made every card look face-up
  and the security assertion pass vacuously. `CardBack` now carries `data-face-down`
  and the test counts that.

## Accessibility, briefly

Colour is never the only signal - cards carry shape tokens in every one of the four
themes, and the log says in words what the animations dramatise. Tap targets are
44px, the card-theme controls included. The countdown is a live
region that only becomes assertive in its last seconds, because a polite update
every second would queue up behind itself in a screen reader. `prefers-reduced-motion`
removes the pulse but not the number, because the number carries information.

## Things that have gone wrong here before

- **A stale `dist/`** meant a new client against an old server; the view arrived
  without a field and the whole table went blank. There is now an error boundary
  outside `App`, so a bad render explains itself and offers a reload that rejoins.
- **Duplicated lookup tables.** Colour swatches were defined in four files. They now
  live in `lib/palette.ts`. When you need a table in two places, that is the pattern -
  but only for values. The colour _names_ moved there too and that was a mistake: a
  word belongs in the catalogues, and one sitting in a language-free module can only
  ever be English. Deduplication and translation want opposite things, and translation
  wins.
- **Layout judged by eye.** Several defects were only visible by measuring computed
  styles or DOM geometry in a real browser - and one "bug" turned out to be a
  screenshot taken mid-transition. Sample after animations settle, or deliberately
  mid-flight at a timestamp computed from the keyframes.
- **An animation with no resting state.** `.pile-draw::after` is the ghost card that
  peels off the draw pile. It set `background: var(--bone)` and an animation running
  0.55 → 0 opacity, but no `opacity` of its own and no `animation-fill-mode` - so
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
  making something smaller. The lobby inherited the same problem when the
  configuration moved into it, and got the same answer: two columns past 900px, and on a
  phone the points table takes a scroll container while the seats and **Start** stay
  inside the fold. Measured at 390 × 844 in the same file - the seats are what a lobby is
  for, so they are never what gets capped.
