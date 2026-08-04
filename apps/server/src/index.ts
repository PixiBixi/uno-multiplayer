import { loadConfig } from './config.js'
import { buildApp } from './http.js'
import { logger } from './logger.js'
import { RoomManager } from './rooms/room-manager.js'
import { registerSocketHandlers } from './sockets/handlers.js'

const config = loadConfig()

// The safety net the predecessor lacked entirely: there, one malformed payload
// took the whole process down and every game in progress with it.
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception, shutting down')
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection, shutting down')
  process.exit(1)
})

const app = await buildApp(config)
const rooms = new RoomManager({
  maxRooms: config.maxRooms,
  gracePeriodMs: config.gracePeriodMs,
})

const io = registerSocketHandlers(app.server, rooms, config)

// Rooms nobody is connected to are dropped on a slow tick, bounding memory.
const purgeInterval = setInterval(() => {
  const removed = rooms.purge()
  if (removed > 0) logger.debug({ removed }, 'purged empty rooms')
}, 60_000)
purgeInterval.unref()

await app.listen({ host: config.host, port: config.port })
logger.info({ port: config.port, maxRooms: config.maxRooms }, 'server listening')

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutting down')
  clearInterval(purgeInterval)
  await io.close()
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
