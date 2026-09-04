import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Signature pad.
//
// The patient signs with a finger on a tablet or a mouse on a laptop. Strokes
// are drawn straight onto a canvas at device resolution, so the PNG that comes
// out is what was actually signed rather than a smoothed reconstruction.
// ---------------------------------------------------------------------------

export function SignaturePad({
  onChange,
  height = 160,
}: {
  /** Called with a PNG blob whenever the signature changes, null when cleared. */
  onChange: (blob: Blob | null) => void
  height?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  // Size the backing store to the device pixel ratio once laid out, or the
  // signature is a blurry upscale of a small bitmap.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = c.clientWidth
    c.width = Math.round(w * dpr)
    c.height = Math.round(height * dpr)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, height)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [height])

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function emit() {
    const c = canvasRef.current
    if (!c) return
    c.toBlob((b) => onChange(b), 'image/png')
  }

  function down(e: React.PointerEvent) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drawing.current = true
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    if (!hasInk) setHasInk(true)
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    emit()
  }

  function clear() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, c.clientWidth, height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ height }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="w-full touch-none rounded-md border border-line bg-white"
      />
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-muted">
          {hasInk ? 'Signed' : 'Sign above with a finger or the mouse'}
        </p>
        <button
          onClick={clear}
          disabled={!hasInk}
          className="text-xs font-semibold text-accent hover:underline disabled:text-muted/50 disabled:no-underline"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
