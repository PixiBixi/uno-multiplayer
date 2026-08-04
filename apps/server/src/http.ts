import { resolve } from 'node:path'
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
  // level belongs to the config — pino lets us set it after construction.
  // Setting it here is also what silences request logging under LOG_LEVEL=silent,
  // rather than Fastify's `disableRequestLogging`, deprecated in v5.
  logger.level = config.logLevel

  const app = Fastify({ loggerInstance: logger })

  await app.register(helmet, {
    // The client is served from the same origin and ships no inline scripts.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
      },
    },
  })

  // An empty allowlist means same-origin only: no header is emitted at all.
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: false,
  })

  app.get('/healthz', () => ({ status: 'ok' }))

  if (config.staticRoot !== null) {
    await app.register(fastifyStatic, { root: resolve(config.staticRoot), wildcard: false })

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
