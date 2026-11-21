import type { Point, SoundObject } from './types'

export function isInsideObject(point: Point, soundObject: SoundObject, padding = 0.015) {
  if (soundObject.bounds) {
    const { x, y, width, height } = soundObject.bounds
    return point.x >= x - padding && point.x <= x + width + padding && point.y >= y - padding && point.y <= y + height + padding
  }

  const horizontalDistance = point.x - soundObject.position.x
  const verticalDistance = point.y - soundObject.position.y
  return Math.hypot(horizontalDistance, verticalDistance) <= soundObject.radius + padding
}
