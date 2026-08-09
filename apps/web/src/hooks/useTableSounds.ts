import { useCallback, useEffect, useRef, useState } from 'react'
import { createAudioEngine, type AudioEngine } from '../lib/audio-engine.js'
import { readMuted, writeMuted } from '../lib/preferences.js'
import { soundsForEvents, type SoundName } from '../lib/sounds.js'
import type { FeedEntry } from './game-reducer.js'

type UseTableSounds = {
  feed: FeedEntry[]
  /** Fires a cue on the moment the turn arrives, not for every render of it. */
  isMyTurn: boolean
  /** Needed to tell winning apart from watching someone else win. */
  mySeat: number
}

const highestId = (feed: FeedEntry[]): number =>
  feed.reduce((highest, entry) => (entry.id > highest ? entry.id : highest), 0)

/**
 * Turns table events into sound, and owns the mute preference.
 *
 * Driven by the feed rather than the view — the opposite of useTableEffects,
 * deliberately. That hook reads the view because a burst needs the colour chosen
 * for a wild, which the feed may not have caught up with. Sound only needs the
 * card's kind, so one source is enough and the decision stays a pure function.
 */
export function useTableSounds({ feed, isMyTurn, mySeat }: UseTableSounds) {
  const [muted, setMuted] = useState(readMuted)
  const engine = useRef<AudioEngine | null>(null)

  /* Starts at what is already on screen, exactly as useTableEffects does. A first
     paint — including the one after a reconnect, which arrives with the whole
     backlog — must not replay every sound of the last ten minutes at once. */
  const lastFeedId = useRef(highestId(feed))
  const wasMyTurn = useRef(isMyTurn)

  const mutedRef = useRef(muted)
  mutedRef.current = muted

  useEffect(() => {
    engine.current = createAudioEngine()
    const current = engine.current

    /* An AudioContext is born suspended and stays mute until a gesture unlocks
       it. Listening once on the window covers every route into the game without
       every button having to remember to do it. */
    const unlock = () => {
      current?.unlock()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      current?.close()
      engine.current = null
    }
  }, [])

  const play = useCallback((name: SoundName) => {
    if (mutedRef.current) return
    engine.current?.play(name)
  }, [])

  useEffect(() => {
    const fresh = feed.filter((entry) => entry.id > lastFeedId.current)
    if (fresh.length === 0) return
    lastFeedId.current = highestId(fresh)

    const events = fresh.flatMap((entry) => (entry.kind === 'event' ? [entry.event] : []))
    for (const name of soundsForEvents(events, mySeat)) play(name)
  }, [feed, play, mySeat])

  useEffect(() => {
    const arrived = isMyTurn && !wasMyTurn.current
    wasMyTurn.current = isMyTurn
    if (arrived) play('yourTurn')
  }, [isMyTurn, play])

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current
      writeMuted(next)
      // Unmuting is itself the gesture that can unlock a context which was never
      // unlocked, for a player who muted before ever hearing anything.
      if (!next) engine.current?.unlock()
      return next
    })
  }, [])

  return { muted, toggleMuted }
}
