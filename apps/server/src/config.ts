import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  /* 5050, not 5000: macOS Control Center binds 5000 for the AirPlay receiver,
     so a 5000 default fails on any Mac with AirPlay on. */
  PORT: z.coerce.number().int().min(1).max(65535).default(5050),
  /** Comma-separated allowlist. Empty means same-origin only. */
  CORS_ORIGIN: z.string().default(''),
  /**
   * Whether players reach this server over HTTPS — directly, or through a proxy
   * that terminates TLS. Governs the two headers that only make sense when that
   * is true; http.ts explains what each does when the premise is wrong.
   *
   * Defaults to false because that is how the project ships and how the README's
   * quickstart runs it: `docker compose up` then open http://localhost:5050.
   *
   * Deliberately strict about spelling. A security flag that read `TRUE` as false
   * would be worse than one that refuses to boot.
   */
  BEHIND_TLS: z.enum(['true', 'false']).default('false'),
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
  /*
   * Tighter still, because a room costs far more than a message: it holds a seat, a deck
   * and up to three timers until somebody leaves it. Three in a burst then one every ten
   * seconds is beyond what anyone opening a table for friends will notice.
   *
   * Worth being clear about what this does and does not buy. Keyed by socket id, so it
   * stops a double-tapped Create and a script that reuses one connection — it does not
   * stop one that reconnects, which gets a fresh bucket every time. The real bound on
   * rooms is MAX_ROOMS with a purge that can actually reclaim them, which is a property
   * of the seat-release path rather than of this limit.
   */
  CREATE_BURST: z.coerce.number().int().min(1).default(3),
  CREATE_PER_SECOND: z.coerce.number().min(0.01).default(0.1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export type LogLevel = z.infer<typeof envSchema>['LOG_LEVEL']

export type Config = {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  corsOrigins: string[]
  behindTls: boolean
  gracePeriodMs: number
  maxRooms: number
  staticRoot: string | null
  moveBurst: number
  movePerSecond: number
  chatBurst: number
  chatPerSecond: number
  createBurst: number
  createPerSecond: number
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
    behindTls: parsed.BEHIND_TLS === 'true',
    gracePeriodMs: parsed.GRACE_PERIOD_MS,
    maxRooms: parsed.MAX_ROOMS,
    staticRoot: parsed.STATIC_ROOT.trim().length > 0 ? parsed.STATIC_ROOT.trim() : null,
    moveBurst: parsed.MOVE_BURST,
    movePerSecond: parsed.MOVE_PER_SECOND,
    chatBurst: parsed.CHAT_BURST,
    chatPerSecond: parsed.CHAT_PER_SECOND,
    createBurst: parsed.CREATE_BURST,
    createPerSecond: parsed.CREATE_PER_SECOND,
    logLevel: parsed.LOG_LEVEL,
  }
}
