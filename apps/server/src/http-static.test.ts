import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

/**
 * A throwaway client build, laid out like a real one: index.html at the root, a
 * content-hashed file under assets/, and the icons Vite copies from public/. The three
 * locations exist because each gets a different cache policy.
 *
 * The asset is padded past the compression threshold - a 20-byte file would be served
 * uncompressed no matter what is registered, and a test asserting otherwise would be
 * asserting the threshold rather than the plugin.
 */
const fakeBuild = () => {
  const dir = mkdtempSync(join(tmpdir(), 'uno-web-'))
  writeFileSync(join(dir, 'index.html'), '<div id="root">app shell</div>')
  writeFileSync(join(dir, 'app.js'), 'console.log("bundle")')
  writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" />')
  writeFileSync(join(dir, 'apple-touch-icon.png'), Buffer.from('89504e470d0a1a0a', 'hex'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'assets', 'index-DR4aIUBH.js'), `// bundle\n${'x'.repeat(4096)}`)
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

  /*
   * The icons are asserted on their content type, not their status code. This route
   * fails silently otherwise: `wildcard: false` plus a not-found handler that returns
   * the app shell means a missed icon answers 200 with HTML, the browser quietly shows
   * its default mark, and nothing anywhere reports a problem. A 200 proves nothing here
   * - only the media type distinguishes the icon from the app shell wearing its name.
   */
  it.each([
    ['/favicon.svg', 'image/svg+xml'],
    ['/apple-touch-icon.png', 'image/png'],
  ])('serves %s as %s rather than as the app shell', async (url, mediaType) => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain(mediaType)
    expect(response.body).not.toContain('app shell')
  })

  /*
   * The bundle went out at 374 KB uncompressed in production before this, with nothing
   * upstream compressing it either. Asserted on the header rather than on a size, since a
   * body that happens to be small is not evidence either way.
   */
  it('compresses a bundle for a client that accepts it', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({
      method: 'GET',
      url: '/assets/index-DR4aIUBH.js',
      headers: { 'accept-encoding': 'gzip' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-encoding']).toBe('gzip')
  })

  it('sends it plain to a client that did not ask', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/assets/index-DR4aIUBH.js' })
    expect(response.headers['content-encoding']).toBeUndefined()
  })

  /*
   * Three policies, and the split is the point. Production served everything with
   * `max-age=0`, so every visit revalidated files whose names contain a hash of their own
   * contents. Caching them for a year is safe precisely because the name changes when the
   * bytes do - and index.html must stay uncached for exactly the same reason, or the
   * player keeps an app shell that points at assets from the previous deploy.
   */
  it.each([
    ['/assets/index-DR4aIUBH.js', 'immutable'],
    ['/index.html', 'no-cache'],
    ['/favicon.svg', 'max-age=86400'],
  ])('caches %s as %s', async (url, expected) => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toContain(expected)
  })

  it('never lets the app shell be cached, even on the client-route fallback', async () => {
    const instance = await appWith({ STATIC_ROOT: fakeBuild() })
    const response = await instance.inject({ method: 'GET', url: '/play' })
    // The fallback serves index.html through sendFile, a different path from a direct
    // request for it. A year-long cache here would pin players to a dead deploy.
    expect(response.headers['cache-control']).toContain('no-cache')
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
