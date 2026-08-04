const PREFIX = 'uno.session.'

const keyFor = (roomCode: string): string => `${PREFIX}${roomCode.toUpperCase()}`

/**
 * localStorage can throw outright — private browsing, blocked storage, a full
 * quota. Losing the ability to reconnect is a degraded experience; a crash on
 * page load is a broken one.
 */
export function readSession(roomCode: string): string | null {
  try {
    return window.localStorage.getItem(keyFor(roomCode))
  } catch {
    return null
  }
}

export function writeSession(roomCode: string, token: string): void {
  try {
    window.localStorage.setItem(keyFor(roomCode), token)
  } catch {
    /* Reconnection will not survive a reload. The game still plays. */
  }
}

export function clearSession(roomCode: string): void {
  try {
    window.localStorage.removeItem(keyFor(roomCode))
  } catch {
    /* Nothing to do. */
  }
}
