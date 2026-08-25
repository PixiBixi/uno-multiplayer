import { MAX_CHAT_LENGTH } from '@uno/protocol'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { FeedEntry } from '../hooks/game-reducer.js'
import { useMessages } from '../i18n/index.js'
import { describeEvent, seatOfEvent } from '../lib/describe-event.js'
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
        {messages.table.panelTitle}
        {unread > 0 && <span className="unread">{unread}</span>}
      </button>
    )
  }

  return (
    <section className="chat-panel" aria-label={messages.table.chatPanel}>
      <header className="chat-head">
        <span>{messages.table.panelTitle}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setOpen(false)
          }}
          aria-label={messages.table.collapsePanel}
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
            const seat = seatOfEvent(entry.event)
            return (
              <p
                className="sys-line"
                data-system=""
                key={entry.id}
                style={seat === null ? undefined : { borderInlineStartColor: pigmentForSeat(seat) }}
              >
                {describeEvent(entry.event, nameOf, mySeat, messages)}
              </p>
            )
          }
          const mine = entry.seat === mySeat
          return (
            <div className={mine ? 'msg msg-mine' : 'msg'} key={entry.id}>
              <div
                className="msg-bubble"
                /* The rule moves to the other edge for my own messages, rather than
                   staying on the left inside a block pushed right - which is what made
                   the column read as a ragged edge. Mirrored, the two kinds of line have
                   one clean edge each: what the table did on the left, what I said on the
                   right. */
                style={
                  mine
                    ? { borderInlineEndColor: pigmentForSeat(entry.seat) }
                    : { borderInlineStartColor: pigmentForSeat(entry.seat) }
                }
              >
                {/* Named on every message, mine included. The name used to be withheld for
                    my own on the grounds that the side of the panel it sat on said so;
                    nothing sits on a side any more, so withholding it left a line with no
                    author at all. `describeEvent` already says "You" for my own events, so
                    the two kinds of line now agree. */}
                <span className="msg-who" style={{ color: pigmentForSeat(entry.seat) }}>
                  {mine ? messages.table.you : entry.name}
                </span>
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
          {messages.table.messageTable}
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          maxLength={MAX_CHAT_LENGTH}
          autoComplete="off"
          placeholder={messages.table.say}
        />
        <button type="submit" className="btn btn-primary">
          {messages.table.send}
        </button>
      </form>
    </section>
  )
}
