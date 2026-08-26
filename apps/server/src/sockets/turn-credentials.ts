import { createHmac } from 'node:crypto'
import type { IceServer } from '@uno/protocol'

export type TurnConfig = {
  turnUrl: string | null
  turnSecret: string | null
  turnTtlSeconds: number
  stunUrl: string | null
}

/**
 * coturn's REST API scheme (`use-auth-secret`): the username carries its own
 * expiry, so the relay validates it against the shared secret and stores nothing.
 * HMAC-SHA1 is not a preference here, it is what the scheme specifies.
 */
export function mintIceServers(
  config: TurnConfig,
  roomCode: string,
  now: () => number = () => Date.now(),
): IceServer[] {
  const servers: IceServer[] = []

  // STUN first: ICE should find the free path before it pays for a relay.
  if (config.stunUrl !== null) servers.push({ urls: [config.stunUrl] })
  if (config.turnUrl === null || config.turnSecret === null) return servers

  const username = `${Math.floor(now() / 1000) + config.turnTtlSeconds}:${roomCode}`
  const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64')
  servers.push({ urls: [config.turnUrl], username, credential })
  return servers
}
