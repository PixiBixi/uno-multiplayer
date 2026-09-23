import type { RefObject } from 'react'
import { highestFeedId, type FeedEntry } from './game-reducer.js'

/**
 * Entries added to `feed` since `lastFeedId`, and advances the ref past them.
 * Shared by useTableSounds and useTableEffects, which both replay only what
 * arrived since their last look - never a reconnect's whole backlog - and both
 * seed `lastFeedId` at what is already on screen before calling this.
 */
export function freshFeedEntries(feed: FeedEntry[], lastFeedId: RefObject<number>): FeedEntry[] {
  const fresh = feed.filter((entry) => entry.id > lastFeedId.current)
  if (fresh.length > 0) lastFeedId.current = highestFeedId(fresh)
  return fresh
}
