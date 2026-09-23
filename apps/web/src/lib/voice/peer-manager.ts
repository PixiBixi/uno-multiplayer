import type { IceServer, VoiceSignal } from '@uno/protocol'

type PeerManagerOptions = {
  selfSeat: number
  iceServers: IceServer[]
  localStream: MediaStream
  sendSignal: (toSeat: number, signal: VoiceSignal) => void
  onRemoteStream: (seat: number, stream: MediaStream) => void
  onStateChange: (seat: number, state: RTCPeerConnectionState) => void
  /** Injected so the negotiation logic is testable without a browser. */
  createConnection?: (config: RTCConfiguration) => RTCPeerConnection
}

export type PeerManager = {
  connect(seat: number): Promise<void>
  accept(fromSeat: number, signal: VoiceSignal): Promise<void>
  disconnect(seat: number): void
  destroy(): void
  seats(): number[]
}

export function createPeerManager(options: PeerManagerOptions): PeerManager {
  const create =
    options.createConnection ?? ((config: RTCConfiguration) => new RTCPeerConnection(config))
  const connections = new Map<number, RTCPeerConnection>()

  const disconnect = (seat: number): void => {
    connections.get(seat)?.close()
    connections.delete(seat)
  }

  const offer = async (seat: number, connection: RTCPeerConnection): Promise<void> => {
    const description = await connection.createOffer()
    await connection.setLocalDescription(description)
    options.sendSignal(seat, { kind: 'offer', sdp: description.sdp ?? '' })
  }

  /*
   * Only the offering seat restarts, over the same offer/answer path, so glare stays
   * impossible. A restart that cannot even be offered drops the seat, so the next
   * roster connects it afresh instead of finding it wedged in the map.
   */
  const recover = (seat: number, connection: RTCPeerConnection): void => {
    if (options.selfSeat > seat) return
    connection.restartIce()
    offer(seat, connection).catch(() => {
      if (connections.get(seat) === connection) disconnect(seat)
    })
  }

  const open = (seat: number): RTCPeerConnection => {
    const existing = connections.get(seat)
    if (existing !== undefined) return existing

    const connection = create({ iceServers: options.iceServers })
    for (const track of options.localStream.getTracks()) {
      connection.addTrack(track, options.localStream)
    }
    connection.onicecandidate = (event) => {
      // A null candidate marks the end of gathering, not something to relay.
      if (event.candidate === null) return
      options.sendSignal(seat, {
        kind: 'candidate',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      })
    }
    connection.ontrack = (event) => {
      const [stream] = event.streams
      if (stream !== undefined) options.onRemoteStream(seat, stream)
    }
    connection.onconnectionstatechange = () => {
      options.onStateChange(seat, connection.connectionState)
      if (connection.connectionState === 'failed') recover(seat, connection)
    }
    connections.set(seat, connection)
    return connection
  }

  return {
    /*
     * The lower seat number offers, the higher one answers. Seat numbers are
     * already stable and agreed by everyone, so glare cannot happen, and an ICE
     * restart follows the same rule. Do NOT make this symmetric.
     */
    async connect(seat) {
      if (connections.has(seat)) return
      const connection = open(seat)
      if (options.selfSeat > seat) return
      await offer(seat, connection)
    },

    async accept(fromSeat, signal) {
      const connection = open(fromSeat)
      if (signal.kind === 'candidate') {
        await connection.addIceCandidate({
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
        })
        return
      }
      await connection.setRemoteDescription({ type: signal.kind, sdp: signal.sdp })
      if (signal.kind === 'answer') return

      const answer = await connection.createAnswer()
      await connection.setLocalDescription(answer)
      options.sendSignal(fromSeat, { kind: 'answer', sdp: answer.sdp ?? '' })
    },

    disconnect,

    destroy() {
      for (const connection of connections.values()) connection.close()
      connections.clear()
    },

    seats: () => [...connections.keys()].sort((left, right) => left - right),
  }
}
