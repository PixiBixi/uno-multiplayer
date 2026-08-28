import { ALL_CARD_THEMES, DEFAULT_CARD_THEME, type CardTheme } from './card-themes.js'
import { HAND_SORTS, type HandSort } from './sort-hand.js'

const HAND_SORT_KEY = 'uno.pref.handSort'

const isHandSort = (value: string | null): value is HandSort =>
  value !== null && (HAND_SORTS as readonly string[]).includes(value)

/**
 * A display preference, kept apart from session tokens: different lifetime,
 * different concern. Same defensive reads - storage can be blocked outright, and
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
 * Sound is on unless someone turned it off, which is the norm for a game - and
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

const CARD_THEME_KEY = 'uno.pref.cardTheme'

const isCardTheme = (value: string | null): value is CardTheme =>
  value !== null && (ALL_CARD_THEMES as readonly string[]).includes(value)

/**
 * Which of the four card faces this player sees. Nobody else is affected: two
 * people at the same table can run different themes and the game is identical.
 *
 * An unrecognised value falls back to `classic` rather than being trusted, because
 * a theme name with no spec behind it is not a cosmetic problem - the face would be
 * built from `undefined` and render as a blank card, with a hand of them. Same
 * reasoning as the mute flag, which stores the exception rather than the state.
 */
export function readCardTheme(): CardTheme {
  try {
    const stored = window.localStorage.getItem(CARD_THEME_KEY)
    return isCardTheme(stored) ? stored : DEFAULT_CARD_THEME
  } catch {
    return DEFAULT_CARD_THEME
  }
}

export function writeCardTheme(theme: CardTheme): void {
  try {
    window.localStorage.setItem(CARD_THEME_KEY, theme)
  } catch {
    /* The preference will not survive a reload. Play continues. */
  }
}

const COLOUR_MODE_KEY = 'uno.pref.colourMode'

/**
 * Paper, ink, or whatever the machine is set to.
 *
 * `system` is a real option and the default rather than an absence of one: somebody who
 * has told their OS they want dark has already answered this question, and the two
 * palettes are the same design either way. The other two exist because that setting is
 * often not a preference about a game - a laptop on a schedule flips at sunset, and a
 * player mid-match should be able to say "not this, not now".
 */
export const COLOUR_MODES = ['system', 'light', 'dark'] as const
export type ColourMode = (typeof COLOUR_MODES)[number]

const isColourMode = (value: string | null): value is ColourMode =>
  value !== null && (COLOUR_MODES as readonly string[]).includes(value)

export function readColourMode(): ColourMode {
  try {
    const stored = window.localStorage.getItem(COLOUR_MODE_KEY)
    return isColourMode(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function writeColourMode(mode: ColourMode): void {
  try {
    window.localStorage.setItem(COLOUR_MODE_KEY, mode)
  } catch {
    /* The preference will not survive a reload. Play continues. */
  }
}

/** The next mode round the loop. The masthead cycles rather than opening a menu. */
export const nextColourMode = (mode: ColourMode): ColourMode =>
  COLOUR_MODES[(COLOUR_MODES.indexOf(mode) + 1) % COLOUR_MODES.length] ?? 'system'

const KONAMI_KEY = 'uno.pref.konami'

/**
 * Whether the hidden face has been found. Kept with the other display preferences
 * because that is what it is: it unlocks something one player sees, it never
 * crosses the wire, and losing it costs a player nothing but the sequence again.
 */
export function readKonamiUnlocked(): boolean {
  try {
    return window.localStorage.getItem(KONAMI_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeKonamiUnlocked(unlocked: boolean): void {
  try {
    window.localStorage.setItem(KONAMI_KEY, unlocked ? 'true' : 'false')
  } catch {
    /* Found again next time. */
  }
}

const SHOUT_CLOUD_KEY = 'uno.pref.shoutCloud'

/**
 * Whether cloud speech recognition was accepted. Off unless the exact string
 * 'true' is stored, so a half-written value never reads as consent: on-device
 * recognition needs none because nothing leaves the machine, and the cloud path
 * sends the microphone to the browser vendor, which nothing else here does.
 */
export function readShoutCloudAllowed(): boolean {
  try {
    return window.localStorage.getItem(SHOUT_CLOUD_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeShoutCloudAllowed(allowed: boolean): void {
  try {
    window.localStorage.setItem(SHOUT_CLOUD_KEY, allowed ? 'true' : 'false')
  } catch {
    /* The choice will not survive a reload, and defaults back to off. */
  }
}
