/**
 * Whether a socket handshake may proceed, judged by its Origin header.
 *
 * A WebSocket upgrade is exempt from CORS, so the `cors` option alone never stopped a
 * page on another site from opening a socket in a player's browser. No Origin means a
 * non-browser client, which this check is not meant to stop.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  allowlist: readonly string[],
): boolean {
  if (origin === undefined) return true
  if (allowlist.includes(origin)) return true
  if (host === undefined) return false
  try {
    // `host` carries the port when it is not the default, exactly like URL.host.
    return new URL(origin).host === host.toLowerCase()
  } catch {
    // "null" from a sandboxed frame or a file:// page, or garbage: never same-origin.
    return false
  }
}
