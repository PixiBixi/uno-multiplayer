import { useEffect, useRef } from 'react'

/**
 * Calls UNO by shouting it, which is how the game is played away from a screen.
 *
 * `armed` comes from `legalMoves`, so the client learns nothing about the rules it
 * did not already receive: the server said the call was legal, and refuses it
 * otherwise. A sound at the wrong moment therefore costs nothing.
 *
 * `speaking` is the local level the voice detector already computes. A muted
 * microphone produces silence, so a muted player still uses the button.
 */
export function useShoutUno(options: {
  armed: boolean
  speaking: boolean
  onCall: () => void
}): void {
  const { armed, speaking, onCall } = options
  const firedRef = useRef(false)
  const callRef = useRef(onCall)
  callRef.current = onCall

  useEffect(() => {
    // Leaving the window re-arms it for the next card that drops to one.
    if (!armed) {
      firedRef.current = false
      return
    }
    if (!speaking || firedRef.current) return

    /* Once per window rather than per rising edge: a window that opens while its
       owner is already mid-sentence should still catch the shout, and a stuttering
       level should not emit the same call five times. */
    firedRef.current = true
    callRef.current()
  }, [armed, speaking])
}
