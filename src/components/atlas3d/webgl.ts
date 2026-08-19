// ---------------------------------------------------------------------------
// WebGL capability detection.
//
// The 3D Atlas must never present a broken page: if the device or browser
// can't render it, we say so plainly and point back to the text tools, which
// carry all the same clinical content.
// ---------------------------------------------------------------------------

export type WebglSupport =
  | { ok: true; renderer: string | null }
  | { ok: false; reason: string }

/**
 * Creates a throwaway context to test support. Cheap enough to run on mount;
 * the context is explicitly released afterwards so we don't burn one of the
 * browser's limited WebGL contexts.
 */
export function detectWebgl(): WebglSupport {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'No browser environment.' }
  }
  if (!('WebGL2RenderingContext' in window) && !('WebGLRenderingContext' in window)) {
    return { ok: false, reason: 'This browser does not support WebGL.' }
  }

  try {
    const canvas = document.createElement('canvas')
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null)

    if (!gl) {
      return {
        ok: false,
        reason:
          'WebGL is available in this browser but could not start — it may be disabled in settings, or hardware acceleration may be turned off.',
      }
    }

    let renderer: string | null = null
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (debugInfo) {
      const value = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      renderer = typeof value === 'string' ? value : null
    }

    // Release the context rather than waiting for GC.
    gl.getExtension('WEBGL_lose_context')?.loseContext()

    return { ok: true, renderer }
  } catch {
    return { ok: false, reason: 'WebGL could not be initialised in this browser.' }
  }
}
