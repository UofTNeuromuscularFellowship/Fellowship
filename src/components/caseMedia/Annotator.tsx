import { useCallback, useMemo, useRef, useState } from 'react'
import type { Annotation, ShapeKind } from '../../lib/caseMedia'

// ---------------------------------------------------------------------------
// Annotation layer.
//
// An SVG drawn over the image at exactly its displayed size. Every coordinate
// is normalised 0..1 against that box, never pixels — the same arrow has to
// point at the same anatomy on a 27-inch monitor and on a phone, and the image
// is responsive.
//
// Each shape carries a number, and the number is what ties it to the legend
// underneath. That is the whole design: the drawing and the appendix are two
// views of one list, so they cannot drift.
// ---------------------------------------------------------------------------

export const COLOURS = [
  { id: '#E8362C', name: 'Red' },
  { id: '#F0A202', name: 'Amber' },
  { id: '#1FA363', name: 'Green' },
  { id: '#0E7C86', name: 'Teal' },
  { id: '#2F6FD0', name: 'Blue' },
  { id: '#8E44AD', name: 'Purple' },
  { id: '#111827', name: 'Black' },
  { id: '#FFFFFF', name: 'White' },
]

export const TOOLS: Array<{ id: ShapeKind; label: string; hint: string }> = [
  { id: 'arrow', label: 'Arrow', hint: 'Drag from the tail to the tip' },
  { id: 'ellipse', label: 'Circle', hint: 'Drag to enclose the finding' },
  { id: 'freehand', label: 'Freehand', hint: 'Draw around anything' },
]

/** Where the number badge sits for a given shape. */
function anchorOf(a: Annotation): [number, number] {
  if (a.kind === 'arrow') return a.points[1] ?? a.points[0] ?? [0.5, 0.5]
  if (a.kind === 'ellipse') {
    const [p, q] = a.points
    if (!p || !q) return [0.5, 0.5]
    // Top-right of the bounding box, just outside it.
    return [Math.max(p[0], q[0]), Math.min(p[1], q[1])]
  }
  return a.points[0] ?? [0.5, 0.5]
}

function pathFor(a: Annotation): string {
  if (a.kind === 'freehand') {
    return a.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0] * 1000} ${p[1] * 1000}`).join(' ')
  }
  return ''
}

/**
 * The shapes themselves, in a viewBox of 1000×1000 with
 * preserveAspectRatio="none" so the normalised coordinates stretch exactly with
 * the image box. Stroke widths are corrected for that stretch below — without
 * it a wide image draws visibly thinner verticals than horizontals.
 */
export function AnnotationLayer({
  annotations,
  box,
  activeId,
  showNumbers = true,
}: {
  annotations: Annotation[]
  /** Displayed size of the media, for stroke correction. */
  box: { w: number; h: number }
  activeId?: string | null
  showNumbers?: boolean
}) {
  // A stroke of N screen pixels, expressed in each axis of the stretched
  // viewBox. Drawn with a group transform we cannot use, so shapes that need an
  // even stroke (ellipse) get vector-effect instead.
  const sx = box.w > 0 ? 1000 / box.w : 1
  const sy = box.h > 0 ? 1000 / box.h : 1

  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        {annotations.map((a) => (
          <marker
            key={`m-${a.id}`}
            id={`arrowhead-${a.id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill={a.colour} />
          </marker>
        ))}
      </defs>

      {annotations.map((a, i) => {
        const dim = activeId && activeId !== a.id
        const opacity = dim ? 0.45 : 1
        const [ax, ay] = anchorOf(a)
        return (
          <g key={a.id} opacity={opacity}>
            {a.kind === 'arrow' && a.points.length >= 2 && (
              <line
                x1={a.points[0][0] * 1000}
                y1={a.points[0][1] * 1000}
                x2={a.points[1][0] * 1000}
                y2={a.points[1][1] * 1000}
                stroke={a.colour}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
                markerEnd={`url(#arrowhead-${a.id})`}
              />
            )}

            {a.kind === 'ellipse' && a.points.length >= 2 && (
              <ellipse
                cx={((a.points[0][0] + a.points[1][0]) / 2) * 1000}
                cy={((a.points[0][1] + a.points[1][1]) / 2) * 1000}
                rx={(Math.abs(a.points[1][0] - a.points[0][0]) / 2) * 1000}
                ry={(Math.abs(a.points[1][1] - a.points[0][1]) / 2) * 1000}
                fill="none"
                stroke={a.colour}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            )}

            {a.kind === 'freehand' && a.points.length >= 2 && (
              <path
                d={pathFor(a)}
                fill="none"
                stroke={a.colour}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {showNumbers && (
              <g>
                {/* The badge is a circle in SCREEN space, so it must undo the
                    viewBox stretch or it turns into an oval on a wide image. */}
                <ellipse
                  cx={ax * 1000}
                  cy={ay * 1000}
                  rx={11 * sx}
                  ry={11 * sy}
                  fill={a.colour}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={ax * 1000}
                  y={ay * 1000}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={13 * Math.min(sx, sy)}
                  fontWeight="700"
                  fill={a.colour === '#FFFFFF' ? '#111827' : '#FFFFFF'}
                  style={{ transform: `scale(${sx / Math.min(sx, sy)}, ${sy / Math.min(sx, sy)})`, transformOrigin: `${ax * 1000}px ${ay * 1000}px` }}
                >
                  {i + 1}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------

/**
 * The drawing surface. Renders `children` (the image) and captures pointer
 * events over it to build shapes.
 */
export function AnnotationEditor({
  annotations,
  onChange,
  tool,
  colour,
  activeId,
  onActive,
  children,
}: {
  annotations: Annotation[]
  onChange: (next: Annotation[]) => void
  tool: ShapeKind
  colour: string
  activeId: string | null
  onActive: (id: string | null) => void
  children: React.ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  const measure = useCallback(() => {
    const el = hostRef.current
    if (el) setBox({ w: el.clientWidth, h: el.clientHeight })
  }, [])

  /** Pointer position as 0..1 of the media box, clamped to it. */
  function pointAt(e: React.PointerEvent): [number, number] {
    const el = hostRef.current
    if (!el) return [0, 0]
    const r = el.getBoundingClientRect()
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ]
  }

  function handleDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    measure()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const p = pointAt(e)
    setDraft({
      id: crypto.randomUUID(),
      kind: tool,
      colour,
      label: '',
      points: [p, p],
    })
  }

  function handleMove(e: React.PointerEvent) {
    if (!draft) return
    const p = pointAt(e)
    setDraft((d) => {
      if (!d) return d
      if (d.kind === 'freehand') {
        // Sample rather than record every event: a 500-point squiggle is not
        // more accurate than a 60-point one, and it has to fit in a jsonb row.
        const last = d.points[d.points.length - 1]
        const far = Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004
        return far ? { ...d, points: [...d.points, p] } : d
      }
      return { ...d, points: [d.points[0], p] }
    })
  }

  function handleUp() {
    if (!draft) return
    const d = draft
    setDraft(null)
    // A click without a drag is not a shape. Without this every stray click
    // adds an invisible zero-length arrow to the legend.
    const [a, b] = [d.points[0], d.points[d.points.length - 1]]
    const moved = Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01
    if (!moved) return
    onChange([...annotations, d])
    onActive(d.id)
  }

  const shown = useMemo(() => (draft ? [...annotations, draft] : annotations), [annotations, draft])

  return (
    <div
      ref={hostRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onLoad={measure}
      className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-md border border-line bg-black"
    >
      {children}
      <AnnotationLayer annotations={shown} box={box} activeId={activeId} />
    </div>
  )
}

/**
 * Read-only media with its annotations drawn on top. Used everywhere the case
 * is shown rather than edited.
 */
export function AnnotatedMedia({
  annotations,
  activeId,
  children,
}: {
  annotations: Annotation[]
  activeId?: string | null
  children: React.ReactNode
}) {
  const [box, setBox] = useState({ w: 0, h: 0 })

  return (
    <div
      // Measured through the ref callback rather than a layout effect: the
      // image loads after mount, and its arrival is what changes the box.
      ref={(el) => {
        if (el && (el.clientWidth !== box.w || el.clientHeight !== box.h)) {
          setBox({ w: el.clientWidth, h: el.clientHeight })
        }
      }}
      className="relative overflow-hidden rounded-md border border-line bg-black"
    >
      {children}
      {annotations.length > 0 && (
        <AnnotationLayer annotations={annotations} box={box} activeId={activeId} />
      )}
    </div>
  )
}
