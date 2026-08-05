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

/**
 * The invitation a host sends out. Built from the code rather than read off the
 * address bar: the two agree today only because `writeRoomCodeToUrl` happens to
 * have run first, and a link that silently invites people to the wrong table — or
 * to no table at all — is not worth that coupling.
 *
 * Whoever opens it lands on the home screen with the code already filled in,
 * which is the whole reason a link is worth offering next to the code.
 */
export function roomLink(roomCode: string, href: string = window.location.href): string {
  const url = new URL(href)
  url.searchParams.set('room', roomCode)
  // A stale fragment would otherwise ride along into every invitation.
  url.hash = ''
  return url.toString()
}
