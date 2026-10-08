import { supabase, FUNCTIONS_URL, PUBLIC_ANON_KEY } from './supabase'

// ---------------------------------------------------------------------------
// Read aloud for NMDx topics.
//
// The NMDx frame splits a topic into chapters (overview, then each section,
// with long sections in parts) and posts them here. Each chapter is voiced by
// the nmdx-audio edge function, which saves it and returns a signed link, so
// only the first listener of a chapter waits for it to be made.
// ---------------------------------------------------------------------------

export interface Chapter {
  key: string
  label: string
  text: string
}

export interface ListenRequest {
  entryId: string
  entryName: string
  chapters: Chapter[]
}

/** Checks what the frame sent and trims it to sane sizes. */
export function parseListenRequest(d: unknown): ListenRequest | null {
  if (!d || typeof d !== 'object') return null
  const r = d as Record<string, unknown>
  if (r.type !== 'nmdx-listen' || typeof r.entryId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(r.entryId)) return null
  if (!Array.isArray(r.chapters)) return null
  const chapters = r.chapters
    .filter((c): c is Chapter => !!c && typeof c.key === 'string' && typeof c.label === 'string' && typeof c.text === 'string')
    .filter((c) => /^[a-z0-9-]{1,40}$/.test(c.key) && c.text.trim().length > 0)
    .slice(0, 40)
    .map((c) => ({ key: c.key, label: c.label.slice(0, 120), text: c.text.slice(0, 12000) }))
  if (!chapters.length) return null
  return { entryId: r.entryId, entryName: typeof r.entryName === 'string' ? r.entryName.slice(0, 300) : r.entryId, chapters }
}

// Links last six hours on the server; reuse them for a bit less than that.
const cache = new Map<string, { url: string; at: number } | Promise<string>>()
const KEEP_MS = 5 * 60 * 60 * 1000

/** A playable link for one chapter, made on first request. */
export function chapterAudio(entryId: string, chapter: Chapter): Promise<string> {
  const id = `${entryId}/${chapter.key}/${chapter.text.length}`
  const hit = cache.get(id)
  if (hit instanceof Promise) return hit
  if (hit && Date.now() - hit.at < KEEP_MS) return Promise.resolve(hit.url)

  const p = (async () => {
    const { data } = await supabase.auth.getSession()
    const res = await fetch(`${FUNCTIONS_URL}/nmdx-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PUBLIC_ANON_KEY,
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ entryId, chapter: chapter.key, text: chapter.text }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || typeof body.url !== 'string') throw new Error(body.error || 'The audio could not be loaded.')
    return body.url as string
  })()
  cache.set(id, p)
  p.then((url) => cache.set(id, { url, at: Date.now() }), () => cache.delete(id))
  return p
}
