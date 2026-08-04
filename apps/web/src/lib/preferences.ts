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
