import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  /** Comma-separated allowlist. Empty means same-origin only. */
  CORS_ORIGIN: z.string().default(''),
  GRACE_PERIOD_MS: z.coerce.number().int().min(0).default(60_000),
  MAX_ROOMS: z.coerce.number().int().min(1).default(500),
  /** Path to the built client. Empty means serve nothing (API only). */
  STATIC_ROOT: z.string().default(''),
  /** Token bucket for game moves. Generous for a human, hostile to a script. */
  MOVE_BURST: z.coerce.number().int().min(1).default(20),
  MOVE_PER_SECOND: z.coerce.number().min(0.1).default(2),
  /** Chat is tighter: flooding it costs everyone else attention. */
  CHAT_BURST: z.coerce.number().int().min(1).default(5),
  CHAT_PER_SECOND: z.coerce.number().min(0.1).default(0.5),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL']

export type Config = {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  corsOrigins: string[]
  gracePeriodMs: number
  maxRooms: number
  staticRoot: string | null
  moveBurst: number
  movePerSecond: number
  chatBurst: number
  chatPerSecond: number
  logLevel: LogLevel
}

/**
 * The one place allowed to throw: a misconfigured environment must stop the boot
 * rather than surface later as confusing runtime behaviour.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env)
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    corsOrigins: parsed.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    gracePeriodMs: parsed.GRACE_PERIOD_MS,
    maxRooms: parsed.MAX_ROOMS,
    staticRoot: parsed.STATIC_ROOT.trim().length > 0 ? parsed.STATIC_ROOT.trim() : null,
    moveBurst: parsed.MOVE_BURST,
    movePerSecond: parsed.MOVE_PER_SECOND,
    chatBurst: parsed.CHAT_BURST,
    chatPerSecond: parsed.CHAT_PER_SECOND,
    logLevel: parsed.LOG_LEVEL,
  }
}
