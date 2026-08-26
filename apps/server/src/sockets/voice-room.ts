import type { VoicePeer } from '@uno/protocol'

export type VoiceRoom = {
  join(seat: number): void
  leave(seat: number): void
  setMuted(seat: number, muted: boolean): void
  has(seat: number): boolean
  peers(): VoicePeer[]
  peersExcept(seat: number): VoicePeer[]
  size(): number
}

export type VoiceRooms = {
  in(roomCode: string): VoiceRoom
  drop(roomCode: string): void
  size(): number
}

function createVoiceRoom(): VoiceRoom {
  /* Seat to muted. Deliberately not on Room: Room is the game, and a voice
     session that owns none of the game state can be removed without touching it. */
  const members = new Map<number, boolean>()

  const peers = (): VoicePeer[] =>
    [...members.entries()]
      .map(([seat, muted]) => ({ seat, muted }))
      .sort((left, right) => left.seat - right.seat)

  return {
    join(seat) {
      // Re-joining must not reset the mute a player set a moment ago.
      if (!members.has(seat)) members.set(seat, false)
    },
    leave(seat) {
      members.delete(seat)
    },
    setMuted(seat, muted) {
      if (members.has(seat)) members.set(seat, muted)
    },
    has: (seat) => members.has(seat),
    peers,
    peersExcept: (seat) => peers().filter((peer) => peer.seat !== seat),
    size: () => members.size,
  }
}

export function createVoiceRooms(): VoiceRooms {
  const rooms = new Map<string, VoiceRoom>()

  return {
    in(roomCode) {
      const existing = rooms.get(roomCode)
      if (existing !== undefined) return existing
      const created = createVoiceRoom()
      rooms.set(roomCode, created)
      return created
    },
    drop(roomCode) {
      rooms.delete(roomCode)
    },
    size: () => rooms.size,
  }
}
