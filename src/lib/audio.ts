import type { Instrument, Note } from './types'

export const instruments: Instrument[] = ['marimba', 'bass', 'chime', 'pluck', 'drum', 'shaker']

export const notes: Note[] = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5']

/** Default notes for newly detected objects: a pentatonic scale, so any combination sounds consonant. */
const pentatonic: Note[] = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5']

/** Pitched instruments use the note; percussion ignores it. */
export const pitchedInstruments = new Set<Instrument>(['marimba', 'bass', 'chime', 'pluck'])

const frequencies: Record<Note, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
}

let audioContext: AudioContext | undefined
let noiseBuffer: AudioBuffer | undefined

function context() {
  audioContext ??= new AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

/** Call from a user gesture (e.g. Start camera) so the first touch is not swallowed by autoplay rules. */
export function unlockAudio() {
  context()
}

export function noteForIndex(index: number): Note {
  return pentatonic[((index % pentatonic.length) + pentatonic.length) % pentatonic.length]
}

export function playInstrument(instrument: Instrument, note: Note = 'C5') {
  const ctx = context()
  const frequency = frequencies[note]
  const now = ctx.currentTime
  const output = ctx.createGain()
  output.gain.value = 0.9
  output.connect(ctx.destination)

  switch (instrument) {
    case 'marimba':
      voice(ctx, output, now, { type: 'sine', frequency, peak: 0.34, decay: 0.55 })
      voice(ctx, output, now, { type: 'sine', frequency: frequency * 4, peak: 0.06, decay: 0.12 })
      break
    case 'bass':
      voice(ctx, output, now, { type: 'triangle', frequency: frequency / 4, peak: 0.5, decay: 0.8, glideTo: 0.97 })
      voice(ctx, output, now, { type: 'sine', frequency: frequency / 2, peak: 0.12, decay: 0.4 })
      break
    case 'chime':
      voice(ctx, output, now, { type: 'sine', frequency: frequency * 2, peak: 0.2, decay: 1.8 })
      voice(ctx, output, now, { type: 'sine', frequency: frequency * 2 * 2.76, peak: 0.05, decay: 0.9 })
      break
    case 'pluck': {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(frequency * 8, now)
      filter.frequency.exponentialRampToValueAtTime(frequency * 1.2, now + 0.3)
      filter.connect(output)
      voice(ctx, filter, now, { type: 'sawtooth', frequency, peak: 0.22, decay: 0.45 })
      break
    }
    case 'drum':
      voice(ctx, output, now, { type: 'sine', frequency: 160, peak: 0.8, decay: 0.38, glideTo: 0.3 })
      noise(ctx, output, now, { filter: 'lowpass', cutoff: 1200, peak: 0.15, decay: 0.05 })
      break
    case 'shaker':
      noise(ctx, output, now, { filter: 'highpass', cutoff: 6000, peak: 0.3, decay: 0.12 })
      break
  }
}

type VoiceOptions = { type: OscillatorType; frequency: number; peak: number; decay: number; glideTo?: number }

function voice(ctx: AudioContext, destination: AudioNode, now: number, options: VoiceOptions) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = options.type
  oscillator.frequency.setValueAtTime(options.frequency, now)
  if (options.glideTo) oscillator.frequency.exponentialRampToValueAtTime(options.frequency * options.glideTo, now + options.decay)
  envelope(gain, now, options.peak, options.decay)
  oscillator.connect(gain).connect(destination)
  oscillator.start(now)
  oscillator.stop(now + options.decay + 0.05)
}

type NoiseOptions = { filter: BiquadFilterType; cutoff: number; peak: number; decay: number }

function noise(ctx: AudioContext, destination: AudioNode, now: number, options: NoiseOptions) {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1
  }
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = noiseBuffer
  filter.type = options.filter
  filter.frequency.value = options.cutoff
  envelope(gain, now, options.peak, options.decay)
  source.connect(filter).connect(gain).connect(destination)
  source.start(now)
  source.stop(now + options.decay + 0.05)
}

function envelope(gain: GainNode, now: number, peak: number, decay: number) {
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
}
