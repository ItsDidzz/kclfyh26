import { instruments } from './audio'
import type { Instrument } from './types'

const fallbackInstruments: Record<string, Instrument> = {
  apple: 'marimba',
  banana: 'marimba',
  orange: 'marimba',
  book: 'bass',
  bottle: 'chime',
  bowl: 'drum',
  'cell phone': 'pluck',
  chair: 'bass',
  cup: 'chime',
  fork: 'shaker',
  keyboard: 'pluck',
  knife: 'shaker',
  laptop: 'bass',
  mouse: 'pluck',
  plant: 'chime',
  'potted plant': 'chime',
  remote: 'pluck',
  scissors: 'shaker',
  spoon: 'shaker',
  vase: 'chime',
  'wine glass': 'chime',
}

type SoundAssignmentResponse = { instrument?: string }

export async function assignSound(label: string): Promise<Instrument> {
  const fallbackInstrument = fallbackInstruments[label.toLowerCase()] ?? 'marimba'
  const endpoint = import.meta.env.VITE_SOUND_ASSIGNMENT_ENDPOINT

  if (!endpoint) return fallbackInstrument

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, availableInstruments: instruments }),
    })
    const assignment = await response.json() as SoundAssignmentResponse

    return instruments.includes(assignment.instrument as Instrument)
      ? assignment.instrument as Instrument
      : fallbackInstrument
  } catch {
    return fallbackInstrument
  }
}
