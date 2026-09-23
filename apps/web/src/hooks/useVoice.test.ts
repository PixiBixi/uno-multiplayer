import { act, renderHook, waitFor } from '@testing-library/react'
import type { VoicePeer } from '@uno/protocol'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { createPeerManager, PeerManager } from '../lib/voice/peer-manager.js'
import type { createSpeakingDetector } from '../lib/voice/speaking-detector.js'
import { useVoice } from './useVoice.js'

type ManagerOptions = Parameters<typeof createPeerManager>[0]
type DetectorOptions = Parameters<typeof createSpeakingDetector>[0]

/** The hook's collaborators, replaced so a test can fire their callbacks by hand. */
const voice = vi.hoisted(() => ({
  manager: null as ManagerOptions | null,
  detector: null as DetectorOptions | null,
  seats: new Set<number>(),
  connect: null as unknown as Mock<PeerManager['connect']>,
  accept: null as unknown as Mock<PeerManager['accept']>,
  disconnect: null as unknown as Mock<PeerManager['disconnect']>,
}))

vi.mock('../lib/voice/peer-manager.js', () => ({
  createPeerManager: (options: ManagerOptions) => {
    voice.manager = options
    return {
      connect: voice.connect,
      accept: voice.accept,
      disconnect: voice.disconnect,
      destroy: () => voice.seats.clear(),
      seats: () => [...voice.seats].sort((left, right) => left - right),
    }
  },
}))

vi.mock('../lib/voice/speaking-detector.js', () => ({
  createSpeakingDetector: (options: DetectorOptions) => {
    voice.detector = options
    return { watch: () => {}, unwatch: () => {}, sample: () => {}, destroy: () => {} }
  },
}))

/** A socket.io stand-in that lets a test deliver server events by hand. */
const fakeSocket = () => {
  const listeners = new Map<string, (payload: never) => void>()
  return {
    on: (event: string, handler: (payload: never) => void) => listeners.set(event, handler),
    off: (event: string) => listeners.delete(event),
    emit: vi.fn((event: string, _payload: unknown, ack?: (result: unknown) => void) => {
      if (event === 'voice:join') ack?.({ ok: true, iceServers: [], peers: [] })
      else ack?.({ ok: true })
    }),
    deliver: (event: string, payload: never) => listeners.get(event)?.(payload),
  }
}

const fakeTrack = { kind: 'audio', enabled: true, stop: () => {} }
const fakeStream = { getTracks: () => [fakeTrack] } as unknown as MediaStream

/** `useVoice` takes the ref, not the socket: the real one is null on first render. */
const refTo = (socket: ReturnType<typeof fakeSocket>) =>
  ({ current: socket }) as unknown as Parameters<typeof useVoice>[0]['socketRef']

let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  voice.manager = null
  voice.detector = null
  voice.seats.clear()
  voice.connect = vi.fn<PeerManager['connect']>((seat) => {
    voice.seats.add(seat)
    return Promise.resolve()
  })
  voice.accept = vi.fn<PeerManager['accept']>(() => Promise.resolve())
  voice.disconnect = vi.fn<PeerManager['disconnect']>((seat) => {
    voice.seats.delete(seat)
  })
  getUserMedia = vi.fn(() => Promise.resolve(fakeStream))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
})

describe('useVoice', () => {
  it('starts idle', () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    expect(result.current.status).toBe('idle')
  })

  it('asks for the microphone before it tells the server anything', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(socket.emit).toHaveBeenCalledWith('voice:join', {}, expect.any(Function))
    await waitFor(() => expect(result.current.status).toBe('joined'))
  })

  it('reports a denied microphone without emitting anything', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: () => Promise.reject(new Error('NotAllowedError')) },
    })
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    expect(result.current.status).toBe('denied')
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('tracks the roster the server broadcasts', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    const roster: VoicePeer[] = [
      { seat: 0, muted: false },
      { seat: 1, muted: true },
    ]
    act(() => socket.deliver('voice:peers', roster as never))
    await waitFor(() => expect(result.current.peers).toEqual(roster))
  })

  it('emits a mute and flips its own flag', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    act(() => result.current.toggleMute())
    await waitFor(() => expect(result.current.muted).toBe(true))
    expect(socket.emit).toHaveBeenCalledWith('voice:mute', { muted: true }, expect.any(Function))
  })

  it('releases the microphone when the server drops its own seat from the roster', async () => {
    // Leaving the table, or a second tab taking the seat, removes it server-side.
    const stop = vi.fn()
    getUserMedia.mockResolvedValue({ getTracks: () => [{ ...fakeTrack, stop }] })
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    await waitFor(() => expect(result.current.status).toBe('joined'))
    act(() => socket.deliver('voice:peers', [{ seat: 1, muted: false }] as never))
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(stop).toHaveBeenCalled()
  })

  it('forgets everything about a peer that leaves the roster', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    const both: VoicePeer[] = [
      { seat: 0, muted: false },
      { seat: 1, muted: false },
    ]
    act(() => socket.deliver('voice:peers', both as never))
    act(() => {
      voice.manager?.onRemoteStream(1, fakeStream)
      voice.manager?.onStateChange(1, 'connected')
      voice.detector?.onChange(1, true)
    })
    await waitFor(() => expect(result.current.speaking[1]).toBe(true))
    act(() => socket.deliver('voice:peers', [{ seat: 0, muted: false }] as never))
    await waitFor(() => expect(result.current.streams).not.toHaveProperty('1'))
    expect(result.current.speaking).not.toHaveProperty('1')
    expect(result.current.connectionStates).not.toHaveProperty('1')
  })

  it('drops a seat whose offer is rejected instead of leaking the rejection', async () => {
    // e.g. setLocalDescription on a connection closed mid-negotiation.
    voice.connect.mockImplementation((seat: number) => {
      voice.seats.add(seat)
      return Promise.reject(new DOMException('closed', 'InvalidStateError'))
    })
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    act(() =>
      socket.deliver('voice:peers', [
        { seat: 0, muted: false },
        { seat: 1, muted: false },
      ] as never),
    )
    await waitFor(() => expect(voice.disconnect).toHaveBeenCalledWith(1))
  })

  it('drops a seat whose signal cannot be applied', async () => {
    voice.accept.mockRejectedValue(new DOMException('closed', 'InvalidStateError'))
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    act(() =>
      socket.deliver('voice:signal', {
        fromSeat: 2,
        signal: { kind: 'offer', sdp: 'THEIR-OFFER' },
      } as never),
    )
    await waitFor(() => expect(voice.disconnect).toHaveBeenCalledWith(2))
  })

  it('emits voice:leave and returns to idle', async () => {
    const socket = fakeSocket()
    const { result } = renderHook(() => useVoice({ socketRef: refTo(socket), selfSeat: 0 }))
    await act(async () => {
      await result.current.join()
    })
    act(() => result.current.leave())
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(socket.emit).toHaveBeenCalledWith('voice:leave', {}, expect.any(Function))
  })
})
