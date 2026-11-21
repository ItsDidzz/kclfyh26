import { isInsideObject } from './interaction'
import type { Point, SoundObject } from './types'

export function createContactTracker(cooldownMs: number) {
  const activeObjectIds = new Set<string>()
  const lastTriggerTimes = new Map<string, number>()

  return {
    update(fingertips: Point[], soundObjects: SoundObject[], now: number, padding?: number) {
      if (fingertips.length === 0) {
        activeObjectIds.clear()
        return []
      }

      const touchedObjects = soundObjects.filter((soundObject) =>
        fingertips.some((fingertip) => isInsideObject(fingertip, soundObject, padding)),
      )
      const touchedIds = new Set(touchedObjects.map((soundObject) => soundObject.id))
      const newlyTouchedObjects = touchedObjects.filter((soundObject) => !activeObjectIds.has(soundObject.id))

      activeObjectIds.clear()
      touchedIds.forEach((id) => activeObjectIds.add(id))

      return newlyTouchedObjects.filter((soundObject) => {
        const lastTriggerTime = lastTriggerTimes.get(soundObject.id) ?? -Infinity
        if (now - lastTriggerTime < cooldownMs) return false

        lastTriggerTimes.set(soundObject.id, now)
        return true
      })
    },
  }
}
