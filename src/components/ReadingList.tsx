import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from './ui/Card'
import { shortDate } from '../lib/format'

// The personal reading list, shared by the dashboard (where papers are starred
// out of Interesting Reads) and the Library page (where they sit alongside the
// fellowship's reference documents).
//
// Saved rows COPY the article details rather than referencing `publications`.
// That table is a rolling 30-day window whose rows are deleted as they age out,
// so a foreign key would make a saved paper vanish a month after it was saved.

export interface Publication {
  pubmed_id: string
  title: string
  journal: string | null
  authors: string | null
  published_on: string | null
  url: string | null
  doi: string | null
}

export interface SavedPublication extends Publication { id: string; saved_at: string }

const SAVED_COLUMNS = 'id, pubmed_id, title, journal, authors, published_on, url, doi, saved_at'

// U of T Libraries' my.access proxy. Sending the reader through it means the
// publisher sees a subscribed institution, so paywalled full text opens after
// a UTORid sign-in instead of asking for a credit card.
const UOFT_PROXY = 'https://login.library.utoronto.ca/index.php?url='

/** Full text via the library where we know the DOI, the PubMed record otherwise. */
export function accessUrl(p: Publication): string | null {
  const target = p.doi ? `https://doi.org/${p.doi}` : p.url
  return target ? UOFT_PROXY + encodeURIComponent(target) : null
}

/** Owns one reader's saved papers. Both pages that show the list use this, so
 *  starring on the dashboard and removing in the Library cannot drift apart. */
export function useSavedPublications(userId: string | undefined) {
  const [saved, setSaved] = useState<SavedPublication[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    supabase
      .from('saved_publications')
      .select(SAVED_COLUMNS)
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setSaved((data as SavedPublication[]) ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  const savedIds = useMemo(() => new Set(saved.map((s) => s.pubmed_id)), [saved])

  // Optimistic on both sides: a row is cheap to re-fetch, and a failed write
  // simply leaves the star as it was on the next load.
  const save = useCallback(async (p: Publication) => {
    if (!userId) return
    const { data } = await supabase.from('saved_publications').insert({
      user_id: userId,
      pubmed_id: p.pubmed_id,
      title: p.title,
      journal: p.journal,
      authors: p.authors,
      published_on: p.published_on,
      url: p.url,
      doi: p.doi,
    }).select(SAVED_COLUMNS).single()
    if (data) setSaved((prev) => [data as SavedPublication, ...prev])
  }, [userId])

  const unsave = useCallback(async (pubmedId: string) => {
    if (!userId) return
    setSaved((prev) => prev.filter((s) => s.pubmed_id !== pubmedId))
    await supabase.from('saved_publications').delete().eq('user_id', userId).eq('pubmed_id', pubmedId)
  }, [userId])

  return { saved, savedIds, save, unsave, loading }
}

/** The star that keeps a paper. Filled means it is on the reader's list. */
export function SaveStar({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      title={saved ? 'On your reading list — click to remove' : 'Save to your reading list'}
      className={`shrink-0 rounded-md px-2 py-1 text-base leading-none transition-colors ${
        saved ? 'text-accent hover:bg-accent-soft' : 'text-muted hover:bg-paper hover:text-accent'
      }`}
    >
      {saved ? '★' : '☆'}
      <span className="sr-only">{saved ? 'Remove from reading list' : 'Save to reading list'}</span>
    </button>
  )
}

/** Title, byline and the PubMed link — shared by the digest and the saved list
 *  so a paper reads the same in both places. */
export function PublicationBody({ p }: { p: Publication }) {
  const href = accessUrl(p)
  return (
    <div className="min-w-0">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent hover:underline">
          {p.title}
        </a>
      ) : (
        <span className="font-medium text-ink">{p.title}</span>
      )}
      <p className="mt-0.5 text-muted">
        {[p.authors, p.journal, p.published_on ? shortDate(p.published_on) : null].filter(Boolean).join(' · ')}
      </p>
      {p.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent hover:underline">
          Abstract on PubMed
        </a>
      )}
    </div>
  )
}

/** Papers this reader has kept. Private to them, and they outlive the digest:
 *  the article details were copied when saved, so a paper stays here after it
 *  has aged off Interesting Reads.
 *
 *  `emptyHint` differs by page — on the dashboard the papers to star are just
 *  below, in the Library they are not. */
export function ReadingList({ saved, loading, onRemove, emptyHint }: {
  saved: SavedPublication[]
  loading?: boolean
  onRemove: (pubmedId: string) => void
  emptyHint?: string
}) {
  return (
    <Card>
      <CardHeader
        title="My reading list"
        sub={saved.length === 0
          ? emptyHint ?? 'Star a paper in Interesting Reads to keep it here. Saved papers stay after they drop off that list, and only you can see them.'
          : `${saved.length} saved paper${saved.length === 1 ? '' : 's'} — only you can see this list.`}
      />
      {loading ? (
        <p className="px-5 py-4 text-sm text-muted">Loading…</p>
      ) : saved.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nothing saved yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {saved.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
              <PublicationBody p={p} />
              <button
                type="button"
                onClick={() => onRemove(p.pubmed_id)}
                className="shrink-0 text-xs font-medium text-muted hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
