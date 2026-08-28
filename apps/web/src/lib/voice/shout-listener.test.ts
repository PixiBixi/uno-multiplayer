import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShoutListener, probeShout, type SpeechRecognitionLike } from './shout-listener.js'

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
  })

  it('forgets the backoff after a session that lasted', () => {
    const { factory, made, last } = fakeRecognition()
    createShoutListener({ locale: 'fr', mode: 'local', onShout: vi.fn(), factory })?.start()
    last().onend?.()
    vi.advanceTimersByTime(300)
    vi.advanceTimersByTime(5000)
    last().onend?.()
    vi.advanceTimersByTime(300)
    expect(made).toHaveLength(3)
  })

  it('gives up for good when the microphone is refused', () => {
    const onDenied = vi.fn()
    const { factory, made, last } = fakeRecognition()
    createShoutListener({
      locale: 'fr',
      mode: 'local',
      onShout: vi.fn(),
      onDenied,
      factory,
    })?.start()
    last().onerror?.({ error: 'not-allowed' })
    last().onend?.()
    vi.advanceTimersByTime(10_000)
    expect(made).toHaveLength(1)
    expect(onDenied).toHaveBeenCalledTimes(1)
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
    listener?.stop()
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
