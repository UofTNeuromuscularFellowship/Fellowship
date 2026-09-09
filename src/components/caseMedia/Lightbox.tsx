import { useEffect, useState } from 'react'
import { AnnotatedMedia } from './Annotator'
import type { Annotation } from '../../lib/caseMedia'

// ---------------------------------------------------------------------------
// Full-screen viewer for a still image.
//
// A video element gets a full-screen button from the browser for free. An
// <img> does not, and the Fullscreen API is not the answer: iOS Safari does not
// implement requestFullscreen on anything other than a <video>, which is
// exactly why a clip could be expanded and its captured frame could not.
//
// So this is an in-page overlay rather than real full-screen. It behaves the
// same everywhere, it can carry the annotations and the legend with it — which
// a native full-screen image could not — and it cannot be blocked by a browser
// that dislikes the API.
//
// Two sizes, because a nerve conduction trace is very wide: fitted to the
// screen by default, and actual size with scrolling on demand, which on a phone
// is the difference between seeing a waveform and seeing a green smear.
// ---------------------------------------------------------------------------

export function Lightbox({
  src,
  alt,
  annotations,
  caption,
  onClose,
}: {
  src: string
  alt: string
  annotations: Annotation[]
  caption?: string | null
  onClose: () => void
}) {
  const [zoomed, setZoomed] = useState(false)

  // Escape closes, and the page behind must not scroll while this is open —
  // otherwise dismissing the overlay leaves the reader somewhere else entirely.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      // Solid, not translucent: the page behind bleeds through a 95% backdrop
      // enough to read, and competing text next to a clinical image is noise.
      className="fixed inset-0 z-50 flex flex-col bg-black"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ---- bar ---- */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{alt}</p>
        <button
          onClick={() => setZoomed((z) => !z)}
          className="min-h-[40px] shrink-0 rounded-md border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          {zoomed ? 'Fit to screen' : 'Actual size'}
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-md border border-white/30 text-white hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* ---- the image ----
          Clicking the backdrop closes; clicking the image itself does not, so a
          missed tap while examining something does not throw the reader out. */}
      <div
        onClick={onClose}
        className={`flex min-h-0 flex-1 items-center justify-center p-2 ${
          zoomed ? 'overflow-auto' : 'overflow-hidden'
        }`}
      >
        <div onClick={(e) => e.stopPropagation()} className="inline-block">
          {/* AnnotatedMedia measures its own box, so the annotations follow the
              image through both sizes without any extra arithmetic here. */}
          <AnnotatedMedia annotations={annotations} className="inline-block border-white/20">
            <img
              src={src}
              alt={alt}
              className={zoomed ? 'block max-w-none' : 'block max-h-[80vh] max-w-full object-contain'}
            />
          </AnnotatedMedia>
        </div>
      </div>

      {/* ---- legend ---- */}
      {(annotations.length > 0 || caption) && (
        <div className="max-h-[28vh] shrink-0 overflow-y-auto border-t border-white/15 px-4 py-3">
          {caption && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">{caption}</p>
          )}
          {annotations.length > 0 && (
            <ol className="mt-2 space-y-1.5">
              {annotations.map((a, i) => (
                <li key={a.id} className="flex items-center gap-2.5">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      backgroundColor: a.colour,
                      color: a.colour === '#FFFFFF' ? '#111827' : '#FFFFFF',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm text-white/90">
                    {a.label || <span className="text-white/50">Unlabelled</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

/** The button that opens it. Sits over the top-right corner of an image. */
export function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="View full screen"
      title="View full screen"
      className="absolute right-2 top-2 flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-white/30 bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
      </svg>
    </button>
  )
}
