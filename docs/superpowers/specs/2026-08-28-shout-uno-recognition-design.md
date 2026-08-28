# Shouting UNO: word recognition design

Date: 2026-08-28
Status: designed

## The problem

`useShoutUno` calls `callUno` the moment the local speaking level crosses a
threshold. There is no word recognition anywhere in it. `speaking` is a peak
amplitude test in `apps/web/src/lib/voice/speaking-detector.ts`: any deviation
of 12 or more from silence in the time-domain byte data.

So any speech, laugh, cough or knock on the desk fires the call. The window
makes it worse: `armed` is `canCallUno`, which the server offers from two cards
onward, so it stays open across the opponents' turns, which is exactly when a
player is talking on voice chat.

The original comment argued a stray call costs nothing because the server
refuses an illegal one. That is true of legality and false of experience: the
call fires by itself, the player never gets to make it, and the feature that was
meant to be fun is noise.

## Goal

Fire `callUno` when the player says the word "uno", and at no other time.

## Non-goals

- Any other voice command. One word, one move.
- Server-side recognition. Nothing new crosses the wire; `callUno` already
  exists as a move and the protocol does not change.
- Recognition for players who have not joined voice chat. The shout stays a
  voice-chat feature.
- An e2e test. It would need a fake audio device; a manual browser check
  replaces it and is a required step, not an optional one.

### Amending a non-goal of the voice chat spec

`docs/superpowers/specs/2026-08-26-voice-chat-design.md` lists "Recording,
transcription, or persistence of any kind" as a non-goal. This design amends the
transcription half of that line and leaves the rest standing.

What changes: the browser transcribes the local microphone, in memory, to test
one word. What does not change: nothing is recorded, nothing is persisted,
nothing is transmitted. No transcript reaches the server, the other players, or
`localStorage`. Each result is tested and dropped.

In cloud mode the audio does reach the browser vendor, which is a real departure
from "audio never leaves the mesh". That is why cloud mode is off until the
player turns it on, and why on-device is preferred whenever the browser has it.

## The browser API

`SpeechRecognition`, `webkitSpeechRecognition` on Safari. Chrome 139 shipped
on-device recognition, which is what makes this design acceptable at all:

```ts
await SpeechRecognition.available({ langs: ['fr-FR'], processLocally: true })
// 'available' | 'downloadable' | 'downloading' | 'unavailable'
await SpeechRecognition.install({ langs: ['fr-FR'], processLocally: true })
recognition.processLocally = true
```

Support, and what each browser gets:

| Browser     | Recognition   | Shout                          |
| ----------- | ------------- | ------------------------------ |
| Chrome 139+ | on-device     | on by default                  |
| Chrome <139 | cloud only    | off until the player opts in   |
| Safari      | cloud (Apple) | off until the player opts in   |
| Firefox     | none          | no shout, the button remains   |

## Decisions and why

### Three units, not one hook

**`apps/web/src/lib/voice/hears-uno.ts`** is a pure function,
`hearsUno(transcript, locale): boolean`. It normalises (lowercase, NFD with the
combining marks stripped, punctuation collapsed) and tests a per-locale list of
what recognisers actually return for a shouted "uno": `uno`, `una`, `ouno`,
`ou no`, `u no`, `huno`, `juno` in French; `uno`, `una`, `oono`, `u no` in
English.

`you know` is deliberately absent from the English list. It is the obvious
homophone and it is also one of the most common fillers in English speech, so
accepting it would rebuild the bug this design exists to remove.

Pure and stateless, so the whole risky part of the feature - what counts as
hearing the word - is a table of cases in a test file rather than something you
can only judge by shouting at a laptop.

**`apps/web/src/lib/voice/shout-listener.ts`** owns the recogniser. Same shape
as `speaking-detector.ts`: a factory that returns `null` when the browser cannot
do it, with an injectable constructor so tests never touch a real one.

```ts
export type ShoutAvailability = 'unsupported' | 'downloadable' | 'local' | 'cloud'
export async function probeShout(locale: Locale): Promise<ShoutAvailability>
export function createShoutListener(options: {
  locale: Locale
  mode: 'local' | 'cloud'
  onShout: () => void
  factory?: () => SpeechRecognitionLike
}): ShoutListener | null
// ShoutListener = { start(): void; stop(): void; destroy(): void }
```

The listener does not know what `armed` means. It reports one thing: the
microphone just heard the word. Whether that counts is the hook's business.
Keeping the boundary there is what lets the recogniser's lifecycle be tested
without a game view, and the arming rules be tested without a recogniser.

**`useShoutUno`** keeps its current semantics exactly - once per armed window,
re-armed when the window closes - and its five existing tests keep their intent.
Only the trigger changes: `speaking: boolean` becomes the listener's `onShout`.

### The recogniser warms up at three cards, not when the window opens

Starting it on `armed` would be tighter, but in cloud mode `start()` costs a few
hundred milliseconds and the shout arrives exactly when the window opens. The
recogniser has to already be listening.

So it starts at three cards or fewer and stops above that. `hand.length` is not
a rule, so the client still works out nothing it was not told. And the
pre-warm window always contains the armed window: `callUno` is offered at two
cards, or while vulnerable at one, and both are under three.

The alternative, running it for the whole game, was rejected: in cloud mode it
would stream the microphone to the vendor from the first deal to the last card.

### Restarting is the feature

A continuous recogniser stops on its own. Chrome ends the session after a few
seconds of silence, and `network` errors end it too. Neither surfaces as
anything a user can see. Without a restart, the shout works for twenty seconds
at the start of a game and then never again, silently - which is worse than not
shipping it.

The rules:

- `onend`, while the listener is meant to be running: start again.
- Repeated immediate ends back off: 300ms, 600ms, 1200ms, capped at 5s. The
  backoff resets after a session that lasted more than 5s.
- `no-speech` and `aborted`: restart, silently. Both are normal.
- `network`: restart through the backoff.
- `not-allowed` and `service-not-allowed`: stop for good and report it. Retrying
  a refused permission just burns battery.
- `start()` on an already-started recogniser throws `InvalidStateError`. Swallow
  it; it means the state we wanted.

Each result event is read from `event.resultIndex` onward only. The transcript
grows across interim results, so reading the whole thing makes one heard "uno"
match again on every subsequent event.

`interimResults` is on for latency and `maxAlternatives` is 3: recognisers
frequently put the right word second when it is shouted rather than spoken.

### Cloud is off until the player says otherwise

One boolean preference, `shoutCloudAllowed`, default `false`, in
`apps/web/src/lib/preferences.ts` alongside the others and with the same
defensive reads.

- `local`: on, no consent asked. Nothing leaves the machine, so there is nothing
  to consent to, and a permission prompt for a non-event trains people to click
  through prompts.
- `downloadable`: a button in `VoicePanel.tsx` calls `install()`. It has to be a
  button because the call requires a user gesture.
- `cloud`: off until the player ticks the box, and the label says plainly that
  the audio goes to the browser vendor.
- `unsupported`: nothing, and the UNO button carries on as it does for a player
  with no microphone.

### The amplitude trigger goes

`useShoutUno` stops reading `speaking`. Firefox and anyone who declines cloud
recognition get the button, the same as a player who never joined voice.

Keeping a degraded amplitude path was considered and rejected: it is the bug,
with a higher threshold. Two trigger paths would also both need maintaining and
testing, for a mode nobody would trust.

`speaking-detector.ts` itself does not change. It still drives the "who is
speaking" indicators, which is what it was written for.

## Testing

| What                     | How                                                          |
| ------------------------ | ------------------------------------------------------------ |
| `hearsUno`               | Table of transcripts per locale, including the `you know` miss |
| `shout-listener`         | Fake `SpeechRecognition`: start/stop idempotence, restart on `onend`, backoff on a burst of immediate ends, permanent stop on `not-allowed`, `processLocally` set in local mode, refusal to run in cloud mode without consent |
| `useShoutUno`            | Existing five cases, re-pointed at a fake listener            |
| Two microphone captures  | Manual, in a real browser. Required.                          |

The manual check is in the plan as a step. `SpeechRecognition` opens its own
capture rather than accepting the `MediaStream` that `useVoice` already holds,
so a game runs two concurrent captures of the same device. Chrome desktop is
expected to cope; iOS Safari is where it is expected to break. No unit test can
see this, and per the repo's own rule, judging it from a screenshot does not
count.

## Not covered by the compiler

Each new user-facing string needs three edits: `messages.ts` for the type, then
`en.ts` and `fr.ts`. The compiler catches the two catalogues and misses nothing
else; `no-english.test.ts` catches a literal left in the component.

New strings: the cloud consent label and its explanation, the offline model
download button, and the unsupported-browser note.

## Documentation

`openwiki/architecture/voice-chat.md` has a `Shouting UNO calls it` section and
a row in its file table. Both describe the amplitude trigger and both become
wrong the moment this ships.

## Commits

One per scope: `hears-uno` and `shout-listener` with their tests, then the
wiring into `useShoutUno`, `Table.tsx`, `VoicePanel.tsx` and preferences with
its strings, then the wiki.
