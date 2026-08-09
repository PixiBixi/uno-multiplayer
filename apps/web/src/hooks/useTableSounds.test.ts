import type { Card, CardId } from '@uno/engine'
import type { GameEvent } from '@uno/protocol'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SoundName } from '../lib/sounds.js'
import { useTableSounds } from './useTableSounds.js'
import type { FeedEntry } from './game-reducer.js'

/* jsdom has no Web Audio, so the engine is replaced wholesale. What is under test
   here is the bookkeeping — which cues fire, once each, and never for history —
   not the synthesis, which no assertion could judge anyway. */
const played: SoundName[] = []
const unlocked = { count: 0 }

vi.mock('../lib/audio-engine.js', () => ({
  createAudioEngine: () => ({
    play: (name: SoundName) => played.push(name),
    unlock: () => {
      unlocked.count += 1
    },
    close: () => undefined,
  }),
}))

const card = (kind: 'number' | 'wild4'): Card =>
  kind === 'number'
    ? { id: 'n' as CardId, kind: 'number', color: 'R', value: 5 }
    : { id: 'w' as CardId, kind: 'wild4' }

let nextId = 0
const entry = (event: GameEvent): FeedEntry => {
  nextId += 1
  return { id: nextId, kind: 'event', event }
}

beforeEach(() => {
  played.length = 0
  unlocked.count = 0
  nextId = 0
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('useTableSounds', () => {
  it('plays a cue for each new feed event', () => {
    const { rerender } = renderHook(
      ({ feed }: { feed: FeedEntry[] }) => useTableSounds({ feed, isMyTurn: false, mySeat: 0 }),
      { initialProps: { feed: [] as FeedEntry[] } },
    )

    rerender({ feed: [entry({ type: 'cardPlayed', seat: 1, card: card('wild4') })] })
    expect(played).toEqual(['wild4'])
  })

  it('never replays an event it has already sounded', () => {
    const first = [entry({ type: 'unoCalled', seat: 1 })]
    const { rerender } = renderHook(
      ({ feed }: { feed: FeedEntry[] }) => useTableSounds({ feed, isMyTurn: false, mySeat: 0 }),
      { initialProps: { feed: [] as FeedEntry[] } },
    )

    rerender({ feed: first })
    rerender({ feed: [...first] })
    expect(played).toEqual(['uno'])
  })

  it('stays silent for a backlog that was already on screen at first paint', () => {
    /* A reconnect arrives with the whole history at once. Sounding it would be a
       minute of the game replayed as noise, which is the audio version of the
       animation storm useTableEffects guards against. */
    const backlog = [
      entry({ type: 'cardPlayed', seat: 0, card: card('wild4') }),
      entry({ type: 'unoCalled', seat: 1 }),
    ]

    renderHook(() => useTableSounds({ feed: backlog, isMyTurn: false, mySeat: 0 }))
    expect(played).toEqual([])
  })

  it('sounds a win differently from watching someone else win', () => {
    const { rerender } = renderHook(
      ({ feed }: { feed: FeedEntry[] }) => useTableSounds({ feed, isMyTurn: false, mySeat: 0 }),
      { initialProps: { feed: [] as FeedEntry[] } },
    )

    rerender({
      feed: [entry({ type: 'roundEnded', winner: 0, awarded: [30, 0], scores: [30, 0] })],
    })
    expect(played).toEqual(['roundWon'])

    played.length = 0
    rerender({
      feed: [entry({ type: 'roundEnded', winner: 1, awarded: [0, 30], scores: [30, 30] })],
    })
    expect(played).toEqual(['roundOver'])
  })

  it('sounds the turn arriving, once, not every render of it', () => {
    const { rerender } = renderHook(
      ({ mine }: { mine: boolean }) => useTableSounds({ feed: [], isMyTurn: mine, mySeat: 0 }),
      { initialProps: { mine: false } },
    )

    rerender({ mine: true })
    rerender({ mine: true })
    expect(played).toEqual(['yourTurn'])
  })

  it('does not sound a turn that was already yours on the first render', () => {
    renderHook(() => useTableSounds({ feed: [], isMyTurn: true, mySeat: 0 }))
    expect(played).toEqual([])
  })

  it('plays nothing while muted, and remembers being muted', () => {
    const { result, rerender } = renderHook(
      ({ feed }: { feed: FeedEntry[] }) => useTableSounds({ feed, isMyTurn: false, mySeat: 0 }),
      { initialProps: { feed: [] as FeedEntry[] } },
    )

    act(() => {
      result.current.toggleMuted()
    })
    expect(result.current.muted).toBe(true)

    rerender({ feed: [entry({ type: 'unoCalled', seat: 1 })] })
    expect(played).toEqual([])
    expect(window.localStorage.getItem('uno.pref.muted')).toBe('true')
  })

  it('starts muted when that is what was stored', () => {
    window.localStorage.setItem('uno.pref.muted', 'true')
    const { result } = renderHook(() => useTableSounds({ feed: [], isMyTurn: false, mySeat: 0 }))
    expect(result.current.muted).toBe(true)
  })

  it('starts audible for anything other than a stored true', () => {
    // A half-written or corrupted value must not leave a player in a silence
    // they cannot account for.
    window.localStorage.setItem('uno.pref.muted', 'wat')
    const { result } = renderHook(() => useTableSounds({ feed: [], isMyTurn: false, mySeat: 0 }))
    expect(result.current.muted).toBe(false)
  })

  it('unlocks the context when sound is turned back on', () => {
    // Somebody who muted before ever clicking has a context still suspended, and
    // the unmute click is itself the gesture allowed to resume it.
    const { result } = renderHook(() => useTableSounds({ feed: [], isMyTurn: false, mySeat: 0 }))

    act(() => {
      result.current.toggleMuted()
    })
    const before = unlocked.count
    act(() => {
      result.current.toggleMuted()
    })

    expect(unlocked.count).toBeGreaterThan(before)
  })
})
