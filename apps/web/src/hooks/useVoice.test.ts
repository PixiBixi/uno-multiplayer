import { act, renderHook, waitFor } from '@testing-library/react'
import type { VoicePeer } from '@uno/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVoice } from './useVoice.js'

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
