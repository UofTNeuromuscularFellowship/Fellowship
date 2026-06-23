import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from './ui/Card'
import { PROCEDURE_METRICS } from '../lib/nm'
import type { CompetencyTarget } from '../types/database'

const FIELD = 'rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft'

export function TargetEditor({ cohortYear }: { cohortYear: string }) {
  const [targets, setTargets] = useState<CompetencyTarget[]>([])
  const [loading, setLoading] = useState(true)

  // new-row draft
  const [kind, setKind] = useState<'procedural' | 'disease'>('procedural')
  const [key, setKey] = useState('ncs')
  const [label, setLabel] = useState('Nerve conduction studies')
  const [value, setValue] = useState(100)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('competency_targets')
      .select('*')
      .eq('cohort_year', cohortYear)
      .is('fellow_id', null)
      .order('sort_order', { ascending: true })
    setTargets((data as CompetencyTarget[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { if (cohortYear) load() }, [cohortYear])

  async function add() {
    setError(null)
    if (!key.trim() || !label.trim()) { setError('Key and label are required.'); return }
    const { error } = await supabase.from('competency_targets').insert({
      cohort_year: cohortYear, fellow_id: null,
      metric_key: key.trim().toLowerCase(), metric_label: label.trim(),
      metric_kind: kind, target_value: value, sort_order: targets.length,
    })
    if (error) { setError(error.message); return }
    setLabel(''); setValue(0); load()
  }

  async function updateValue(id: string, v: number) {
    setTargets((p) => p.map((t) => (t.id === id ? { ...t, target_value: v } : t)))
    await supabase.from('competency_targets').update({ target_value: v }).eq('id', id)
  }

  async function remove(id: string) {
    await supabase.from('competency_targets').delete().eq('id', id)
    load()
  }

  return (
    <Card>
      <CardHeader title="Cohort targets" sub={`Defaults applied to every fellow in ${cohortYear}`} />
      <div className="px-5 py-4">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : targets.length === 0 ? (
          <p className="text-sm text-muted">No targets set for this cohort yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {targets.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-sm text-ink">
                  {t.metric_label}
                  <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] uppercase text-muted">{t.metric_kind}</span>
                </span>
                <input
                  type="number" min={0}
                  className={`${FIELD} w-24 nums`}
                  value={t.target_value}
                  onChange={(e) => updateValue(t.id, Math.max(0, Number(e.target.value)))}
                />
                <button onClick={() => remove(t.id)} className="text-sm text-red-600 hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Add a target</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs text-muted">Type</span>
              <select
                className={`${FIELD} mt-1 block`}
                value={kind}
                onChange={(e) => {
                  const k = e.target.value as 'procedural' | 'disease'
                  setKind(k)
                  if (k === 'procedural') { setKey('ncs'); setLabel('Nerve conduction studies') }
                  else { setKey(''); setLabel('') }
                }}
              >
                <option value="procedural">Procedural</option>
                <option value="disease">Disease</option>
              </select>
            </label>

            {kind === 'procedural' ? (
              <label className="block">
                <span className="text-xs text-muted">Procedure</span>
                <select
                  className={`${FIELD} mt-1 block`}
                  value={key}
                  onChange={(e) => {
                    const m = PROCEDURE_METRICS.find((x) => x.key === e.target.value)!
                    setKey(m.key); setLabel(m.label)
                  }}
                >
                  {PROCEDURE_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="text-xs text-muted">Diagnosis tag</span>
                <input className={`${FIELD} mt-1 block`} value={key} onChange={(e) => { setKey(e.target.value); setLabel(e.target.value) }} placeholder="e.g. ALS" />
              </label>
            )}

            <label className="block">
              <span className="text-xs text-muted">Target</span>
              <input type="number" min={0} className={`${FIELD} mt-1 block w-24 nums`} value={value} onChange={(e) => setValue(Math.max(0, Number(e.target.value)))} />
            </label>

            <button onClick={add} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">Add</button>
          </div>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </Card>
  )
}
