import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// ---------------------------------------------------------------------------
// PdfViewer — in-portal reader for library documents.
//
// This module is deliberately NOT imported at the top level anywhere. Library
// pulls it in with React.lazy, the same treatment the 3D atlas gets, so pdf.js
// and its worker stay out of the main bundle for everyone who never opens a
// document.
//
// Pages render on demand as they scroll into view rather than all at once — a
// 900-page textbook would otherwise try to rasterise 900 canvases on open. Each
// page keeps a placeholder of the right size so the scrollbar is honest before
// anything has rendered, and canvases far from the viewport are released again
// to cap memory.
// ---------------------------------------------------------------------------

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// How many pages either side of the viewport stay rendered.
const KEEP_RENDERED = 2
// Device pixel ratio is capped: a 3x retina render of a full-page textbook scan
// costs a lot of memory for very little visible gain.
const MAX_DPR = 2

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

interface Props {
  url: string
  title: string
  fileName: string
  /** Omitted when the viewer is opened for someone who may not download. */
  onDownload?: () => void
  onClose: () => void
}

interface PageDims { width: number; height: number }

/** One occurrence of the search term: which page, and which occurrence on it. */
interface Match { page: number; index: number }

/**
 * Wrap every occurrence of `needle` inside a rendered text layer in a <mark>.
 *
 * pdf.js gives each text run its own absolutely-positioned span, so marking the
 * whole span would light up an entire line for a one-word hit. This splits the
 * run and marks only the matched characters.
 *
 * Reading `span.textContent` returns the flattened text whether or not a
 * previous pass already wrapped parts of it, so each pass rebuilds from clean
 * text and marks cannot nest.
 */
function applyHighlight(container: HTMLElement, needle: string | null, currentIndex: number | null) {
  let occurrence = 0
  for (const span of Array.from(container.querySelectorAll('span'))) {
    const text = span.textContent ?? ''
    const hay = text.toLowerCase()
    if (!needle || !hay.includes(needle)) {
      if (span.firstElementChild) span.textContent = text // clear stale marks
      continue
    }
    const frag = document.createDocumentFragment()
    let pos = 0
    for (;;) {
      const at = hay.indexOf(needle, pos)
      if (at === -1) break
      if (at > pos) frag.appendChild(document.createTextNode(text.slice(pos, at)))
      const mark = document.createElement('mark')
      mark.className = occurrence === currentIndex ? 'pdf-hl pdf-hl-current' : 'pdf-hl'
      mark.textContent = text.slice(at, at + needle.length)
      frag.appendChild(mark)
      pos = at + needle.length
      occurrence++
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)))
    span.textContent = ''
    span.appendChild(frag)
  }
}

export default function PdfViewer({ url, title, fileName, onDownload, onClose }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [baseDims, setBaseDims] = useState<PageDims | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState<number | 'fit'>('fit')
  const [pageNum, setPageNum] = useState(1)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // --- document load ------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const task = pdfjs.getDocument({ url })
    task.promise.then(
      async (doc) => {
        if (cancelled) { doc.destroy(); return }
        const first = await doc.getPage(1)
        const vp = first.getViewport({ scale: 1 })
        if (cancelled) { doc.destroy(); return }
        setBaseDims({ width: vp.width, height: vp.height })
        setNumPages(doc.numPages)
        setPdf(doc)
      },
      (e: unknown) => {
        if (cancelled) return
        const m = e instanceof Error ? e.message : String(e)
        setError(
          /password/i.test(m)
            ? 'This PDF is password protected and cannot be opened in the portal.'
            : `Could not open this document. ${m}`
        )
      }
    )
    return () => {
      cancelled = true
      task.destroy()
    }
  }, [url])

  useEffect(() => () => { pdf?.destroy() }, [pdf])

  // --- sizing -------------------------------------------------------------
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [pdf])

  // Horizontal padding around the page inside the scroller.
  const GUTTER = 32
  const effectiveScale = useMemo(() => {
    if (scale !== 'fit') return scale
    if (!baseDims || !containerWidth) return 1
    return Math.max(0.2, (containerWidth - GUTTER) / baseDims.width)
  }, [scale, baseDims, containerWidth])

  const pageDims = useMemo<PageDims | null>(
    () => (baseDims ? { width: baseDims.width * effectiveScale, height: baseDims.height * effectiveScale } : null),
    [baseDims, effectiveScale]
  )

  function zoom(dir: 1 | -1) {
    const current = effectiveScale
    const next = dir === 1
      ? ZOOM_STEPS.find((s) => s > current + 0.001)
      : [...ZOOM_STEPS].reverse().find((s) => s < current - 0.001)
    if (next) setScale(next)
  }

  // --- page navigation ----------------------------------------------------
  const goToPage = useCallback((n: number) => {
    const el = scrollRef.current
    if (!el) return
    const target = el.querySelector<HTMLElement>(`[data-page="${n}"]`)
    if (target) el.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' })
  }, [])

  // --- search -------------------------------------------------------------
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [matchIdx, setMatchIdx] = useState(0)
  const [searching, setSearching] = useState(false)
  // Cached per page as the individual text runs, not one joined string: the
  // count has to be taken the same way the highlighter walks spans, or the
  // "3 of 41" counter and the marks on the page disagree.
  const textCache = useRef<Map<number, string[]>>(new Map())
  const searchRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(async (q: string) => {
    if (!pdf || q.trim().length < 2) { setMatches([]); setMatchIdx(0); return }
    const needle = q.trim().toLowerCase()
    setSearching(true)
    const found: Match[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      let runs = textCache.current.get(n)
      if (runs === undefined) {
        const page = await pdf.getPage(n)
        const content = await page.getTextContent()
        runs = content.items.map((i) => ('str' in i ? i.str : ''))
        textCache.current.set(n, runs)
      }
      let onPage = 0
      for (const run of runs) {
        const hay = run.toLowerCase()
        let pos = hay.indexOf(needle)
        while (pos !== -1) {
          found.push({ page: n, index: onPage })
          onPage++
          pos = hay.indexOf(needle, pos + needle.length)
        }
      }
    }
    setMatches(found)
    setMatchIdx(0)
    setSearching(false)
    if (found.length) goToPage(found[0].page)
  }, [pdf, goToPage])

  function stepMatch(dir: 1 | -1) {
    if (!matches.length) return
    const next = (matchIdx + dir + matches.length) % matches.length
    setMatchIdx(next)
    goToPage(matches[next].page)
  }

  // --- keyboard -----------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return
      }
      if (typing) {
        if (e.key === 'Enter') { e.preventDefault(); stepMatch(e.shiftKey ? -1 : 1) }
        return
      }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1) }
      if (e.key === '-') { e.preventDefault(); zoom(-1) }
      if (e.key === 'Home') { e.preventDefault(); goToPage(1) }
      if (e.key === 'End') { e.preventDefault(); goToPage(numPages) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, goToPage, numPages, matches, matchIdx, effectiveScale])

  // The page behind the modal must not scroll along with it.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const needle = query.trim().length >= 2 ? query.trim().toLowerCase() : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" role="dialog" aria-modal="true" aria-label={title}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={title}>{title}</p>

        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => goToPage(Math.max(1, pageNum - 1))} disabled={pageNum <= 1}
            className="rounded border border-line px-2 py-1 text-muted hover:text-ink disabled:opacity-40" aria-label="Previous page">↑</button>
          <span className="px-1 tabular-nums text-muted">
            {numPages ? `${pageNum} / ${numPages}` : '—'}
          </span>
          <button onClick={() => goToPage(Math.min(numPages, pageNum + 1))} disabled={pageNum >= numPages}
            className="rounded border border-line px-2 py-1 text-muted hover:text-ink disabled:opacity-40" aria-label="Next page">↓</button>
        </div>

        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => zoom(-1)} className="rounded border border-line px-2 py-1 text-muted hover:text-ink" aria-label="Zoom out">−</button>
          <button onClick={() => setScale('fit')}
            className={`rounded border px-2 py-1 ${scale === 'fit' ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink'}`}>
            Fit
          </button>
          <span className="px-1 tabular-nums text-muted">{Math.round(effectiveScale * 100)}%</span>
          <button onClick={() => zoom(1)} className="rounded border border-line px-2 py-1 text-muted hover:text-ink" aria-label="Zoom in">+</button>
        </div>

        <div className="flex items-center gap-1 text-sm">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !matches.length) runSearch(query) }}
            onBlur={() => { if (query.trim().length >= 2 && !matches.length) runSearch(query) }}
            placeholder="Search text"
            className="w-32 rounded-md border border-line bg-paper px-2 py-1 text-sm text-ink sm:w-44"
          />
          {searching ? (
            <span className="px-1 text-xs text-muted">scanning…</span>
          ) : matches.length > 0 ? (
            <>
              <span className="px-1 text-xs tabular-nums text-muted">{matchIdx + 1}/{matches.length}</span>
              <button onClick={() => stepMatch(-1)} className="rounded border border-line px-2 py-1 text-muted hover:text-ink" aria-label="Previous match">‹</button>
              <button onClick={() => stepMatch(1)} className="rounded border border-line px-2 py-1 text-muted hover:text-ink" aria-label="Next match">›</button>
            </>
          ) : needle ? (
            <button onClick={() => runSearch(query)} className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-ink">Find</button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-sm">
          {onDownload && (
            <button onClick={onDownload} className="font-medium text-accent hover:underline">Download</button>
          )}
          <button onClick={onClose} className="rounded-md border border-line px-3 py-1 font-medium text-ink hover:bg-paper">
            Close
          </button>
        </div>
      </div>

      {/* Pages */}
      <div ref={scrollRef} className="flex-1 overflow-auto overscroll-contain bg-[#3a3f47] px-2 py-4">
        {error ? (
          <div className="mx-auto max-w-md rounded-md bg-surface px-5 py-4 text-sm text-ink">
            <p>{error}</p>
            {onDownload && (
              <p className="mt-2">
                <button onClick={onDownload} className="font-medium text-accent hover:underline">
                  Download {fileName} instead
                </button>
              </p>
            )}
          </div>
        ) : !pdf || !pageDims ? (
          <p className="py-10 text-center text-sm text-white/80">Opening document…</p>
        ) : (
          <div className="mx-auto flex flex-col items-center gap-4" style={{ width: pageDims.width }}>
            {Array.from({ length: numPages }, (_, i) => (
              <PageSlot
                key={i + 1}
                pdf={pdf}
                num={i + 1}
                scale={effectiveScale}
                fallback={pageDims}
                needle={needle}
                currentMatchIndex={
                  matches[matchIdx]?.page === i + 1 ? matches[matchIdx].index : null
                }
                onVisible={setPageNum}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PageSlot({
  pdf, num, scale, fallback, needle, currentMatchIndex, onVisible,
}: {
  pdf: PDFDocumentProxy
  num: number
  scale: number
  fallback: PageDims
  needle: string | null
  /** Which occurrence on THIS page is the active one, or null if none is. */
  currentMatchIndex: number | null
  onVisible: (n: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState<PageDims | null>(null)
  const [near, setNear] = useState(false)
  const [rendered, setRendered] = useState(false)

  // Two thresholds off one observer: a wide margin decides what to render
  // ahead of the reader, a tight one decides which page label to show.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const renderObs = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { root: el.closest('.overflow-auto'), rootMargin: `${KEEP_RENDERED * 100}% 0px` }
    )
    const currentObs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) onVisible(num) },
      { root: el.closest('.overflow-auto'), rootMargin: '-45% 0px -45% 0px' }
    )
    renderObs.observe(el)
    currentObs.observe(el)
    return () => { renderObs.disconnect(); currentObs.disconnect() }
  }, [num, onVisible])

  useEffect(() => {
    if (!near) {
      // Released so a long document does not accumulate hundreds of canvases.
      const c = canvasRef.current
      if (c) { c.width = 0; c.height = 0 }
      if (textRef.current) textRef.current.innerHTML = ''
      setRendered(false)
      return
    }

    let cancelled = false
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null

    ;(async () => {
      try {
        const page = await pdf.getPage(num)
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        setDims({ width: viewport.width, height: viewport.height })

        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return

        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`

        task = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        })
        await task.promise
        if (cancelled) return

        // Text layer: makes the page selectable and copyable, and is what the
        // search highlight attaches to.
        const tl = textRef.current
        if (tl) {
          tl.innerHTML = ''
          tl.style.setProperty('--scale-factor', String(scale))
          const layer = new pdfjs.TextLayer({
            textContentSource: await page.getTextContent(),
            container: tl,
            viewport,
          })
          await layer.render()
        }
        if (!cancelled) setRendered(true)
      } catch (e) {
        // A cancelled render is the normal result of scrolling away or zooming
        // mid-paint, not a failure worth surfacing.
        if (!(e instanceof pdfjs.RenderingCancelledException)) {
          // eslint-disable-next-line no-console
          console.error(`Page ${num} failed to render`, e)
        }
      }
    })()

    return () => { cancelled = true; task?.cancel() }
  }, [near, pdf, num, scale])

  // Mark the search term, then bring the active occurrence into view. A phrase
  // that straddles two text runs is not marked — pdf.js chose those boundaries,
  // not us — and for the same reason it is not counted, so the marks on screen
  // and the "3 of 41" counter always agree.
  useEffect(() => {
    const tl = textRef.current
    if (!tl || !rendered) return
    applyHighlight(tl, needle, currentMatchIndex)
    if (currentMatchIndex !== null) {
      tl.querySelector('.pdf-hl-current')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [needle, rendered, currentMatchIndex])

  const shown = dims ?? fallback

  return (
    <div
      ref={hostRef}
      data-page={num}
      className="relative bg-white shadow-lg"
      style={{ width: shown.width, height: shown.height }}
    >
      <canvas ref={canvasRef} className="block" />
      <div ref={textRef} className="pdf-text-layer" />
      {!rendered && (
        <span className="absolute inset-x-0 top-1/2 text-center text-xs text-[#8a8f98]">
          Page {num}
        </span>
      )}
    </div>
  )
}
