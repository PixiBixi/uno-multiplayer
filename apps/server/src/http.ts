import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
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

  return app
}
