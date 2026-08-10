import type { Toast } from '../hooks/game-reducer.js'
import { useMessages } from '../i18n/index.js'

type ToasterProps = {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

/** A live region, not a modal: a message must never block the game thread the
 *  way the prototype's `alert()` did. */
export function Toaster({ toasts, onDismiss }: ToasterProps) {
  const t = useMessages()
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
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
      ))}
    </div>
  )
}
