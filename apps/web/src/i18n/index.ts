import { createContext, useContext } from 'react'
import { en } from './en.js'
import { fr } from './fr.js'
import { LOCALES, type Locale, type Messages } from './messages.js'

export { LOCALES, LOCALE_NAME, type Locale, type Messages } from './messages.js'

export const CATALOGUES: Record<Locale, Messages> = { en, fr }

const LOCALE_KEY = 'uno.pref.locale'

const isLocale = (value: string | null): value is Locale =>
  value !== null && (LOCALES as readonly string[]).includes(value)

/**
 * A stored choice wins; otherwise the browser decides. Only the primary subtag is
 * read, so fr-CA and fr-BE both get French rather than falling back to English on
 * a region nobody thought to list.
 */
export function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    /* Storage can be blocked outright; the browser's preference still applies. */
  }
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language
  const primary = preferred.split('-')[0]?.toLowerCase() ?? ''
  return isLocale(primary) ? primary : 'en'
}

export function writeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    /* The choice will not survive a reload. Play continues. */
  }
}

type LocaleValue = { locale: Locale; messages: Messages; setLocale: (next: Locale) => void }

export const LocaleContext = createContext<LocaleValue>({
  locale: 'en',
  messages: en,
  setLocale: () => undefined,
})

/** Every user-facing string in the client comes through here. */
export const useMessages = (): Messages => useContext(LocaleContext).messages
export const useLocale = (): Locale => useContext(LocaleContext).locale
export const useSetLocale = (): ((next: Locale) => void) => useContext(LocaleContext).setLocale
