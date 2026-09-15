import { useEffect, useRef } from 'react'

/**
 * `U`, and deliberately not the space bar that was asked for first.
 *
 * Space activates whatever button holds the focus, and the table is a wall of them:
 * bound here it would fire Draw and the call together for anyone who had just
 * clicked Draw - the same missclick the control order in Table.tsx exists to
 * prevent, reached through the keyboard instead. It also scrolls the page, so it
 * would need a preventDefault that fights the chat.
 */
export const CALL_UNO_KEY = 'u'

/**
 * True for anything a player types into. The chat sits on the same screen as the
 * table, so without this every message holding the letter calls UNO once per
 * keystroke.
 *
 * `isContentEditable` is read through the attribute as well: jsdom does not
 * implement the property, so the tests would pass against a guard that does
 * nothing in a browser.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.getAttribute('contenteditable') === 'true') return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Calls UNO from the keyboard, the third way into the same move after the button
 * and the shout.
 *
 * `armed` comes from `legalMoves`, so this learns no rule the server did not
 * already send: it presses the control that was on offer, and nothing happens when
 * none was.
 *
 * Both inputs live in refs and the listener attaches once. Putting them in the
 * dependency list would tear the listener down and build it back up on every
 * render of the table, which is every move anybody makes.
 */
export function useCallUnoKey(options: { armed: boolean; onCall: () => void }): void {
  const armedRef = useRef(options.armed)
  armedRef.current = options.armed
  const onCallRef = useRef(options.onCall)
  onCallRef.current = options.onCall

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!armedRef.current) return
      // Leaves Ctrl+U and Cmd+U to the browser.
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // An IME composes a word one keystroke at a time; those are not shortcuts.
      if (event.isComposing) return
      if (event.key.toLowerCase() !== CALL_UNO_KEY) return
      if (isTyping(event.target)) return
      onCallRef.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
