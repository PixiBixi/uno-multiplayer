import type { IncomingHttpHeaders } from 'node:http'

/**
 * The address abuse limits are keyed on. Behind the proxy the socket peer is Traefik, so
 * the leftmost X-Forwarded-For entry is the client: Traefik drops a client-sent header
 * unless its source is trusted. Read only from a private peer, as http.ts trusts it.
 */
export function clientIp(
  handshake: { address: string; headers: IncomingHttpHeaders },
  behindProxy: boolean,
): string {
  const peer = unmapped(handshake.address)
  if (behindProxy && isPrivate(peer)) {
    const header = handshake.headers['x-forwarded-for']
    const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim()
    if (first !== undefined && first.length > 0) return unmapped(first)
  }
  return peer
}

/** `::ffff:1.2.3.4` and `1.2.3.4` are one client and must share one bucket. */
function unmapped(address: string): string {
  return address.startsWith('::ffff:') && address.includes('.') ? address.slice(7) : address
}

/** Loopback and unique-local ranges, the same set as `trustProxy` in http.ts. */
function isPrivate(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length === 4 && octets.every((n) => Number.isInteger(n))) {
    const [a = -1, b = -1] = octets
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  const lower = address.toLowerCase()
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd')
}
