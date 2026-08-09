import { MAX_CHAT_LENGTH } from '@uno/protocol'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { FeedEntry } from '../hooks/game-reducer.js'
import { useMessages } from '../i18n/index.js'
import { describeEvent } from '../lib/describe-event.js'
import { pigmentForSeat } from '../lib/palette.js'

type ChatPanelProps = {
  feed: FeedEntry[]
  mySeat: number
  nameOf: (seat: number) => string
  onSend: (text: string) => void
}

export function ChatPanel({ feed, mySeat, nameOf, onSend }: ChatPanelProps) {
  const messages = useMessages()
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const seenRef = useRef(0)
  const [unread, setUnread] = useState(0)

  /* Unread counts chat from other people only. A badge that ticks up every time
     somebody draws a card trains people to ignore it. */
  const chatCount = feed.filter((entry) => entry.kind === 'chat' && entry.seat !== mySeat).length

  useEffect(() => {
    if (open) {
      seenRef.current = chatCount
      setUnread(0)
      return
    }
    setUnread(Math.max(0, chatCount - seenRef.current))
  }, [chatCount, open])

  useEffect(() => {
    if (!open) return
    const body = bodyRef.current
    if (body !== null) body.scrollTop = body.scrollHeight
  }, [feed, open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text.length === 0) return
    onSend(text)
    setDraft('')
  }

  if (!open) {
    return (
      <button
        type="button"
        className="chat-tab"
        onClick={() => {
          setOpen(true)
        }}
      >
        Table
        {unread > 0 && <span className="unread">{unread}</span>}
      </button>
    )
  }

  return (
    <section className="chat-panel" aria-label="Table chat and log">
      <header className="chat-head">
        <span>Table</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setOpen(false)
          }}
          aria-label="Collapse the table panel"
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </header>

      <div className="chat-body" ref={bodyRef}>
        {feed.map((entry) => {
          if (entry.kind === 'event') {
            return (
              <p className="sys-line" data-system="" key={entry.id}>
                {describeEvent(entry.event, nameOf, mySeat, messages)}
              </p>
            )
          }
          const mine = entry.seat === mySeat
          return (
            <div className={mine ? 'msg msg-mine' : 'msg'} key={entry.id}>
              <div className="msg-bubble">
                {!mine && (
                  <span className="msg-who" style={{ color: pigmentForSeat(entry.seat) }}>
                    {entry.name}
                  </span>
                )}
                <span>{entry.text}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* No autoFocus: stealing the keyboard mid-turn would break playing cards by
          keyboard. */}
      <form className="chat-foot" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="chat-input">
          Message the table
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          placeholder="Say something…"
        />
        <button type="submit" className="btn btn-primary">
          Send
        </button>
      </form>
    </section>
  )
}
