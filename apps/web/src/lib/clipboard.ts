/**
 * Copying text is a one-liner in a modern secure context and a genuine chore
 * everywhere else, so it lives behind one function that reports whether it
 * worked rather than throwing.
 *
 * The fallback is not legacy-browser defensiveness — it is the path this app
 * actually takes when self-hosted. `navigator.clipboard` is undefined outside a
 * secure context, and http://<lan-ip>:5050 is not one. Without the fallback the
 * buttons would work perfectly on localhost and silently do nothing on the
 * deployed instance, which is the worst of both worlds.
 */

/** Resolves to whether the text reached the clipboard. Never throws. */
export async function copyText(text: string): Promise<boolean> {
  return (await copyViaClipboardApi(text)) || copyViaSelection(text)
}

async function copyViaClipboardApi(text: string): Promise<boolean> {
  // A property check rather than a secure-context check: even in a secure
  // context writeText can reject on a denied permission or an unfocused
  // document, and both cases want the same fallback.
  if (!('clipboard' in navigator)) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function copyViaSelection(text: string): boolean {
  const carrier = document.createElement('textarea')
  carrier.value = text
  // `readonly` keeps the iOS keyboard from sliding up over the lobby.
  carrier.setAttribute('readonly', '')
  /* Invisible but not hidden: `display: none` and `visibility: hidden` both make
     an element unselectable, and a selection is precisely what the copy command
     acts on. Pinned inside the viewport at 1px rather than parked off-screen at
     a negative offset — focusing something outside the viewport makes the
     browser scroll to reach it, yanking the lobby out from under the player. */
  carrier.style.position = 'fixed'
  carrier.style.top = '0'
  carrier.style.left = '0'
  carrier.style.width = '1px'
  carrier.style.height = '1px'
  carrier.style.opacity = '0'
  document.body.append(carrier)

  // Handing focus back matters for keyboard users, who would otherwise be
  // dropped at the top of the document by a button press.
  const previous = document.activeElement
  try {
    // Focused explicitly: browsers move focus as a side effect of `select()`,
    // but the command acts on the focused element's selection, so relying on
    // that side effect leaves the one thing that matters implicit.
    carrier.focus()
    carrier.select()
    // Belt and braces for iOS Safari, where `select()` alone can come up empty.
    carrier.setSelectionRange(0, text.length)
    /* Deprecated, and kept anyway: it is the only copy that works in an insecure
       context, which is the only context this branch runs in. */
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    carrier.remove()
    if (previous instanceof HTMLElement) previous.focus()
  }
}
