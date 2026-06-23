import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ChipsInput } from './ui/ChipsInput'
import { PROCEDURE_METRICS, DIAGNOSIS_SUGGESTIONS, NERVE_SUGGESTIONS, MUSCLE_SUGGESTIONS } from '../lib/nm'
import type { CaseRow } from '../types/database'

type Draft = Partial<CaseRow>

const FIELD = 'mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft'

export function CaseForm({
  existing, onClose, onSaved,
}: {
  existing?: CaseRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const { session } = useAuth()
  const [d, setD] = useState<Draft>(
    existing ?? {
      case_date: new Date().toISOString().slice(0, 10),
      title: '', visibility: 'private',
      nerves_tested: [], muscles_tested: [], diagnoses: [],
      ncs_count: 0, emg_count: 0, rns_count: 0, sfemg_count: 0,
    },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Draft>(k: K, v: Draft[K]) { setD((p) => ({ ...p, [k]: v })) }

  async function save() {
    if (!d.title?.trim() || !d.case_date) { setError('A title and date are required.'); return }
    setBusy(true); setError(null)
    const payload = {
      fellow_id: session!.user.id,
      case_date: d.case_date,
      title: d.title.trim(),
      age: d.age ?? null,
      sex: d.sex ?? null,
      presentation: d.presentation ?? null,
      nerves_tested: d.nerves_tested ?? [],
      muscles_tested: d.muscles_tested ?? [],
      diagnoses: d.diagnoses ?? [],
      ncs_count: d.ncs_count ?? 0,
      emg_count: d.emg_count ?? 0,
      rns_count: d.rns_count ?? 0,
      sfemg_count: d.sfemg_count ?? 0,
      summary: d.summary ?? null,
      teaching_points: d.teaching_points ?? null,
      visibility: d.visibility ?? 'private',
      updated_at: new Date().toISOString(),
    }
    const res = existing
      ? await supabase.from('cases').update(payload).eq('id', existing.id)
      : await supabase.from('cases').insert(payload)
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-lg bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{existing ? 'Edit case' : 'New case'}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">×</button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-ink">Title</span>
              <input className={FIELD} value={d.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Bilateral CTS work-up" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">Date</span>
              <input type="date" className={FIELD} value={d.case_date ?? ''} onChange={(e) => set('case_date', e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-ink">Age</span>
                <input type="number" className={FIELD} value={d.age ?? ''} onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Sex</span>
                <input className={FIELD} value={d.sex ?? ''} onChange={(e) => set('sex', e.target.value)} />
              </label>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-ink">Presentation</span>
            <textarea rows={2} className={FIELD} value={d.presentation ?? ''} onChange={(e) => set('presentation', e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PROCEDURE_METRICS.map((m) => (
              <label key={m.key} className="block">
                <span className="text-xs font-medium text-muted">{m.label}</span>
                <input
                  type="number" min={0} className={`${FIELD} nums`}
                  value={(d[m.column] as number) ?? 0}
                  onChange={(e) => set(m.column as keyof Draft, Math.max(0, Number(e.target.value)) as never)}
                />
              </label>
            ))}
          </div>

          <ChipsInput label="Nerves tested" values={d.nerves_tested ?? []} onChange={(v) => set('nerves_tested', v)} suggestions={NERVE_SUGGESTIONS} placeholder="type and press Enter" />
          <ChipsInput label="Muscles tested" values={d.muscles_tested ?? []} onChange={(v) => set('muscles_tested', v)} suggestions={MUSCLE_SUGGESTIONS} placeholder="type and press Enter" />
          <ChipsInput label="Diagnoses" values={d.diagnoses ?? []} onChange={(v) => set('diagnoses', v)} suggestions={DIAGNOSIS_SUGGESTIONS} placeholder="type and press Enter" />

          <label className="block">
            <span className="text-sm font-medium text-ink">Summary</span>
            <textarea rows={3} className={FIELD} value={d.summary ?? ''} onChange={(e) => set('summary', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Teaching points</span>
            <textarea rows={2} className={FIELD} value={d.teaching_points ?? ''} onChange={(e) => set('teaching_points', e.target.value)} />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={d.visibility === 'shared'}
              onChange={(e) => set('visibility', e.target.checked ? 'shared' : 'private')}
            />
            <span className="text-sm text-ink">Share with supervisors &amp; directors for feedback</span>
          </label>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:text-ink">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save case'}
          </button>
        </div>
      </div>
    </div>
  )
}
