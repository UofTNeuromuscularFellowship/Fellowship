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
  //
  // Re-run on resize as well: a phone rotated mid-signing changes the canvas
  // width, and setting canvas.width wipes the bitmap — so whatever has been
  // signed so far is copied across rather than lost.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return

    let lastW = 0
    function size() {
      const c = canvasRef.current
      if (!c) return
      const w = c.clientWidth
      if (w === 0 || w === lastW) return
      const prev = lastW > 0 ? document.createElement('canvas') : null
      if (prev) {
        prev.width = c.width
        prev.height = c.height
        prev.getContext('2d')?.drawImage(c, 0, 0)
      }
      lastW = w

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
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
      // Stretched to the new width, which keeps the whole signature visible
      // rather than cropping the end of a name off the right-hand side.
      if (prev && prev.width > 0) ctx.drawImage(prev, 0, 0, w, height)
    }

    size()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(size)
    ro.observe(c)
    return () => ro.disconnect()
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
        // touch-none stops the page scrolling under the finger mid-signature;
        // WebkitTouchCallout stops iOS offering to save the canvas as an image
        // when a slow stroke reads as a long press.
        style={{ height, WebkitTouchCallout: 'none' }}
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
          className="min-h-[36px] px-2 text-xs font-semibold text-accent hover:underline disabled:text-muted/50 disabled:no-underline"
        >
          Clear
        </button>
      </div>
    </div>
  )
}
