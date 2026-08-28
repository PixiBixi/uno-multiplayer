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
      // A stopped listener has no microphone: a late event from an abandoned
      // recogniser must not shout.
      if (!wanted || refused) return
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
