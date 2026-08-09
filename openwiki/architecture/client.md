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
`sort-hand.ts` how to order a hand, `describe-event.ts` what the log says. All are
unit-tested without a browser.

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

## Accessibility, briefly

Colour is never the only signal — cards carry shape tokens, and the log says in
words what the animations dramatise. Tap targets are 44px. The countdown is a live
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
