// ---------------------------------------------------------------------------
// Model attribution dialog.
//
// The 3D meshes are CC BY-SA licensed, which obliges us to credit the sources
// and to state that we modified them, wherever the models are shown. This
// dialog is reachable from the viewer toolbar on every 3D Atlas screen.
//
// Keep this copy in sync with §6 of LICENSES-3D.md.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react'

export function AttributionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas3d-attribution-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-surface shadow-lg"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 id="atlas3d-attribution-title" className="font-display text-base font-semibold text-ink">
            Model sources &amp; licence
          </h2>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm text-ink">
          <p>
            The 3D anatomy in this atlas is adapted from{' '}
            <a
              href="https://github.com/Z-Anatomy"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline"
            >
              Z-Anatomy
            </a>
            , an open-source 3D atlas of human anatomy, licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline"
            >
              CC BY-SA 4.0
            </a>
            .
          </p>

          <p>
            Z-Anatomy derives from BodyParts3D, &copy; The Database Center for Life Science,
            licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by-sa/2.1/jp/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline"
            >
              CC Attribution-Share Alike 2.1 Japan
            </a>
            .
          </p>

          <div className="rounded-md bg-accent-soft/40 px-4 py-3">
            <p className="text-sm text-ink">
              <span className="font-semibold">Changes we made: </span>
              regions isolated, polygon counts reduced for web delivery, meshes renamed to match
              this atlas, and the models converted to glTF. The modified models are distributed
              under CC BY-SA 4.0.
            </p>
          </div>

          <p className="text-xs text-muted">
            The clinical text in this atlas is separately authored and is not part of the
            CC BY-SA licensed material.
          </p>
        </div>

        <div className="flex justify-end border-t border-line px-5 py-3">
          <button
            ref={closeRef}
            onClick={onClose}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
