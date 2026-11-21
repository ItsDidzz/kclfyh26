import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Point } from '../lib/types'

type TrackingStatus = 'idle' | 'loading' | 'tracking' | 'error'

type HandTrackerOptions = {
  enabled: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  onFingertips: (points: Point[]) => void
}

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const NO_POINTS: Point[] = []
const MODEL_PATH = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export function useHandTracker({ enabled, videoRef, onFingertips }: HandTrackerOptions) {
  const [status, setStatus] = useState<TrackingStatus>('idle')
  const [fingertips, setFingertips] = useState<Point[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const onFingertipsRef = useRef(onFingertips)

  useEffect(() => {
    onFingertipsRef.current = onFingertips
  }, [onFingertips])

  useEffect(() => {
    if (!enabled) {
      onFingertipsRef.current([])
      return
    }

    let cancelled = false
    let animationFrameId: number | undefined
    let handLandmarker: HandLandmarker | undefined
    let lastVideoTime = -1

    const startTracking = async () => {
      setStatus('loading')
      setErrorMessage(null)

      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        })

        if (cancelled) {
          handLandmarker.close()
          return
        }

        const detect = () => {
          const video = videoRef.current
          if (cancelled || !video || !handLandmarker) return

          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            const result = handLandmarker.detectForVideo(video, performance.now())
            const displayPoints = result.landmarks
              .map((handLandmarks) => handLandmarks[8])
              .filter((indexFingertip): indexFingertip is NonNullable<typeof indexFingertip> => Boolean(indexFingertip))
              .map((indexFingertip) => ({ x: indexFingertip.x, y: indexFingertip.y }))

            setFingertips(displayPoints)
            onFingertipsRef.current(displayPoints)
          }

          animationFrameId = requestAnimationFrame(detect)
        }

        setStatus('tracking')
        detect()
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(error instanceof Error ? error.message : 'Unable to start hand tracking.')
      }
    }

    void startTracking()

    return () => {
      cancelled = true
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      handLandmarker?.close()
      onFingertipsRef.current([])
    }
  }, [enabled, videoRef])

  return {
    status: enabled ? status : 'idle',
    fingertips: enabled ? fingertips : NO_POINTS,
    errorMessage: enabled ? errorMessage : null,
  }
}
