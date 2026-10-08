import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import compendiumHtml from '../data/compendium.html?raw'
import NmdxSuggestDialog, { type DialogStart } from '../components/NmdxSuggestDialog'
import NmdxListenPlayer from '../components/NmdxListenPlayer'
import { parseListenRequest, type ListenRequest } from '../lib/nmdxAudio'
import { SECTION_LABEL, isFrameRequest, loadSuggestions, openCounts } from '../lib/nmdxSuggestions'

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
//
// Suggestions: the frame posts {type: 'nmdx-suggest'} when someone clicks
// "Suggest a correction" on a topic or "Request a new topic", and this page
// opens the form. When the frame says it is ready, this page sends it the
// number of open suggestions per topic so each topic can show them.
//
// Read aloud: the frame posts {type: 'nmdx-listen'} with the topic split into
// chapters, and this page plays them in the player above the frame.
// ---------------------------------------------------------------------------

export default function Compendium() {
  const frame = useRef<HTMLIFrameElement>(null)
  const [src, setSrc] = useState<string>()
  const [dialog, setDialog] = useState<DialogStart | null>(null)
  const [openTotal, setOpenTotal] = useState(0)
  const [listen, setListen] = useState<ListenRequest | null>(null)
  const counts = useRef<Record<string, number>>({})

  const sendCounts = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'nmdx-counts', counts: counts.current }, window.location.origin)
  }, [])

  const refreshCounts = useCallback(() => {
    loadSuggestions()
      .then((list) => {
        counts.current = openCounts(list)
        setOpenTotal(list.filter((x) => x.status === 'open').length)
        sendCounts()
      })
      .catch(() => {})
  }, [sendCounts])

  useEffect(() => { refreshCounts() }, [refreshCounts])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.current?.contentWindow) return
      if (e.data && (e.data as { type?: string }).type === 'nmdx-ready') { sendCounts(); return }
      const l = parseListenRequest(e.data)
      if (l) {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        setListen(l)
        return
      }
      if (!isFrameRequest(e.data)) return
      const r = e.data
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      setDialog({
        kind: r.kind,
        entryId: typeof r.entryId === 'string' ? r.entryId.slice(0, 80) : undefined,
        entryName: typeof r.entryName === 'string' ? r.entryName.slice(0, 300) : undefined,
        section: typeof r.section === 'string' && r.section in SECTION_LABEL ? r.section : undefined,
        quote: typeof r.quote === 'string' ? r.quote.slice(0, 2000) : undefined,
        topicName: typeof r.topicName === 'string' ? r.topicName.slice(0, 300) : undefined,
      })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [sendCounts])

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
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/compendium/suggestions" className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft">
            Suggestions{openTotal ? ` (${openTotal} open)` : ''}
          </Link>
          <button
            type="button"
            onClick={() => setDialog({ kind: 'new_topic' })}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
          >
            Request a topic
          </button>
          <button
            type="button"
            onClick={fullScreen}
            className="hidden rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft md:inline-block"
          >
            Full screen
          </button>
        </div>
      </div>

      {listen && <NmdxListenPlayer request={listen} onClose={() => setListen(null)} />}

      {src ? (
        <iframe
          ref={frame}
          src={src}
          title="NMDx"
          allow="fullscreen"
          className={`block w-full rounded-lg border border-line bg-paper min-h-[520px] ${listen ? 'h-[calc(100dvh-22rem)] md:h-[calc(100dvh-19rem)]' : 'h-[calc(100dvh-13rem)] md:h-[calc(100dvh-11rem)]'}`}
        />
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}

      {dialog && <NmdxSuggestDialog start={dialog} onClose={() => setDialog(null)} onSubmitted={refreshCounts} />}
    </div>
  )
}
