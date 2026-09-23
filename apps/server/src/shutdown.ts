export type ShutdownOptions = {
  /** Run in order: stop accepting work before closing what serves it. */
  steps: (() => Promise<void> | void)[]
  exit: (code: number) => void
  setTimer?: (fn: () => void, ms: number) => { unref(): void }
  log: {
    info: (obj: object, msg: string) => void
    error: (obj: object, msg: string) => void
  }
}

/** Long enough for sockets to close, short enough to beat an orchestrator's SIGKILL. */
const HARD_EXIT_MS = 10_000

/**
 * The signal handler, injectable so the paths that matter at 3am are tested: a second
 * Ctrl-C, a close that hangs, a close that throws.
 */
export function createShutdown(options: ShutdownOptions): (signal: string) => Promise<void> {
  const { steps, exit, log } = options
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  let started = false

  return async (signal) => {
    // A second signal used to start a second close over the first, on half-closed servers.
    if (started) return
    started = true
    log.info({ signal }, 'shutting down')
    // unref: a clean close must still exit at once, not wait out the timer.
    setTimer(() => exit(1), HARD_EXIT_MS).unref()

    try {
      for (const step of steps) await step()
    } catch (error) {
      log.error({ err: error }, 'shutdown failed')
      exit(1)
      return
    }
    exit(0)
  }
}
