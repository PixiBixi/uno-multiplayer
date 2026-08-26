import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('applies defaults on an empty environment', () => {
    const config = loadConfig({})
    expect(config.port).toBe(5050)
    expect(config.host).toBe('0.0.0.0')
    expect(config.gracePeriodMs).toBe(60_000)
    expect(config.maxRooms).toBe(500)
    expect(config.nodeEnv).toBe('development')
    expect(config.corsOrigins).toEqual([])
  })

  it('coerces a numeric port from its string form', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080)
  })

  it('splits and trims the CORS allowlist', () => {
    const config = loadConfig({ CORS_ORIGIN: 'https://a.example , https://b.example' })
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example'])
  })

  it('drops empty entries from the CORS allowlist', () => {
    expect(loadConfig({ CORS_ORIGIN: ',, ' }).corsOrigins).toEqual([])
  })

  it('throws on a port outside the valid range', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow()
  })

  it('throws on a non-numeric port', () => {
    expect(() => loadConfig({ PORT: 'http' })).toThrow()
  })

  it('throws on an unknown NODE_ENV', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow()
  })

  it('accepts a zero grace period, for tests that want no waiting', () => {
    expect(loadConfig({ GRACE_PERIOD_MS: '0' }).gracePeriodMs).toBe(0)
  })
})

describe('voice configuration', () => {
  it('defaults every voice setting to disabled', () => {
    const config = loadConfig({ NODE_ENV: 'test' })
    expect(config.turnUrl).toBeNull()
    expect(config.turnSecret).toBeNull()
    expect(config.stunUrl).toBeNull()
    expect(config.turnTtlSeconds).toBe(86_400)
  })

  it('reads a configured relay', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      TURN_URL: 'turn:turn.example.com:3478',
      TURN_SECRET: 'shhh',
    })
    expect(config.turnUrl).toBe('turn:turn.example.com:3478')
    expect(config.turnSecret).toBe('shhh')
  })

  it('refuses a ttl short enough to expire mid-match', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', TURN_TTL_SECONDS: '30' })).toThrow()
  })
})
