import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VoicePanel, type ShoutControls } from './VoicePanel.js'
import type { useVoice } from '../hooks/useVoice.js'
import { fr } from '../i18n/fr.js'
import { LocaleContext } from '../i18n/index.js'

const baseVoice: ReturnType<typeof useVoice> = {
  status: 'idle',
  peers: [],
  streams: {},
  speaking: {},
  connectionStates: {},
  muted: false,
  join: () => Promise.resolve(),
  leave: () => {},
  toggleMute: () => {},
}

const names = ['Ana', 'Bo', 'Cy', 'Di']

const shoutControls = (over: Partial<ShoutControls> = {}): ShoutControls => ({
  availability: 'local',
  cloudAllowed: false,
  onCloudAllowed: vi.fn(),
  onInstalled: vi.fn(),
  ...over,
})

/** The joined branch, in French: the shout row's strings only exist in the catalogues. */
const renderJoined = (overrides: { shout: ShoutControls }) =>
  render(
    <LocaleContext.Provider value={{ locale: 'fr', messages: fr, setLocale: () => undefined }}>
      <VoicePanel
        voice={{ ...baseVoice, status: 'joined', peers: [{ seat: 0, muted: false }] }}
        seatNames={names}
        selfSeat={0}
        {...overrides}
      />
    </LocaleContext.Provider>,
  )

describe('VoicePanel', () => {
  it('offers to join when idle', () => {
    render(<VoicePanel voice={baseVoice} seatNames={names} selfSeat={0} shout={shoutControls()} />)
    expect(screen.getByRole('button', { name: /join voice/i })).toBeTruthy()
  })

  it('calls join when clicked', async () => {
    const join = vi.fn(() => Promise.resolve())
    render(
      <VoicePanel
        voice={{ ...baseVoice, join }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /join voice/i }))
    expect(join).toHaveBeenCalled()
  })

  it('explains a denied microphone instead of failing silently', () => {
    render(
      <VoicePanel
        voice={{ ...baseVoice, status: 'denied' }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    expect(screen.getByText(/microphone/i)).toBeTruthy()
  })

  it('renders nothing at all when the browser cannot do voice', () => {
    const { container } = render(
      <VoicePanel
        voice={{ ...baseVoice, status: 'unsupported' }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('lists the other players once joined', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: false },
          ],
        }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    expect(screen.getByText('Bo')).toBeTruthy()
  })

  it('lists the player looking at it, so they can see their own mic', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: false },
          ],
        }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    expect(screen.getByText('Ana')).toBeTruthy()
  })

  it('gives your own row the mic toggle and no local-mute control', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: false },
          ],
        }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    expect(screen.getByRole('button', { name: /^mute$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /mute ana/i })).toBeNull()
  })

  it('marks your own row as speaking without a connection state', () => {
    const { container } = render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [{ seat: 0, muted: false }],
          speaking: { 0: true },
        }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    const self = container.querySelector('.voice-peer-self')
    expect(self?.getAttribute('data-speaking')).toBe('true')
    /* The end-to-end test polls the first [data-voice-state] in the document. Your
       own row carrying one would shadow the real peer and never reach connected. */
    expect(self?.hasAttribute('data-voice-state')).toBe(false)
  })

  it('marks a peer whose own mic is off', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: true },
          ],
        }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    expect(screen.getByLabelText(/Bo has muted their microphone/i)).toBeTruthy()
  })

  it('says voice is unavailable with a peer whose connection failed', () => {
    render(
      <VoicePanel
        voice={{
          ...baseVoice,
          status: 'joined',
          peers: [
            { seat: 0, muted: false },
            { seat: 1, muted: false },
          ],
          connectionStates: { 1: 'failed' },
        }}
        seatNames={names}
        selfSeat={0}
        shout={shoutControls()}
      />,
    )
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })
})

describe('VoicePanel shout row', () => {
  it('says the shout is live when recognition runs on the device', () => {
    renderJoined({ shout: shoutControls({ availability: 'local' }) })
    expect(screen.getByText(fr.voice.shoutListening)).toBeTruthy()
  })

  it('points at the button when the browser cannot recognise anything', () => {
    renderJoined({ shout: shoutControls({ availability: 'unsupported' }) })
    expect(screen.getByText(fr.voice.shoutUnsupported)).toBeTruthy()
  })

  it('offers the download when a language pack would make it local', () => {
    renderJoined({ shout: shoutControls({ availability: 'downloadable' }) })
    expect(screen.getByRole('button', { name: fr.voice.shoutInstall })).toBeTruthy()
  })

  it('asks before opening a cloud recogniser, and says where the audio goes', () => {
    renderJoined({ shout: shoutControls({ availability: 'cloud' }) })
    const consent = screen.getByRole('checkbox', { name: fr.voice.shoutCloud })
    expect((consent as HTMLInputElement).checked).toBe(false)
  })

  it('reports a consent change to its owner', async () => {
    const onCloudAllowed = vi.fn()
    renderJoined({ shout: shoutControls({ availability: 'cloud', onCloudAllowed }) })
    await userEvent.click(screen.getByRole('checkbox', { name: fr.voice.shoutCloud }))
    expect(onCloudAllowed).toHaveBeenCalledWith(true)
  })

  it('shows nothing at all while the probe is still running', () => {
    renderJoined({ shout: shoutControls({ availability: 'probing' }) })
    expect(screen.queryByText(fr.voice.shoutListening)).toBeNull()
  })
})
