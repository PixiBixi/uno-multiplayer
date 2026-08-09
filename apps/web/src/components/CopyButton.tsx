import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/clipboard.js'
import { useMessages } from '../i18n/index.js'

const REVERT_AFTER_MS = 1800

type Outcome = 'idle' | 'copied' | 'failed'

type CopyButtonProps = {
  /** What lands on the clipboard. */
  value: string
  /**
   * The resting label. Kept stable through the copied state on purpose: it is
   * also what a voice-control user says out loud to press the button, and a
   * label that renames itself to "Copied" mid-interaction stops matching the
   * command. The confirmation is carried by the icon and the live region instead.
   */
  label: string
  /**
   * The whole spoken confirmation, not a noun the component appends "copied" to.
   * Building it here would force every language to put the verb where English
   * does; the caller takes it from the catalogue instead.
   */
  subject: string
}

export function CopyButton({ value, label, subject }: CopyButtonProps) {
  const t = useMessages()
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  async function copy(): Promise<void> {
    setOutcome((await copyText(value)) ? 'copied' : 'failed')
    // Restarted rather than stacked, so an impatient second press does not cut
    // the first press's confirmation short.
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setOutcome('idle')
    }, REVERT_AFTER_MS)
  }

  const copied = outcome === 'copied'

  return (
    <span className="copy-cell">
      <button
        type="button"
        className={copied ? 'btn btn-copy is-copied' : 'btn btn-copy'}
        onClick={() => {
          void copy()
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {copied ? (
            <path d="m20 6-11 11-5-5" />
          ) : (
            <>
              <rect x="9" y="9" width="11" height="11" rx="2.5" />
              <path d="M6.5 15H5.5A1.5 1.5 0 0 1 4 13.5v-8A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5v1" />
            </>
          )}
        </svg>
        {label}
      </button>

      {/* Spoken, never seen: the icon already says "copied" to anyone watching. */}
      <span className="visually-hidden" role="status">
        {copied ? subject : ''}
      </span>

      {/* Seen only on failure. A copy that quietly does nothing is the one
          outcome a player cannot diagnose, so this path gets words even though
          it costs a little layout shift on a rare error. */}
      {outcome === 'failed' && (
        <span className="copy-failed" role="status">
          {t.lobby.copyFailed}
        </span>
      )}
    </span>
  )
}
