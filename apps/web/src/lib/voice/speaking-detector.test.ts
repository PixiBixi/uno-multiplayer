import { describe, expect, it, vi } from 'vitest'
import { createSpeakingDetector } from './speaking-detector.js'

/** Drives the detector from a scripted sequence of loudness readings. */
const scriptedContext = (levels: number[]) => {
  let index = 0
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 4,
    getByteTimeDomainData(target: Uint8Array) {
      const level = levels[Math.min(index, levels.length - 1)] ?? 0
      index += 1
      // 128 is silence in time-domain byte data; deviation from it is amplitude.
      target.fill(128 + level)
    },
    disconnect: vi.fn(),
  }
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const close = vi.fn()
  return {
    context: {
      createAnalyser: () => analyser,
      createMediaStreamSource: () => source,
      close,
      state: 'running',
    } as unknown as AudioContext,
    source,
    close,
  }
}

const fakeStream = {} as MediaStream

describe('speaking detector', () => {
  it('reports speaking when the level crosses the threshold', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([40])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    expect(onChange).toHaveBeenCalledWith(1, true)
  })

  it('stays silent below the threshold', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([2])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits only on transitions, not on every sample', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([40, 40, 40])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    detector.sample()
    detector.sample()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reports the fall back to silence once it has lasted the hold', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([40, 1, 1])
    const detector = createSpeakingDetector({
      onChange,
      threshold: 10,
      holdSamples: 2,
      context,
      autoStart: false,
    })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    detector.sample()
    expect(onChange).toHaveBeenCalledTimes(1)
    detector.sample()
    expect(onChange).toHaveBeenNthCalledWith(2, 1, false)
  })

  it('rides over the gaps between syllables', () => {
    // Each flip re-renders the whole table, so a dip shorter than the hold must not flip.
    const onChange = vi.fn()
    const { context } = scriptedContext([40, 1, 40, 1, 40])
    const detector = createSpeakingDetector({
      onChange,
      threshold: 10,
      holdSamples: 2,
      context,
      autoStart: false,
    })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    for (let i = 0; i < 5; i++) detector.sample()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('disconnects the source it created when a seat stops being watched', () => {
    const { context, source } = scriptedContext([0])
    const detector = createSpeakingDetector({
      onChange: vi.fn(),
      threshold: 10,
      context,
      autoStart: false,
    })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.unwatch(1)
    expect(source.disconnect).toHaveBeenCalled()
  })

  it('reports silence for a seat that stops being watched mid-sentence', () => {
    // Otherwise the table keeps lighting up a player who has already left voice.
    const onChange = vi.fn()
    const { context } = scriptedContext([40])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    detector.unwatch(1)
    expect(onChange).toHaveBeenLastCalledWith(1, false)
  })

  it('stays quiet when a silent seat stops being watched', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([0])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    detector.unwatch(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves a context it did not create open', () => {
    const { context, close } = scriptedContext([0])
    const detector = createSpeakingDetector({
      onChange: vi.fn(),
      threshold: 10,
      context,
      autoStart: false,
    })
    if (detector === null) throw new Error('expected a detector')
    detector.destroy()
    expect(close).not.toHaveBeenCalled()
  })
})
