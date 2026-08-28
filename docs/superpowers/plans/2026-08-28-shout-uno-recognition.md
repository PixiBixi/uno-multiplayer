# Shout UNO word recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Call UNO when the player says the word "uno", and at no other time, replacing the peak-amplitude trigger that fires on any sound.

**Architecture:** Three units with clear seams. A pure matcher decides whether a transcript contains the word. A listener owns the `SpeechRecognition` lifecycle and reports "heard it", knowing nothing about the game. `useShoutUno` keeps its existing arming semantics and swaps its trigger source. Nothing crosses the wire; `callUno` already exists as a move.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).

**Spec:** `docs/superpowers/specs/2026-08-28-shout-uno-recognition-design.md`

## Global Constraints

- Code, comments and commit messages in English. Conventional Commits, one commit per scope.
- `npm run verify` before every commit. Check the exit code; piping to `tail` swallows it.
- Never an em dash (`-`, a comma, a colon, or two sentences instead). Applies to code comments too.
- Code comments are 1 to 3 lines: the decision and why it must not be undone. No investigation notes inline.
- `packages/engine` and the protocol are untouched by this plan. No new dependency in any package.
- A user-facing string needs three edits: `apps/web/src/i18n/messages.ts` for the type, then `en.ts` and `fr.ts`. `no-english.test.ts` catches a literal left in a component.
- Preference reads and writes are wrapped in `try`/`catch`: storage can be blocked outright and losing a preference must never break the page.
- Availability values, verbatim: `'unsupported' | 'downloadable' | 'local' | 'cloud'`.
- Backoff, verbatim: `300, 600, 1200, 2500, 5000` milliseconds, reset after a session lasting `5000` ms or more.
- Pre-warm threshold, verbatim: `3` cards or fewer.

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `apps/web/src/lib/voice/hears-uno.ts` (create) | Pure: does this transcript contain the word, in this locale |
| `apps/web/src/lib/voice/hears-uno.test.ts` (create) | Table of transcripts per locale |
| `apps/web/src/lib/voice/shout-listener.ts` (create) | Availability probe, language pack install, recogniser lifecycle |
| `apps/web/src/lib/voice/shout-listener.test.ts` (create) | Fake recogniser: config, restart, backoff, refusal |
| `apps/web/src/lib/preferences.ts` (modify) | `readShoutCloudAllowed` / `writeShoutCloudAllowed` |
| `apps/web/src/lib/preferences.test.ts` (modify) | Cases for the new preference |
| `apps/web/src/hooks/useShoutUno.ts` (rewrite) | Arming rules, listener lifecycle, availability probe |
| `apps/web/src/hooks/useShoutUno.test.ts` (rewrite) | The arming intents, driven by a fake listener, plus availability |
| `apps/web/src/screens/Table.tsx` (modify) | Wiring: pre-warm, mute, consent preference, panel props |
| `apps/web/src/components/VoicePanel.tsx` (modify) | The consent and install surface |
| `apps/web/src/components/VoicePanel.test.tsx` (modify) | Cases per availability |
| `apps/web/src/i18n/{messages,en,fr}.ts` (modify) | Six new strings |
| `apps/web/src/styles/app.css` (modify) | One class for the consent row |
| `openwiki/architecture/voice-chat.md` (modify) | The `Shouting UNO calls it` section and its file table row |

`apps/web/src/lib/voice/speaking-detector.ts` is **not** touched. It still drives the "who is speaking" indicators, which is what it was written for.

---

### Task 1: The matcher

**Files:**

- Create: `apps/web/src/lib/voice/hears-uno.ts`
- Test: `apps/web/src/lib/voice/hears-uno.test.ts`

**Interfaces:**

- Consumes: `Locale` from `apps/web/src/i18n/messages.ts` (`'en' | 'fr'`).
- Produces: `hearsUno(transcript: string, locale: Locale): boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/voice/hears-uno.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hearsUno } from './hears-uno.js'

describe('hearsUno', () => {
  it('hears the word itself, however it is punctuated or cased', () => {
    expect(hearsUno('Uno!', 'fr')).toBe(true)
    expect(hearsUno('uno', 'en')).toBe(true)
    expect(hearsUno('  UNO  ', 'en')).toBe(true)
  })

  it('hears what a recogniser returns instead of the word', () => {
    expect(hearsUno('ou no', 'fr')).toBe(true)
    expect(hearsUno('juno', 'fr')).toBe(true)
    expect(hearsUno('u no', 'en')).toBe(true)
    expect(hearsUno('oono', 'en')).toBe(true)
  })

  it('drops accents a recogniser may add', () => {
    expect(hearsUno('ünó', 'fr')).toBe(true)
  })

  it('finds the word inside a longer transcript', () => {
    expect(hearsUno('attends uno voila', 'fr')).toBe(true)
  })

  it('never hears "you know", the filler that would rebuild the bug', () => {
    expect(hearsUno('you know', 'en')).toBe(false)
    expect(hearsUno('you know what I mean', 'en')).toBe(false)
  })

  it('needs the whole word, not a fragment of a longer one', () => {
    expect(hearsUno('unoriginal', 'en')).toBe(false)
    expect(hearsUno('unanimous', 'en')).toBe(false)
  })

  it('does not hear French words that merely start the same way', () => {
    expect(hearsUno('un os', 'fr')).toBe(false)
    expect(hearsUno('une carte', 'fr')).toBe(false)
  })

  it('hears nothing in nothing', () => {
    expect(hearsUno('', 'fr')).toBe(false)
    expect(hearsUno('   ', 'en')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/src/lib/voice/hears-uno.test.ts`
Expected: FAIL, cannot resolve `./hears-uno.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/voice/hears-uno.ts`:

```ts
import type { Locale } from '../../i18n/messages.js'

/**
 * What recognisers return for a shouted "uno". Per locale because the mistakes
 * differ: a French engine offers "ou no", an English one does not. "you know" is
 * deliberately absent - it is the closest English homophone and one of the most
 * common fillers in the language, so accepting it rebuilds the bug this replaced.
 */
const HEARD: Record<Locale, readonly string[]> = {
  en: ['uno', 'una', 'oono', 'u no'],
  fr: ['uno', 'una', 'ouno', 'ou no', 'u no', 'huno', 'hu no', 'juno'],
}

/** Lowercase, accents dropped, everything that is not a letter becomes a space. */
const normalise = (transcript: string): string =>
  transcript
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()

export function hearsUno(transcript: string, locale: Locale): boolean {
  // Padded both ends so a match is always on whole words: "unoriginal" must miss.
  const heard = ` ${normalise(transcript)} `
  return (HEARD[locale] ?? HEARD.en).some((word) => heard.includes(` ${word} `))
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run apps/web/src/lib/voice/hears-uno.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify
git add apps/web/src/lib/voice/hears-uno.ts apps/web/src/lib/voice/hears-uno.test.ts
git commit -F - <<'EOF'
feat(web): add the pure matcher for a shouted "uno"

Recognisers rarely return the word cleanly, so the transcript is normalised
and tested against a per-locale list of what they do return.

"you know" is left out of the English list on purpose: it is the closest
homophone and a very common filler, so accepting it would put back the
false positives this feature exists to remove.
EOF
```

---

### Task 2: The recogniser

**Files:**

- Create: `apps/web/src/lib/voice/shout-listener.ts`
- Test: `apps/web/src/lib/voice/shout-listener.test.ts`

**Interfaces:**

- Consumes: `hearsUno` from Task 1, `Locale`.
- Produces:
  - `type ShoutAvailability = 'unsupported' | 'downloadable' | 'local' | 'cloud'`
  - `type SpeechRecognitionLike` (structural, exported for tests and for the hook's injection point)
  - `type ShoutListener = { start(): void; stop(): void; destroy(): void }`
  - `probeShout(locale: Locale): Promise<ShoutAvailability>`
  - `installShout(locale: Locale): Promise<boolean>`
  - `createShoutListener(options: { locale, mode: 'local' | 'cloud', onShout: () => void, onDenied?: () => void, factory?: () => SpeechRecognitionLike }): ShoutListener | null`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/voice/shout-listener.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createShoutListener,
  probeShout,
  type SpeechRecognitionLike,
} from './shout-listener.js'

/** A recogniser that records how it was configured and fires its handlers on demand. */
const fakeRecognition = () => {
  const made: SpeechRecognitionLike[] = []
  const factory = (): SpeechRecognitionLike => {
    const instance: SpeechRecognitionLike = {
      lang: '',
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      onresult: null,
      onend: null,
      onerror: null,
    }
    made.push(instance)
    return instance
  }
  return { factory, made, last: () => made[made.length - 1] as SpeechRecognitionLike }
}

/** One result event, shaped the way the browser shapes it. */
const resultEvent = (resultIndex: number, alternatives: string[][]) => ({
  resultIndex,
  results: alternatives.map((list) => list.map((transcript) => ({ transcript }))),
})

describe('shout listener', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('configures the recogniser for continuous listening in the locale', () => {
    const { factory, last } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    expect(last().lang).toBe('fr-FR')
    expect(last().continuous).toBe(true)
    expect(last().interimResults).toBe(true)
    expect(last().maxAlternatives).toBe(3)
    expect(last().start).toHaveBeenCalled()
  })

  it('asks for local processing in local mode and not in cloud mode', () => {
    const local = fakeRecognition()
    createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory: local.factory,
    })?.start()
    expect(local.last().processLocally).toBe(true)

    const cloud = fakeRecognition()
    createShoutListener({
      locale: 'fr',
      mode: 'cloud',
      onShout: vi.fn(),
      factory: cloud.factory,
    })?.start()
    expect(cloud.last().processLocally).toBeUndefined()
  })

  it('shouts when a result carries the word', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(0, [['uno']]))
    expect(onShout).toHaveBeenCalledTimes(1)
  })

  it('checks the later alternatives, where a shouted word often lands', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(0, [['une eau', 'uno']]))
    expect(onShout).toHaveBeenCalledTimes(1)
  })

  it('reads only from resultIndex, so a word already acted on cannot match again', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(1, [['uno'], ['bonjour']]))
    expect(onShout).not.toHaveBeenCalled()
  })

  it('stays quiet on speech that is not the word', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'en', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(0, [['you know what']]))
    expect(onShout).not.toHaveBeenCalled()
  })

  it('starts again after the recogniser ends on its own', () => {
    const { factory, made, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout: vi.fn(), factory })?.start()
    expect(made).toHaveLength(1)
    last().onend?.()
    vi.advanceTimersByTime(300)
    expect(made).toHaveLength(2)
    expect(last().start).toHaveBeenCalled()
  })

  it('backs off when the ends keep coming immediately', () => {
    const { factory, made, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout: vi.fn(), factory })?.start()
    last().onend?.()
    vi.advanceTimersByTime(300)
    last().onend?.()
    vi.advanceTimersByTime(300)
    // The second wait is 600ms, so 300 is not yet enough.
    expect(made).toHaveLength(2)
    vi.advanceTimersByTime(300)
    expect(made).toHaveLength(3)
  })

  it('forgets the backoff after a session that lasted', () => {
    const { factory, made, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout: vi.fn(), factory })?.start()
    last().onend?.()
    vi.advanceTimersByTime(300)
    vi.advanceTimersByTime(5000)
    last().onend?.()
    vi.advanceTimersByTime(300)
    expect(made).toHaveLength(3)
  })

  it('gives up for good when the microphone is refused', () => {
    const onDenied = vi.fn()
    const { factory, made, last } = fakeRecognition()
    createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      onDenied,
      factory,
    })?.start()
    last().onerror?.({ error: 'not-allowed' })
    last().onend?.()
    vi.advanceTimersByTime(10_000)
    expect(made).toHaveLength(1)
    expect(onDenied).toHaveBeenCalledTimes(1)
  })

  it('stops for good on stop, pending restart included', () => {
    const { factory, made, last } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    const first = last()
    first.onend?.()
    listener?.stop()
    vi.advanceTimersByTime(10_000)
    expect(made).toHaveLength(1)
    expect(first.abort).toHaveBeenCalled()
  })

  it('survives a start that throws because it is already listening', () => {
    const { factory, last } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    vi.mocked(last().start).mockImplementation(() => {
      throw new Error('InvalidStateError')
    })
    expect(() => {
      last().onend?.()
      vi.advanceTimersByTime(300)
    }).not.toThrow()
  })

  it('starting twice does not stack recognisers', () => {
    const { factory, made } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    listener?.start()
    expect(made).toHaveLength(1)
  })

  it('reports an unsupported browser', async () => {
    await expect(probeShout('fr')).resolves.toBe('unsupported')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/src/lib/voice/shout-listener.test.ts`
Expected: FAIL, cannot resolve `./shout-listener.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/voice/shout-listener.ts`:

```ts
import type { Locale } from '../../i18n/messages.js'
import { hearsUno } from './hears-uno.js'

/** The slice of SpeechRecognition this uses. The DOM lib does not declare it. */
export type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  processLocally?: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechResultLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

export type SpeechResultLike = {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

export type ShoutAvailability = 'unsupported' | 'downloadable' | 'local' | 'cloud'

export type ShoutListener = {
  start(): void
  stop(): void
  destroy(): void
}

type RecognitionCtor = (new () => SpeechRecognitionLike) & {
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>
}

const TAGS: Record<Locale, string> = { en: 'en-US', fr: 'fr-FR' }

/* Ends of the same session in quick succession are a failure; one that lasted was
   a normal silence timeout and starts the backoff over. */
const BACKOFF_MS = [300, 600, 1200, 2500, 5000]
const STABLE_MS = 5000

const constructor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/**
 * On-device is preferred over cloud everywhere: the rest of the voice feature keeps
 * audio inside the mesh, and a transcriber that ships it to a vendor is the one
 * thing that breaks that promise.
 */
export async function probeShout(locale: Locale): Promise<ShoutAvailability> {
  const Recognition = constructor()
  if (Recognition === null) return 'unsupported'
  if (typeof Recognition.available !== 'function') return 'cloud'
  try {
    const state = await Recognition.available({ langs: [TAGS[locale]], processLocally: true })
    if (state === 'available') return 'local'
    if (state === 'downloadable' || state === 'downloading') return 'downloadable'
    return 'cloud'
  } catch {
    // A probe that throws says nothing about the cloud path, which predates it.
    return 'cloud'
  }
}

/** Must be called from a user gesture: the browser refuses the download otherwise. */
export async function installShout(locale: Locale): Promise<boolean> {
  const Recognition = constructor()
  if (Recognition?.install === undefined) return false
  try {
    return await Recognition.install({ langs: [TAGS[locale]], processLocally: true })
  } catch {
    return false
  }
}

export function createShoutListener(options: {
  locale: Locale
  mode: 'local' | 'cloud'
  onShout: () => void
  onDenied?: () => void
  /** False in tests, which drive the handlers directly. */
  factory?: () => SpeechRecognitionLike
}): ShoutListener | null {
  const Recognition = constructor()
  if (options.factory === undefined && Recognition === null) return null
  const make =
    options.factory ?? ((): SpeechRecognitionLike => new (Recognition as RecognitionCtor)())

  let current: SpeechRecognitionLike | null = null
  let wanted = false
  let startedAt = 0
  let failures = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let refused = false

  const launch = (): void => {
    if (!wanted || refused) return
    const recognition = make()
    recognition.lang = TAGS[options.locale]
    recognition.continuous = true
    recognition.interimResults = true
    // A shouted word lands in the second or third alternative often enough to check.
    recognition.maxAlternatives = 3
    if (options.mode === 'local') recognition.processLocally = true

    recognition.onresult = (event) => {
      /* From resultIndex only: the transcript grows across interim results, so
         reading all of it matches a word already acted on, over and over. */
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const alternatives = event.results[index]
        if (alternatives === undefined) continue
        for (let rank = 0; rank < alternatives.length; rank += 1) {
          if (!hearsUno(alternatives[rank]?.transcript ?? '', options.locale)) continue
          options.onShout()
          return
        }
      }
    }

    recognition.onerror = (event) => {
      if (event.error !== 'not-allowed' && event.error !== 'service-not-allowed') return
      // A refused microphone does not un-refuse itself; retrying only costs battery.
      refused = true
      wanted = false
      options.onDenied?.()
    }

    recognition.onend = () => {
      current = null
      if (!wanted || refused) return
      /* A continuous recogniser ends by itself on silence or a network blip, with
         nothing a player can see. Without this restart the feature dies quietly a
         few seconds into the first game. Do not remove it. */
      if (Date.now() - startedAt >= STABLE_MS) failures = 0
      const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)] ?? 5000
      failures += 1
      timer = setTimeout(launch, wait)
    }

    current = recognition
    startedAt = Date.now()
    try {
      recognition.start()
    } catch {
      /* InvalidStateError means it is already listening, which is the state wanted. */
    }
  }

  const halt = (): void => {
    wanted = false
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    current?.abort()
    current = null
  }

  return {
    start() {
      if (wanted || refused) return
      wanted = true
      failures = 0
      launch()
    },
    stop: halt,
    destroy() {
      halt()
      refused = true
    },
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run apps/web/src/lib/voice/shout-listener.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify
git add apps/web/src/lib/voice/shout-listener.ts apps/web/src/lib/voice/shout-listener.test.ts
git commit -F - <<'EOF'
feat(web): add the shout listener over the Web Speech API

Owns the recogniser and reports one thing: the microphone heard the word.
It knows nothing about the game, so its lifecycle is testable without a
view and the arming rules stay testable without a recogniser.

The restart on onend is the feature, not a detail. A continuous recogniser
ends on its own after silence or a network blip and says nothing about it,
so without the restart the shout works for a few seconds per game.
EOF
```

---

### Task 3: The cloud consent preference

**Files:**

- Modify: `apps/web/src/lib/preferences.ts` (append, after the Konami block)
- Test: `apps/web/src/lib/preferences.test.ts` (append)

**Interfaces:**

- Produces: `readShoutCloudAllowed(): boolean`, `writeShoutCloudAllowed(allowed: boolean): void`. Storage key `uno.pref.shoutCloud`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/lib/preferences.test.ts`:

```ts
describe('shout cloud consent', () => {
  it('is off until it is turned on', () => {
    window.localStorage.clear()
    expect(readShoutCloudAllowed()).toBe(false)
  })

  it('round-trips a yes', () => {
    writeShoutCloudAllowed(true)
    expect(readShoutCloudAllowed()).toBe(true)
  })

  it('round-trips a no', () => {
    writeShoutCloudAllowed(true)
    writeShoutCloudAllowed(false)
    expect(readShoutCloudAllowed()).toBe(false)
  })

  it('treats a corrupted value as no rather than as consent', () => {
    window.localStorage.setItem('uno.pref.shoutCloud', 'yes')
    expect(readShoutCloudAllowed()).toBe(false)
  })
})
```

Add `readShoutCloudAllowed` and `writeShoutCloudAllowed` to the existing import at the top of that file.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/src/lib/preferences.test.ts`
Expected: FAIL, `readShoutCloudAllowed` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `apps/web/src/lib/preferences.ts`:

```ts
const SHOUT_CLOUD_KEY = 'uno.pref.shoutCloud'

/**
 * Whether cloud speech recognition was accepted. Off unless the exact string
 * 'true' is stored, so a half-written value never reads as consent: on-device
 * recognition needs none because nothing leaves the machine, and the cloud path
 * sends the microphone to the browser vendor, which nothing else here does.
 */
export function readShoutCloudAllowed(): boolean {
  try {
    return window.localStorage.getItem(SHOUT_CLOUD_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeShoutCloudAllowed(allowed: boolean): void {
  try {
    window.localStorage.setItem(SHOUT_CLOUD_KEY, allowed ? 'true' : 'false')
  } catch {
    /* The choice will not survive a reload, and defaults back to off. */
  }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run apps/web/src/lib/preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify
git add apps/web/src/lib/preferences.ts apps/web/src/lib/preferences.test.ts
git commit -F - <<'EOF'
feat(web): store whether cloud speech recognition was accepted

Only the exact string 'true' counts, so a corrupted value reads as a no
rather than as consent to send a microphone to a browser vendor.
EOF
```

---

### Task 4: Rewire the hook

**Files:**

- Rewrite: `apps/web/src/hooks/useShoutUno.ts`
- Rewrite: `apps/web/src/hooks/useShoutUno.test.ts`

**Interfaces:**

- Consumes: `createShoutListener`, `probeShout`, `ShoutAvailability`, `ShoutListener` from Task 2; `Locale`.
- Produces: `useShoutUno(options): { availability: ShoutAvailability | 'probing'; refresh: () => void }` where options are `{ armed, prewarm, enabled, locale, cloudAllowed, onCall, create?, probe? }`.

- [ ] **Step 1: Write the failing test**

Replace `apps/web/src/hooks/useShoutUno.test.ts` entirely:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useShoutUno } from './useShoutUno.js'
import type { ShoutAvailability, ShoutListener } from '../lib/voice/shout-listener.js'

type Props = { armed: boolean; prewarm: boolean; enabled: boolean; cloudAllowed: boolean }

/** A listener whose "heard it" can be fired by the test. */
const fakeListener = () => {
  let shout: () => void = () => undefined
  const listener: ShoutListener = { start: vi.fn(), stop: vi.fn(), destroy: vi.fn() }
  const create = vi.fn((options: { onShout: () => void }) => {
    shout = options.onShout
    return listener
  })
  return { create, listener, hear: () => shout() }
}

const setup = (initial: Partial<Props> = {}, availability: ShoutAvailability = 'local') => {
  const onCall = vi.fn()
  const { create, listener, hear } = fakeListener()
  const probe = vi.fn(async () => availability)
  const props: Props = {
    armed: false,
    prewarm: true,
    enabled: true,
    cloudAllowed: false,
    ...initial,
  }
  const view = renderHook(
    (current: Props) =>
      useShoutUno({
        ...current,
        locale: 'fr',
        onCall,
        create: create as never,
        probe: probe as never,
      }),
    { initialProps: props },
  )
  return { onCall, create, listener, hear, view, props }
}

describe('useShoutUno', () => {
  it('calls when the word is heard while the call is legal', async () => {
    const { onCall, hear, view, props } = setup({ armed: true })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    expect(onCall).toHaveBeenCalledTimes(1)
    view.rerender(props)
  })

  it('stays quiet while the call is not legal, however clearly it is shouted', async () => {
    const { onCall, hear, view } = setup({ armed: false })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    expect(onCall).not.toHaveBeenCalled()
  })

  it('calls once per window, not once per syllable', async () => {
    const { onCall, hear, view } = setup({ armed: true })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    hear()
    hear()
    expect(onCall).toHaveBeenCalledTimes(1)
  })

  it('arms again for the next time the call becomes legal', async () => {
    const { onCall, hear, view, props } = setup({ armed: true })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    hear()
    view.rerender({ ...props, armed: false })
    view.rerender({ ...props, armed: true })
    hear()
    expect(onCall).toHaveBeenCalledTimes(2)
  })

  it('listens only while the hand is short enough to matter', async () => {
    const { listener, view, props } = setup({ prewarm: false })
    await waitFor(() => expect(view.result.current.availability).toBe('local'))
    expect(listener.start).not.toHaveBeenCalled()
    view.rerender({ ...props, prewarm: true })
    await waitFor(() => expect(listener.start).toHaveBeenCalled())
  })

  it('stops listening when voice is left or the microphone is muted', async () => {
    const { listener, view, props } = setup({ prewarm: true, enabled: true })
    await waitFor(() => expect(listener.start).toHaveBeenCalled())
    view.rerender({ ...props, enabled: false })
    await waitFor(() => expect(listener.destroy).toHaveBeenCalled())
  })

  it('never opens a cloud recogniser without consent', async () => {
    const { create, view } = setup({ cloudAllowed: false }, 'cloud')
    await waitFor(() => expect(view.result.current.availability).toBe('cloud'))
    expect(create).not.toHaveBeenCalled()
  })

  it('opens a cloud recogniser once consent is given', async () => {
    const { create, view, props } = setup({ cloudAllowed: false }, 'cloud')
    await waitFor(() => expect(view.result.current.availability).toBe('cloud'))
    view.rerender({ ...props, cloudAllowed: true })
    await waitFor(() => expect(create).toHaveBeenCalled())
  })

  it('opens nothing at all on a browser that cannot listen', async () => {
    const { create, view } = setup({}, 'unsupported')
    await waitFor(() => expect(view.result.current.availability).toBe('unsupported'))
    expect(create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run apps/web/src/hooks/useShoutUno.test.ts`
Expected: FAIL, `useShoutUno` still expects `speaking` and returns `void`.

- [ ] **Step 3: Write the implementation**

Replace `apps/web/src/hooks/useShoutUno.ts` entirely:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '../i18n/messages.js'
import {
  createShoutListener,
  probeShout,
  type ShoutAvailability,
} from '../lib/voice/shout-listener.js'

/**
 * Calls UNO by shouting it, which is how the game is played away from a screen.
 *
 * `armed` comes from `legalMoves`, so the client learns no rule it was not already
 * sent: the server said the call was legal, and refuses it otherwise.
 *
 * `prewarm` is wider than `armed` on purpose. A cloud recogniser takes a few hundred
 * milliseconds to start and the shout arrives exactly as the window opens, so it has
 * to already be listening. Do not narrow it to `armed`.
 */
export function useShoutUno(options: {
  armed: boolean
  /** Short enough a hand that the call is about to matter. */
  prewarm: boolean
  /** Voice joined and the microphone open. */
  enabled: boolean
  locale: Locale
  cloudAllowed: boolean
  onCall: () => void
  create?: typeof createShoutListener
  probe?: typeof probeShout
}): { availability: ShoutAvailability | 'probing'; refresh: () => void } {
  const { armed, prewarm, enabled, locale, cloudAllowed, onCall } = options
  const create = options.create ?? createShoutListener
  const probe = options.probe ?? probeShout

  const [availability, setAvailability] = useState<ShoutAvailability | 'probing'>('probing')
  const [attempt, setAttempt] = useState(0)
  const firedRef = useRef(false)
  const armedRef = useRef(armed)
  armedRef.current = armed
  const callRef = useRef(onCall)
  callRef.current = onCall

  const refresh = useCallback(() => setAttempt((count) => count + 1), [])

  useEffect(() => {
    let live = true
    void probe(locale).then((result) => {
      if (live) setAvailability(result)
    })
    return () => {
      live = false
    }
  }, [locale, probe, attempt])

  /* Cloud is a mode the player has to ask for: it sends the microphone to the
     browser vendor, which nothing else in this feature does. */
  const mode =
    availability === 'local' ? 'local' : availability === 'cloud' && cloudAllowed ? 'cloud' : null

  useEffect(() => {
    if (!enabled || !prewarm || mode === null) return
    const listener = create({
      locale,
      mode,
      onShout: () => {
        /* Once per window rather than per utterance: a recogniser emits interim
           results, and a window is one call however many times the word lands. */
        if (!armedRef.current || firedRef.current) return
        firedRef.current = true
        callRef.current()
      },
    })
    if (listener === null) return
    listener.start()
    return () => listener.destroy()
  }, [enabled, prewarm, mode, locale, create])

  // Leaving the window re-arms it for the next card that drops to one.
  useEffect(() => {
    if (!armed) firedRef.current = false
  }, [armed])

  return { availability, refresh }
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run apps/web/src/hooks/useShoutUno.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify and commit**

```bash
npm run verify
git add apps/web/src/hooks/useShoutUno.ts apps/web/src/hooks/useShoutUno.test.ts
git commit -F - <<'EOF'
feat(web): trigger the UNO shout on the word, not on any sound

The hook keeps its arming rules unchanged, once per window and re-armed
when the window closes, and swaps its source: the peak amplitude level
becomes the listener saying it heard the word.

The recogniser warms up at three cards rather than when the window opens,
because a cloud start costs a few hundred milliseconds and the shout comes
the instant the window does.
EOF
```

---

### Task 5: Wire it into the table

**Files:**

- Modify: `apps/web/src/screens/Table.tsx:19` (import), `:23` (import), `:77-81` (the call)
- Modify: `apps/web/src/components/VoicePanel.tsx`
- Modify: `apps/web/src/components/VoicePanel.test.tsx`
- Modify: `apps/web/src/i18n/messages.ts:365-379`, `apps/web/src/i18n/en.ts:278-292`, `apps/web/src/i18n/fr.ts` (same `voice` block)
- Modify: `apps/web/src/styles/app.css`

**Interfaces:**

- Consumes: `useShoutUno` from Task 4, `installShout` and `ShoutAvailability` from Task 2, `readShoutCloudAllowed` / `writeShoutCloudAllowed` from Task 3.
- Produces: `type ShoutControls` exported from `VoicePanel.tsx`, and a `shout: ShoutControls` prop on `VoicePanel`.

- [ ] **Step 1: Add the six strings**

In `apps/web/src/i18n/messages.ts`, inside the `voice` block (after `unmuteThem`):

```ts
    shoutListening: string
    shoutUnsupported: string
    shoutOffline: string
    shoutInstall: string
    shoutInstalling: string
    shoutCloud: string
```

In `apps/web/src/i18n/en.ts`, same place in the `voice` block:

```ts
    shoutListening: 'Shout "uno" to call it.',
    shoutUnsupported: 'This browser cannot recognise the word. Use the UNO button.',
    shoutOffline: 'Shouting "uno" needs an offline language pack.',
    shoutInstall: 'Download it',
    shoutInstalling: 'Downloading…',
    shoutCloud:
      'Call UNO by shouting it. This browser has no offline recognition, so your microphone goes to its maker while your hand is nearly done.',
```

In `apps/web/src/i18n/fr.ts`, same place in the `voice` block:

```ts
    shoutListening: 'Crie « uno » pour annoncer.',
    shoutUnsupported: 'Ce navigateur ne reconnaît pas le mot. Utilise le bouton UNO.',
    shoutOffline: 'Crier « uno » demande un pack de langue hors ligne.',
    shoutInstall: 'Le télécharger',
    shoutInstalling: 'Téléchargement…',
    shoutCloud:
      'Annoncer UNO en le criant. Ce navigateur n’a pas de reconnaissance hors ligne, ton micro part donc chez son éditeur quand ta main touche à sa fin.',
```

- [ ] **Step 2: Write the failing panel test**

Append to `apps/web/src/components/VoicePanel.test.tsx`, adapting the existing render helper in that file to pass the new `shout` prop:

```ts
const shoutControls = (over: Partial<ShoutControls> = {}): ShoutControls => ({
  availability: 'local',
  cloudAllowed: false,
  onCloudAllowed: vi.fn(),
  onInstalled: vi.fn(),
  ...over,
})

describe('VoicePanel shout row', () => {
  it('says the shout is live when recognition runs on the device', () => {
    renderJoined({ shout: shoutControls({ availability: 'local' }) })
    expect(screen.getByText(fr.voice.shoutListening)).toBeInTheDocument()
  })

  it('points at the button when the browser cannot recognise anything', () => {
    renderJoined({ shout: shoutControls({ availability: 'unsupported' }) })
    expect(screen.getByText(fr.voice.shoutUnsupported)).toBeInTheDocument()
  })

  it('offers the download when a language pack would make it local', () => {
    renderJoined({ shout: shoutControls({ availability: 'downloadable' }) })
    expect(screen.getByRole('button', { name: fr.voice.shoutInstall })).toBeInTheDocument()
  })

  it('asks before opening a cloud recogniser, and says where the audio goes', () => {
    renderJoined({ shout: shoutControls({ availability: 'cloud' }) })
    const consent = screen.getByRole('checkbox', { name: fr.voice.shoutCloud })
    expect(consent).not.toBeChecked()
  })

  it('reports a consent change to its owner', async () => {
    const onCloudAllowed = vi.fn()
    renderJoined({ shout: shoutControls({ availability: 'cloud', onCloudAllowed }) })
    await userEvent.click(screen.getByRole('checkbox', { name: fr.voice.shoutCloud }))
    expect(onCloudAllowed).toHaveBeenCalledWith(true)
  })

  it('shows nothing at all while the probe is still running', () => {
    renderJoined({ shout: shoutControls({ availability: 'probing' }) })
    expect(screen.queryByText(fr.voice.shoutListening)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run apps/web/src/components/VoicePanel.test.tsx`
Expected: FAIL, `ShoutControls` is not exported and the row does not render.

- [ ] **Step 4: Add the row to the panel**

In `apps/web/src/components/VoicePanel.tsx`, add to the imports:

```ts
import { useLocale, useMessages } from '../i18n/index.js'
import { installShout, type ShoutAvailability } from '../lib/voice/shout-listener.js'
```

Add the type and the component above `VoicePanel`:

```tsx
export type ShoutControls = {
  availability: ShoutAvailability | 'probing'
  cloudAllowed: boolean
  onCloudAllowed: (allowed: boolean) => void
  /** Re-probes after a language pack lands, which turns cloud into local. */
  onInstalled: () => void
}

/** What the shout can do here, and what it needs from the player to do it. */
function ShoutRow({ shout }: { shout: ShoutControls }) {
  const t = useMessages()
  const locale = useLocale()
  const [installing, setInstalling] = useState(false)

  if (shout.availability === 'probing') return null
  if (shout.availability === 'local') return <p className="voice-note">{t.voice.shoutListening}</p>
  if (shout.availability === 'unsupported')
    return <p className="voice-note">{t.voice.shoutUnsupported}</p>

  if (shout.availability === 'downloadable')
    return (
      <p className="voice-note">
        {t.voice.shoutOffline}{' '}
        <button
          type="button"
          className="btn-link"
          disabled={installing}
          onClick={() => {
            // install() needs the gesture, so it is a button and never an effect.
            setInstalling(true)
            void installShout(locale).then(() => {
              setInstalling(false)
              shout.onInstalled()
            })
          }}
        >
          {installing ? t.voice.shoutInstalling : t.voice.shoutInstall}
        </button>
      </p>
    )

  return (
    <label className="voice-note voice-shout-cloud">
      <input
        type="checkbox"
        checked={shout.cloudAllowed}
        onChange={(event) => shout.onCloudAllowed(event.target.checked)}
      />
      {t.voice.shoutCloud}
    </label>
  )
}
```

Add `shout: ShoutControls` to `VoicePanelProps`, take it in the signature, and render `<ShoutRow shout={shout} />` immediately after the `<ul className="voice-peers">` block in the joined branch.

- [ ] **Step 5: Add the one class**

In `apps/web/src/styles/app.css`, beside the other `.voice-` rules:

```css
.voice-shout-cloud {
  display: flex;
  gap: 0.4rem;
  align-items: start;
  cursor: pointer;
}
```

- [ ] **Step 6: Wire the table**

In `apps/web/src/screens/Table.tsx`, extend the preferences import on line 23:

```ts
import {
  nextColourMode,
  readKonamiUnlocked,
  readShoutCloudAllowed,
  writeKonamiUnlocked,
  writeShoutCloudAllowed,
} from '../lib/preferences.js'
```

Add `import { useLocale, useMessages } from '../i18n/index.js'` if `useLocale` is not already imported there, and near the other module constants:

```ts
/* The recogniser is warm before the window opens, because a cloud start costs a few
   hundred milliseconds and the shout arrives with the window. Wider than callUno on
   purpose: that is offered at two cards, or at one while vulnerable. */
const SHOUT_PREWARM_CARDS = 3
```

Replace the `useShoutUno` call at lines 77-81:

```ts
const locale = useLocale()
const [shoutCloudAllowed, setShoutCloudAllowed] = useState(readShoutCloudAllowed)
const shout = useShoutUno({
  armed: canCallUno,
  prewarm: view.you.hand.length <= SHOUT_PREWARM_CARDS,
  /* Mute means stop listening to me. The recogniser holds its own capture, so
     without this it would keep transcribing a closed microphone. */
  enabled: voice.status === 'joined' && !voice.muted,
  locale,
  cloudAllowed: shoutCloudAllowed,
  onCall: () => onPlay({ type: 'callUno' }),
})
```

Pass it down at line 350:

```tsx
<VoicePanel
  voice={voice}
  seatNames={[0, 1, 2, 3].map((seat) => nameOf(seat))}
  selfSeat={view.you.seat}
  shout={{
    availability: shout.availability,
    cloudAllowed: shoutCloudAllowed,
    onCloudAllowed: (allowed) => {
      writeShoutCloudAllowed(allowed)
      setShoutCloudAllowed(allowed)
    },
    onInstalled: shout.refresh,
  }}
/>
```

- [ ] **Step 7: Run the whole suite**

Run: `npm run verify`
Expected: PASS. `Table.test.tsx` may need the new `shout` prop wherever it renders `VoicePanel` directly; fix those call sites, do not loosen the prop type to optional.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/VoicePanel.tsx apps/web/src/components/VoicePanel.test.tsx \
  apps/web/src/screens/Table.tsx apps/web/src/styles/app.css \
  apps/web/src/i18n/messages.ts apps/web/src/i18n/en.ts apps/web/src/i18n/fr.ts
git commit -F - <<'EOF'
feat(web): surface the shout state and ask before using a cloud recogniser

The panel says which of the four states the browser is in, offers the
language pack download where that turns cloud into on-device, and asks
plainly before any audio goes to the browser maker.

The recogniser stops while the microphone is muted. It holds a capture of
its own, so track.enabled alone would leave it transcribing a player who
had just asked to be silent.
EOF
```

---

### Task 6: Verify in a browser, then document

**Files:**

- Modify: `openwiki/architecture/voice-chat.md:71-88` and the file table row near `:116`

**Interfaces:**

- Consumes: everything above. Produces no code.

- [ ] **Step 1: Build and run**

```bash
npm run build && npm run dev
```

Open two Chrome windows on the table, join voice in both. A stale `dist/` means a new client talking to an old server, so the build is not optional.

- [ ] **Step 2: Check the two captures coexist**

This is the risk no unit test can see: `SpeechRecognition` opens its own capture beside the `getUserMedia` stream `useVoice` already holds.

With both windows in voice and a hand down to three cards, confirm in the browser:

- The other player is still audible, both ways.
- The speaking indicator still lights on `voice-peer-self`.
- `chrome://media-internals` shows both captures live.

Measure it in the running browser, not from a screenshot.

- [ ] **Step 3: Check the trigger**

- Talk normally with two cards in hand. The call must **not** fire. This is the bug being fixed; if it still fires, stop and go back to Task 1.
- Shout "uno". The call fires once.
- Shout it again in the same window. Nothing more happens.
- Mute the microphone, shout again. Nothing happens.
- Leave it idle for a minute with a short hand, then shout. It still fires, which is the restart working.

- [ ] **Step 4: Note the Safari result**

Repeat step 2 on iOS Safari if a device is to hand. Two concurrent captures is where it is expected to break. Record what happens in the commit body, whatever it is. If it does break, the fix is to leave the shout off there, not to remove the mute rule.

- [ ] **Step 5: Rewrite the wiki section**

Replace the `Shouting UNO calls it` section of `openwiki/architecture/voice-chat.md` with an account of what now exists: the word recognition rather than the level, the four availability states and what each browser gets, the pre-warm at three cards and why it is wider than the armed window, the restart on `onend` and why removing it kills the feature silently, and mute stopping the recogniser. Keep the `armed` comes from `legalMoves` point, which has not changed.

Update the file table near line 116: `useShoutUno.ts` no longer turns a level into a call. Add rows for `hears-uno.ts` and `shout-listener.ts`.

- [ ] **Step 6: Commit**

```bash
npm run verify
git add openwiki/architecture/voice-chat.md
git commit -F - <<'EOF'
docs(wiki): the shout listens for the word, not for a level

Records the four availability states, why the recogniser warms up wider
than the armed window, and why the restart on onend cannot be removed.
EOF
```

---

## Self-review

Spec coverage, section by section:

| Spec section | Task |
| ------------ | ---- |
| The matcher, per-locale lists, the `you know` exclusion | 1 |
| Availability probe, install, on-device preference | 2 |
| Restart, backoff, `resultIndex`, refusal, `InvalidStateError` | 2 |
| Cloud off until consented | 3, 5 |
| Arming unchanged, trigger swapped | 4 |
| Pre-warm at three cards | 4, 5 |
| Mute stops the recogniser | 5 |
| Amplitude trigger removed, detector untouched | 4 (the rewrite drops `speaking`) |
| Six strings across three files | 5 |
| Two concurrent captures, manual check | 6 |
| Wiki section and file table | 6 |

Names used consistently across tasks: `hearsUno`, `probeShout`, `installShout`, `createShoutListener`, `ShoutListener`, `ShoutAvailability`, `SpeechRecognitionLike`, `ShoutControls`, `readShoutCloudAllowed`, `writeShoutCloudAllowed`, `SHOUT_PREWARM_CARDS`.
