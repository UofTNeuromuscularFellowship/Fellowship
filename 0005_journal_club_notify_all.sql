import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'

interface Page { id: string; slug: string; title: string; body_md: string; sort_order: number; updated_at: string }

// Minimal markdown rendering: bold, italics, links, lists, numbered lists, blockquotes.
function renderMd(md: string) {
  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-accent hover:underline">$1</a>')

  const blocks = md.split(/\n\s*\n/)
  return blocks.map((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return null
    if (lines.every((l) => l.startsWith('- '))) {
      return (
        <ul key={i} className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
          {lines.map((l, j) => <li key={j} dangerouslySetInnerHTML={{ __html: inline(l.slice(2)) }} />)}
        </ul>
      )
    }
    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      return (
        <ol key={i} className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink">
          {lines.map((l, j) => <li key={j} dangerouslySetInnerHTML={{ __html: inline(l.replace(/^\d+\.\s/, '')) }} />)}
        </ol>
      )
    }
    if (lines[0].startsWith('> ')) {
      return (
        <blockquote key={i} className="my-3 rounded-md border-l-4 border-accent bg-surface px-4 py-3 text-sm leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' ')) }} />
      )
    }
    return (
      <p key={i} className="my-2 text-sm leading-relaxed text-ink"
        dangerouslySetInnerHTML={{ __html: inline(lines.join(' ')) }} />
    )
  })
}

export default function Handbook() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const [pages, setPages] = useState<Page[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('handbook_pages')
      .select('id, slug, title, body_md, sort_order, updated_at')
      .order('sort_order')
    if (error) setMsg(error.message)
    const list = (data as Page[]) ?? []
    setPages(list)
    if (!active && list.length > 0) setActive(list[0].slug)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const page = pages.find((p) => p.slug === active) ?? null

  async function saveEdit() {
    if (!page || !profile) return
    setBusy(true)
    const { error: e1 } = await supabase
      .from('handbook_pages')
      .update({ body_md: draft, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq('id', page.id)
    if (e1) { setBusy(false); setMsg(e1.message); return }
    await supabase.from('handbook_versions').insert({
      page_id: page.id, body_md: draft, change_note: 'Edited in portal', is_major: false, edited_by: profile.id,
    })
    setBusy(false)
    setEditing(false)
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Fellowship Handbook</h1>
        <p className="mt-1 text-sm text-muted">Housekeeping, EMG reporting, and site-by-site guides</p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {pages.map((p) => (
          <button key={p.slug}
            onClick={() => { setActive(p.slug); setEditing(false) }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active === p.slug ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
            }`}>
            {p.title}
          </button>
        ))}
      </div>

      {page && (
        <Card>
          <CardHeader
            title={page.title}
            sub={`Last updated ${new Date(page.updated_at).toLocaleDateString('en-CA')}`}
            action={isDirector ? (
              <button
                onClick={() => { setEditing(!editing); setDraft(page.body_md) }}
                className="text-sm font-medium text-accent hover:underline">
                {editing ? 'Cancel' : 'Edit section'}
              </button>
            ) : undefined}
          />
          <div className="px-5 py-4">
            {editing ? (
              <div className="space-y-3">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={22}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
                <p className="text-xs text-muted">
                  Formatting: **bold**, *italic*, [link](url), "- " for bullets, "1. " for numbered steps, "&gt; " for callouts.
                  A version snapshot is kept every time you save.
                </p>
                <button onClick={saveEdit} disabled={busy}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save section'}
                </button>
              </div>
            ) : (
              <div>{renderMd(page.body_md)}</div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
