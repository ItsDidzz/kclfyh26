export type Point = { x: number; y: number }

export type Bounds = { x: number; y: number; width: number; height: number }

export type Instrument = 'marimba' | 'bass' | 'chime' | 'pluck' | 'drum' | 'shaker'

export type Note = 'C4' | 'D4' | 'E4' | 'F4' | 'G4' | 'A4' | 'B4' | 'C5' | 'D5' | 'E5' | 'F5' | 'G5' | 'A5'

export type SoundObject = {
  id: string
  label: string
  instrument: Instrument
  note: Note
  color: 'orange' | 'green' | 'blue'
  position: Point
  radius: number
  bounds?: Bounds
}

export type SoundChoice = { instrument: Instrument; note: Note }

export type DetectedObject = {
  id: string
  label: string
  confidence: number
  bounds: Bounds
}

/** Four tabletop corners in normalised camera space: top-left, top-right, bottom-right, bottom-left. */
export type TableQuad = [Point, Point, Point, Point]

export type Calibration = {
  table: TableQuad
  /** Added to the tracked index fingertip so the marker sits on the real contact point. */
  fingertipOffset: Point
  /** Extra margin around each object's box that still counts as a touch. */
  hitPadding: number
}
