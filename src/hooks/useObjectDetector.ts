import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'
import { useEffect, useState, type RefObject } from 'react'
import type { Bounds, DetectedObject } from '../lib/types'

type DetectorStatus = 'idle' | 'loading' | 'detecting' | 'error'

type ObjectDetectorOptions = {
  enabled: boolean
  videoRef: RefObject<HTMLVideoElement | null>
}

type TrackedObject = DetectedObject & { lastSeenAt: number }

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite'
const DETECTION_INTERVAL_MS = 180
const TRACK_EXPIRY_MS = 700
const NO_OBJECTS: DetectedObject[] = []

export function useObjectDetector({ enabled, videoRef }: ObjectDetectorOptions) {
  const [status, setStatus] = useState<DetectorStatus>('idle')
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let animationFrameId: number | undefined
    let objectDetector: ObjectDetector | undefined
    let lastDetectionAt = -Infinity
    let nextTrackId = 0
    let tracks: TrackedObject[] = []

    const detectObjects = async () => {
      setStatus('loading')
      setErrorMessage(null)

      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
        objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
          runningMode: 'VIDEO',
          maxResults: 6,
          scoreThreshold: 0.45,
          categoryDenylist: ['person'],
        })

        if (cancelled) {
          objectDetector.close()
          return
        }

        const updateDetections = () => {
          const video = videoRef.current
          if (cancelled || !video || !objectDetector) return

          const now = performance.now()
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastDetectionAt >= DETECTION_INTERVAL_MS) {
            lastDetectionAt = now
            const result = objectDetector.detectForVideo(video, now)
            const detections = result.detections.flatMap((detection) => {
              const category = detection.categories[0]
              const boundingBox = detection.boundingBox
              if (!category || category.categoryName === 'person' || !boundingBox || video.videoWidth === 0 || video.videoHeight === 0) return []

              const bounds = displayBounds(boundingBox, video.videoWidth, video.videoHeight)
              const existingTrack = tracks
                .filter((track) => track.label === category.categoryName)
                .sort((first, second) => overlap(second.bounds, bounds) - overlap(first.bounds, bounds))[0]
              const track = existingTrack && overlap(existingTrack.bounds, bounds) > 0.25
                ? existingTrack
                : { id: `detected-${nextTrackId++}`, label: category.categoryName, confidence: category.score, bounds, lastSeenAt: now }

              track.bounds = bounds
              track.confidence = category.score
              track.lastSeenAt = now
              return track
            })

            tracks = tracks.filter((track) => track.lastSeenAt >= now - TRACK_EXPIRY_MS)
            detections.forEach((detection) => {
              if (!tracks.some((track) => track.id === detection.id)) tracks.push(detection)
            })
            setDetectedObjects(detections)
          }

          animationFrameId = requestAnimationFrame(updateDetections)
        }

        setStatus('detecting')
        updateDetections()
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'Unable to start object detection.')
      }
    }

    void detectObjects()

    return () => {
      cancelled = true
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      objectDetector?.close()
      setDetectedObjects([])
    }
  }, [enabled, videoRef])

  return {
    status: enabled ? status : 'idle',
    detectedObjects: enabled ? detectedObjects : NO_OBJECTS,
    errorMessage: enabled ? errorMessage : null,
  }
}

function displayBounds(boundingBox: { originX: number; originY: number; width: number; height: number }, videoWidth: number, videoHeight: number): Bounds {
  const width = boundingBox.width / videoWidth
  return {
    x: boundingBox.originX / videoWidth,
    y: boundingBox.originY / videoHeight,
    width,
    height: boundingBox.height / videoHeight,
  }
}

function overlap(first: Bounds, second: Bounds) {
  const intersectionWidth = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x))
  const intersectionHeight = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
  const intersection = intersectionWidth * intersectionHeight
  const combinedArea = first.width * first.height + second.width * second.height - intersection
  return combinedArea === 0 ? 0 : intersection / combinedArea
}
