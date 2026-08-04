import type { Toast } from '../hooks/game-reducer.js'

type ToasterProps = {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

/** A live region, not a modal: a message must never block the game thread the
 *  way the prototype's `alert()` did. */
export function Toaster({ toasts, onDismiss }: ToasterProps) {
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
            aria-label={`Dismiss: ${toast.title}`}
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
