import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { cohortYears, DIAGNOSIS_CATEGORIES } from '../lib/caseOptions'

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

interface CaseAgg {
  ncs: number; emg: number; rns: number; sfemg: number; total: number
  byDiagnosis: Record<string, number>
}

const METRIC_KINDS = [
  { value: 'cases_total', label: 'Total cases logged' },
  { value: 'ncs_total', label: 'Nerve conduction studies (total)' },
  { value: 'emg_total', label: 'EMG muscles sampled (total)' },
  { value: 'rns_total', label: 'Repetitive nerve stimulation (total)' },
  { value: 'sfemg_total', label: 'Single fiber EMG (total)' },
  ...DIAGNOSIS_CATEGORIES.map((d) => ({ value: `diagnosis:${d}`, label: `Cases: ${d}` })),
]

export default function Competency() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const isFellow = profile?.role === 'fellow'
  const [targets, setTargets] = useState<Target[]>([])
  const [agg, setAgg] = useState<CaseAgg | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data: t, error } = await supabase
      .from('competency_targets')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
    if (error) setMsg(error.message)
    setTargets((t as Target[]) ?? [])

    if (isFellow && profile) {
      const { data: rows } = await supabase
        .from('cases')
        .select('ncs_count, emg_count, rns_count, sfemg_count, diagnoses')
        .eq('fellow_id', profile.id)
      const a: CaseAgg = { ncs: 0, emg: 0, rns: 0, sfemg: 0, total: 0, byDiagnosis: {} }
      for (const r of rows ?? []) {
        a.total += 1
        a.ncs += r.ncs_count ?? 0
        a.emg += r.emg_count ?? 0
        a.rns += r.rns_count ?? 0
        a.sfemg += r.sfemg_count ?? 0
        for (const d of (r.diagnoses as { category: string }[]) ?? []) {
          if (d?.category) a.byDiagnosis[d.category] = (a.byDiagnosis[d.category] ?? 0) + 1
        }
      }
      setAgg(a)
    }
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function achieved(kind: string): number {
    if (!agg) return 0
    if (kind === 'cases_total') return agg.total
    if (kind === 'ncs_total') return agg.ncs
    if (kind === 'emg_total') return agg.emg
    if (kind === 'rns_total') return agg.rns
    if (kind === 'sfemg_total') return agg.sfemg
    if (kind.startsWith('diagnosis:')) return agg.byDiagnosis[kind.slice('diagnosis:'.length)] ?? 0
    return 0
  }

  const myTargets = isFellow && profile
    ? targets.filter((t) => (t.fellow_id === profile.id) || (!t.fellow_id && (!t.cohort_year || t.cohort_year === profile.cohort_year)))
    : targets

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Competency</h1>
        <p className="mt-1 text-sm text-muted">
          {isFellow ? 'Your progress toward the minimums set by the fellowship' : 'Program minimums by cohort'}
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
          {myTargets.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">
              No minimums have been set for your cohort yet — the fellowship director configures these.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {myTargets.map((t) => {
                const done = achieved(t.metric_kind)
                const pct = t.target_value > 0 ? Math.min(100, Math.round((done / t.target_value) * 100)) : 0
                return (
                  <li key={t.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-ink">{t.metric_label}</span>
                      <span className={done >= t.target_value ? 'font-semibold text-accent' : 'text-muted'}>
                        {done} / {t.target_value}{done >= t.target_value ? ' ✓' : ''}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-paper">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {isDirector && <TargetEditor targets={targets} onChanged={load} onError={setMsg} />}
    </div>
  )
}

function TargetEditor({ targets, onChanged, onError }: { targets: Target[]; onChanged: () => void; onError: (m: string) => void }) {
  const [cohort, setCohort] = useState(cohortYears()[2] ?? '')
  const [kind, setKind] = useState('cases_total')
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const v = parseInt(value, 10)
    if (!label.trim() || !v || v < 1) { onError('A label and a target of at least 1 are required.'); return }
    setBusy(true)
    const { error } = await supabase.from('competency_targets').insert({
      cohort_year: cohort || null,
      metric_key: `${kind}:${Date.now()}`,
      metric_label: label.trim(),
      metric_kind: kind,
      target_value: v,
      sort_order: targets.length + 1,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    setLabel(''); setValue(''); onChanged()
  }

  async function remove(id: string) {
    await supabase.from('competency_targets').delete().eq('id', id)
    onChanged()
  }

  async function updateValue(t: Target, v: string) {
    const n = parseInt(v, 10)
    if (!n || n < 1) return
    await supabase.from('competency_targets').update({ target_value: n }).eq('id', t.id)
    onChanged()
  }

  return (
    <Card>
      <CardHeader title="Set minimums" sub="These drive each fellow's progress view. Metrics compute from logged cases." />
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Cohort</label>
            <select value={cohort} onChange={(e) => setCohort(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="">All cohorts</option>
              {cohortYears().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Metric</label>
            <select value={kind} onChange={(e) => { setKind(e.target.value); const m = METRIC_KINDS.find((x) => x.value === e.target.value); if (m) setLabel(m.label) }}
              className="max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {METRIC_KINDS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Display label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g., Total EMG cases"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Minimum</label>
            <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
              className="w-24 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <button onClick={add} disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            Add
          </button>
        </div>

        {targets.length > 0 && (
          <ul className="divide-y divide-line">
            {targets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-ink">{t.metric_label}</span>
                  <span className="ml-2 text-muted">{t.cohort_year ?? 'All cohorts'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    defaultValue={t.target_value}
                    onBlur={(e) => updateValue(t, e.target.value)}
                    inputMode="numeric"
                    className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                  />
                  <button onClick={() => remove(t.id)} className="text-xs font-medium text-muted hover:text-ink">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
