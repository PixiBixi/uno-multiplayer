import { useEffect, useState } from 'react'

/**
 * Seconds left until a server-set deadline, or null when there is no clock.
 *
 * Takes a deadline rather than a duration on purpose. A client that drops frames,
 * sleeps a background tab, or reconnects halfway through a turn would drift away
 * from the server if it counted down from a duration it was handed once; reading
 * the remainder of an absolute stamp cannot drift, because every tick recomputes
 * it from the same fixed point the server used.
 *
 * The clock is still the server's. This only renders what is left of it, and a
 * disagreement of a few hundred milliseconds shows up as a number arriving
 * slightly early rather than as a move being wrongly allowed or refused.
 */
export function useCountdown(deadline: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => secondsLeft(deadline))

  useEffect(() => {
    if (deadline === null) {
      setRemaining(null)
      return
    }

    setRemaining(secondsLeft(deadline))
    /* Four times a second, not once. Ticking on the second boundary makes the
       displayed number lag by up to a full second after a re-arm, which at three
       seconds a turn is a third of the clock. */
    const handle = setInterval(() => {
      setRemaining(secondsLeft(deadline))
    }, 250)

    return () => {
      clearInterval(handle)
    }
  }, [deadline])

  return remaining
}

function secondsLeft(deadline: number | null): number | null {
  if (deadline === null) return null
  // Rounded up so the last second is shown as 1 rather than flicking to 0 while
  // there is still time to play.
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}
