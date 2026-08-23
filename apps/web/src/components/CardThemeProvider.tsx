import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_CARD_THEME, type CardTheme } from '../lib/card-themes.js'
import { readCardTheme, writeCardTheme } from '../lib/preferences.js'

type CardThemeValue = { theme: CardTheme; setTheme: (next: CardTheme) => void }

/**
 * A context rather than a read in `Card`, for one reason: the cycler on the table
 * has to repaint every card on screen - the hand, the discard pile, the draw pile -
 * the moment it is pressed. A dozen components reading `localStorage` on their own
 * would each keep their own idea of the answer.
 *
 * The default is the classic face and a setter that does nothing, so a `Card`
 * rendered outside the provider still draws a card. Tests rely on that.
 */
const CardThemeContext = createContext<CardThemeValue>({
  theme: DEFAULT_CARD_THEME,
  setTheme: () => undefined,
})

export function CardThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<CardTheme>(readCardTheme)

  const setTheme = useCallback((next: CardTheme) => {
    writeCardTheme(next)
    setThemeState(next)
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return <CardThemeContext.Provider value={value}>{children}</CardThemeContext.Provider>
}

export const useCardTheme = (): CardTheme => useContext(CardThemeContext).theme
export const useSetCardTheme = (): ((next: CardTheme) => void) =>
  useContext(CardThemeContext).setTheme
