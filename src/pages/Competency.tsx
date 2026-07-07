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

// Grouped metric options — each individual component is selectable, plus totals & diagnoses.
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

const METRIC_LABEL: Record<string, string> = {}
for (const g of METRIC_GROUPS) for (const o of g.options) METRIC_LABEL[o.value] = o.label

export default function Competency() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const isFellow = profile?.role === 'fellow'
  const [targets, setTargets] = useState<Target[]>([])
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
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
        .select('ncs_count, emg_count, rns_count, sfemg_count, nerves_tested, muscles_tested, diagnoses')
        .eq('fellow_id', profile.id)
      const c: Record<string, number> = {}
      const bump = (k: string, by = 1) => { c[k] = (c[k] ?? 0) + by }
      let total = 0
      for (const r of (rows as CaseRow[]) ?? []) {
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
      setCounts(c)
    }
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const achieved = (kind: string) => counts?.[kind] ?? 0

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
  const [label, setLabel] = useState('Total cases logged')
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
    setValue(''); onChanged()
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
      <CardHeader
        title="Set minimums"
        sub="Set a target for any individual nerve, muscle, study, or diagnosis — or an overall total. Progress computes from each fellow's logged cases."
      />
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
            <label className="mb-1 block text-xs font-medium text-muted">Component</label>
            <select value={kind}
              onChange={(e) => { setKind(e.target.value); setLabel(METRIC_LABEL[e.target.value] ?? '') }}
              className="max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {METRIC_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Display label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
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
