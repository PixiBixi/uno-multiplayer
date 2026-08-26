import { useEffect, useRef, useState } from 'react'
import type { useVoice } from '../hooks/useVoice.js'
import { useMessages } from '../i18n/index.js'

type VoiceState = ReturnType<typeof useVoice>

type VoicePanelProps = {
  voice: VoiceState
  seatNames: string[]
  selfSeat: number
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
        <p>{t.voice.noMicrophone}</p>
      </section>
    )
  }

  if (voice.status !== 'joined') {
    return (
      <section className="voice-panel" aria-label={t.voice.label}>
        <button
          type="button"
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
      <button type="button" onClick={voice.toggleMute}>
        {voice.muted ? t.voice.unmute : t.voice.mute}
      </button>
      <button type="button" onClick={voice.leave}>
        {t.voice.leave}
      </button>
      <ul>
        {others.map((peer) => {
          const name = seatNames[peer.seat] ?? String(peer.seat)
          const state = voice.connectionStates[peer.seat]
          const stream = voice.streams[peer.seat]
          const silenced = locallyMuted[peer.seat] === true
          return (
            <li
              key={peer.seat}
              data-voice-state={state ?? 'new'}
              data-speaking={voice.speaking[peer.seat] === true}
            >
              <span>{name}</span>
              {peer.muted && <span aria-label={t.voice.peerMuted(name)}>{t.voice.muted}</span>}
              {(state === 'failed' || state === 'disconnected') && (
                <span>{t.voice.unavailableWith(name)}</span>
              )}
              <button
                type="button"
                onClick={() =>
                  setLocallyMuted((current) => ({ ...current, [peer.seat]: !silenced }))
                }
              >
                {silenced ? t.voice.unmuteThem(name) : t.voice.muteThem(name)}
              </button>
              {stream !== undefined && <PeerAudio stream={stream} muted={silenced} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
