// ---------------------------------------------------------------------------
// Marker labels, drawn OFF TO THE SIDE of the model.
//
// Labels used to live only in the authoring panel, so a marker on the model
// carried no text at all. Putting the text in the 3D scene instead does not
// work: it sits over the anatomy, competes with it for contrast, and turns
// with the camera. So each label is drawn in the margin against the white
// background, with a leader line back to its marker.
//
// Labels are stacked in vertical slots so two markers close together do not
// overlap, and each goes to whichever margin its marker is nearest.
// ---------------------------------------------------------------------------

import { useMemo } from 'react'
import { MARKER_COLORS, MARKER_LABELS, type ElectrodeKind } from './MarkerShapes'
import type { NeedleMarker } from '../../lib/atlas3dMarkers'

export interface ScreenPos {
  x: number
  y: number
  visible: boolean
}

// Card height varies with how much text it carries, so the stack reserves the
// worst case rather than the average — a clipped label is worse than a gap.
const ROW_H = 76 // enough for a two-line note plus the draft flag
const TOP_PAD = 8
const GUTTER = 158

function title(m: NeedleMarker): string {
  if (m.label && m.label.trim()) return m.label.trim()
  if (m.kind === 'landmark') return 'Unnamed landmark'
  return MARKER_LABELS[m.kind as ElectrodeKind]
}

export function MarkerCallouts({
  markers,
  positions,
  width,
  height,
  activeId,
  onHover,
}: {
  markers: NeedleMarker[]
  positions: Record<string, ScreenPos>
  width: number
  height: number
  activeId: string | null
  onHover: (id: string | null) => void
}) {
  const placed = useMemo(() => {
    const rows = markers
      .map((m) => ({ m, p: positions[m.id] }))
      .filter((r): r is { m: NeedleMarker; p: ScreenPos } => Boolean(r.p?.visible))

    // Split by which side of the model each marker sits on, then stack each
    // column top-to-bottom in the order the markers appear vertically.
    const left = rows.filter((r) => r.p.x < width / 2).sort((a, b) => a.p.y - b.p.y)
    const right = rows.filter((r) => r.p.x >= width / 2).sort((a, b) => a.p.y - b.p.y)

    const out: Array<{
      m: NeedleMarker
      from: ScreenPos
      lx: number
      ly: number
      side: 'left' | 'right'
    }> = []

    const layout = (col: typeof left, side: 'left' | 'right') => {
      if (col.length === 0) return
      // Evenly spaced slots, centred on the group of markers they point at,
      // then clamped inside the canvas. Fixed spacing is what guarantees the
      // cards cannot overlap; trying to place each one next to its own marker
      // collapses as soon as two markers are close together.
      const total = col.length * ROW_H
      const meanY = col.reduce((sum, r) => sum + r.p.y, 0) / col.length
      const start = Math.max(
        TOP_PAD,
        Math.min(meanY - total / 2, Math.max(TOP_PAD, height - total - TOP_PAD)),
      )
      col.forEach((r, i) => {
        out.push({
          m: r.m,
          from: r.p,
          lx: side === 'left' ? 8 : width - GUTTER - 8,
          ly: start + i * ROW_H,
          side,
        })
      })
    }
    layout(left, 'left')
    layout(right, 'right')
    return out
  }, [markers, positions, width, height])

  if (placed.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Leader lines sit under the label chips. */}
      <svg width={width} height={height} className="absolute inset-0">
        {placed.map(({ m, from, lx, ly, side }) => {
          const anchorX = side === 'left' ? lx + GUTTER : lx
          const anchorY = ly + 13
          const midX = (anchorX + from.x) / 2
          const dim = m.status !== 'approved'
          return (
            <g key={m.id} opacity={m.id === activeId ? 1 : dim ? 0.75 : 0.9}>
              <path
                d={`M ${anchorX} ${anchorY} C ${midX} ${anchorY}, ${midX} ${from.y}, ${from.x} ${from.y}`}
                fill="none"
                stroke={MARKER_COLORS[m.kind as ElectrodeKind]}
                strokeWidth={m.id === activeId ? 2 : 1.2}
                strokeDasharray={dim ? '4 3' : undefined}
              />
              <circle
                cx={from.x}
                cy={from.y}
                r={m.id === activeId ? 4 : 3}
                fill={MARKER_COLORS[m.kind as ElectrodeKind]}
              />
            </g>
          )
        })}
      </svg>

      {placed.map(({ m, lx, ly }) => (
        <div
          key={m.id}
          onMouseEnter={() => onHover(m.id)}
          onMouseLeave={() => onHover(null)}
          style={{ left: lx, top: ly, width: GUTTER }}
          className={`pointer-events-auto absolute rounded-md border bg-surface/95 px-2 py-1 shadow-sm ${
            m.id === activeId ? 'border-accent' : 'border-line'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: MARKER_COLORS[m.kind as ElectrodeKind] }}
            />
            <span className="text-[11px] font-semibold leading-tight text-ink" title={title(m)}>
              {title(m)}
            </span>
          </div>
          {/* The cathode's bearing is shown by the probe on the model, not as
              a number here: a degree reading off an arbitrary zero is not
              something anyone repeats at the bedside, and it crowded out the
              note. The authoring slider still sets it. */}
          {m.note && (
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">{m.note}</p>
          )}
          {m.status !== 'approved' && (
            <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-700">
              Draft
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
