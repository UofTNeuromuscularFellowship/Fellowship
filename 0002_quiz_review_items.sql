import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'

interface Evaluation {
  id: string
  supervisor_id: string
  fellow_id: string
  period_label: string
  strengths: string | null
  areas_for_improvement: string | null
  overall_rating: number | null
  submitted_at: string
  fellow_viewed_at: string | null
}

interface Person { id: string; full_name: string }

function currentPeriods(): string[] {
  const periods: string[] = []
  const quarters = [['Jul', 'Sep'], ['Oct', 'Dec'], ['Jan', 'Mar'], ['Apr', 'Jun']]
  const now = new Date()
  for (let back = 0; back < 4; back++) {
    const d = new Date(now); d.setMonth(now.getMonth() - back * 3)
    const q = Math.floor(((d.getMonth() + 6) % 12) / 3)
    const year = d.getFullYear()
    periods.push(`${quarters[q][0]}–${quarters[q][1]} ${year}`)
  }
  return Array.from(new Set(periods))
}

export default function Evaluations() {
  const { profile } = useAuth()
  const role = profile?.role
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (error) setMsg(error.message)
    const rows = (data as Evaluation[]) ?? []
    setEvals(rows)
    const ids = Array.from(new Set(rows.flatMap((r) => [r.supervisor_id, r.fellow_id])))
    if (ids.length > 0) {
      try {
        const { data: n } = await supabase.rpc('profile_names', { ids })
        const map: Record<string, string> = {}
        for (const x of (n as Person[]) ?? []) map[x.id] = x.full_name
        setNames(map)
      } catch { /* names optional */ }
    }
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function markViewed(e: Evaluation) {
    await supabase.from('evaluations').update({ fellow_viewed_at: new Date().toISOString() }).eq('id', e.id)
    load()
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Evaluations</h1>
        <p className="mt-1 text-sm text-muted">
          {role === 'supervisor' && 'Formal feedback on fellows every 3 months — submitted evaluations go to the fellowship director and are visible to the fellow.'}
          {role === 'fellow' && 'Formal feedback from your supervisors, submitted every 3 months.'}
          {role === 'director' && 'All formal supervisor evaluations across the program.'}
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {role === 'supervisor' && <EvalForm supervisorId={profile.id} onDone={load} onError={setMsg} />}

      <Card>
        <CardHeader title={role === 'supervisor' ? 'Your submitted evaluations' : 'Evaluations'} />
        {evals.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No evaluations yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {evals.map((e) => (
              <li key={e.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ink">
                    {names[e.fellow_id] ?? 'Fellow'} · {e.period_label}
                    {e.overall_rating ? ` · ${e.overall_rating}/5` : ''}
                  </p>
                  <p className="text-muted">
                    {names[e.supervisor_id] ?? 'Supervisor'} · {new Date(e.submitted_at).toLocaleDateString('en-CA')}
                  </p>
                </div>
                {e.strengths && <p className="mt-1.5 text-ink"><span className="font-medium">Strengths:</span> {e.strengths}</p>}
                {e.areas_for_improvement && <p className="mt-1 text-ink"><span className="font-medium">Areas for growth:</span> {e.areas_for_improvement}</p>}
                {role === 'fellow' && !e.fellow_viewed_at && (
                  <button onClick={() => markViewed(e)} className="mt-2 text-xs font-medium text-accent hover:underline">
                    Mark as reviewed
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function EvalForm({ supervisorId, onDone, onError }: { supervisorId: string; onDone: () => void; onError: (m: string) => void }) {
  const [fellows, setFellows] = useState<Person[]>([])
  const [fellowId, setFellowId] = useState('')
  const [period, setPeriod] = useState(currentPeriods()[0])
  const [strengths, setStrengths] = useState('')
  const [areas, setAreas] = useState('')
  const [rating, setRating] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('list_fellows').then(({ data }) => setFellows((data as Person[]) ?? []))
  }, [])

  async function submit() {
    if (!fellowId) { onError('Choose a fellow to evaluate.'); return }
    setBusy(true)
    const { error } = await supabase.from('evaluations').insert({
      supervisor_id: supervisorId,
      fellow_id: fellowId,
      period_label: period,
      strengths: strengths.trim() || null,
      areas_for_improvement: areas.trim() || null,
      overall_rating: rating || null,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    setStrengths(''); setAreas(''); setRating(0)
    onDone()
  }

  return (
    <Card>
      <CardHeader title="Submit an evaluation" />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Fellow</label>
            <select value={fellowId} onChange={(e) => setFellowId(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="">Select…</option>
              {fellows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {currentPeriods().map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Overall (1–5)</label>
            <div className="flex items-center gap-1 pt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} of 5`}
                  className={`text-lg ${n <= rating ? 'text-accent' : 'text-muted'}`}>★</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Strengths</label>
          <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={3}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Areas for growth</label>
          <textarea value={areas} onChange={(e) => setAreas(e.target.value)} rows={3}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <button onClick={submit} disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Submitting…' : 'Submit evaluation'}
        </button>
      </div>
    </Card>
  )
}
