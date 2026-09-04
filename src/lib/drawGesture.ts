import { useEffect } from 'react'
import type { RefObject } from 'react'

// ---------------------------------------------------------------------------
// One drawing gesture, across every input this portal is actually used with:
// a finger on a phone, a stylus on a tablet, a mouse on a desk.
//
// Pointer events alone were not enough. They work in Chrome, in Chromium's
// emulated touch, and on Android — but drawing with a finger was reported not
// to work on an iPhone, and iOS Safari has several distinct ways to break a
// pointer-events-only drawing surface:
//
//   - it can classify the gesture as a scroll or a text selection after
//     pointerdown has already fired, then send pointercancel and stop sending
//     pointermove. touch-action: none covers scrolling; it does NOT cover
//     selection, which needs user-select: none.
//   - setPointerCapture inside pointerdown has a history of suppressing the
//     subsequent pointermove stream in WebKit.
//   - a long, slow stroke reads as a long press and raises the callout menu.
//
// So this listens to TOUCH events directly, with a non-passive listener that
// calls preventDefault — which React's JSX props cannot do, because React
// registers touch listeners passively at the root — and falls back to pointer
// events for mouse and pen. A `touching` flag makes sure the compatibility
// pointer events iOS fires after a touch do not draw the stroke a second time.
//
// Coordinates are handed back in CLIENT pixels. Callers convert.
// ---------------------------------------------------------------------------

export interface DrawHandlers {
  onStart: (clientX: number, clientY: number) => void
  onMove: (clientX: number, clientY: number) => void
  onEnd: () => void
}

export function useDrawGestures(
  ref: RefObject<HTMLElement | null>,
  handlers: DrawHandlers,
  enabled = true,
) {
  // Held in a ref-like closure rather than state: these fire at pointer rate and
  // must never cause a render.
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    let touching = false
    let drawingWithPointer = false

    const h = handlers

    // ---- touch: the path a finger actually takes on iOS ----
    function touchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      // Non-passive, so this actually prevents the scroll/selection/callout that
      // would otherwise cancel the stroke halfway through.
      e.preventDefault()
      touching = true
      const t = e.touches[0]
      h.onStart(t.clientX, t.clientY)
    }

    function touchMove(e: TouchEvent) {
      if (!touching) return
      e.preventDefault()
      // A second finger is a pinch, not a drawing. End the stroke cleanly
      // rather than letting it jump to whichever touch the browser lists first.
      if (e.touches.length !== 1) {
        touching = false
        h.onEnd()
        return
      }
      const t = e.touches[0]
      h.onMove(t.clientX, t.clientY)
    }

    function touchEnd(e: TouchEvent) {
      if (!touching) return
      e.preventDefault()
      touching = false
      h.onEnd()
    }

    // ---- pointer: mouse and pen ----
    function pointerDown(e: PointerEvent) {
      // The finger already drew this one through the touch path above.
      if (touching || e.pointerType === 'touch') return
      if (e.button !== 0) return
      drawingWithPointer = true
      h.onStart(e.clientX, e.clientY)
      // Listen on the window rather than capturing the pointer: dragging past
      // the edge of the canvas should keep drawing, and setPointerCapture is
      // the call that misbehaves in WebKit.
      window.addEventListener('pointermove', pointerMove)
      window.addEventListener('pointerup', pointerUp)
      window.addEventListener('pointercancel', pointerUp)
    }

    function pointerMove(e: PointerEvent) {
      if (!drawingWithPointer) return
      h.onMove(e.clientX, e.clientY)
    }

    function pointerUp() {
      if (!drawingWithPointer) return
      drawingWithPointer = false
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
      h.onEnd()
    }

    const opts: AddEventListenerOptions = { passive: false }
    el.addEventListener('touchstart', touchStart, opts)
    el.addEventListener('touchmove', touchMove, opts)
    el.addEventListener('touchend', touchEnd, opts)
    el.addEventListener('touchcancel', touchEnd, opts)
    el.addEventListener('pointerdown', pointerDown)

    return () => {
      el.removeEventListener('touchstart', touchStart, opts)
      el.removeEventListener('touchmove', touchMove, opts)
      el.removeEventListener('touchend', touchEnd, opts)
      el.removeEventListener('touchcancel', touchEnd, opts)
      el.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
    }
    // handlers is rebuilt every render by the caller; the effect reads it
    // through the closure above, so re-running on every change would tear the
    // listeners down mid-stroke. Callers keep their handlers stable with refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled])
}

/**
 * The style a drawing surface needs on iOS. Applied as an inline style rather
 * than a class so it cannot be purged or overridden by utility ordering.
 */
export const DRAW_SURFACE_STYLE = {
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
} as const
