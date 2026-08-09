import { HAND_SORTS, type HandSort } from './sort-hand.js'

const HAND_SORT_KEY = 'uno.pref.handSort'

const isHandSort = (value: string | null): value is HandSort =>
  value !== null && (HAND_SORTS as readonly string[]).includes(value)

/**
 * A display preference, kept apart from session tokens: different lifetime,
 * different concern. Same defensive reads — storage can be blocked outright, and
 * losing a preference must never break the page.
 */
export function readHandSort(): HandSort {
  try {
    const stored = window.localStorage.getItem(HAND_SORT_KEY)
    return isHandSort(stored) ? stored : 'dealt'
  } catch {
    return 'dealt'
  }
}

export function writeHandSort(mode: HandSort): void {
  try {
    window.localStorage.setItem(HAND_SORT_KEY, mode)
  } catch {
    /* The preference will not survive a reload. Play continues. */
  }
}

const MUTED_KEY = 'uno.pref.muted'

/**
 * Sound is on unless someone turned it off, which is the norm for a game — and
 * safe here because no sound can fire before the click that creates or joins a
 * table. Nobody is ambushed by opening the page.
 *
 * Stored as the exception rather than the state: only the exact string 'true'
 * means muted, so a corrupted or half-written value falls back to audible rather
 * than to a silence the player cannot explain.
 */
export function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? 'true' : 'false')
  } catch {
    /* The preference will not survive a reload. Play continues. */
  }
}
