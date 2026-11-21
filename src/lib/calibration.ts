import type { Calibration, Point, TableQuad } from './types'

const STORAGE_KEY = 'field-sound:calibration:v1'

export const defaultTable: TableQuad = [
  { x: 0.04, y: 0.05 },
  { x: 0.96, y: 0.05 },
  { x: 0.96, y: 0.95 },
  { x: 0.04, y: 0.95 },
]

export const defaultCalibration: Calibration = {
  table: defaultTable,
  fingertipOffset: { x: 0, y: 0 },
  hitPadding: 0.015,
}

export function loadCalibration(): Calibration {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Calibration> | null
    if (!stored) return defaultCalibration
    const table = Array.isArray(stored.table) && stored.table.length === 4 && stored.table.every(isPoint)
      ? stored.table as TableQuad
      : defaultTable
    return {
      table,
      fingertipOffset: isPoint(stored.fingertipOffset) ? stored.fingertipOffset : defaultCalibration.fingertipOffset,
      hitPadding: typeof stored.hitPadding === 'number' ? stored.hitPadding : defaultCalibration.hitPadding,
    }
  } catch {
    return defaultCalibration
  }
}

export function saveCalibration(calibration: Calibration) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration))
  } catch {
    // Storage can be unavailable (private mode); calibration still works for this session.
  }
}

export function applyFingertipOffset(point: Point, offset: Point): Point {
  return { x: point.x + offset.x, y: point.y + offset.y }
}

/** Ray-casting point-in-polygon test, so the tabletop can be any convex or concave quad. */
export function isInsideTable(point: Point, table: TableQuad) {
  let inside = false
  for (let current = 0, previous = table.length - 1; current < table.length; previous = current++) {
    const a = table[current]
    const b = table[previous]
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function isPoint(value: unknown): value is Point {
  return typeof value === 'object' && value !== null
    && typeof (value as Point).x === 'number' && typeof (value as Point).y === 'number'
}
