import { describe, expect, it } from 'vitest'
import { createShutdown, type ShutdownOptions } from './shutdown.js'

const harness = (steps: ShutdownOptions['steps']) => {
  const exits: number[] = []
  const errors: unknown[] = []
  const timers: { ms: number; fire: () => void; unrefed: boolean }[] = []
  const shutdown = createShutdown({
    steps,
    exit: (code) => exits.push(code),
    setTimer: (fire, ms) => {
      const timer = { ms, fire, unrefed: false }
      timers.push(timer)
      return {
        unref: () => {
          timer.unrefed = true
        },
      }
    },
    log: { info: () => undefined, error: (obj: unknown) => errors.push(obj) },
  })
  return { shutdown, exits, errors, timers }
}

describe('shutdown', () => {
  it('closes every step in order, then exits cleanly', async () => {
    const order: string[] = []
    const { shutdown, exits } = harness([
      () => void order.push('interval'),
      () => Promise.resolve(void order.push('io')),
      () => Promise.resolve(void order.push('app')),
    ])
    await shutdown('SIGTERM')
    expect(order).toEqual(['interval', 'io', 'app'])
    expect(exits).toEqual([0])
  })

  it('arms an unref-ed hard exit, so a hung close cannot keep the process alive', () => {
    const { shutdown, exits, timers } = harness([() => new Promise(() => undefined)])
    void shutdown('SIGTERM')
    expect(timers).toHaveLength(1)
    expect(timers[0]?.ms).toBe(10_000)
    expect(timers[0]?.unrefed).toBe(true)
    timers[0]?.fire()
    expect(exits).toEqual([1])
  })

  it('ignores a second signal while the first is still closing', async () => {
    let release = (): void => undefined
    const hung = new Promise<void>((resolve) => (release = resolve))
    let closes = 0
    const { shutdown, exits, timers } = harness([
      async () => {
        closes += 1
        await hung
      },
    ])
    const first = shutdown('SIGTERM')
    await shutdown('SIGINT')
    release()
    await first
    expect(closes).toBe(1)
    expect(timers).toHaveLength(1)
    expect(exits).toEqual([0])
  })

  it('logs a failing close and exits non-zero rather than rejecting', async () => {
    const failure = new Error('close failed')
    const { shutdown, exits, errors } = harness([() => Promise.reject(failure)])
    await expect(shutdown('SIGTERM')).resolves.toBeUndefined()
    expect(errors).toEqual([{ err: failure }])
    expect(exits).toEqual([1])
  })
})
