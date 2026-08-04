import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'
import { buildApp } from './http.js'

type App = Awaited<ReturnType<typeof buildApp>>
let app: App | null = null

afterEach(async () => {
  await app?.close()
  app = null
})

/** A throwaway client build: index.html plus one asset. */
const fakeBuild = () => {
  const dir = mkdtempSync(join(tmpdir(), 'uno-web-'))
  writeFileSync(join(dir, 'index.html'), '<div id="root">app shell</div>')
  writeFileSync(join(dir, 'app.js'), 'console.log("bundle")')
  return dir
}

const appWith = async (env: NodeJS.ProcessEnv): Promise<App> => {
  const instance = await buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env }))
  app = instance
  return instance
}

describe('static serving', () => {
  it('serves index.html at the root', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('app shell')
  })

  it('serves a built asset', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/app.js' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('bundle')
  })

  it('falls back to index.html for a client route', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/play' })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('app shell')
  })

  it('never lets the fallback swallow the health check', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    expect((await instance.inject({ method: 'GET', url: '/healthz' })).json()).toEqual({
      status: 'ok',
    })
  })

  it('answers 404 rather than HTML for a non-GET method', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    expect((await instance.inject({ method: 'POST', url: '/play' })).statusCode).toBe(404)
  })

  it('still answers 404 when no static root is configured', async () => {
    const instance = await appWith({})
    expect((await instance.inject({ method: 'GET', url: '/play' })).statusCode).toBe(404)
  })
})
