import { useEffect, useRef, useState } from 'react'
import type { VoicePeer } from '@uno/protocol'
import type { useVoice } from '../hooks/useVoice.js'
import { useLocale, useMessages } from '../i18n/index.js'
import { installShout, type ShoutAvailability } from '../lib/voice/shout-listener.js'
import { pigmentForSeat } from '../lib/palette.js'

type VoiceState = ReturnType<typeof useVoice>

export type ShoutControls = {
  availability: ShoutAvailability | 'probing'
  cloudAllowed: boolean
  onCloudAllowed: (allowed: boolean) => void
  /** Re-probes after a language pack lands, which turns cloud into local. */
  onInstalled: () => void
}

type VoicePanelProps = {
  voice: VoiceState
  seatNames: string[]
  selfSeat: number
  shout: ShoutControls
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

/** Your own row. No audio element and no connection state: there is neither. */
function SelfRow({ voice, seat, name }: { voice: VoiceState; seat: number; name: string }) {
  const t = useMessages()
  return (
    <li
      className="voice-peer voice-peer-self"
      data-speaking={voice.speaking[seat] === true}
      style={{ borderInlineStartColor: pigmentForSeat(seat) }}
    >
      <span className="voice-peer-name">{name}</span>
      <button
        type="button"
        className="icon-btn voice-peer-mute"
        onClick={voice.toggleMute}
        aria-label={voice.muted ? t.voice.unmute : t.voice.mute}
        aria-pressed={voice.muted}
      >
        <MicIcon off={voice.muted} />
      </button>
    </li>
  )
}

function PeerRow({
  voice,
  peer,
  name,
  silenced,
  onToggleMute,
}: {
  voice: VoiceState
  peer: VoicePeer
  name: string
  silenced: boolean
  onToggleMute: () => void
}) {
  const t = useMessages()
  const state = voice.connectionStates[peer.seat]
  const stream = voice.streams[peer.seat]
  const broken = state === 'failed' || state === 'disconnected'

  return (
    <li
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
        onClick={onToggleMute}
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
}

/** What the shout can do here, and what it needs from the player to do it. */
function ShoutRow({ shout }: { shout: ShoutControls }) {
  const t = useMessages()
  const locale = useLocale()
  const [installing, setInstalling] = useState(false)
  const [installFailed, setInstallFailed] = useState(false)

  if (shout.availability === 'probing') return null
  if (shout.availability === 'local') return <p className="voice-note">{t.voice.shoutListening}</p>
  if (shout.availability === 'unsupported')
    return <p className="voice-note">{t.voice.shoutUnsupported}</p>

  if (shout.availability === 'downloading')
    return <p className="voice-note">{t.voice.shoutInstalling}</p>

  if (shout.availability === 'downloadable')
    return (
      <p className="voice-note">
        {/* A refused install lands back on this same button, so the swapped lead is
            the only thing telling the player their click did anything at all. */}
        {installFailed ? t.voice.shoutInstallFailed : t.voice.shoutOffline}{' '}
        <button
          type="button"
          className="btn-link"
          disabled={installing}
          onClick={() => {
            // install() needs the gesture, so it is a button and never an effect.
            setInstalling(true)
            setInstallFailed(false)
            void installShout(locale).then((started) => {
              setInstalling(false)
              setInstallFailed(!started)
              shout.onInstalled()
            })
          }}
        >
          {installing ? t.voice.shoutInstalling : t.voice.shoutInstall}
        </button>
      </p>
    )

  return (
    <label className="voice-note voice-shout-cloud">
      <input
        type="checkbox"
        checked={shout.cloudAllowed}
        onChange={(event) => shout.onCloudAllowed(event.target.checked)}
      />
      {t.voice.shoutCloud}
    </label>
  )
}

export function VoicePanel({ voice, seatNames, selfSeat, shout }: VoicePanelProps) {
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

  /* Everyone, own seat included: without your own row there is no feedback that
     your microphone is being heard, which is the first thing anyone checks. */
  const others = voice.peers.filter((peer) => peer.seat !== selfSeat)
  const nameFor = (seat: number): string => seatNames[seat] ?? String(seat)

  return (
    <section className="voice-panel" aria-label={t.voice.label}>
      <header className="voice-head">
        <span>{t.voice.label}</span>
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
        {voice.peers.map((peer) =>
          peer.seat === selfSeat ? (
            <SelfRow key={peer.seat} voice={voice} seat={peer.seat} name={nameFor(peer.seat)} />
          ) : (
            <PeerRow
              key={peer.seat}
              voice={voice}
              peer={peer}
              name={nameFor(peer.seat)}
              silenced={locallyMuted[peer.seat] === true}
              onToggleMute={() =>
                setLocallyMuted((current) => ({
                  ...current,
                  [peer.seat]: current[peer.seat] !== true,
                }))
              }
            />
          ),
        )}
      </ul>

      <ShoutRow shout={shout} />
    </section>
  )
}
