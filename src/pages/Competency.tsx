import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import {
  cohortYears, DIAGNOSIS_CATEGORIES,
  NCS_COMMON, NCS_INFREQUENT, RNS_SITES, SFEMG_SITES, EMG_MUSCLES,
} from '../lib/caseOptions'

interface Target {
  id: string
  cohort_year: string | null
  fellow_id: string | null
  metric_key: string
  metric_label: string
  metric_kind: string
  target_value: number
  sort_order: number | null
}

interface CaseRow {
  ncs_count: number | null
  emg_count: number | null
  rns_count: number | null
  sfemg_count: number | null
  nerves_tested: { common?: string[]; infrequent?: string[]; rns?: string[]; sfemg?: string[] } | null
  muscles_tested: string[] | null
  diagnoses: { category: string }[] | null
}

interface FellowOpt { id: string; full_name: string }

const METRIC_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: 'Totals',
    options: [
      { value: 'cases_total', label: 'Total cases logged' },
      { value: 'ncs_total', label: 'Nerve conduction studies (total)' },
      { value: 'emg_total', label: 'EMG muscles sampled (total)' },
      { value: 'rns_total', label: 'Repetitive nerve stimulation (total)' },
      { value: 'sfemg_total', label: 'Single fiber EMG (total)' },
    ],
  },
  { label: 'Nerve conduction — common protocol', options: NCS_COMMON.map((n) => ({ value: `ncs:${n}`, label: n })) },
  { label: 'Nerve conduction — infrequent nerves', options: NCS_INFREQUENT.map((n) => ({ value: `ncs:${n}`, label: n })) },
  { label: 'Repetitive nerve stimulation', options: RNS_SITES.map((n) => ({ value: `rns:${n}`, label: n })) },
  { label: 'Single fiber EMG', options: SFEMG_SITES.map((n) => ({ value: `sfemg:${n}`, label: n })) },
  ...EMG_MUSCLES.map((g) => ({
    label: `EMG muscles — ${g.group}`,
    options: g.muscles.map((m) => ({ value: `emg:${m}`, label: m })),
  })),
  { label: 'Diagnosis', options: DIAGNOSIS_CATEGORIES.map((d) => ({ value: `diagnosis:${d}`, label: `Cases: ${d}` })) },
]

function ProgressBar({ done, goal }: { done: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0
  const met = done >= goal
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-paper sm:w-40">
        <div className={`h-full rounded-full transition-all ${met ? 'bg-accent' : 'bg-accent/70'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-12 shrink-0 text-right text-sm tabular-nums ${met ? 'font-semibold text-accent' : 'text-muted'}`}>
        {done}/{goal}
      </span>
    </div>
  )
}

function countsFromCases(rows: CaseRow[]): Record<string, number> {
  const c: Record<string, number> = {}
  const bump = (k: string, by = 1) => { c[k] = (c[k] ?? 0) + by }
  let total = 0
  for (const r of rows) {
    total += 1
    const nt = r.nerves_tested ?? {}
    for (const x of nt.common ?? []) bump(`ncs:${x}`)
    for (const x of nt.infrequent ?? []) bump(`ncs:${x}`)
    for (const x of nt.rns ?? []) bump(`rns:${x}`)
    for (const x of nt.sfemg ?? []) bump(`sfemg:${x}`)
    for (const m of r.muscles_tested ?? []) bump(`emg:${m}`)
    for (const d of r.diagnoses ?? []) if (d?.category) bump(`diagnosis:${d.category}`)
    bump('ncs_total', r.ncs_count ?? ((nt.common?.length ?? 0) + (nt.infrequent?.length ?? 0)))
    bump('emg_total', r.emg_count ?? (r.muscles_tested?.length ?? 0))
    bump('rns_total', r.rns_count ?? (nt.rns?.length ?? 0))
    bump('sfemg_total', r.sfemg_count ?? (nt.sfemg?.length ?? 0))
  }
  c['cases_total'] = total
  return c
}

function ProgressTable({ counts, byKind }: { counts: Record<string, number>; byKind: Map<string, Target> }) {
  if (byKind.size === 0) {
    return <p className="px-5 py-4 text-sm text-muted">No minimums have been set yet.</p>
  }
  return (
    <div className="px-5 py-3">
      {METRIC_GROUPS.map((g) => {
        const rows = g.options.filter((o) => byKind.has(o.value))
        if (rows.length === 0) return null
        return (
          <div key={g.label} className="mb-4 last:mb-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
            <div className="divide-y divide-line">
              {rows.map((o) => {
                const t = byKind.get(o.value)!
                return (
                  <div key={o.value} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.metric_label}</span>
                    <ProgressBar done={counts[o.value] ?? 0} goal={t.target_value} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Competency() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const isFellow = profile?.role === 'fellow'
  const [targets, setTargets] = useState<Target[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data: t, error } = await supabase.from('competency_targets').select('*')
    if (error) setMsg(error.message)
    setTargets((t as Target[]) ?? [])

    if (isFellow && profile) {
      const { data: rows } = await supabase
        .from('cases')
        .select('ncs_count, emg_count, rns_count, sfemg_count, nerves_tested, muscles_tested, diagnoses')
        .eq('fellow_id', profile.id)
      setCounts(countsFromCases((rows as CaseRow[]) ?? []))
    }
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null

  const myTargets = targets.filter(
    (t) => t.fellow_id === profile.id || (!t.fellow_id && (!t.cohort_year || t.cohort_year === profile.cohort_year))
  )
  const myByKind = new Map(myTargets.map((t) => [t.metric_kind, t]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Competency</h1>
        <p className="mt-1 text-sm text-muted">
          {isFellow ? 'Your progress toward the minimums set by the fellowship' : 'Set minimums and review each fellow\u2019s progress'}
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {isFellow && (
        <Card>
          <CardHeader title="Your progress" sub="Computed from your logged cases" />
          <ProgressTable counts={counts} byKind={myByKind} />
        </Card>
      )}

      {isDirector && <FellowProgress targets={targets} onError={setMsg} />}
      {isDirector && <MinimumsTable targets={targets} onChanged={load} onError={setMsg} />}
    </div>
  )
}

function FellowProgress({ targets, onError }: { targets: Target[]; onError: (m: string) => void }) {
  const [fellows, setFellows] = useState<FellowOpt[]>([])
  const [fellowId, setFellowId] = useState('')
  const [cohortYear, setCohortYear] = useState<string | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.rpc('list_fellows').then(({ data }) => setFellows((data as FellowOpt[]) ?? []))
  }, [])

  async function pick(id: string) {
    setFellowId(id)
    setCounts({})
    if (!id) return
    setLoading(true)
    // cohort of this fellow (for matching cohort-level targets)
    const { data: u } = await supabase.from('users').select('cohort_year').eq('id', id).maybeSingle()
    setCohortYear((u?.cohort_year as string | null) ?? null)
    const { data, error } = await supabase.rpc('fellow_competency_counts', { p_fellow: id })
    setLoading(false)
    if (error) { onError(error.message); return }
    const c: Record<string, number> = {}
    for (const row of (data as { metric_kind: string; n: number }[]) ?? []) c[row.metric_kind] = Number(row.n)
    setCounts(c)
  }

  const applicable = targets.filter(
    (t) => t.fellow_id === fellowId || (!t.fellow_id && (!t.cohort_year || t.cohort_year === cohortYear))
  )
  const byKind = new Map(applicable.map((t) => [t.metric_kind, t]))

  return (
    <Card>
      <CardHeader title="Fellow progress" sub="Select a fellow to see their progress toward each minimum" />
      <div className="px-5 pt-4">
        <label className="mb-1 block text-xs font-medium text-muted">Fellow</label>
        <select value={fellowId} onChange={(e) => pick(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
          <option value="">— choose a fellow —</option>
          {fellows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
        </select>
      </div>
      {fellowId && (loading
        ? <p className="px-5 py-4 text-sm text-muted">Loading…</p>
        : <ProgressTable counts={counts} byKind={byKind} />)}
    </Card>
  )
}

function MinimumsTable({ targets, onChanged, onError }: { targets: Target[]; onChanged: () => void; onError: (m: string) => void }) {
  const [cohort, setCohort] = useState('')

  const byKind = new Map(
    targets.filter((t) => (t.cohort_year ?? '') === cohort && !t.fellow_id).map((t) => [t.metric_kind, t])
  )

  async function setMinimum(kind: string, label: string, raw: string) {
    const v = parseInt(raw, 10)
    const existing = byKind.get(kind)
    if (!raw.trim() || !v || v < 1) {
      if (existing) { await supabase.from('competency_targets').delete().eq('id', existing.id); onChanged() }
      return
    }
    if (existing) {
      await supabase.from('competency_targets').update({ target_value: v, metric_label: label }).eq('id', existing.id)
    } else {
      const { error } = await supabase.from('competency_targets').insert({
        cohort_year: cohort || null,
        metric_key: `${cohort || 'all'}:${kind}`,
        metric_label: label,
        metric_kind: kind,
        target_value: v,
        sort_order: 0,
      })
      if (error) { onError(error.message); return }
    }
    onChanged()
  }

  return (
    <Card>
      <CardHeader
        title="Set minimums"
        sub="Type a target next to any component — individual nerves, muscles, studies, or diagnoses. Leave blank for no minimum. Each fellow sees these as progress bars."
      />
      <div className="px-5 py-4">
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-muted">Cohort</label>
          <select value={cohort} onChange={(e) => setCohort(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="">All cohorts</option>
            {cohortYears().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {METRIC_GROUPS.map((g) => (
          <div key={g.label} className="mb-5 last:mb-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</p>
            <div className="divide-y divide-line">
              {g.options.map((o) => {
                const existing = byKind.get(o.value)
                return (
                  <div key={o.value} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{o.label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      defaultValue={existing ? String(existing.target_value) : ''}
                      key={`${o.value}-${cohort}-${existing?.target_value ?? 'x'}`}
                      onBlur={(e) => setMinimum(o.value, o.label, e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="—"
                      className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-right text-sm text-ink"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
