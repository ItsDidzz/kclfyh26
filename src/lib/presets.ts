import type { SoundChoice } from './types'

/** One step of a song: which slot (object, counted left to right) to tap and for how many beats. */
export type SongStep = { slot: number; beats: number }

export type Preset = {
  id: string
  name: string
  description: string
  /** Sounds handed to the objects from left to right. */
  slots: (SoundChoice & { role: string })[]
  song?: { title: string; bpm: number; steps: SongStep[] }
}

const steps = (pattern: [slot: number, beats: number][]): SongStep[] => pattern.map(([slot, beats]) => ({ slot, beats }))

// Ode to Joy (Beethoven, public domain). Five notes, C to G, rising left to right.
const odePhraseA: [number, number][] = [[2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 1], [1, 1], [2, 1]]

// Twinkle Twinkle Little Star (traditional). Six notes, C to A.
const twinkleA: [number, number][] = [[0, 1], [0, 1], [4, 1], [4, 1], [5, 1], [5, 1], [4, 2], [3, 1], [3, 1], [2, 1], [2, 1], [1, 1], [1, 1], [0, 2]]
const twinkleB: [number, number][] = [[4, 1], [4, 1], [3, 1], [3, 1], [2, 1], [2, 1], [1, 2]]

export const presets: Preset[] = [
  {
    id: 'ode',
    name: 'Ode to Joy',
    description: 'Five warm marimba notes plus a bass for accents. The easiest tune to perform: it mostly steps between neighbouring objects.',
    slots: [
      { role: 'Do', instrument: 'marimba', note: 'C4' },
      { role: 'Re', instrument: 'marimba', note: 'D4' },
      { role: 'Mi', instrument: 'marimba', note: 'E4' },
      { role: 'Fa', instrument: 'marimba', note: 'F4' },
      { role: 'Sol', instrument: 'marimba', note: 'G4' },
      { role: 'Bass', instrument: 'bass', note: 'C5' },
    ],
    song: {
      title: 'Ode to Joy',
      bpm: 120,
      steps: steps([...odePhraseA, [2, 1.5], [1, 0.5], [1, 2], ...odePhraseA, [1, 1.5], [0, 0.5], [0, 2]]),
    },
  },
  {
    id: 'twinkle',
    name: 'Twinkle',
    description: 'Six bright chimes from C to A. A well-known melody that uses big jumps, so the audience can hear the objects clearly.',
    slots: [
      { role: 'Do', instrument: 'chime', note: 'C4' },
      { role: 'Re', instrument: 'chime', note: 'D4' },
      { role: 'Mi', instrument: 'chime', note: 'E4' },
      { role: 'Fa', instrument: 'chime', note: 'F4' },
      { role: 'Sol', instrument: 'chime', note: 'G4' },
      { role: 'La', instrument: 'chime', note: 'A4' },
    ],
    song: {
      title: 'Twinkle Twinkle Little Star',
      bpm: 100,
      steps: steps([...twinkleA, ...twinkleB, ...twinkleB, ...twinkleA]),
    },
  },
  {
    id: 'jam',
    name: 'Pentatonic jam',
    description: 'A small band: drum, shaker, bass and a pentatonic melody. Every combination sounds good, so improvise freely or follow the groove.',
    slots: [
      { role: 'Kick', instrument: 'drum', note: 'C4' },
      { role: 'Shaker', instrument: 'shaker', note: 'C4' },
      { role: 'Bass', instrument: 'bass', note: 'C5' },
      { role: 'Melody', instrument: 'marimba', note: 'E4' },
      { role: 'Melody', instrument: 'marimba', note: 'G4' },
      { role: 'Sparkle', instrument: 'chime', note: 'A4' },
      { role: 'Lead', instrument: 'pluck', note: 'C5' },
      { role: 'Lead', instrument: 'pluck', note: 'D5' },
    ],
    song: {
      title: 'Groove',
      bpm: 104,
      steps: steps([
        [0, 1], [1, 0.5], [1, 0.5], [2, 1], [1, 1],
        [0, 1], [3, 0.5], [4, 0.5], [2, 1], [1, 1],
        [0, 1], [1, 0.5], [1, 0.5], [2, 1], [1, 1],
        [0, 1], [4, 0.5], [3, 0.5], [2, 1], [3, 1],
      ]),
    },
  },
]

/** Objects a preset needs for its song (extra slots are optional bonus sounds). */
export function usedSlotCount(preset: Preset) {
  if (!preset.song) return preset.slots.length
  return Math.max(...preset.song.steps.map((step) => step.slot)) + 1
}

/** First step at or after `from` whose object exists; returns steps.length when the song is over. */
export function nextPlayableStep(steps: SongStep[], from: number, objectCount: number) {
  let index = from
  while (index < steps.length && steps[index].slot >= objectCount) index++
  return index
}
