import { useEffect, useRef } from 'react'

/** The sequence, in `KeyboardEvent.key` spellings. */
export const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const

/**
 * Calls back when the sequence is typed. Progress lives in a ref rather than in
 * state: nothing renders differently halfway through, and a state update per
 * keystroke would re-render the whole table for a secret nobody is watching.
 */
export function useKonami(onUnlock: () => void): void {
  const atRef = useRef(0)
  const unlockRef = useRef(onUnlock)
  unlockRef.current = onUnlock

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key !== KONAMI[atRef.current]) {
        /* A wrong key restarts, and restarts at 1 when it is itself the opening
           key - otherwise a stray Up before the real attempt eats the first press. */
        atRef.current = key === KONAMI[0] ? 1 : 0
        return
      }
      atRef.current += 1
      if (atRef.current < KONAMI.length) return
      atRef.current = 0
      unlockRef.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
