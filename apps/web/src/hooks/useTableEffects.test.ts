import type { Card, CardId } from '@uno/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EFFECT_DURATION_MS } from '../lib/play-effects.js'
import type { FeedEntry } from './game-reducer.js'
import { useTableEffects } from './useTableEffects.js'

const id = (value: string) => value as CardId
const num = (cardId: string): Card => ({ id: id(cardId), kind: 'number', color: 'R', value: 3 })
const wild4 = (cardId: string): Card => ({ id: id(cardId), kind: 'wild4' })
const skip = (cardId: string): Card => ({ id: id(cardId), kind: 'skip', color: 'G' })

const unoCalled = (entryId: number): FeedEntry => ({
  id: entryId,
  kind: 'event',
  event: { type: 'unoCalled', seat: 1 },
})
const cardsDrawn = (entryId: number, count = 1): FeedEntry => ({
  id: entryId,
  kind: 'event',
  event: { type: 'cardsDrawn', seat: 1, count },
})
const chat = (entryId: number): FeedEntry => ({
  id: entryId,
  kind: 'chat',
  seat: 1,
  name: 'Ben',
  text: 'hi',
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const setup = (discardTop: Card, feed: FeedEntry[] = []) =>
  renderHook(
    (props: { discardTop: Card; feed: FeedEntry[] }) =>
      useTableEffects({ ...props, currentColor: 'R' }),
    {
      initialProps: { discardTop, feed },
    },
  )

describe('card bursts', () => {
  it('fires nothing on first paint, even when a wild4 is already on top', () => {
    const { result } = setup(wild4('a'))
    expect(result.current.effects).toEqual([])
  })

  it('fires when a new wild4 lands', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: wild4('b'), feed: [] })
    expect(result.current.effects.map((effect) => effect.kind)).toEqual(['wild4'])
  })

  it('reports shaking only while a wild4 burst is live', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: wild4('b'), feed: [] })
    expect(result.current.shaking).toBe(true)
    act(() => {
      vi.advanceTimersByTime(EFFECT_DURATION_MS.wild4 + 10)
    })
    expect(result.current.shaking).toBe(false)
  })

  it('does not shake for a lesser card', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: skip('b'), feed: [] })
    expect(result.current.shaking).toBe(false)
  })

  it('ignores a re-render that leaves the same card on top, as a draw does', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: wild4('b'), feed: [] })
    rerender({ discardTop: wild4('b'), feed: [] })
    expect(result.current.effects).toHaveLength(1)
  })

  it('fires nothing for a plain number card', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('b'), feed: [] })
    expect(result.current.effects).toEqual([])
  })
})

describe('UNO calls, read from the feed', () => {
  it('fires a uno burst for a fresh unoCalled event', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('a'), feed: [unoCalled(1)] })
    expect(result.current.effects.map((effect) => effect.kind)).toEqual(['uno'])
  })

  it('clears the burst once its duration elapses', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('a'), feed: [unoCalled(1)] })
    act(() => {
      vi.advanceTimersByTime(EFFECT_DURATION_MS.uno + 10)
    })
    expect(result.current.effects).toEqual([])
  })

  it('does not fire for a backlog already present at mount, as after a reconnect', () => {
    const { result } = setup(num('a'), [unoCalled(1), cardsDrawn(2), unoCalled(3)])
    expect(result.current.effects).toEqual([])
    expect(result.current.drawNonce).toBe(0)
  })

  it('does not re-fire for entries it has already seen', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('a'), feed: [unoCalled(1)] })
    rerender({ discardTop: num('a'), feed: [unoCalled(1), chat(2)] })
    expect(result.current.effects.filter((effect) => effect.kind === 'uno')).toHaveLength(1)
  })

  it('does not shake the table for a uno call', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('a'), feed: [unoCalled(1)] })
    expect(result.current.shaking).toBe(false)
  })
})

describe('draws, read from the feed', () => {
  it('bumps the pulse counter once per draw event', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('a'), feed: [cardsDrawn(1)] })
    expect(result.current.drawNonce).toBe(1)
    rerender({ discardTop: num('a'), feed: [cardsDrawn(1), cardsDrawn(2)] })
    expect(result.current.drawNonce).toBe(2)
  })

  it('bumps once regardless of how many cards were drawn', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('a'), feed: [cardsDrawn(1, 4)] })
    expect(result.current.drawNonce).toBe(1)
  })

  it('pulses for a uno penalty too, since cards really did leave the pile', () => {
    const { result, rerender } = setup(num('a'))
    rerender({
      discardTop: num('a'),
      feed: [{ id: 1, kind: 'event', event: { type: 'unoPenalty', seat: 0, count: 2 } }],
    })
    expect(result.current.drawNonce).toBe(1)
  })

  it('puts no burst on the overlay for a draw', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: num('a'), feed: [cardsDrawn(1)] })
    expect(result.current.effects).toEqual([])
  })

  it('ignores chat and other events entirely', () => {
    const { result, rerender } = setup(num('a'))
    rerender({
      discardTop: num('a'),
      feed: [chat(1), { id: 2, kind: 'event', event: { type: 'seatReconnected', seat: 1 } }],
    })
    expect(result.current.drawNonce).toBe(0)
    expect(result.current.effects).toEqual([])
  })
})

describe('several flourishes at once', () => {
  it('stacks a card burst and a uno burst without either cancelling the other', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: skip('b'), feed: [unoCalled(1)] })
    expect(result.current.effects.map((effect) => effect.kind).sort()).toEqual(['skip', 'uno'])
  })

  it('gives every live burst a distinct key so React can tell them apart', () => {
    const { result, rerender } = setup(num('a'))
    rerender({ discardTop: skip('b'), feed: [unoCalled(1), unoCalled(2)] })
    const keys = result.current.effects.map((effect) => effect.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('drops pending timers on unmount rather than firing into a dead component', () => {
    const { rerender, unmount } = setup(num('a'))
    rerender({ discardTop: wild4('b'), feed: [] })
    unmount()
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(EFFECT_DURATION_MS.wild4 + 50)
      })
    }).not.toThrow()
  })
})
