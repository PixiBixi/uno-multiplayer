import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readColourMode, writeColourMode, type ColourMode } from '../lib/preferences.js'

type ColourModeValue = { mode: ColourMode; setMode: (next: ColourMode) => void }

/**
 * Paper or ink, chosen by the player rather than by their laptop's schedule.
 *
 * A context rather than a read wherever it is needed, for the same reason the card face
 * is one: the switch exists in two places - the home screen and the table's masthead -
 * and two components each holding their own idea of the answer is how they disagree.
 *
 * The default is `system` and a setter that does nothing, so anything rendered outside
 * the provider still paints from the media query rather than from nothing.
 */
const ColourModeContext = createContext<ColourModeValue>({
  mode: 'system',
  setMode: () => undefined,
})

export function ColourModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColourMode>(readColourMode)

  /* `data-theme` is what `tokens.css` keys the explicit palettes on, and `system` has to
     REMOVE the attribute rather than set it to anything: the media query is the fallback,
     and an attribute of "system" would match neither `[data-theme='light']` nor
     `[data-theme='dark']` while still being present - which is the same thing, until
     somebody writes a selector that tests for the attribute rather than its value.
     `color-scheme` is set alongside it so form controls and scrollbars follow; without it
     a page forced to ink still drew light native scrollbars. */
  useEffect(() => {
    const root = document.documentElement
    if (mode === 'system') {
      delete root.dataset.theme
      root.style.removeProperty('color-scheme')
      return
    }
    root.dataset.theme = mode
    root.style.setProperty('color-scheme', mode)
  }, [mode])

  const setMode = useCallback((next: ColourMode) => {
    writeColourMode(next)
    setModeState(next)
  }, [])

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])

  return <ColourModeContext.Provider value={value}>{children}</ColourModeContext.Provider>
}

export const useColourMode = (): ColourMode => useContext(ColourModeContext).mode
export const useSetColourMode = (): ((next: ColourMode) => void) =>
  useContext(ColourModeContext).setMode
