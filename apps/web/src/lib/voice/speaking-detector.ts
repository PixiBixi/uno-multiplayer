export type SpeakingDetector = {
  watch(seat: number, stream: MediaStream): void
  unwatch(seat: number): void
  /** Exposed so tests can step the loop instead of waiting on animation frames. */
  sample(): void
  destroy(): void
}

export type SpeakingDetectorOptions = {
  onChange: (seat: number, speaking: boolean) => void
  /** Deviation from silence, in the 0-127 range of time-domain byte data. */
  threshold?: number
  /** Quiet samples before speaking turns off: about 250 ms at 60 frames a second. */
  holdSamples?: number
  context?: AudioContext
  /** False in tests, which drive `sample` directly. */
  autoStart?: boolean
}

type Watched = {
  analyser: AnalyserNode
  source: MediaStreamAudioSourceNode
  buffer: Uint8Array<ArrayBuffer>
  speaking: boolean
  quiet: number
}

/**
 * Who is talking is computed from the audio each client already receives, so
 * nothing about it travels over the wire. Publishing a speaking flag instead
 * would emit several messages per second per player to carry information every
 * client can derive locally.
 */
export function createSpeakingDetector(options: SpeakingDetectorOptions): SpeakingDetector | null {
  const threshold = options.threshold ?? 12
  const holdSamples = options.holdSamples ?? 15
  const context =
    options.context ??
    (typeof window !== 'undefined' && 'AudioContext' in window ? new AudioContext() : null)
  if (context === null) return null

  const watched = new Map<number, Watched>()
  let frame: number | null = null

  const sample = (): void => {
    for (const [seat, entry] of watched) {
      entry.analyser.getByteTimeDomainData(entry.buffer)
      let peak = 0
      // 128 is silence in time-domain byte data; deviation from it is amplitude.
      for (const value of entry.buffer) peak = Math.max(peak, Math.abs(value - 128))
      /* Held before turning off: every flip re-renders the table, and the gaps between
         syllables would otherwise flip it dozens of times a second. */
      if (peak >= threshold) {
        entry.quiet = 0
        if (entry.speaking) continue
        entry.speaking = true
        options.onChange(seat, true)
        continue
      }
      if (!entry.speaking) continue
      entry.quiet += 1
      if (entry.quiet < holdSamples) continue
      entry.speaking = false
      options.onChange(seat, false)
    }
  }

  const loop = (): void => {
    sample()
    frame = requestAnimationFrame(loop)
  }
  if (options.autoStart !== false && typeof requestAnimationFrame === 'function') loop()

  const release = (seat: number): void => {
    const entry = watched.get(seat)
    if (entry === undefined) return
    entry.source.disconnect()
    entry.analyser.disconnect()
    watched.delete(seat)
  }

  return {
    watch(seat, stream) {
      if (watched.has(seat)) return
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      watched.set(seat, {
        analyser,
        source,
        buffer: new Uint8Array(analyser.frequencyBinCount),
        speaking: false,
        quiet: 0,
      })
    },
    unwatch: release,
    sample,
    destroy() {
      if (frame !== null) cancelAnimationFrame(frame)
      for (const seat of [...watched.keys()]) release(seat)
      // Only a context this module created is ours to close.
      if (options.context === undefined) void context.close()
    },
  }
}
