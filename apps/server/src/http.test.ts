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

const appWith = async (env: NodeJS.ProcessEnv = {}): Promise<App> => {
  const instance = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env }))
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
