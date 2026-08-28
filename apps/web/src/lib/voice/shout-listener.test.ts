import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createShoutListener,
  installShout,
  probeShout,
  type SpeechRecognitionLike,
} from './shout-listener.js'

/** A recogniser that records how it was configured and fires its handlers on demand. */
const fakeRecognition = () => {
  const made: SpeechRecognitionLike[] = []
  const factory = (): SpeechRecognitionLike => {
    const instance: SpeechRecognitionLike = {
      lang: '',
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      onresult: null,
      onend: null,
      onerror: null,
    }
    made.push(instance)
    return instance
  }
  return { factory, made, last: () => made[made.length - 1] as SpeechRecognitionLike }
}

/** One result event, shaped the way the browser shapes it. */
const resultEvent = (resultIndex: number, alternatives: string[][]) => ({
  resultIndex,
  results: alternatives.map((list) => list.map((transcript) => ({ transcript }))),
})

describe('shout listener', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('configures the recogniser for continuous listening in the locale', () => {
    const { factory, last } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    expect(last().lang).toBe('fr-FR')
    expect(last().continuous).toBe(true)
    expect(last().interimResults).toBe(true)
    expect(last().maxAlternatives).toBe(3)
    expect(last().start).toHaveBeenCalled()
  })

  it('asks for local processing in local mode and not in cloud mode', () => {
    const local = fakeRecognition()
    createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory: local.factory,
    })?.start()
    expect(local.last().processLocally).toBe(true)

    const cloud = fakeRecognition()
    createShoutListener({
      locale: 'fr',
      mode: 'cloud',
      onShout: vi.fn(),
      factory: cloud.factory,
    })?.start()
    expect(cloud.last().processLocally).toBeUndefined()
  })

  it('shouts when a result carries the word', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(0, [['uno']]))
    expect(onShout).toHaveBeenCalledTimes(1)
  })

  it('checks the later alternatives, where a shouted word often lands', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(0, [['une eau', 'uno']]))
    expect(onShout).toHaveBeenCalledTimes(1)
  })

  it('reads only from resultIndex, so a word already acted on cannot match again', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(1, [['uno'], ['bonjour']]))
    expect(onShout).not.toHaveBeenCalled()
  })

  it('stays quiet on speech that is not the word', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    createShoutListener({ locale: 'en', mode: 'local', onShout, factory })?.start()
    last().onresult?.(resultEvent(0, [['you know what']]))
    expect(onShout).not.toHaveBeenCalled()
  })

  it('stays quiet when a dropped recogniser reports late', () => {
    const onShout = vi.fn()
    const { factory, last } = fakeRecognition()
    const listener = createShoutListener({ locale: 'fr', mode: 'local', onShout, factory })
    listener?.start()
    const dropped = last()
    listener?.stop()
    dropped.onresult?.(resultEvent(0, [['uno']]))
    expect(onShout).not.toHaveBeenCalled()
  })

  it('starts again after the recogniser ends on its own', () => {
    const { factory, made, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout: vi.fn(), factory })?.start()
    expect(made).toHaveLength(1)
    last().onend?.()
    vi.advanceTimersByTime(300)
    expect(made).toHaveLength(2)
    expect(last().start).toHaveBeenCalled()
  })

  it('backs off when the ends keep coming immediately', () => {
    const { factory, made, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout: vi.fn(), factory })?.start()
    last().onend?.()
    vi.advanceTimersByTime(300)
    last().onend?.()
    vi.advanceTimersByTime(300)
    // The second wait is 600ms, so 300 is not yet enough.
    expect(made).toHaveLength(2)
    vi.advanceTimersByTime(300)
    expect(made).toHaveLength(3)
    last().onend?.()
    vi.advanceTimersByTime(600)
    // The third wait is 1200ms, so 600 is not yet enough.
    expect(made).toHaveLength(3)
    vi.advanceTimersByTime(600)
    expect(made).toHaveLength(4)
  })

  it('forgets the backoff after a session that lasted', () => {
    const { factory, made, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout: vi.fn(), factory })?.start()
    last().onend?.()
    vi.advanceTimersByTime(300)
    // A session that runs its course is a normal timeout, not a failure: it
    // restarts with no delay at all, unlike the 300ms backoff above.
    vi.advanceTimersByTime(5000)
    last().onend?.()
    expect(made).toHaveLength(2)
    vi.advanceTimersByTime(0)
    expect(made).toHaveLength(3)
  })

  it('gives up for good when the microphone is refused', () => {
    const onDenied = vi.fn()
    const { factory, made, last } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      onDenied,
      factory,
    })
    listener?.start()
    last().onerror?.({ error: 'not-allowed' })
    last().onend?.()
    vi.advanceTimersByTime(10_000)
    expect(made).toHaveLength(1)
    expect(onDenied).toHaveBeenCalledTimes(1)
    // A refusal is final: arming it again must not reach for the microphone.
    listener?.start()
    expect(made).toHaveLength(1)
  })

  it('aborts the recogniser it is holding on stop', () => {
    const { factory, last } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    const first = last()
    listener?.stop()
    expect(first.abort).toHaveBeenCalled()
  })

  it('cancels a restart that was already scheduled', () => {
    const { factory, made, last } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    // onend clears the held recogniser, so only the pending timer is left to cancel.
    last().onend?.()
    expect(vi.getTimerCount()).toBe(1)
    listener?.stop()
    // Counting the timer is the point: a leaked one is invisible in `made`, since
    // the restart it fires bails on `wanted` anyway.
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(made).toHaveLength(1)
  })

  it('survives a start that throws because it is already listening', () => {
    const { factory, made, last } = fakeRecognition()
    /* Every instance refuses to start, which is what InvalidStateError looks like
       from here. Mocking one instance would not do it: the restart builds a new one. */
    const throwing = (): SpeechRecognitionLike => {
      const instance = factory()
      instance.start = vi.fn(() => {
        throw new Error('InvalidStateError')
      })
      return instance
    }
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory: throwing,
    })
    expect(() => listener?.start()).not.toThrow()
    expect(() => {
      last().onend?.()
      vi.advanceTimersByTime(300)
    }).not.toThrow()
    expect(made).toHaveLength(2)
  })

  it('starting twice does not stack recognisers', () => {
    const { factory, made } = fakeRecognition()
    const listener = createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      factory,
    })
    listener?.start()
    listener?.start()
    expect(made).toHaveLength(1)
  })

  it('reports an unsupported browser', async () => {
    await expect(probeShout('fr')).resolves.toBe('unsupported')
  })
})

describe('probeShout with a recogniser present', () => {
  const withRecognition = (available: () => Promise<string>) => {
    const scope = globalThis as unknown as { SpeechRecognition?: unknown }
    const previous = scope.SpeechRecognition
    scope.SpeechRecognition = Object.assign(function Fake() {}, { available })
    return () => {
      scope.SpeechRecognition = previous
    }
  }

  it('maps an installed pack to local', async () => {
    const restore = withRecognition(() => Promise.resolve('available'))
    await expect(probeShout('fr')).resolves.toBe('local')
    restore()
  })

  it('maps an offerable pack to downloadable', async () => {
    const restore = withRecognition(() => Promise.resolve('downloadable'))
    await expect(probeShout('fr')).resolves.toBe('downloadable')
    restore()
  })

  it('maps a pack in flight to downloading, distinct from downloadable', async () => {
    const restore = withRecognition(() => Promise.resolve('downloading'))
    await expect(probeShout('fr')).resolves.toBe('downloading')
    restore()
  })

  it('maps an unavailable pack to cloud', async () => {
    const restore = withRecognition(() => Promise.resolve('unavailable'))
    await expect(probeShout('fr')).resolves.toBe('cloud')
    restore()
  })

  it('falls back to cloud when the probe itself rejects', async () => {
    const restore = withRecognition(() => Promise.reject(new Error('boom')))
    await expect(probeShout('fr')).resolves.toBe('cloud')
    restore()
  })
})

describe('installShout', () => {
  const withCtor = (extras: Record<string, unknown>) => {
    const scope = globalThis as unknown as { SpeechRecognition?: unknown }
    const previous = scope.SpeechRecognition
    scope.SpeechRecognition = Object.assign(function Fake() {}, extras)
    return () => {
      scope.SpeechRecognition = previous
    }
  }

  it('refuses when there is no recogniser at all', async () => {
    await expect(installShout('fr')).resolves.toBe(false)
  })

  it('refuses on a recogniser that cannot install packs, rather than throwing', async () => {
    const restore = withCtor({})
    await expect(installShout('fr')).resolves.toBe(false)
    restore()
  })

  it('asks for the locale pack on device and passes on what the browser answered', async () => {
    const install = vi.fn(() => Promise.resolve(true))
    const restore = withCtor({ install })
    await expect(installShout('fr')).resolves.toBe(true)
    expect(install).toHaveBeenCalledWith({ langs: ['fr-FR'], processLocally: true })
    restore()
  })

  it('asks for the English pack in the English locale', async () => {
    const install = vi.fn(() => Promise.resolve(true))
    const restore = withCtor({ install })
    await installShout('en')
    expect(install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true })
    restore()
  })

  it('reports false when the install rejects', async () => {
    const restore = withCtor({ install: () => Promise.reject(new Error('boom')) })
    await expect(installShout('fr')).resolves.toBe(false)
    restore()
  })

  it('reports false when the browser declines the download', async () => {
    const restore = withCtor({ install: () => Promise.resolve(false) })
    await expect(installShout('fr')).resolves.toBe(false)
    restore()
  })
})
