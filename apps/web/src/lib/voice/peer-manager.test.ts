import type { VoiceSignal } from '@uno/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPeerManager } from './peer-manager.js'

/** Enough of RTCPeerConnection to drive the manager without a browser. */
class FakeConnection {
  static instances: FakeConnection[] = []
  localDescription: { type: string; sdp: string } | null = null
  remoteDescriptions: { type: string; sdp: string }[] = []
  addedCandidates: unknown[] = []
  addedTracks: unknown[] = []
  connectionState = 'new'
  closed = false
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null = null
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null
  onconnectionstatechange: (() => void) | null = null

  constructor(public config: RTCConfiguration) {
    FakeConnection.instances.push(this)
  }

  addTrack(track: unknown): void {
    this.addedTracks.push(track)
  }
  createOffer(): Promise<{ type: string; sdp: string }> {
    return Promise.resolve({ type: 'offer', sdp: 'FAKE-OFFER' })
  }
  createAnswer(): Promise<{ type: string; sdp: string }> {
    return Promise.resolve({ type: 'answer', sdp: 'FAKE-ANSWER' })
  }
  setLocalDescription(description: { type: string; sdp: string }): Promise<void> {
    this.localDescription = description
    return Promise.resolve()
  }
  setRemoteDescription(description: { type: string; sdp: string }): Promise<void> {
    this.remoteDescriptions.push(description)
    return Promise.resolve()
  }
  addIceCandidate(candidate: unknown): Promise<void> {
    this.addedCandidates.push(candidate)
    return Promise.resolve()
  }
  close(): void {
    this.closed = true
  }
}

const fakeStream = { getTracks: () => [{ kind: 'audio' }] } as unknown as MediaStream

const build = (selfSeat: number) => {
  const sendSignal = vi.fn<(toSeat: number, signal: VoiceSignal) => void>()
  const onRemoteStream = vi.fn<(seat: number, stream: MediaStream) => void>()
  const onStateChange = vi.fn<(seat: number, state: RTCPeerConnectionState) => void>()
  const manager = createPeerManager({
    selfSeat,
    iceServers: [{ urls: ['stun:example.com'] }],
    localStream: fakeStream,
    sendSignal,
    onRemoteStream,
    onStateChange,
    createConnection: (config) => new FakeConnection(config) as unknown as RTCPeerConnection,
  })
  return { manager, sendSignal, onRemoteStream, onStateChange }
}

beforeEach(() => {
  FakeConnection.instances = []
})

describe('peer manager negotiation', () => {
  it('sends the offer when this seat is the lower of the pair', async () => {
    const { manager, sendSignal } = build(0)
    await manager.connect(2)
    expect(sendSignal).toHaveBeenCalledWith(2, { kind: 'offer', sdp: 'FAKE-OFFER' })
  })

  it('stays silent and waits when this seat is the higher of the pair', async () => {
    const { manager, sendSignal } = build(3)
    await manager.connect(1)
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('answers an offer it receives', async () => {
    const { manager, sendSignal } = build(3)
    await manager.accept(1, { kind: 'offer', sdp: 'THEIR-OFFER' })
    expect(sendSignal).toHaveBeenCalledWith(1, { kind: 'answer', sdp: 'FAKE-ANSWER' })
    expect(FakeConnection.instances[0]?.remoteDescriptions).toEqual([
      { type: 'offer', sdp: 'THEIR-OFFER' },
    ])
  })

  it('applies an answer to the connection it already opened', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    await manager.accept(2, { kind: 'answer', sdp: 'THEIR-ANSWER' })
    expect(FakeConnection.instances).toHaveLength(1)
    expect(FakeConnection.instances[0]?.remoteDescriptions).toEqual([
      { type: 'answer', sdp: 'THEIR-ANSWER' },
    ])
  })

  it('adds a received candidate', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    await manager.accept(2, {
      kind: 'candidate',
      candidate: 'candidate:1 1 udp 2 1.2.3.4 5 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })
    expect(FakeConnection.instances[0]?.addedCandidates).toHaveLength(1)
  })

  it('publishes its own candidates as signals', async () => {
    const { manager, sendSignal } = build(0)
    await manager.connect(2)
    sendSignal.mockClear()
    FakeConnection.instances[0]?.onicecandidate?.({
      candidate: {
        candidate: 'candidate:1 1 udp 2 1.2.3.4 5 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
      } as RTCIceCandidate,
    })
    expect(sendSignal).toHaveBeenCalledWith(2, {
      kind: 'candidate',
      candidate: 'candidate:1 1 udp 2 1.2.3.4 5 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    })
  })

  it('ignores the null candidate that marks the end of gathering', async () => {
    const { manager, sendSignal } = build(0)
    await manager.connect(2)
    sendSignal.mockClear()
    FakeConnection.instances[0]?.onicecandidate?.({ candidate: null })
    expect(sendSignal).not.toHaveBeenCalled()
  })

  it('reports a remote stream against its seat', async () => {
    const { manager, onRemoteStream } = build(0)
    await manager.connect(2)
    const remote = { id: 'remote' } as unknown as MediaStream
    FakeConnection.instances[0]?.ontrack?.({ streams: [remote] })
    expect(onRemoteStream).toHaveBeenCalledWith(2, remote)
  })

  it('reports connection state changes against its seat', async () => {
    const { manager, onStateChange } = build(0)
    await manager.connect(2)
    const connection = FakeConnection.instances[0]
    if (connection === undefined) throw new Error('expected a connection')
    connection.connectionState = 'failed'
    connection.onconnectionstatechange?.()
    expect(onStateChange).toHaveBeenCalledWith(2, 'failed')
  })

  it('reuses one connection per seat', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    await manager.connect(2)
    expect(FakeConnection.instances).toHaveLength(1)
  })

  it('closes and forgets a seat on disconnect', async () => {
    const { manager } = build(0)
    await manager.connect(2)
    manager.disconnect(2)
    expect(FakeConnection.instances[0]?.closed).toBe(true)
    expect(manager.seats()).toEqual([])
  })

  it('closes every connection on destroy', async () => {
    const { manager } = build(0)
    await manager.connect(1)
    await manager.connect(2)
    manager.destroy()
    expect(FakeConnection.instances.every((instance) => instance.closed)).toBe(true)
    expect(manager.seats()).toEqual([])
  })
})
