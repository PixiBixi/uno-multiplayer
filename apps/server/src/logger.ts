import { pino } from 'pino'

export const logger = pino({
  // Fixed, not LOG_LEVEL: an unvalidated value threw here at import. buildApp sets the
  // level from the validated config.
  level: 'info',
  // Never log a hand or a session token. Redacting by path beats trusting every
  // call site to remember.
  redact: {
    paths: ['sessionToken', '*.sessionToken', 'hand', '*.hand'],
    censor: '[redacted]',
  },
})
