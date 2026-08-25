import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'
import { buildApp } from './http.js'

/** Derived from buildApp: annotating it as FastifyInstance loses the concrete
 *  pino logger type that passing a logger instance introduces. */
type App = Awaited<ReturnType<typeof buildApp>>

let app: App | null = null

afterEach(async () => {
  await app?.close()
  app = null
})

let seenIp: string | null = null

const appWith = async (env: NodeJS.ProcessEnv = {}): Promise<App> => {
  const instance = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env }))
  seenIp = null
  // request.ip is what the logger records, so observe the same value.
  instance.addHook('onRequest', (request, _reply, done) => {
    seenIp = request.ip
    done()
  })
  app = instance
  return instance
}

describe('GET /healthz', () => {
  it('reports healthy', async () => {
    const response = await (await appWith()).inject({ method: 'GET', url: '/healthz' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('security headers', () => {
  it('sets the headers helmet provides', async () => {
    const response = await (await appWith()).inject({ method: 'GET', url: '/healthz' })
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-security-policy']).toBeDefined()
  })

  it('does not advertise the framework', async () => {
    const response = await (await appWith()).inject({ method: 'GET', url: '/healthz' })
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  /* Two helmet defaults that assume TLS. Left on, they take a plain-http
     deployment from working to serving a blank page: every asset request gets
     rewritten to a https URL with nothing listening behind it. */
  describe('without BEHIND_TLS', () => {
    it('does not upgrade asset requests to https', async () => {
      const response = await (await appWith()).inject({ method: 'GET', url: '/healthz' })
      expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests')
    })

    it('does not promise HSTS it cannot keep', async () => {
      const response = await (await appWith()).inject({ method: 'GET', url: '/healthz' })
      expect(response.headers['strict-transport-security']).toBeUndefined()
    })
  })

  describe('with BEHIND_TLS', () => {
    it('upgrades asset requests to https', async () => {
      const instance = await appWith({ BEHIND_TLS: 'true' })
      const response = await instance.inject({ method: 'GET', url: '/healthz' })
      expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests')
    })

    it('sends HSTS', async () => {
      const instance = await appWith({ BEHIND_TLS: 'true' })
      const response = await instance.inject({ method: 'GET', url: '/healthz' })
      expect(response.headers['strict-transport-security']).toContain('max-age=')
    })

    it('refuses to boot on a spelling it does not recognise', () => {
      // Reading `TRUE` as false would silently drop both protections.
      expect(() => loadConfig({ NODE_ENV: 'test', BEHIND_TLS: 'TRUE' })).toThrow()
    })
  })
})

describe('the client IP behind a proxy', () => {
  /* Deployed behind Traefik, every request arrives from the proxy's address on the
     docker network, so the log said 172.19.0.10 for everybody. Trusting one hop
     recovers the real client - and one hop is exactly what BEHIND_TLS already
     asserts, since it means a proxy terminates TLS in front of this process.

     Safe here because the container publishes no ports and sits only on the proxy
     network, so nothing but the proxy can reach it to forge a header. Off without
     the flag, where a forged X-Forwarded-For would otherwise be believed. */
  it('reports the forwarded client when a proxy is declared', async () => {
    const instance = await appWith({ BEHIND_TLS: 'true' })
    const response = await instance.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    })
    expect(response.statusCode).toBe(200)
    expect(seenIp).toBe('203.0.113.7')
  })

  it('ignores the header when no proxy is declared', async () => {
    const instance = await appWith()
    await instance.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    })
    expect(seenIp).not.toBe('203.0.113.7')
  })

  it('reads the closest entry, so a forged one behind the proxy is not believed', async () => {
    // Traefik appends the peer it saw; anything to its left came from the client.
    const instance = await appWith({ BEHIND_TLS: 'true' })
    await instance.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.7' },
    })
    expect(seenIp).toBe('203.0.113.7')
  })

  /* The property a hop count could not check, and the reason it no longer exists.
     fastify 5.12.1 made `trustProxy: <number>` fail closed outright, because a count says
     how many entries to believe and nothing about WHO sent them - so a client reaching
     this process directly could pad the header until it was believed
     (GHSA-3m5p-2c4r-xxw2). Trust is by address now, and this asserts the half that
     matters: a peer that is not a plausible proxy is not believed at all. */
  it('does not believe a forwarded header from a peer on a public address', async () => {
    const instance = await appWith({ BEHIND_TLS: 'true' })
    await instance.inject({
      method: 'GET',
      url: '/healthz',
      remoteAddress: '198.51.100.9',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    })
    expect(seenIp).toBe('198.51.100.9')
  })
})

describe('CORS', () => {
  it('reflects an allowlisted origin', async () => {
    const instance = await appWith({ CORS_ORIGIN: 'https://play.example' })
    const response = await instance.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://play.example' },
    })
    expect(response.headers['access-control-allow-origin']).toBe('https://play.example')
  })

  it('does not reflect an origin outside the allowlist', async () => {
    const instance = await appWith({ CORS_ORIGIN: 'https://play.example' })
    const response = await instance.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://evil.example' },
    })
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('unknown routes', () => {
  it('answers 404 rather than throwing', async () => {
    const response = await (await appWith()).inject({ method: 'GET', url: '/nope' })
    expect(response.statusCode).toBe(404)
  })
})
