import type { SoundName } from './sounds.js'

/**
 * Every sound is synthesised, so the app ships no audio files at all - no binary
 * blobs in the repository, nothing added to the image, no licences to track, and
 * each sound is a few numbers that can be tuned by editing them.
 *
 * Nothing here is unit-testable: jsdom has no Web Audio. The decision of WHICH
 * sound to play lives in sounds.ts and is tested there; this file only turns a
 * name into noise, and is checked in a real browser.
 */
export type AudioEngine = {
  /** Safe to call before the context is unlocked; it simply does nothing. */
  play: (name: SoundName) => void
  /**
   * Browsers create an AudioContext suspended and keep it that way until a user
   * gesture. Call this from a real click or keypress or everything stays silent.
   */
  unlock: () => void
  close: () => void
}

type Recipe = (context: AudioContext, out: GainNode, at: number) => void

/** A pitched blip, optionally sweeping to a second frequency. */
function tone(
  context: AudioContext,
  out: GainNode,
  at: number,
  options: {
    from: number
    to?: number
    duration: number
    type?: OscillatorType
    gain?: number
  },
): void {
  const osc = context.createOscillator()
  const level = context.createGain()
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(options.from, at)
  if (options.to !== undefined) {
    // Exponential, not linear: pitch is perceived logarithmically, so a linear
    // ramp sounds like it slows down as it falls.
    osc.frequency.exponentialRampToValueAtTime(Math.max(options.to, 1), at + options.duration)
  }

  const peak = options.gain ?? 0.25
  /* A 8ms attack rather than an instant one. Starting a gain at full level
     produces a click of its own - the discontinuity is itself a waveform. */
  level.gain.setValueAtTime(0.0001, at)
  level.gain.exponentialRampToValueAtTime(peak, at + 0.008)
  level.gain.exponentialRampToValueAtTime(0.0001, at + options.duration)

  osc.connect(level).connect(out)
  osc.start(at)
  osc.stop(at + options.duration + 0.02)
}

/** Filtered white noise: the papery part of a card being dealt or shuffled. */
function noise(
  context: AudioContext,
  out: GainNode,
  at: number,
  options: { duration: number; cutoff: number; gain?: number },
): void {
  const frames = Math.max(1, Math.floor(context.sampleRate * options.duration))
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) {
    // Fades across the buffer so the noise tails off instead of stopping dead.
    channel[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(options.cutoff, at)
  filter.Q.setValueAtTime(0.8, at)

  const level = context.createGain()
  level.gain.setValueAtTime(options.gain ?? 0.2, at)

  source.connect(filter).connect(level).connect(out)
  source.start(at)
}

/*
 * The kit. Loudness is deliberately uneven: a card landing happens dozens of
 * times a round and has to stay in the background, while a Wild Draw Four happens
 * rarely and is supposed to land on someone.
 */
const RECIPES: Record<SoundName, Recipe> = {
  play: (context, out, at) => {
    noise(context, out, at, { duration: 0.06, cutoff: 2600, gain: 0.13 })
    tone(context, out, at, { from: 320, to: 190, duration: 0.07, type: 'triangle', gain: 0.07 })
  },

  draw: (context, out, at) => {
    noise(context, out, at, { duration: 0.14, cutoff: 1500, gain: 0.16 })
    tone(context, out, at + 0.02, { from: 200, to: 150, duration: 0.1, type: 'sine', gain: 0.05 })
  },

  skip: (context, out, at) => {
    tone(context, out, at, { from: 900, to: 420, duration: 0.11, type: 'square', gain: 0.09 })
  },

  reverse: (context, out, at) => {
    // Down then up: the direction of play turning round, made audible.
    tone(context, out, at, { from: 620, to: 330, duration: 0.1, type: 'triangle', gain: 0.1 })
    tone(context, out, at + 0.09, {
      from: 330,
      to: 660,
      duration: 0.12,
      type: 'triangle',
      gain: 0.1,
    })
  },

  draw2: (context, out, at) => {
    tone(context, out, at, { from: 260, to: 130, duration: 0.16, type: 'sawtooth', gain: 0.12 })
    noise(context, out, at, { duration: 0.12, cutoff: 900, gain: 0.14 })
  },

  wild: (context, out, at) => {
    // Four rising notes, one per colour.
    for (const [index, freq] of [523, 659, 784, 1047].entries()) {
      tone(context, out, at + index * 0.055, {
        from: freq,
        duration: 0.16,
        type: 'sine',
        gain: 0.09,
      })
    }
  },

  wild4: (context, out, at) => {
    /* The one that is meant to land. A low sweep for weight, a detuned pair for
       menace, and a noise crack on top for impact. */
    tone(context, out, at, { from: 320, to: 55, duration: 0.55, type: 'sawtooth', gain: 0.2 })
    tone(context, out, at, { from: 316, to: 54, duration: 0.55, type: 'square', gain: 0.1 })
    noise(context, out, at, { duration: 0.3, cutoff: 600, gain: 0.22 })
    for (const [index, freq] of [196, 233, 294].entries()) {
      tone(context, out, at + 0.28 + index * 0.05, {
        from: freq,
        duration: 0.3,
        type: 'triangle',
        gain: 0.11,
      })
    }
  },

  uno: (context, out, at) => {
    for (const [index, freq] of [880, 1175].entries()) {
      tone(context, out, at + index * 0.1, { from: freq, duration: 0.22, type: 'sine', gain: 0.14 })
    }
  },

  yourTurn: (context, out, at) => {
    // Two soft notes, quiet on purpose: this fires when attention is elsewhere,
    // so it should reach across a room without being an alarm.
    tone(context, out, at, { from: 587, duration: 0.13, type: 'sine', gain: 0.1 })
    tone(context, out, at + 0.12, { from: 784, duration: 0.18, type: 'sine', gain: 0.1 })
  },

  swap: (context, out, at) => {
    /* Two sweeps crossing, one rising and one falling, plus the papery noise of
       cards actually changing hands. Deliberately built from the same material as
       `reverse`, which is the other cue for the table being turned around. */
    tone(context, out, at, { from: 380, to: 760, duration: 0.16, type: 'triangle', gain: 0.09 })
    tone(context, out, at, { from: 760, to: 380, duration: 0.16, type: 'triangle', gain: 0.09 })
    noise(context, out, at + 0.05, { duration: 0.12, cutoff: 2100, gain: 0.12 })
  },

  timedOut: (context, out, at) => {
    // Falling and dry: the sound of a turn being taken away, not a card played.
    tone(context, out, at, { from: 300, to: 120, duration: 0.18, type: 'square', gain: 0.09 })
    noise(context, out, at + 0.02, { duration: 0.1, cutoff: 700, gain: 0.1 })
  },

  /* Four endings, not two. Winning and watching someone else win are different
     events to the person listening, and one shared cue for both congratulates the
     loser. The pairs are deliberately built from the same material - the same
     intervals, moving the other way - so the table still sounds coherent. */

  roundWon: (context, out, at) => {
    // Rising major triad: short, bright, over before it outstays its welcome.
    for (const [index, freq] of [523, 659, 784].entries()) {
      tone(context, out, at + index * 0.08, {
        from: freq,
        duration: 0.22,
        type: 'sine',
        gain: 0.12,
      })
    }
  },

  roundOver: (context, out, at) => {
    // The same triad falling, quieter and lower: an ending, not an achievement.
    for (const [index, freq] of [392, 330, 262].entries()) {
      tone(context, out, at + index * 0.085, {
        from: freq,
        duration: 0.24,
        type: 'sine',
        gain: 0.075,
      })
    }
  },

  matchWon: (context, out, at) => {
    /* The biggest thing in the kit, because it happens once per match. A rising
       run, a held chord underneath it, and a last octave on top. */
    for (const [index, freq] of [523, 659, 784, 1047].entries()) {
      tone(context, out, at + index * 0.11, {
        from: freq,
        duration: 0.3,
        type: 'triangle',
        gain: 0.13,
      })
    }
    for (const freq of [262, 330, 392]) {
      tone(context, out, at + 0.44, { from: freq, duration: 0.9, type: 'sine', gain: 0.07 })
    }
    tone(context, out, at + 0.52, { from: 1568, duration: 0.7, type: 'triangle', gain: 0.11 })
  },

  matchOver: (context, out, at) => {
    // Someone else took it. A settled cadence - final, but not a celebration.
    for (const [index, freq] of [392, 349, 294].entries()) {
      tone(context, out, at + index * 0.13, {
        from: freq,
        duration: 0.34,
        type: 'sine',
        gain: 0.085,
      })
    }
    tone(context, out, at + 0.39, { from: 196, duration: 0.7, type: 'sine', gain: 0.075 })
  },
}

export function createAudioEngine(): AudioEngine | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null

  let context: AudioContext | null = null
  let master: GainNode | null = null

  const ensure = (): { context: AudioContext; master: GainNode } | null => {
    try {
      if (context === null) {
        context = new AudioContext()
        master = context.createGain()
        // One master trim, so every recipe can be written at a comfortable level
        // and the whole kit moves together.
        master.gain.value = 0.9
        master.connect(context.destination)
      }
      return master === null ? null : { context, master }
    } catch {
      // A browser that refuses to construct a context is a browser that plays no
      // sound. It is not a browser that fails to play the game.
      return null
    }
  }

  return {
    unlock: () => {
      const ready = ensure()
      if (ready === null) return
      if (ready.context.state === 'suspended') void ready.context.resume()
    },

    play: (name) => {
      const ready = ensure()
      if (ready === null) return

      const emit = () => {
        try {
          // Read currentTime here, not before the await: on the resumed path the
          // clock has moved on, and scheduling in the past drops the sound.
          RECIPES[name](ready.context, ready.master, ready.context.currentTime)
        } catch {
          /* A sound failing is never a reason for a turn to fail. */
        }
      }

      /* The very first cue of a session races the unlock. Measuring in a real
         browser showed the context is not even constructed until then - if that
         first cue happens to be the gesture that unlocks it, resume() is still in
         flight and the sound would simply vanish. Resuming and then emitting
         costs a few milliseconds once, and never loses it. */
      if (ready.context.state === 'suspended') {
        void ready.context.resume().then(emit, () => undefined)
        return
      }
      if (ready.context.state !== 'running') return
      emit()
    },

    close: () => {
      const closing = context
      context = null
      master = null
      if (closing !== null) void closing.close().catch(() => undefined)
    },
  }
}
