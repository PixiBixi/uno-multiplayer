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

  it('reports the fall back to silence', () => {
    const onChange = vi.fn()
    const { context } = scriptedContext([40, 1])
    const detector = createSpeakingDetector({ onChange, threshold: 10, context, autoStart: false })
    if (detector === null) throw new Error('expected a detector')
    detector.watch(1, fakeStream)
    detector.sample()
    detector.sample()
    expect(onChange).toHaveBeenNthCalledWith(2, 1, false)
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
