import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import {
  ReadingList, InterestingReads, useSavedPublications, usePublicationDigest,
} from '../components/ReadingList'
import { Carousel, CarouselTile, DocCover } from '../components/ShelfCarousel'

// pdf.js is a big dependency and most visits to this page are a download, not a
// read. Loaded only when someone actually opens a document.
const PdfViewer = lazy(() => import('../components/PdfViewer'))

// ---------------------------------------------------------------------------
// Library — reference texts and documents for the fellowship.
//
// The bucket is PRIVATE. Nothing here has a public URL: every download is a
// signed link minted for the signed-in user and valid for an hour. The
// director and program admin upload and remove; fellows, supervisors and the
// director can all read.
// ---------------------------------------------------------------------------

const BUCKET = 'library'
const SIGNED_URL_TTL = 3600 // 1 hour — plenty for a download to start
// Reading is a longer activity than downloading, and pdf.js keeps fetching byte
// ranges as the reader scrolls: a link that expired mid-book would strand them
// halfway through. Four hours covers a sitting without minting anything
// long-lived.
const VIEWER_URL_TTL = 4 * 3600

const CATEGORIES = [
  'Textbook',
  'Atlas & reference',
  'Guidelines',
  'Review articles',
  'Program documents',
  'Other',
]

interface LibraryDoc {
  id: string
  title: string
  authors: string | null
  category: string | null
  edition: string | null
  description: string | null
  file_name: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

const SELECT =
  'id, title, authors, category, edition, description, file_name, storage_path, mime_type, size_bytes, created_at'

// Shelves run in this order, so the two the fellowship reaches for most are the
// first thing on the page. Anything filed under a category not listed here
// follows in the order the categories come back from the database.
const SECTION_ORDER = [
  'Textbook',
  'Review articles',
  'Atlas & reference',
  'Guidelines',
  'Program documents',
  'Other',
]

// The stored category is singular because it labels one document; a shelf holds
// several. Only the ones that read wrong in the plural are listed.
const SECTION_TITLES: Record<string, string> = {
  Textbook: 'Textbooks',
  Guidelines: 'Guidelines',
  'Review articles': 'Review articles',
}

function sectionTitle(category: string): string {
  return SECTION_TITLES[category] ?? category
}

function humanSize(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function Library() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'director' || profile?.role === 'admin'
  const [docs, setDocs] = useState<LibraryDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reading, setReading] = useState<{ doc: LibraryDoc; url: string } | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  // Signed read links, keyed by storage path — used by the covers only.
  const [coverUrls, setCoverUrls] = useState<Map<string, string>>(new Map())
  // The reader's own saved papers and the rolling journal digest — the same
  // two the dashboard shows, sharing one hook each so a paper starred in
  // either place is starred in both.
  const { saved, savedIds, save, unsave, loading: savedLoading } = useSavedPublications(profile?.id)
  const { publications, loading: pubsLoading } = usePublicationDigest()

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('library_documents')
      .select(SELECT)
      .order('category', { ascending: true })
      .order('title', { ascending: true })
    if (error) setMsg(error.message)
    setDocs((data as LibraryDoc[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // One batch of signed links for the covers. The tiles draw page 1 of each PDF
  // themselves, and they need a readable URL to do it — minting them one at a
  // time as tiles scroll into view would be a request per document.
  useEffect(() => {
    if (docs.length === 0) { setCoverUrls(new Map()); return }
    let cancelled = false
    supabase.storage
      .from(BUCKET)
      .createSignedUrls(docs.map((d) => d.storage_path), SIGNED_URL_TTL)
      .then(({ data }) => {
        if (cancelled || !data) return
        const map = new Map<string, string>()
        for (const row of data) {
          if (row.path && row.signedUrl) map.set(row.path, row.signedUrl)
        }
        setCoverUrls(map)
      })
    return () => { cancelled = true }
  }, [docs])

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? docs.filter((d) =>
          [d.title, d.authors, d.category, d.description, d.file_name]
            .filter(Boolean)
            .some((v) => (v as string).toLowerCase().includes(q))
        )
      : docs
    const map = new Map<string, LibraryDoc[]>()
    for (const d of filtered) {
      const key = d.category?.trim() || 'Other'
      map.set(key, [...(map.get(key) ?? []), d])
    }
    // Known shelves in their fixed order; anything filed under a category that
    // is not one of ours keeps its place at the end rather than disappearing.
    const rank = (c: string) => {
      const i = SECTION_ORDER.indexOf(c)
      return i === -1 ? SECTION_ORDER.length : i
    }
    return Array.from(map.entries()).sort((a, b) => rank(a[0]) - rank(b[0]))
  }, [docs, query])

  function isPdf(d: LibraryDoc) {
    return d.mime_type === 'application/pdf' || d.file_name.toLowerCase().endsWith('.pdf')
  }

  async function read(d: LibraryDoc) {
    setOpening(d.id)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(d.storage_path, VIEWER_URL_TTL)
    setOpening(null)
    if (error || !data?.signedUrl) {
      setMsg(error?.message ?? 'Could not open this document.')
      return
    }
    setReading({ doc: d, url: data.signedUrl })
  }

  async function download(d: LibraryDoc) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, SIGNED_URL_TTL, {
      download: d.file_name,
    })
    if (error || !data?.signedUrl) {
      setMsg(error?.message ?? 'Could not generate a download link.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove(d: LibraryDoc) {
    if (!window.confirm(`Remove "${d.title}" from the library? The file is permanently deleted.`)) return
    const { error: sErr } = await supabase.storage.from(BUCKET).remove([d.storage_path])
    if (sErr) { setMsg(sErr.message); return }
    const { error } = await supabase.from('library_documents').delete().eq('id', d.id)
    if (error) setMsg(error.message)
    load()
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Library</h1>
        <p className="mt-1 text-sm text-muted">
          Reference texts and documents for the fellowship, the latest papers from the journals we follow, and the
          ones you have kept.
          Files are private to the portal — downloads use temporary links and nothing here is reachable from the
          public internet.
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      <Card>
        <CardHeader
          title="Shelf"
          sub={`${docs.length} item${docs.length === 1 ? '' : 's'}`}
          action={canManage ? (
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              {showUpload ? 'Close' : 'Add document'}
            </button>
          ) : undefined}
        />

        {showUpload && canManage && (
          <div className="border-b border-line px-5 py-4">
            <UploadPanel
              userId={profile.id}
              onDone={() => { setShowUpload(false); load() }}
              onError={setMsg}
            />
          </div>
        )}

        <div className="px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, or category"
            className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
          />
        </div>
      </Card>

      {loading ? (
        <Card><p className="px-5 py-4 text-sm text-muted">Loading…</p></Card>
      ) : grouped.length === 0 ? (
        <Card>
          <p className="px-5 py-4 text-sm text-muted">
            {docs.length === 0
              ? canManage
                ? 'Nothing on the shelf yet. Use \u201cAdd document\u201d to upload the first PDF.'
                : 'Nothing on the shelf yet.'
              : 'No documents match that search.'}
          </p>
        </Card>
      ) : (
        // One shelf per category, textbooks first and review articles next,
        // each scrolling sideways through its covers.
        grouped.map(([category, items]) => (
          <Card key={category}>
            <CardHeader
              title={sectionTitle(category)}
              sub={`${items.length} item${items.length === 1 ? '' : 's'}`}
            />
            <Carousel label={sectionTitle(category)}>
              {items.map((d) => (
                <CarouselTile key={d.id}>
                  {isPdf(d) ? (
                    <button
                      type="button"
                      onClick={() => read(d)}
                      title={`Read ${d.title}`}
                      className="rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <DocCover url={coverUrls.get(d.storage_path) ?? null} title={d.title} isPdf />
                    </button>
                  ) : (
                    <DocCover url={null} title={d.title} isPdf={false} />
                  )}

                  <div className="min-h-[2.5rem]">
                    <p className="line-clamp-2 text-xs font-medium leading-snug text-ink" title={d.title}>{d.title}</p>
                    {(d.authors || d.edition) && (
                      <p className="line-clamp-1 text-[11px] text-muted">
                        {[d.authors, d.edition].filter(Boolean).join(' \u00b7 ')}
                      </p>
                    )}
                  </div>

                  {isPdf(d) && (
                    <button
                      onClick={() => read(d)}
                      disabled={opening === d.id}
                      className="rounded-md bg-accent px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {opening === d.id ? 'Opening\u2026' : 'Read online'}
                    </button>
                  )}
                  <button
                    onClick={() => download(d)}
                    className="rounded-md border border-accent px-2 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft"
                  >
                    Download
                  </button>
                  {d.size_bytes ? (
                    <p className="text-center text-[11px] text-muted">{humanSize(d.size_bytes)}</p>
                  ) : null}
                  {canManage && (
                    <button onClick={() => remove(d)} className="text-[11px] font-medium text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </CarouselTile>
              ))}
            </Carousel>
          </Card>
        ))
      )}

      {/* The reader's own saved papers on the left, the rolling journal digest
          on the right. They stack on a narrow screen, saved list first. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ReadingList
          saved={saved}
          loading={savedLoading}
          onRemove={unsave}
          emptyHint="Star a paper in Interesting reads \u2014 here or on the dashboard \u2014 and it will be kept here."
        />
        <InterestingReads
          publications={publications}
          loading={pubsLoading}
          savedIds={savedIds}
          onSave={save}
          onUnsave={unsave}
        />
      </div>

      {reading && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <p className="rounded-md bg-surface px-5 py-4 text-sm text-ink">Loading reader…</p>
            </div>
          }
        >
          <PdfViewer
            url={reading.url}
            title={reading.doc.title}
            fileName={reading.doc.file_name}
            onDownload={() => download(reading.doc)}
            onClose={() => setReading(null)}
          />
        </Suspense>
      )}

      {canManage && (
        <p className="text-xs text-muted">
          Only upload material the program is licensed to distribute — publisher-provided copies, open-access texts,
          institutional subscriptions that permit it, or documents the fellowship owns. If you are unsure about a
          particular title, the University of Toronto libraries can confirm what the licence allows.
        </p>
      )}
    </div>
  )
}

function UploadPanel({ userId, onDone, onError }: {
  userId: string; onDone: () => void; onError: (m: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [edition, setEdition] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!file) { onError('Choose a file to upload.'); return }
    if (!title.trim()) { onError('Give the document a title.'); return }
    setBusy(true)
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `${crypto.randomUUID()}-${safe}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    })
    if (upErr) { setBusy(false); onError(upErr.message); return }

    const { error: rowErr } = await supabase.from('library_documents').insert({
      title: title.trim(),
      authors: authors.trim() || null,
      category: category.trim() || null,
      edition: edition.trim() || null,
      description: description.trim() || null,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: userId,
    })
    setBusy(false)
    if (rowErr) {
      // Do not leave an orphan blob behind if the row insert is rejected.
      await supabase.storage.from(BUCKET).remove([path])
      onError(rowErr.message)
      return
    }
    onDone()
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">File (PDF, up to 200 MB)</label>
        <input
          type="file"
          accept=".pdf,.epub,.doc,.docx,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
          }}
          className="block w-full max-w-md text-sm text-ink"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Electromyography and Neuromuscular Disorders"
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted">Author(s)</label>
          <input value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="e.g. Preston & Shapiro"
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[12rem]">
          <label className="mb-1 block text-xs font-medium text-muted">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="min-w-[10rem]">
          <label className="mb-1 block text-xs font-medium text-muted">Edition / year</label>
          <input value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="e.g. 4th ed., 2020"
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Note (optional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Core text for the EMG rotation"
          className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
      </div>
      <button onClick={save} disabled={busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {busy ? 'Uploading…' : 'Add to library'}
      </button>
    </div>
  )
}
