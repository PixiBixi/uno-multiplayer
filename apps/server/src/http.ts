import { resolve } from 'node:path'
import compress from '@fastify/compress'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import type { Config } from './config.js'
import { logger } from './logger.js'

/**
 * Builds the HTTP surface without starting to listen, so tests can drive it
 * through `app.inject()` without opening a port.
 *
 * The return type is inferred rather than annotated: passing a pino instance
 * makes Fastify carry that concrete logger type, which the generic
 * `FastifyInstance` alias does not describe.
 */
export async function buildApp(config: Config) {
  // The logger is a module singleton so every module can import it, but its
  // level belongs to the config - pino lets us set it after construction.
  // Setting it here is also what silences request logging under LOG_LEVEL=silent,
  // rather than Fastify's `disableRequestLogging`, deprecated in v5.
  logger.level = config.logLevel

  /*
   * One hop, and only when a proxy is declared. Behind Traefik every request
   * arrives from the proxy's address on the docker network, so without this the
   * log records the same 172.19.x.x for every visitor.
   *
   * `1` rather than `true`: it trusts the single closest hop, so the address is
   * the peer the proxy itself saw. Anything further left in X-Forwarded-For came
   * from the client and stays untrusted.
   *
   * Tied to BEHIND_TLS because that flag already asserts exactly this shape - a
   * proxy terminating TLS in front of this process. Without it the header is
   * ignored, which is what a directly-exposed server needs: it would otherwise
   * believe whatever a client claimed.
   */
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.behindTls ? 1 : false,
  })

  await app.register(helmet, {
    // The client is served from the same origin and ships no inline scripts.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        /* helmet emits this by default, and it is actively harmful when the
           premise is wrong: it rewrites every asset request to https, so a
           server reached over plain http answers with a CSS and JS URL that has
           no TLS behind it and the page renders blank. `null` removes it, `[]`
           emits it valueless - which is the form the directive takes. */
        upgradeInsecureRequests: config.behindTls ? [] : null,
      },
    },
    /* Same reasoning, opposite failure mode: browsers ignore HSTS delivered over
       plain http, so it does no damage there - but it does promise something this
       deployment cannot keep, and a header that lies is worth removing. */
    strictTransportSecurity: config.behindTls,
  })

  // An empty allowlist means same-origin only: no header is emitted at all.
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: false,
  })

  /*
   * The client bundle went out uncompressed until this existed: 374 KB of JavaScript on
   * the wire, where gzip takes it to roughly a third. Nothing upstream was doing it
   * either, so it belongs here - the app should not depend on a particular proxy being
   * configured a particular way to be usable on a phone.
   *
   * Registered before the static plugin so it wraps those replies. Socket.IO is untouched
   * by this and needs its own setting: engine.io and ws never reach Fastify's reply
   * pipeline. An earlier version of this comment claimed their frames were "already
   * optional-deflate" - they were not, and engine.io only builds a deflate config when
   * the option is passed, which nothing did. `perMessageDeflate` now handles that side
   * in `registerSocketHandlers`.
   *
   * `threshold` leaves tiny payloads alone - /healthz is 15 bytes, and compressing it
   * would add headers worth more than the body.
   */
  await app.register(compress, {
    global: true,
    threshold: 1024,
    /*
     * gzip only, and measured rather than assumed. On this bundle the plugin's default
     * brotli produced a LARGER body than gzip - 113,536 bytes against 112,412 - because
     * it compresses at a low quality to keep per-request cost down. Browsers advertise
     * `br` ahead of `gzip`, so leaving both enabled would serve the worse of the two and
     * spend more CPU doing it.
     *
     * Raising brotli's quality would win a few percent and cost far more per request,
     * with no cache in front of it. Pre-compressing at build time is the real answer if
     * this ever matters; at a few players it does not.
     */
    encodings: ['gzip', 'deflate'],
  })

  app.get('/healthz', () => ({ status: 'ok' }))

  if (config.staticRoot !== null) {
    await app.register(fastifyStatic, {
      root: resolve(config.staticRoot),
      wildcard: false,
      /*
       * Cache policy has to split by filename, and a single `maxAge` would be wrong for
       * everything: Vite writes content-hashed names under /assets/, so those files can
       * never change and are safe to keep for a year - while index.html must never be
       * cached, or a player stays on a stale app shell after every deploy and no amount
       * of reloading fixes it.
       *
       * The icons sit in between: they are copied from public/ with stable names, so
       * they are not immutable, but a day is fine for a favicon.
       */
      /* The first argument is a FastifyReply here, not a raw ServerResponse - hence
         `.header()` and no annotation of my own, which only got it wrong. */
      setHeaders: (reply, path) => {
        if (path.includes('/assets/')) {
          reply.header('cache-control', 'public, max-age=31536000, immutable')
        } else if (path.endsWith('.html')) {
          reply.header('cache-control', 'no-cache')
        } else {
          reply.header('cache-control', 'public, max-age=86400')
        }
      },
    })

    // Single-page fallback, explicitly excluding the paths that must never
    // receive HTML: a health probe answered with an app shell reads as healthy
    // to nothing.
    app.setNotFoundHandler((request, reply) => {
      const isApi = request.url.startsWith('/healthz') || request.url.startsWith('/socket.io')
      if (request.method !== 'GET' || isApi) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
