import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@uno/protocol'

/**
 * Validated against the protocol's own alphabet, so a hand-typed URL cannot push
 * a malformed code as far as the socket.
 */
export function readRoomCodeFromUrl(search: string = window.location.search): string | null {
  const raw = new URLSearchParams(search).get('room')
  if (raw === null) return null
  const code = raw.trim().toUpperCase()
  if (code.length !== ROOM_CODE_LENGTH) return null
  if (![...code].every((character) => ROOM_CODE_ALPHABET.includes(character))) return null
  return code
}

export function writeRoomCodeToUrl(roomCode: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomCode)
  history.replaceState(null, '', url)
}
