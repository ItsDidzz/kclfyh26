import { useRef, type RefObject } from 'react'
import { clamp01 } from '../lib/calibration'
import type { TableQuad } from '../lib/types'

type TableOverlayProps = {
  table: TableQuad
  editable: boolean
  stageRef: RefObject<HTMLDivElement | null>
  onChange: (table: TableQuad) => void
}

const cornerNames = ['top-left', 'top-right', 'bottom-right', 'bottom-left']

export function TableOverlay({ table, editable, stageRef, onChange }: TableOverlayProps) {
  const draggingIndexRef = useRef<number | null>(null)
  const polygon = table.map((point) => `${point.x},${point.y}`).join(' ')

  const moveCorner = (event: React.PointerEvent<HTMLSpanElement>) => {
    const index = draggingIndexRef.current
    const stage = stageRef.current
    if (index === null || !stage) return
    const bounds = stage.getBoundingClientRect()
    const next = [...table] as TableQuad
    next[index] = {
      x: clamp01((event.clientX - bounds.left) / bounds.width),
      y: clamp01((event.clientY - bounds.top) / bounds.height),
    }
    onChange(next)
  }

  return (
    <>
      <svg className={`table-overlay ${editable ? 'table-overlay--editing' : ''}`} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        <path className="table-outside" fillRule="evenodd" d={`M0,0 H1 V1 H0 Z M${table.map((point) => `${point.x},${point.y}`).join(' L')} Z`} vectorEffect="non-scaling-stroke" />
        <polygon className="table-edge" points={polygon} vectorEffect="non-scaling-stroke" />
      </svg>
      {editable && table.map((point, index) => (
        <span
          key={cornerNames[index]}
          className="table-handle"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          role="slider"
          aria-label={`Tabletop ${cornerNames[index]} corner`}
          aria-valuetext={`${Math.round(point.x * 100)}%, ${Math.round(point.y * 100)}%`}
          onPointerDown={(event) => {
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            draggingIndexRef.current = index
          }}
          onPointerMove={moveCorner}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId)
            draggingIndexRef.current = null
          }}
        >
          <span className="table-handle-label">{index + 1}</span>
        </span>
      ))}
    </>
  )
}
