import { afterEach, describe, expect, it, vi } from 'vitest'

describe('the logger singleton', () => {
  const original = process.env['LOG_LEVEL']

  afterEach(() => {
    if (original === undefined) delete process.env['LOG_LEVEL']
    else process.env['LOG_LEVEL'] = original
    vi.resetModules()
  })

  /* The raw variable used to reach pino at import, so a typo threw from inside a module
     graph before loadConfig could reject it with a message naming the variable. */
  it('ignores LOG_LEVEL at import and leaves validating it to the config', async () => {
    process.env['LOG_LEVEL'] = 'verbose'
    vi.resetModules()
    const { logger } = await import('./logger.js')
    expect(logger.level).toBe('info')
  })
})
