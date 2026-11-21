import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OrchestraPanel } from './components/OrchestraPanel'
import { TableOverlay } from './components/TableOverlay'
import { useHandTracker } from './hooks/useHandTracker'
import { useObjectDetector } from './hooks/useObjectDetector'
import { noteForIndex, pitchedInstruments, playInstrument, unlockAudio } from './lib/audio'
import { applyFingertipOffset, defaultCalibration, isInsideTable, loadCalibration, saveCalibration } from './lib/calibration'
import { createContactTracker } from './lib/contactTracker'
import { isInsideObject } from './lib/interaction'
import { objects } from './lib/objects'
import { nextPlayableStep, presets, type Preset } from './lib/presets'
import { assignSound } from './lib/soundAssignment'
import type { Calibration, Instrument, Point, SoundChoice, SoundObject } from './lib/types'
import './App.css'

type CameraState = 'idle' | 'starting' | 'live' | 'blocked'
type Mode = 'play' | 'calibrate'

const AUTO_LOCK_DELAY_MS = 2500
const ALIGN_COUNTDOWN_SECONDS = 3

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contactTrackerRef = useRef(createContactTracker(250))
  const assignedInstrumentsRef = useRef(new Map<string, Instrument>())
  const pendingAssignmentsRef = useRef(new Map<string, Promise<Instrument>>())
  const labelChoicesRef = useRef(new Map<string, SoundChoice>())
  const rawFingertipsRef = useRef<Point[]>([])
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [mode, setMode] = useState<Mode>('play')
  const [activeObjectId, setActiveObjectId] = useState<string | null>(null)
  const [lastHit, setLastHit] = useState<string>('')
  const [detectedSoundObjects, setDetectedSoundObjects] = useState<SoundObject[]>([])
  const [soundChoices, setSoundChoices] = useState<Record<string, SoundChoice>>({})
  const [calibration, setCalibration] = useState<Calibration>(loadCalibration)
  const [calibrationMessage, setCalibrationMessage] = useState('')
  const [alignCountdown, setAlignCountdown] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [lockedObjects, setLockedObjects] = useState<SoundObject[]>([])
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null)
  const [autoLock, setAutoLock] = useState(true)
  const [showLiveVideo, setShowLiveVideo] = useState(false)
  const [activePreset, setActivePreset] = useState<Preset | null>(null)
  const [guideStep, setGuideStep] = useState(0)
  const [demoPlaying, setDemoPlaying] = useState(false)
  const demoTimersRef = useRef<number[]>([])
  const songTriggerRef = useRef<((soundObject: SoundObject) => void) | null>(null)

  const isLive = cameraState === 'live'

  useEffect(() => saveCalibration(calibration), [calibration])

  const unlockScene = useCallback(() => {
    setLocked(false)
    setLockedObjects([])
    setFrozenFrame(null)
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraState('idle')
    unlockScene()
  }, [unlockScene])

  const startCamera = useCallback(async () => {
    unlockAudio()
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('blocked')
      return
    }

    setCameraState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('live')
    } catch {
      setCameraState('blocked')
    }
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const triggerObject = useCallback((soundObject: SoundObject) => {
    playInstrument(soundObject.instrument, soundObject.note)
    setActiveObjectId(soundObject.id)
    setLastHit(`${soundObject.label} · ${soundObject.instrument}${pitchedInstruments.has(soundObject.instrument) ? ` ${soundObject.note}` : ''}`)
    window.setTimeout(() => setActiveObjectId(null), 220)
    songTriggerRef.current?.(soundObject)
  }, [])

  // Detection stops while the scene is locked, which also frees the GPU for hand tracking.
  const objectDetector = useObjectDetector({ enabled: isLive && !locked, videoRef })

  const objectsOnTable = useMemo(
    () => detectedSoundObjects.filter((soundObject) => isInsideTable(soundObject.position, calibration.table)),
    [detectedSoundObjects, calibration.table],
  )

  const soundObjects = useMemo(() => {
    const baseObjects = !isLive ? objects : locked ? lockedObjects : objectsOnTable
    return baseObjects.map((soundObject) => ({ ...soundObject, ...soundChoices[soundObject.id] }))
  }, [isLive, locked, lockedObjects, objectsOnTable, soundChoices])

  /** Objects numbered left to right, like keys on a keyboard. Presets and songs address objects by this order. */
  const orderedObjects = useMemo(
    () => [...soundObjects].sort((first, second) => first.position.x - second.position.x),
    [soundObjects],
  )

  const toTablePoints = useCallback((rawPoints: Point[]) => rawPoints
    .map((point) => applyFingertipOffset(point, calibration.fingertipOffset))
    .filter((point) => isInsideTable(point, calibration.table)), [calibration.fingertipOffset, calibration.table])

  const handleTrackedFingertips = useCallback((rawPoints: Point[]) => {
    rawFingertipsRef.current = rawPoints
    const triggeredObjects = contactTrackerRef.current.update(toTablePoints(rawPoints), soundObjects, performance.now(), calibration.hitPadding)
    triggeredObjects.forEach(triggerObject)
  }, [toTablePoints, soundObjects, calibration.hitPadding, triggerObject])

  const handTracker = useHandTracker({
    enabled: isLive,
    videoRef,
    onFingertips: handleTrackedFingertips,
  })

  useEffect(() => {
    let mounted = true

    setDetectedSoundObjects((currentObjects) => currentObjects.length === 0 && objectDetector.detectedObjects.length === 0 ? currentObjects : objectDetector.detectedObjects.map((detectedObject) => {
      const existingObject = currentObjects.find((soundObject) => soundObject.id === detectedObject.id)
      const labelChoice = labelChoicesRef.current.get(detectedObject.label)
      const instrument = existingObject?.instrument ?? labelChoice?.instrument ?? assignedInstrumentsRef.current.get(detectedObject.label) ?? 'marimba'
      const note = existingObject?.note ?? labelChoice?.note ?? noteForIndex(trackNumber(detectedObject.id))

      return {
        id: detectedObject.id,
        label: detectedObject.label,
        instrument,
        note,
        color: colorForObject(detectedObject.id),
        position: {
          x: detectedObject.bounds.x + detectedObject.bounds.width / 2,
          y: detectedObject.bounds.y + detectedObject.bounds.height / 2,
        },
        radius: Math.max(detectedObject.bounds.width, detectedObject.bounds.height) / 2,
        bounds: detectedObject.bounds,
      }
    }))

    objectDetector.detectedObjects.forEach((detectedObject) => {
      if (assignedInstrumentsRef.current.has(detectedObject.label) || pendingAssignmentsRef.current.has(detectedObject.label)) return

      const assignment = assignSound(detectedObject.label)
      pendingAssignmentsRef.current.set(detectedObject.label, assignment)
      void assignment.then((instrument) => {
        assignedInstrumentsRef.current.set(detectedObject.label, instrument)
        pendingAssignmentsRef.current.delete(detectedObject.label)
        if (!mounted || labelChoicesRef.current.has(detectedObject.label)) return
        setDetectedSoundObjects((currentObjects) => currentObjects.map((soundObject) =>
          soundObject.label === detectedObject.label ? { ...soundObject, instrument } : soundObject,
        ))
      })
    })

    return () => { mounted = false }
  }, [objectDetector.detectedObjects])

  // ---- Scene lock ---------------------------------------------------------

  const lockScene = useCallback(() => {
    if (objectsOnTable.length === 0) return
    const video = videoRef.current
    let frame: string | null = null
    if (video && video.videoWidth > 0) {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      frame = canvas.toDataURL('image/jpeg', 0.85)
    }
    setLockedObjects(objectsOnTable)
    if (activePreset) setSoundChoices((current) => ({ ...current, ...presetChoices(activePreset, objectsOnTable) }))
    setGuideStep(activePreset?.song ? nextPlayableStep(activePreset.song.steps, 0, objectsOnTable.length) : 0)
    setFrozenFrame(frame)
    setLocked(true)
    setLastHit(`Scene locked with ${objectsOnTable.length} object${objectsOnTable.length === 1 ? '' : 's'}. Tap away.`)
  }, [objectsOnTable, activePreset])

  const lockSceneRef = useRef(lockScene)
  useEffect(() => { lockSceneRef.current = lockScene }, [lockScene])

  // Auto-lock once the same set of objects has been seen for a moment.
  const objectSignature = objectsOnTable.map((soundObject) => soundObject.id).join('|')
  useEffect(() => {
    if (!autoLock || !isLive || locked || mode !== 'play' || objectSignature === '') return
    const timer = window.setTimeout(() => lockSceneRef.current(), AUTO_LOCK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [autoLock, isLive, locked, mode, objectSignature])

  // ---- Calibration --------------------------------------------------------

  const updateCalibration = useCallback((patch: Partial<Calibration>) => {
    setCalibration((current) => ({ ...current, ...patch }))
  }, [])

  const alignFingertipTo = useCallback((target: Point) => {
    const rawPoints = rawFingertipsRef.current
    if (rawPoints.length === 0) {
      setCalibrationMessage('No fingertip visible. Rest your index finger on the table and try again.')
      return
    }
    const nearest = rawPoints.reduce((best, point) =>
      Math.hypot(point.x - target.x, point.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y) ? point : best)
    const offset = { x: target.x - nearest.x, y: target.y - nearest.y }
    updateCalibration({ fingertipOffset: offset })
    setCalibrationMessage(`Fingertip offset set to ${formatOffset(offset)}.`)
  }, [updateCalibration])

  useEffect(() => {
    if (alignCountdown === null) return
    if (alignCountdown === 0) {
      alignFingertipTo(calibration.table[0])
      const done = window.setTimeout(() => setAlignCountdown(null), 0)
      return () => window.clearTimeout(done)
    }
    const tick = window.setTimeout(() => setAlignCountdown(alignCountdown - 1), 1000)
    return () => window.clearTimeout(tick)
  }, [alignCountdown, alignFingertipTo, calibration.table])

  const toggleMode = () => {
    setMode((current) => current === 'play' ? 'calibrate' : 'play')
    setCalibrationMessage('')
    setAlignCountdown(null)
  }

  // ---- Sound choices ------------------------------------------------------

  const chooseSound = (soundObject: SoundObject, patch: Partial<SoundChoice>) => {
    const choice: SoundChoice = { instrument: soundObject.instrument, note: soundObject.note, ...patch }
    if (!activePreset) labelChoicesRef.current.set(soundObject.label, choice)
    setSoundChoices((current) => ({ ...current, [soundObject.id]: choice }))
    playInstrument(choice.instrument, choice.note)
  }

  // ---- Presets and song guide ---------------------------------------------

  const stopDemo = useCallback(() => {
    demoTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    demoTimersRef.current = []
    setDemoPlaying(false)
  }, [])

  useEffect(() => stopDemo, [stopDemo])

  const song = activePreset?.song
  const restartSong = useCallback(() => {
    setGuideStep(song ? nextPlayableStep(song.steps, 0, orderedObjects.length) : 0)
  }, [song, orderedObjects.length])

  const selectPreset = (preset: Preset | null) => {
    stopDemo()
    setActivePreset(preset)
    if (preset) setSoundChoices((current) => ({ ...current, ...presetChoices(preset, soundObjects) }))
    setGuideStep(preset?.song ? nextPlayableStep(preset.song.steps, 0, orderedObjects.length) : 0)
  }

  // Advance the guide when the performer hits the expected object (from a fingertip or a click).
  useEffect(() => {
    songTriggerRef.current = (soundObject) => {
      if (!song || demoPlaying) return
      const step = song.steps[guideStep]
      if (step && orderedObjects[step.slot]?.id === soundObject.id) {
        setGuideStep(nextPlayableStep(song.steps, guideStep + 1, orderedObjects.length))
      }
    }
  }, [song, demoPlaying, guideStep, orderedObjects])

  const listenToSong = () => {
    if (!song) return
    stopDemo()
    setDemoPlaying(true)
    const beatMs = 60000 / song.bpm
    let time = 150
    song.steps.forEach((step, index) => {
      const target = orderedObjects[step.slot]
      if (target) {
        demoTimersRef.current.push(window.setTimeout(() => {
          setGuideStep(index)
          triggerObject(target)
        }, time))
      }
      time += step.beats * beatMs
    })
    demoTimersRef.current.push(window.setTimeout(() => {
      demoTimersRef.current = []
      setDemoPlaying(false)
      setGuideStep(nextPlayableStep(song.steps, 0, orderedObjects.length))
    }, time + 400))
  }

  const nextStep = song ? song.steps[guideStep] : undefined
  const nextObjectId = nextStep && !demoPlaying ? orderedObjects[nextStep.slot]?.id : undefined

  // ---- Stage input --------------------------------------------------------

  const handleStagePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    }

    if (mode === 'calibrate') {
      alignFingertipTo(point)
      return
    }

    const hitObject = soundObjects.find((soundObject) => isInsideObject(point, soundObject, calibration.hitPadding))
    if (hitObject) triggerObject(hitObject)
  }

  const cameraLabel = {
    idle: 'Start camera',
    starting: 'Requesting camera…',
    live: 'Stop camera',
    blocked: 'Camera unavailable',
  }[cameraState]

  const rawFingertips = handTracker.fingertips
  const calibratedFingertips = rawFingertips.map((point) => applyFingertipOffset(point, calibration.fingertipOffset))
  const showFrozenFrame = Boolean(locked && frozenFrame && !showLiveVideo)

  return (
    <main>
      <header className="topbar">
        <a className="wordmark" href="#stage">FIELD / SOUND</a>
        <span className={`status status--${cameraState}`}>
          <span className="status-dot" />
          {isLive
            ? `hand ${handTracker.status} · objects ${locked ? 'locked' : objectDetector.status}`
            : cameraState === 'blocked' ? 'camera unavailable' : 'prototype'}
        </span>
      </header>

      <section className="intro">
        <p className="eyebrow">Portable orchestra</p>
        <h1>Make the world<br />play back.</h1>
        <p className="intro-copy">Put objects on a table, give each one a voice, then tap them with your index finger to play.</p>
      </section>

      <section className="instrument" aria-labelledby="instrument-title">
        <div className="instrument-heading">
          <div>
            <p className="eyebrow">01 / Live instrument</p>
            <h2 id="instrument-title">Camera field</h2>
          </div>
          <button className="camera-button" type="button" disabled={cameraState === 'starting' || cameraState === 'blocked'} onClick={isLive ? stopCamera : startCamera}>
            <span className="button-indicator" />
            {cameraLabel}
          </button>
        </div>

        <div className="toolbar" role="toolbar" aria-label="Instrument controls">
          <button type="button" className={`tool-button ${mode === 'calibrate' ? 'tool-button--on' : ''}`} aria-pressed={mode === 'calibrate'} onClick={toggleMode}>
            {mode === 'calibrate' ? 'Done calibrating' : 'Calibrate'}
          </button>
          <button
            type="button"
            className={`tool-button ${locked ? 'tool-button--on' : ''}`}
            disabled={!isLive || (!locked && objectsOnTable.length === 0)}
            onClick={locked ? unlockScene : lockScene}
          >
            {locked ? 'Rescan objects' : 'Lock scene'}
          </button>
          <label className="tool-toggle">
            <input type="checkbox" checked={autoLock} onChange={(event) => setAutoLock(event.target.checked)} />
            Auto-lock when objects are stable
          </label>
          <label className="tool-toggle">
            <input type="checkbox" checked={showLiveVideo} disabled={!locked} onChange={(event) => setShowLiveVideo(event.target.checked)} />
            Live video while locked
          </label>
        </div>

        <div
          id="stage"
          ref={stageRef}
          className={`stage ${mode === 'calibrate' ? 'stage--calibrating' : ''}`}
          onPointerDown={handleStagePointer}
          role="application"
          aria-label="Camera feed with interactive detected object regions"
        >
          <video ref={videoRef} className="camera-feed" playsInline muted />
          {showFrozenFrame && frozenFrame && <img className="frozen-frame" src={frozenFrame} alt="" />}
          <div className="placeholder-feed" aria-hidden={isLive}>
            <div className="placeholder-orb orb-one" />
            <div className="placeholder-orb orb-two" />
            <div className="placeholder-surface" />
            <p>{cameraState === 'blocked' ? 'Allow camera access, then refresh' : 'Camera preview will appear here'}</p>
          </div>
          <div className="stage-scrim" />
          <TableOverlay
            table={calibration.table}
            editable={mode === 'calibrate'}
            stageRef={stageRef}
            onChange={(table) => updateCalibration({ table })}
          />
          <div className="stage-corner stage-corner--top-left">{mode === 'calibrate' ? 'CALIBRATION' : 'LIVE INPUT'}</div>
          <div className="stage-corner stage-corner--top-right">{soundObjects.length} OBJECTS{locked ? ' · LOCKED' : ''}</div>
          <div className="stage-corner stage-corner--bottom-left">
            {mode === 'calibrate' ? 'DRAG CORNERS · CLICK WHERE YOUR FINGERTIP TOUCHES' : 'OVERHEAD CAMERA · BACK-OF-HAND INPUT'}
          </div>
          <div className="stage-corner stage-corner--bottom-right">{showFrozenFrame ? 'FROZEN BACKDROP' : '30 FPS TARGET'}</div>

          {mode === 'calibrate' && rawFingertips.map((fingertip, index) => (
            <span
              key={`raw-${index}`}
              className="fingertip fingertip--raw"
              style={{ left: `${fingertip.x * 100}%`, top: `${fingertip.y * 100}%` }}
              aria-label="Raw tracked fingertip"
            />
          ))}

          {calibratedFingertips.map((fingertip, index) => (
            <span
              key={`tip-${index}`}
              className={`fingertip ${isInsideTable(fingertip, calibration.table) ? '' : 'fingertip--off-table'}`}
              style={{ left: `${fingertip.x * 100}%`, top: `${fingertip.y * 100}%` }}
              aria-label="Tracked index fingertip"
            />
          ))}

          {soundObjects.map((soundObject) => (
            <button
              key={soundObject.id}
              className={`object-zone ${soundObject.bounds ? 'object-zone--box' : ''} ${activeObjectId === soundObject.id ? 'object-zone--active' : ''} ${nextObjectId === soundObject.id ? 'object-zone--next' : ''}`}
              style={soundObject.bounds
                ? { left: `${soundObject.position.x * 100}%`, top: `${soundObject.position.y * 100}%`, width: `${soundObject.bounds.width * 100}%`, height: `${soundObject.bounds.height * 100}%` }
                : { left: `${soundObject.position.x * 100}%`, top: `${soundObject.position.y * 100}%`, width: `${soundObject.radius * 200}%`, height: `${soundObject.radius * 200}%` }}
              onPointerDown={(event) => { event.stopPropagation(); triggerObject(soundObject) }}
              aria-label={`Play ${soundObject.label} ${soundObject.instrument}`}
            >
              <span className="zone-label">{orderedObjects.indexOf(soundObject) + 1} · {soundObject.label}</span>
              <span className="zone-sound">{soundObject.instrument}{pitchedInstruments.has(soundObject.instrument) ? ` · ${soundObject.note}` : ''}</span>
            </button>
          ))}

          {alignCountdown !== null && (
            <div className="countdown" aria-live="assertive">
              <strong>{alignCountdown}</strong>
              <span>Touch corner 1 with your index fingertip</span>
            </div>
          )}
        </div>

        <div className="stage-footer">
          <p>{lastHit || (isLive ? 'Object regions appear as the detector identifies the scene.' : 'Tap a marked object to hear its assigned sound.')}</p>
          <p>{handTracker.errorMessage || objectDetector.errorMessage || (isLive ? `${calibratedFingertips.length} index fingertips · ${soundObjects.length} objects` : 'Pointer input stands in for hand tracking.')}</p>
        </div>

        {mode === 'calibrate' && (
          <div className="calibration-panel">
            <div className="calibration-group">
              <p className="eyebrow">Tabletop area</p>
              <p className="calibration-help">Drag the four numbered corners onto the corners of your playing surface. Objects and fingertips outside it are ignored.</p>
              <button type="button" className="tool-button" onClick={() => updateCalibration({ table: defaultCalibration.table })}>Reset area</button>
            </div>

            <div className="calibration-group">
              <p className="eyebrow">Fingertip alignment</p>
              <p className="calibration-help">
                The hollow ring is the raw tracked point; the solid dot is what triggers sounds. Rest a fingertip on the table and click where it really touches, or use the timer and touch corner 1.
              </p>
              <div className="calibration-actions">
                <button type="button" className="tool-button" disabled={!isLive || alignCountdown !== null} onClick={() => { setCalibrationMessage(''); setAlignCountdown(ALIGN_COUNTDOWN_SECONDS) }}>
                  Align on corner 1 ({ALIGN_COUNTDOWN_SECONDS}s)
                </button>
                <button type="button" className="tool-button" onClick={() => updateCalibration({ fingertipOffset: { x: 0, y: 0 } })}>Reset offset</button>
              </div>
              <Slider label="Offset X" value={calibration.fingertipOffset.x} min={-0.15} max={0.15} step={0.002}
                onChange={(x) => updateCalibration({ fingertipOffset: { ...calibration.fingertipOffset, x } })} />
              <Slider label="Offset Y" value={calibration.fingertipOffset.y} min={-0.15} max={0.15} step={0.002}
                onChange={(y) => updateCalibration({ fingertipOffset: { ...calibration.fingertipOffset, y } })} />
              <Slider label="Touch margin" value={calibration.hitPadding} min={0} max={0.08} step={0.002}
                onChange={(hitPadding) => updateCalibration({ hitPadding })} />
              {calibrationMessage && <p className="calibration-message" role="status">{calibrationMessage}</p>}
            </div>
          </div>
        )}

        {mode === 'play' && (
          <OrchestraPanel
            objects={orderedObjects}
            presets={presets}
            activePreset={activePreset}
            isLive={isLive}
            locked={locked}
            guideStep={guideStep}
            demoPlaying={demoPlaying}
            onSelectPreset={selectPreset}
            onChooseSound={chooseSound}
            onPreview={triggerObject}
            onListen={listenToSong}
            onStopListening={stopDemo}
            onRestart={restartSong}
          />
        )}
      </section>

      <section className="signal-flow" aria-labelledby="signal-title">
        <div>
          <p className="eyebrow">02 / Signal flow</p>
          <h2 id="signal-title">From light to sound</h2>
        </div>
        <ol className="flow-list">
          <li><span>01</span><strong>Calibrate</strong><p>Mark the tabletop and align the fingertip point.</p></li>
          <li><span>02</span><strong>Lock</strong><p>Detect objects, then freeze the scene once it is stable.</p></li>
          <li><span>03</span><strong>Orchestrate</strong><p>Pick a preset or choose each object&rsquo;s sound.</p></li>
          <li><span>04</span><strong>Perform</strong><p>Tap objects with your index finger; follow the song guide.</p></li>
        </ol>
      </section>

      <footer>Prototype · Webcam permissions required for the live feed · Calibration is saved in this browser</footer>
    </main>
  )
}

export default App

type SliderProps = { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{(value * 100).toFixed(1)}%</output>
    </label>
  )
}

/** Hands a preset's sounds to objects from left to right. Objects beyond the preset keep their sounds. */
function presetChoices(preset: Preset, soundObjects: SoundObject[]): Record<string, SoundChoice> {
  const ordered = [...soundObjects].sort((first, second) => first.position.x - second.position.x)
  return Object.fromEntries(ordered.slice(0, preset.slots.length).map((soundObject, index) => {
    const { instrument, note } = preset.slots[index]
    return [soundObject.id, { instrument, note }]
  }))
}

function formatOffset(offset: Point) {
  return `${(offset.x * 100).toFixed(1)}% × ${(offset.y * 100).toFixed(1)}%`
}

function trackNumber(id: string) {
  const match = /(\d+)$/.exec(id)
  return match ? Number(match[1]) : 0
}

function colorForObject(id: string): SoundObject['color'] {
  const colors: SoundObject['color'][] = ['orange', 'green', 'blue']
  const colorIndex = [...id].reduce((total, character) => total + character.charCodeAt(0), 0) % colors.length
  return colors[colorIndex]
}
