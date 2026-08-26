import { describe, expect, it } from 'vitest'
import { mintIceServers, type TurnConfig } from './turn-credentials.js'

const full: TurnConfig = {
  turnUrl: 'turn:turn.example.com:3478',
  turnSecret: 'test-secret',
  turnTtlSeconds: 86_400,
  stunUrl: 'stun:stun.example.com:3478',
}

describe('mintIceServers', () => {
  it('produces the exact coturn REST credential for a known secret and clock', () => {
    const servers = mintIceServers(full, 'ABCDEF', () => 0)
    expect(servers).toContainEqual({
      urls: ['turn:turn.example.com:3478'],
      username: '86400:ABCDEF',
      credential: 'w7nN9a6dg0s6aZuK9l76b2ekQ/o=',
    })
  })

  it('lists the stun server first so ICE tries the free path before the relay', () => {
    const servers = mintIceServers(full, 'ABCDEF', () => 0)
    expect(servers[0]).toEqual({ urls: ['stun:stun.example.com:3478'] })
  })

  it('expires the username ttl seconds after now', () => {
    const servers = mintIceServers(full, 'ABCDEF', () => 10_000)
    expect(servers[1]?.username).toBe('86410:ABCDEF')
  })

  it('omits turn entirely when no secret is configured', () => {
    const servers = mintIceServers({ ...full, turnSecret: null }, 'ABCDEF', () => 0)
    expect(servers).toEqual([{ urls: ['stun:stun.example.com:3478'] }])
  })

  it('returns an empty list when nothing is configured', () => {
    const servers = mintIceServers(
      { turnUrl: null, turnSecret: null, turnTtlSeconds: 86_400, stunUrl: null },
      'ABCDEF',
      () => 0,
    )
    expect(servers).toEqual([])
  })
})
