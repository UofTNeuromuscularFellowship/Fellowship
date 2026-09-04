import { useEffect, useRef, useState } from 'react'
import { DRAW_SURFACE_STYLE, useDrawGestures } from '../../lib/drawGesture'

// ---------------------------------------------------------------------------
// Signature pad.
//
// The patient — or the person signing for them — signs with a finger on a
// phone or tablet, or a mouse on a laptop. Strokes are drawn straight onto a
// canvas at device resolution, so the PNG that comes out is what was actually
// signed rather than a smoothed reconstruction.
//
// Input goes through useDrawGestures, which listens to touch events directly
// with a non-passive listener rather than relying on pointer events alone.
// Signing with a finger did not work on iOS with pointer events, and the
// reasons it can fail there are documented in lib/drawGesture.ts.
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

  // The gesture layer fires at pointer rate and must not re-subscribe on every
  // render, so it reads the live callbacks through a ref.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Size the backing store to the device pixel ratio once laid out, or the
  // signature is a blurry upscale of a small bitmap.
  //
  // Re-run on resize as well: a phone rotated mid-signing changes the canvas
  // width, and setting canvas.width wipes the bitmap — so whatever has been
  // signed so far is copied across rather than lost.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return

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
      ctx.lineWidth = 2.2
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
    ro.observe(el)
    return () => ro.disconnect()
  }, [height])

  /** Client coordinates to canvas coordinates. */
  function at(clientX: number, clientY: number) {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const r = c.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  function emit() {
    const c = canvasRef.current
    if (!c) return
    c.toBlob((blob) => onChangeRef.current(blob), 'image/png')
  }

  useDrawGestures(canvasRef, {
    onStart(cx, cy) {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      drawing.current = true
      const p = at(cx, cy)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      // A single tap is a dot, and a dot is ink. Without this, signing a name
      // that starts with a press reads as an empty pad.
      ctx.lineTo(p.x + 0.01, p.y)
      ctx.stroke()
      setHasInk(true)
    },
    onMove(cx, cy) {
      if (!drawing.current) return
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      const p = at(cx, cy)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    },
    onEnd() {
      if (!drawing.current) return
      drawing.current = false
      emit()
    },
  })

  function clear() {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, c.clientWidth, height)
    setHasInk(false)
    onChangeRef.current(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ height, ...DRAW_SURFACE_STYLE }}
        className="w-full rounded-md border border-line bg-white"
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
