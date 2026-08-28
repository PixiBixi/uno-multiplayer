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
