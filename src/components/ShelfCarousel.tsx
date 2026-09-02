import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// The shelf carousel — a row of document covers that scrolls sideways.
//
// Two pieces live here:
//   Carousel   the scrolling strip and its arrows
//   DocCover   one cover image, rasterised from page 1 of the PDF
//
// Covers are NOT stored anywhere. Nothing in the library carries a cover image,
// and inventing one would mean guessing at artwork the fellowship does not
// have. Instead page 1 of the PDF is rendered to a canvas in the browser, which
// is the actual first page of the actual document — a scan's cover, a paper's
// title page. Documents that are not PDFs, and PDFs that fail to render, fall
// back to a typeset tile showing the title.
// ---------------------------------------------------------------------------

const COVER_W = 150 // css px; the raster is drawn at 2x this for retina

/** A horizontally scrolling strip with arrows at either edge.
 *
 *  The arrows page by roughly a full strip width rather than one tile, which
 *  is what makes a long shelf quick to move through. They fade out at each end
 *  so it is clear when there is nothing further to see. */
export function Carousel({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // A pixel of slack: fractional scroll positions on zoomed displays would
    // otherwise leave an arrow live with nowhere to go.
    setAtStart(el.scrollLeft <= 1)
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, children])

  function page(dir: -1 | 1) {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(el.clientWidth - COVER_W, COVER_W), behavior: 'smooth' })
  }

  const arrow = 'absolute top-[38%] z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full ' +
    'bg-accent text-white shadow transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-0'

  return (
    <div className="relative">
      <button type="button" onClick={() => page(-1)} disabled={atStart}
        aria-label={`Scroll ${label} left`} className={`${arrow} left-1`}>
        <span aria-hidden="true" className="-mt-0.5 text-lg leading-none">‹</span>
      </button>

      {/* px-12 leaves the arrows a gutter of their own rather than having them
          sit on top of the first and last covers. scroll-px-12 matches it:
          without it a snap point would align a tile to the very edge of the
          scrollport, scrolling that padding straight back off again. */}
      <div
        ref={ref}
        onScroll={measure}
        role="group"
        aria-label={label}
        className="flex snap-x snap-mandatory scroll-px-12 gap-4 overflow-x-auto scroll-smooth px-12 py-4"
      >
        {children}
      </div>

      <button type="button" onClick={() => page(1)} disabled={atEnd}
        aria-label={`Scroll ${label} right`} className={`${arrow} right-1`}>
        <span aria-hidden="true" className="-mt-0.5 text-lg leading-none">›</span>
      </button>
    </div>
  )
}

// Rendered covers, keyed by storage path, kept for the life of the tab. Moving
// between the Library and another page should not re-rasterise the whole shelf.
const coverCache = new Map<string, string>()

// pdf.js is a big dependency and the viewer already loads it lazily. Importing
// it here at the top level would pull it into the main bundle for everyone, so
// it is fetched the first time a cover is actually drawn.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })()
  }
  return pdfjsPromise
}

// One cover at a time. Rasterising a shelf of textbooks in parallel would put
// several multi-hundred-megabyte documents in flight at once.
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => {})
  return run
}

async function rasterise(url: string): Promise<string> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ url })
  const doc = await task.promise
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: (COVER_W * 2) / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.72)
  } finally {
    doc.destroy()
  }
}

/** One cover. Draws itself only once it is scrolled into view, so opening the
 *  Library does not rasterise every document on every shelf. */
export function DocCover({ url, title, isPdf }: { url: string | null; title: string; isPdf: boolean }) {
  const [src, setSrc] = useState<string | null>(() => (url ? coverCache.get(url) ?? null : null))
  const [failed, setFailed] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (seen || !boxRef.current) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(boxRef.current)
    return () => io.disconnect()
  }, [seen])

  useEffect(() => {
    if (!seen || !url || !isPdf || src || failed) return
    let cancelled = false
    enqueue(() => rasterise(url))
      .then((data) => {
        coverCache.set(url, data)
        if (!cancelled) setSrc(data)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [seen, url, isPdf, src, failed])

  const frame = 'flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-md border border-line bg-surface shadow-sm'

  if (src) {
    return (
      <div ref={boxRef} className={frame}>
        <img src={src} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  // Before a cover has been drawn, and permanently for a Word file or a PDF
  // that will not open, the title is the tile. Nothing is left blank waiting:
  // a document with no cover still reads as that document.
  return (
    <div ref={boxRef} className={`${frame} bg-paper px-3`}>
      <p className="line-clamp-6 text-center font-display text-[13px] font-semibold leading-snug text-ink">
        {title}
      </p>
    </div>
  )
}

/** The fixed-width column a cover and its buttons share. */
export function CarouselTile({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-[150px] shrink-0 snap-start flex-col gap-2">
      {children}
    </div>
  )
}
