import type { ClientToServer, ServerToClient, VoicePeer, VoiceSignal } from '@uno/protocol'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Socket } from 'socket.io-client'
import { createPeerManager, type PeerManager } from '../lib/voice/peer-manager.js'
import { createSpeakingDetector, type SpeakingDetector } from '../lib/voice/speaking-detector.js'

export type VoiceStatus = 'idle' | 'joining' | 'joined' | 'denied' | 'unsupported'

type VoiceSocket = Socket<ServerToClient, ClientToServer>

/**
 * Voice rides the game socket rather than opening its own: the server resolves a
 * voice member through that socket's presence. It arrives as a ref because
 * useGameSocket creates it inside an effect, so it is null on the first render.
 */
export function useVoice(options: { socketRef: RefObject<VoiceSocket | null>; selfSeat: number }) {
  const { socketRef, selfSeat } = options
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [streams, setStreams] = useState<Record<number, MediaStream>>({})
  const [speaking, setSpeaking] = useState<Record<number, boolean>>({})
  const [connectionStates, setConnectionStates] = useState<Record<number, RTCPeerConnectionState>>(
    {},
  )
  const [muted, setMuted] = useState(false)

  const managerRef = useRef<PeerManager | null>(null)
  const detectorRef = useRef<SpeakingDetector | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const teardown = useCallback(() => {
    managerRef.current?.destroy()
    managerRef.current = null
    detectorRef.current?.destroy()
    detectorRef.current = null
    for (const track of localStreamRef.current?.getTracks() ?? []) track.stop()
    localStreamRef.current = null
    setStreams({})
    setSpeaking({})
    setConnectionStates({})
    setMuted(false)
  }, [])

  const join = useCallback(async () => {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
      setStatus('unsupported')
      return
    }
    setStatus('joining')

    let localStream: MediaStream
    try {
      // The microphone is asked for first: a denial must cost nothing on the server.
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStatus('denied')
      return
    }
    localStreamRef.current = localStream

    socketRef.current?.emit('voice:join', {}, (result) => {
      if (!result.ok) {
        teardown()
        setStatus('idle')
        return
      }
      const manager = createPeerManager({
        selfSeat,
        iceServers: result.iceServers,
        localStream,
        sendSignal: (toSeat, signal) =>
          socketRef.current?.emit('voice:signal', { toSeat, signal }, () => {}),
        onRemoteStream: (seat, stream) => {
          setStreams((current) => ({ ...current, [seat]: stream }))
          detectorRef.current?.watch(seat, stream)
        },
        onStateChange: (seat, state) =>
          setConnectionStates((current) => ({ ...current, [seat]: state })),
      })
      managerRef.current = manager
      detectorRef.current = createSpeakingDetector({
        onChange: (seat, isSpeaking) =>
          setSpeaking((current) => ({ ...current, [seat]: isSpeaking })),
      })
      setStatus('joined')
      for (const peer of result.peers) void manager.connect(peer.seat)
    })
  }, [selfSeat, socketRef, teardown])

  const leave = useCallback(() => {
    socketRef.current?.emit('voice:leave', {}, () => {})
    teardown()
    setStatus('idle')
  }, [socketRef, teardown])

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    for (const track of localStreamRef.current?.getTracks() ?? []) track.enabled = !next
    socketRef.current?.emit('voice:mute', { muted: next }, () => {})
  }, [muted, socketRef])

  useEffect(() => {
    const socket = socketRef.current
    if (socket === null) return

    const onPeers = (roster: VoicePeer[]): void => {
      setPeers(roster)
      const manager = managerRef.current
      if (manager === null) return
      const present = new Set(roster.map((peer) => peer.seat))
      // A seat that left the roster takes its peer connection with it.
      for (const seat of manager.seats()) {
        if (present.has(seat)) continue
        manager.disconnect(seat)
        detectorRef.current?.unwatch(seat)
        setStreams((current) => {
          const rest = { ...current }
          delete rest[seat]
          return rest
        })
      }
      for (const peer of roster) {
        if (peer.seat !== selfSeat) void manager.connect(peer.seat)
      }
    }

    const onSignal = (payload: { fromSeat: number; signal: VoiceSignal }): void => {
      void managerRef.current?.accept(payload.fromSeat, payload.signal)
    }

    // A dropped socket takes the peers with it; the client rejoins explicitly.
    const onDisconnect = (): void => {
      teardown()
      setStatus('idle')
    }

    socket.on('voice:peers', onPeers)
    socket.on('voice:signal', onSignal)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('voice:peers', onPeers)
      socket.off('voice:signal', onSignal)
      socket.off('disconnect', onDisconnect)
    }
  }, [selfSeat, socketRef, teardown])

  useEffect(() => teardown, [teardown])

  return { status, peers, streams, speaking, connectionStates, join, leave, toggleMute, muted }
}
