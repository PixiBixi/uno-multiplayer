import { useEffect, useRef } from 'react'
import type { Toast } from '../hooks/game-reducer.js'
import { useMessages } from '../i18n/index.js'

type ToasterProps = {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

/**
 * How long each tone stays before closing itself.
 *
 * Long enough to read a title and a line of detail without hurrying, and a warning gets
 * more than a note: a note missed costs nothing, while a refused move the player never
 * read leaves them wondering why the table ignored them.
 */
export const TOAST_MS: Record<Toast['tone'], number> = {
  info: 5000,
  warn: 8000,
  bad: 8000,
}

/** A live region, not a modal: a message must never block the game thread the
 *  way the prototype's `alert()` did. */
export function Toaster({ toasts, onDismiss }: ToasterProps) {
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        /* Each toast is its own component so it can own its own timer. Keyed by id, so
           React keeps the instance across the parent's re-renders - which happen several
           times a turn as views arrive - and the countdown below is started once. */
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const t = useMessages()

  /*
   * The callback goes through a ref so the effect below can depend on the id alone.
   * `onDismiss` is stable today (a useCallback in useGameSocket), but a toast whose
   * timer restarts on every re-render never closes at all, and on a table pushing views
   * several times a turn that failure is total, silent, and indistinguishable from
   * having never written this. Not worth leaving to a caller's memo surviving a refactor.
   */
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useEffect(() => {
    const timer = setTimeout(() => {
      dismiss.current(toast.id)
    }, TOAST_MS[toast.tone])
    // Cleared when the toast goes, or a timer would outlive its message and close
    // whatever id got recycled into its place.
    return () => {
      clearTimeout(timer)
    }
  }, [toast.id, toast.tone])

  return (
    <div className={`toast toast-${toast.tone}`}>
      <div>
        <b>{toast.title}</b>
        <span>{toast.detail}</span>
      </div>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          onDismiss(toast.id)
        }}
        /* The toast's own title is already translated by the reducer that raised
           it; the verb in front of it was not. Several close buttons can be on
           screen at once, so the name has to say which toast this one closes. */
        aria-label={t.dismissToast(toast.title)}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
