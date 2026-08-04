import { pino } from 'pino'

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  // Never log a hand or a session token. Redacting by path beats trusting every
  // call site to remember.
  redact: {
    paths: ['sessionToken', '*.sessionToken', 'hand', '*.hand'],
    censor: '[redacted]',
  },
})

export type Logger = typeof logger
