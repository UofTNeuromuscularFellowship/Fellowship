import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'

export default function Settings() {
  const { profile } = useAuth()
  const [msg, setMsg] = useState<string | null>(null)

  if (!profile || profile.role !== 'director') return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Program configuration and announcements</p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      <Broadcast directorId={profile.id} onError={setMsg} />
      <RequestAwayDates onError={setMsg} />
      <WaveformAllocation onError={setMsg} />
      <PubmedTerms onError={setMsg} />
    </div>
  )
}

function Broadcast({ directorId, onError }: { directorId: string; onError: (m: string) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'fellow' | 'all'>('fellow')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function send() {
    if (!title.trim()) return
    setBusy(true)
    let q = supabase.from('users').select('id').eq('status', 'active').neq('id', directorId)
    if (audience === 'fellow') q = q.eq('role', 'fellow')
    const { data: recipients, error: e1 } = await q
    if (e1) { setBusy(false); onError(e1.message); return }
    const rows = (recipients ?? []).map((r) => ({
      user_id: r.id,
      kind: 'director_note',
      title: title.trim(),
      body: body.trim() || null,
    }))
    if (rows.length === 0) { setBusy(false); onError('No recipients found.'); return }
    const { error: e2 } = await supabase.from('notifications').insert(rows)
    setBusy(false)
    if (e2) { onError(e2.message); return }
    setTitle(''); setBody(''); setSent(true); setTimeout(() => setSent(false), 2500)
  }

  return (
    <Card>
      <CardHeader
        title="Send a note"
        sub="Appears at the top of each recipient's dashboard until they acknowledge it"
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g., 'Journal Club moved to Friday')"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          <select value={audience} onChange={(e) => setAudience(e.target.value as 'fellow' | 'all')}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="fellow">Fellows only</option>
            <option value="all">Everyone</option>
          </select>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Details (optional)"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        <button onClick={send} disabled={busy || !title.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Sending…' : sent ? 'Sent ✓' : 'Send note'}
        </button>
      </div>
    </Card>
  )
}

function WaveformAllocation({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<{ name: string; weight: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'waveform_allocation').maybeSingle()
      .then(({ data }) => {
        const v = (data?.value as Record<string, number>) ?? {}
        setRows(Object.entries(v).map(([name, weight]) => ({ name, weight })))
      })
  }, [])

  async function save() {
    setBusy(true)
    const value: Record<string, number> = {}
    for (const r of rows) if (r.name.trim() && r.weight > 0) value[r.name.trim()] = r.weight
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'waveform_allocation', value, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) { onError(error.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader
        title="Waveform Rounds allocation"
        sub="Relative share of Waveform Rounds each provider is auto-assigned per rotation cycle. The cycle repeats after the weights are used up (e.g., 6 : 6 : 1 ≈ one session per ~6 months for the weight-1 provider)."
      />
      <div className="space-y-2 px-5 py-4">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={r.name}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
            <input value={r.weight}
              onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, weight: parseInt(e.target.value.replace(/\D/g, ''), 10) || 0 } : x))}
              inputMode="numeric"
              className="w-20 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))}
              className="text-xs font-medium text-muted hover:text-ink">Remove</button>
          </div>
        ))}
        <div className="flex gap-3 pt-1">
          <button onClick={() => setRows([...rows, { name: '', weight: 1 }])}
            className="text-sm font-medium text-accent hover:underline">+ Add provider</button>
          <button onClick={save} disabled={busy}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save allocation'}
          </button>
        </div>
      </div>
    </Card>
  )
}

function PubmedTerms({ onError }: { onError: (m: string) => void }) {
  const [terms, setTerms] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'pubmed_terms').maybeSingle()
      .then(({ data }) => setTerms(((data?.value as string[]) ?? [])))
  }, [])

  async function save(next: string[]) {
    setTerms(next)
    setBusy(true)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'pubmed_terms', value: next, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) { onError(error.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader
        title="Interesting reads — PubMed search terms"
        sub="The dashboard feed refreshes weekly with recent publications matching any of these terms"
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {terms.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink">
              {t}
              <button onClick={() => save(terms.filter((x) => x !== t))} className="text-muted hover:text-ink">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { save([...terms, draft.trim()]); setDraft('') } }}
            placeholder="Add a search term and press Enter"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <p className="text-xs text-muted">{busy ? 'Saving…' : saved ? 'Saved ✓' : ' '}</p>
      </div>
    </Card>
  )
}

function RequestAwayDates({ onError }: { onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<number | null>(null)

  async function push() {
    setBusy(true)
    const { data, error } = await supabase.rpc('request_vacation_submissions')
    setBusy(false)
    if (error) { onError(error.message); return }
    setResult(data as number)
  }

  return (
    <Card>
      <CardHeader
        title="Request away dates"
        sub="Emails all active providers and fellows asking them to submit vacation and away dates in the portal, so the next clinic and teaching schedules can be built around them. Sends at most once per person per day."
      />
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={push} disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Sending\u2026' : 'Email everyone now'}
        </button>
        {result !== null && <span className="text-sm text-muted">Queued for {result} people \u2713</span>}
      </div>
    </Card>
  )
}
