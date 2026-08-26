import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VoicePanel } from './VoicePanel.js'
import type { useVoice } from '../hooks/useVoice.js'

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

describe('VoicePanel', () => {
  it('offers to join when idle', () => {
    render(<VoicePanel voice={baseVoice} seatNames={names} selfSeat={0} />)
    expect(screen.getByRole('button', { name: /join voice/i })).toBeTruthy()
  })

  it('calls join when clicked', async () => {
    const join = vi.fn(() => Promise.resolve())
    render(<VoicePanel voice={{ ...baseVoice, join }} seatNames={names} selfSeat={0} />)
    await userEvent.click(screen.getByRole('button', { name: /join voice/i }))
    expect(join).toHaveBeenCalled()
  })

  it('explains a denied microphone instead of failing silently', () => {
    render(<VoicePanel voice={{ ...baseVoice, status: 'denied' }} seatNames={names} selfSeat={0} />)
    expect(screen.getByText(/microphone/i)).toBeTruthy()
  })

  it('renders nothing at all when the browser cannot do voice', () => {
    const { container } = render(
      <VoicePanel voice={{ ...baseVoice, status: 'unsupported' }} seatNames={names} selfSeat={0} />,
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
      />,
    )
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })
})
