import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/**
 * Where the number badge sits, in SCREEN pixels.
 *
 * Never on the shape itself. The badge used to sit exactly on the anchor point,
 * which for an arrow is the tip — so the number covered the one part of the
 * annotation that carries the meaning. Each kind now offsets away from its own
 * business end:
 *
 *   arrow     behind the TAIL, along the shaft, pointing away from the tip
 *   ellipse   diagonally outside the top-right of the bounding box
 *   freehand  up and left of where the stroke started
 *
 * The result is clamped into the image, and if the offset would push it out the
 * badge flips to the other side rather than being cropped.
 */
const BADGE_R = 9
const BADGE_GAP = 13

function badgeAt(a: Annotation, box: { w: number; h: number }): [number, number] {
  const W = box.w || 1
  const H = box.h || 1
  const px = (p: [number, number]): [number, number] => [p[0] * W, p[1] * H]

  let x: number
  let y: number

  if (a.kind === 'arrow' && a.points.length >= 2) {
    const [tail, head] = [px(a.points[0]), px(a.points[1])]
    const dx = head[0] - tail[0]
    const dy = head[1] - tail[1]
    const len = Math.hypot(dx, dy) || 1
    // Back along the shaft from the tail, so the badge trails the arrow.
    x = tail[0] - (dx / len) * (BADGE_R + BADGE_GAP)
    y = tail[1] - (dy / len) * (BADGE_R + BADGE_GAP)
  } else if (a.kind === 'ellipse' && a.points.length >= 2) {
    const [p, q] = [px(a.points[0]), px(a.points[1])]
    const right = Math.max(p[0], q[0])
    const top = Math.min(p[1], q[1])
    const d = (BADGE_R + BADGE_GAP) / Math.SQRT2
    x = right + d
    y = top - d
  } else {
    const first = px(a.points[0] ?? [0.5, 0.5])
    const d = (BADGE_R + BADGE_GAP) / Math.SQRT2
    x = first[0] - d
    y = first[1] - d
  }

  // Keep it on the image. Reflecting about the anchor rather than sliding keeps
  // the badge next to its own shape instead of parked in a corner.
  const pad = BADGE_R + 2
  const origin = px(a.points[0] ?? [0.5, 0.5])
  if (x < pad || x > W - pad) x = origin[0] - (x - origin[0])
  if (y < pad || y > H - pad) y = origin[1] - (y - origin[1])
  return [Math.min(W - pad, Math.max(pad, x)), Math.min(H - pad, Math.max(pad, y))]
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
  return (
    <>
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

      {annotations.map((a) => {
        const dim = activeId && activeId !== a.id
        const opacity = dim ? 0.45 : 1
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

          </g>
        )
      })}
    </svg>

    {/* Badges get their OWN svg in screen pixels. The shape layer is stretched
        (preserveAspectRatio="none") so that normalised coordinates land
        correctly, but a circle drawn in a stretched space is an oval and text
        in it is distorted — which is why this used to need a scale correction
        on every glyph. Two coordinate systems, no correction. */}
    {showNumbers && box.w > 0 && box.h > 0 && (
      <svg
        viewBox={`0 0 ${box.w} ${box.h}`}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {annotations.map((a, i) => {
          const [bx, by] = badgeAt(a, box)
          const dim = activeId && activeId !== a.id
          return (
            <g key={`b-${a.id}`} opacity={dim ? 0.45 : 1}>
              <circle
                cx={bx}
                cy={by}
                r={BADGE_R}
                fill={a.colour}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              <text
                x={bx}
                y={by}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight="700"
                fill={a.colour === '#FFFFFF' ? '#111827' : '#FFFFFF'}
              >
                {i + 1}
              </text>
            </g>
          )
        })}
      </svg>
    )}
    </>
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
    if (el) setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
  }, [])

  // Rotating a phone changes the box without any React state changing, and the
  // badge layer is drawn in pixels — so it has to be re-measured or every number
  // lands in the wrong place after a rotation.
  useEffect(() => {
    const el = hostRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

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
    // A second finger arriving mid-stroke is a pinch, not a drawing. Ignoring it
    // keeps the shape anchored to the finger that started it.
    if (draft) return
    measure()
    // Capture on the host, not e.target: the pointer goes down on the <img>
    // child, and a capture there is lost the moment the finger leaves it.
    hostRef.current?.setPointerCapture?.(e.pointerId)
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
      // WebkitTouchCallout: iOS pops its "Save Image / Copy" sheet on a long
      // press, which is exactly what drawing a slow freehand outline looks like.
      style={{ WebkitTouchCallout: 'none' }}
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
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  // The box changes twice after mount without any prop changing: once when the
  // image finishes loading and gives the div a height, and again whenever the
  // phone is rotated. A ResizeObserver catches both; the ref callback alone
  // caught only the first, and only by luck of a re-render.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const read = () =>
      setBox((b) =>
        b.w === el.clientWidth && b.h === el.clientHeight
          ? b
          : { w: el.clientWidth, h: el.clientHeight },
      )
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={hostRef}
      className="relative overflow-hidden rounded-md border border-line bg-black"
    >
      {children}
      {annotations.length > 0 && (
        <AnnotationLayer annotations={annotations} box={box} activeId={activeId} />
      )}
    </div>
  )
}
