import { useEffect, useRef, useState } from 'react'
import type { useVoice } from '../hooks/useVoice.js'
import { useMessages } from '../i18n/index.js'
import { pigmentForSeat } from '../lib/palette.js'

type VoiceState = ReturnType<typeof useVoice>

type VoicePanelProps = {
  voice: VoiceState
  seatNames: string[]
  selfSeat: number
}

function MicIcon({ off }: { off: boolean }) {
  return (
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
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      {off && <path d="M4 3l16 18" />}
    </svg>
  )
}

/**
 * Plays one peer's audio. `srcObject` cannot be expressed as a prop, which is why
 * this needs a ref rather than being a plain `<audio src=...>`.
 */
function PeerAudio({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (ref.current === null) return
    ref.current.srcObject = stream
  }, [stream])
  return <audio ref={ref} autoPlay muted={muted} />
}

export function VoicePanel({ voice, seatNames, selfSeat }: VoicePanelProps) {
  const t = useMessages()
  /* Muting someone is local and never broadcast: who I decline to listen to is
     nobody else's business. */
  const [locallyMuted, setLocallyMuted] = useState<Record<number, boolean>>({})

  if (voice.status === 'unsupported') return null

  if (voice.status === 'denied') {
    return (
      <section className="voice-panel" aria-label={t.voice.label}>
        <header className="voice-head">
          <span>{t.voice.label}</span>
        </header>
        <p className="voice-note">{t.voice.noMicrophone}</p>
      </section>
    )
  }

  if (voice.status !== 'joined') {
    return (
      <section className="voice-panel" aria-label={t.voice.label}>
        <header className="voice-head">
          <span>{t.voice.label}</span>
        </header>
        <button
          type="button"
          className="btn voice-join"
          onClick={() => void voice.join()}
          disabled={voice.status === 'joining'}
        >
          {voice.status === 'joining' ? t.voice.joining : t.voice.join}
        </button>
      </section>
    )
  }

  const others = voice.peers.filter((peer) => peer.seat !== selfSeat)

  return (
    <section className="voice-panel" aria-label={t.voice.label}>
      <header className="voice-head">
        <span>{t.voice.label}</span>
        <button
          type="button"
          className="icon-btn"
          onClick={voice.toggleMute}
          aria-label={voice.muted ? t.voice.unmute : t.voice.mute}
          aria-pressed={voice.muted}
        >
          <MicIcon off={voice.muted} />
        </button>
        <button type="button" className="icon-btn" onClick={voice.leave} aria-label={t.voice.leave}>
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
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </header>

      {others.length === 0 && <p className="voice-note">{t.voice.alone}</p>}

      <ul className="voice-peers">
        {others.map((peer) => {
          const name = seatNames[peer.seat] ?? String(peer.seat)
          const state = voice.connectionStates[peer.seat]
          const stream = voice.streams[peer.seat]
          const silenced = locallyMuted[peer.seat] === true
          const broken = state === 'failed' || state === 'disconnected'
          return (
            <li
              key={peer.seat}
              className="voice-peer"
              data-voice-state={state ?? 'new'}
              data-speaking={voice.speaking[peer.seat] === true}
              style={{ borderInlineStartColor: pigmentForSeat(peer.seat) }}
            >
              <span className="voice-peer-name">{name}</span>

              {peer.muted && (
                <span className="voice-tag" aria-label={t.voice.peerMuted(name)}>
                  <MicIcon off />
                </span>
              )}

              {broken && <span className="voice-broken">{t.voice.unavailableWith(name)}</span>}

              <button
                type="button"
                className="icon-btn voice-peer-mute"
                onClick={() =>
                  setLocallyMuted((current) => ({ ...current, [peer.seat]: !silenced }))
                }
                aria-label={silenced ? t.voice.unmuteThem(name) : t.voice.muteThem(name)}
                aria-pressed={silenced}
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
                  <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                  {silenced ? <path d="m17 9 4 6m0-6-4 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7" />}
                </svg>
              </button>

              {stream !== undefined && <PeerAudio stream={stream} muted={silenced} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
