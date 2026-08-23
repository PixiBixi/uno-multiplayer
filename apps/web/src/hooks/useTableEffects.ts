import type { Card, Color } from '@uno/engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EFFECT_DURATION_MS,
  effectForCard,
  effectForFeedEvent,
  type ActiveEffect,
  type EffectKind,
} from '../lib/play-effects.js'
import { highestFeedId, type FeedEntry } from './game-reducer.js'

type UseTableEffects = {
  discardTop: Card
  currentColor: Color
  feed: FeedEntry[]
}

/**
 * Owns every transient table flourish in one place, so the "what have I already
 * reacted to" bookkeeping exists once rather than in each component that wants
 * an animation.
 *
 * Returns state, not DOM: the burst overlay, the shake flag and the draw-pile
 * pulse counter are rendered by three different parts of the table, and putting
 * the logic here keeps all of it testable without a browser.
 */
export function useTableEffects({ discardTop, currentColor, feed }: UseTableEffects) {
  const [effects, setEffects] = useState<ActiveEffect[]>([])
  const [drawNonce, setDrawNonce] = useState(0)

  /* Both refs start at what is already on screen. A first paint - including the
     one right after a reconnect, which arrives with a whole backlog of feed
     entries - must not replay a storm of animations for moves that happened
     minutes ago. */
  const lastCardId = useRef(discardTop.id)
  const lastFeedId = useRef(highestFeedId(feed))

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const nextKey = useRef(0)

  const push = useCallback((kind: EffectKind, color?: Color) => {
    nextKey.current += 1
    const key = `fx-${String(nextKey.current)}`
    setEffects((current) => [...current, { key, kind, ...(color === undefined ? {} : { color }) }])
    const timer = setTimeout(() => {
      setEffects((current) => current.filter((effect) => effect.key !== key))
    }, EFFECT_DURATION_MS[kind])
    timers.current.push(timer)
  }, [])

  // Pending timers would otherwise keep firing into a component that is gone,
  // for instance when a player leaves the table mid-burst.
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer)
      timers.current = []
    },
    [],
  )

  // Card bursts: driven by the view, which is race-free for the chosen colour.
  useEffect(() => {
    if (discardTop.id === lastCardId.current) return
    lastCardId.current = discardTop.id
    const effect = effectForCard(discardTop, currentColor)
    if (effect !== null) push(effect.kind, effect.color)
  }, [discardTop, currentColor, push])

  // UNO calls and draws: driven by the feed, which is the only place they exist.
  useEffect(() => {
    const fresh = feed.filter((entry) => entry.id > lastFeedId.current)
    if (fresh.length === 0) return
    lastFeedId.current = highestFeedId(fresh)

    for (const entry of fresh) {
      if (entry.kind !== 'event') continue
      const effect = effectForFeedEvent(entry.event)
      if (effect === null) continue
      if ('overlay' in effect) push(effect.overlay)
      else setDrawNonce((current) => current + 1)
    }
  }, [feed, push])

  return {
    effects,
    shaking: effects.some((effect) => effect.kind === 'wild4'),
    drawNonce,
  }
}
