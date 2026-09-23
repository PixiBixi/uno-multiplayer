import { describe, expect, it } from 'vitest'
import { freshFeedEntries } from './feed-window.js'
import type { FeedEntry } from './game-reducer.js'

const chat = (id: number): FeedEntry => ({ id, kind: 'chat', seat: 0, name: 'Ana', text: 'hi' })

describe('freshFeedEntries', () => {
  it('returns nothing when the feed has not grown past lastFeedId', () => {
    const lastFeedId = { current: 3 }
    expect(freshFeedEntries([chat(1), chat(2), chat(3)], lastFeedId)).toEqual([])
    expect(lastFeedId.current).toBe(3)
  })

  it('returns only entries newer than lastFeedId and advances it to the highest', () => {
    const lastFeedId = { current: 1 }
    const fresh = freshFeedEntries([chat(1), chat(2), chat(3)], lastFeedId)
    expect(fresh).toEqual([chat(2), chat(3)])
    expect(lastFeedId.current).toBe(3)
  })

  it('leaves lastFeedId untouched when nothing is fresh, not reset to the feed max', () => {
    // A backlog delivered out of order must not walk the cursor backwards.
    const lastFeedId = { current: 5 }
    expect(freshFeedEntries([chat(1), chat(2)], lastFeedId)).toEqual([])
    expect(lastFeedId.current).toBe(5)
  })
})
