import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CATALOGUES, LocaleContext, detectLocale, writeLocale, type Locale } from './index.js'

/**
 * Holds the chosen language and hands the matching catalogue to everything below.
 *
 * Deliberately not a route or a build flag: switching has to be instant and to
 * survive a reload, because a guest arriving on somebody else's invite link should
 * be able to fix the language in one tap without losing their place.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(detectLocale)

  /* Also on mount, not only on a manual change. A French browser was rendering
     French while the document still declared lang="en" - measured, not guessed -
     which tells a screen reader to pronounce it in an English voice. */
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const change = useCallback((next: Locale) => {
    writeLocale(next)
    setLocale(next)
  }, [])

  const value = useMemo(
    () => ({ locale, messages: CATALOGUES[locale], setLocale: change }),
    [locale, change],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
