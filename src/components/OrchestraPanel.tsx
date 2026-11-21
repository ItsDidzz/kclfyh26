import { instruments, notes, pitchedInstruments } from '../lib/audio'
import { usedSlotCount, type Preset } from '../lib/presets'
import type { Instrument, Note, SoundChoice, SoundObject } from '../lib/types'

type OrchestraPanelProps = {
  /** Objects ordered left to right; index = slot. */
  objects: SoundObject[]
  presets: Preset[]
  activePreset: Preset | null
  isLive: boolean
  locked: boolean
  guideStep: number
  demoPlaying: boolean
  onSelectPreset: (preset: Preset | null) => void
  onChooseSound: (soundObject: SoundObject, patch: Partial<SoundChoice>) => void
  onPreview: (soundObject: SoundObject) => void
  onListen: () => void
  onStopListening: () => void
  onRestart: () => void
}

export function OrchestraPanel({
  objects, presets, activePreset, isLive, locked, guideStep, demoPlaying,
  onSelectPreset, onChooseSound, onPreview, onListen, onStopListening, onRestart,
}: OrchestraPanelProps) {
  const song = activePreset?.song
  const missingSlots = activePreset ? Math.max(0, usedSlotCount(activePreset) - objects.length) : 0
  const finished = song ? guideStep >= song.steps.length : false
  const nextStep = song && !finished ? song.steps[guideStep] : undefined
  const nextObject = nextStep ? objects[nextStep.slot] : undefined

  return (
    <div className="orchestra">
      <div className="orchestra-head">
        <div>
          <p className="eyebrow">Orchestra</p>
          <h3>Choose the sounds</h3>
        </div>
        <p className="orchestra-hint">
          {!isLive
            ? 'Preview mode: these are placeholder objects. Start the camera to use your own.'
            : locked
              ? 'Scene locked. Objects are numbered left to right; presets hand out sounds in that order.'
              : 'Lock the scene first so each object keeps its sound.'}
        </p>
      </div>

      <div className="preset-list" role="radiogroup" aria-label="Sound preset">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={activePreset?.id === preset.id}
            className={`preset ${activePreset?.id === preset.id ? 'preset--on' : ''}`}
            onClick={() => onSelectPreset(preset)}
          >
            <strong>{preset.name}</strong>
            <span>{preset.description}</span>
            <em>{usedSlotCount(preset)} objects</em>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={activePreset === null}
          className={`preset ${activePreset === null ? 'preset--on' : ''}`}
          onClick={() => onSelectPreset(null)}
        >
          <strong>Custom</strong>
          <span>Keep the current sounds and pick each one yourself below.</span>
          <em>any</em>
        </button>
      </div>

      {missingSlots > 0 && (
        <p className="orchestra-warning">
          {activePreset?.name} uses {activePreset ? usedSlotCount(activePreset) : 0} objects; {objects.length} {objects.length === 1 ? 'is' : 'are'} on the table.
          Add {missingSlots} more and rescan for the full tune. Steps for missing objects are skipped.
        </p>
      )}

      <ul className="mapping-list">
        {objects.length === 0 && <li className="mapping-empty">No objects on the table yet.</li>}
        {objects.map((soundObject, index) => (
          <li key={soundObject.id} className={nextObject?.id === soundObject.id ? 'mapping-row--next' : ''}>
            <span className="slot-number">{index + 1}</span>
            <span className="mapping-label">
              {soundObject.label}
              {activePreset?.slots[index] && <small>{activePreset.slots[index].role}</small>}
            </span>
            <select aria-label={`${soundObject.label} instrument`} value={soundObject.instrument}
              onChange={(event) => onChooseSound(soundObject, { instrument: event.target.value as Instrument })}>
              {instruments.map((instrument) => <option key={instrument} value={instrument}>{instrument}</option>)}
            </select>
            <select aria-label={`${soundObject.label} note`} value={soundObject.note} disabled={!pitchedInstruments.has(soundObject.instrument)}
              onChange={(event) => onChooseSound(soundObject, { note: event.target.value as Note })}>
              {notes.map((note) => <option key={note} value={note}>{note}</option>)}
            </select>
            <button type="button" onClick={() => onPreview(soundObject)}>Preview</button>
          </li>
        ))}
      </ul>

      {song && (
        <div className="song-guide">
          <div className="song-head">
            <div>
              <p className="eyebrow">Song guide · {song.bpm} bpm</p>
              <h3>{song.title}</h3>
            </div>
            <div className="song-actions">
              {demoPlaying
                ? <button type="button" className="tool-button tool-button--on" onClick={onStopListening}>Stop</button>
                : <button type="button" className="tool-button" disabled={objects.length === 0} onClick={onListen}>Listen</button>}
              <button type="button" className="tool-button" disabled={demoPlaying} onClick={onRestart}>Restart</button>
            </div>
          </div>
          <p className="song-status" aria-live="polite">
            {finished
              ? 'Bravo! That is the whole tune. Press Restart to play it again.'
              : nextObject
                ? <>Next: tap <strong>{objects.indexOf(nextObject) + 1} · {nextObject.label}</strong>. The glowing object on the camera view shows where.</>
                : 'Add objects to the table to follow the tune.'}
          </p>
          <ol className="song-steps">
            {song.steps.map((step, index) => {
              const target = objects[step.slot]
              const state = index < guideStep ? 'done' : index === guideStep ? 'current' : 'todo'
              return (
                <li
                  key={index}
                  className={`song-step song-step--${state} ${target ? '' : 'song-step--missing'}`}
                  style={{ flexGrow: step.beats, minWidth: `${Math.max(step.beats, 0.5) * 30}px` }}
                  title={target ? `${target.label} · ${target.note}` : 'No object for this step'}
                >
                  <strong>{step.slot + 1}</strong>
                  <span>{target && pitchedInstruments.has(target.instrument) ? target.note : target?.instrument ?? '–'}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
