import { useEffect, useRef, useState } from 'react'
import compendiumHtml from '../data/compendium.html?raw'

// ---------------------------------------------------------------------------
// Neuromuscular disease compendium.
//
// A searchable reference of about 320 neuromuscular diseases. It has three
// ways to browse (localization, presenting pattern and disease category) and
// a differential builder. Every entry has the same four parts: clinical
// features, investigations, differential and management.
//
// The compendium is a self-contained page (src/data/compendium.html) built
// outside the portal from Amato & Russell, Neuromuscular Disorders 2nd ed., and
// the WUSTL Neuromuscular Disease Center. It is shown here in a frame instead
// of being rewritten in React, so a content update means replacing one file
// and nothing else.
//
// Why a blob URL and not srcDoc: a srcdoc frame resolves "#als" style links
// against the PORTAL's address, so following a cross-reference would load the
// whole portal inside the frame. A blob URL is its own document with the same
// origin, so in-page links stay in the frame. The page can still read the
// portal's <html class="dark"> to follow light/dark, and it writes the open
// entry back to this page's #hash so /compendium#als can be shared.
//
// The HTML is imported ?raw, so it lands in this page's lazy chunk. It is not
// a public file and loads only for someone signed in.
// ---------------------------------------------------------------------------

export default function Compendium() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState<string>()

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([compendiumHtml], { type: 'text/html' }))
    // Open on the entry named in the address, e.g. /compendium#mfs
    setSrc(url + window.location.hash)
    return () => URL.revokeObjectURL(url)
  }, [])

  function fullScreen() {
    frame.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">NMDx</h1>
          <p className="mt-1 text-sm text-muted">
            Search a disease, gene, antibody or sign. Browse by localization, presenting pattern or disease category, or build a differential from findings.
          </p>
        </div>
        <button
          type="button"
          onClick={fullScreen}
          className="hidden rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft md:inline-block"
        >
          Full screen
        </button>
      </div>

      {src ? (
        <iframe
          ref={frame}
          src={src}
          title="NMDx"
          allow="fullscreen"
          className="block w-full rounded-lg border border-line bg-paper h-[calc(100dvh-13rem)] min-h-[520px] md:h-[calc(100dvh-11rem)]"
        />
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
    </div>
  )
}
