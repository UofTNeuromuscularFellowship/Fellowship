import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate } from '../lib/format'
import {
  NCS_COMMON, NCS_INFREQUENT, RNS_SITES, SFEMG_SITES, EMG_MUSCLES, DIAGNOSIS_CATEGORIES,
} from '../lib/caseOptions'

interface CaseRow {
  id: string
  case_date: string
  title: string | null
  nerves_tested: { common?: string[]; infrequent?: string[]; rns?: string[]; sfemg?: string[] } | null
  muscles_tested: string[] | null
  diagnoses: { category: string; subtype: string | null }[] | null
  summary: string | null
}

interface InterestingCase {
  id: string
  reference_label: string
  encounter_date: string
  provider_name: string | null
  follow_up: string | null
  resolved: boolean
}

function Chip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function ChipGroup({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void
}) {
  function toggle(o: string) {
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o])
  }
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => <Chip key={o} label={o} active={selected.includes(o)} onToggle={() => toggle(o)} />)}
      </div>
    </div>
  )
}

export default function Cases() {
  const { profile } = useAuth()
  const isFellow = profile?.role === 'fellow'
  const [cases, setCases] = useState<CaseRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CaseRow | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('cases')
      .select('id, case_date, title, nerves_tested, muscles_tested, diagnoses, summary')
      .order('case_date', { ascending: false })
      .limit(100)
    if (error) setMsg(error.message)
    setCases((data as CaseRow[]) ?? [])
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Case logger</h1>
          <p className="mt-1 text-sm text-muted">Log electrodiagnostic cases with structured study details</p>
        </div>
        {isFellow && (
          <button
            onClick={() => { setEditing(null); setShowForm(!showForm) }}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {showForm ? 'Close form' : '+ Log a case'}
          </button>
        )}
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {(showForm || editing) && (
        <CaseForm
          fellowId={profile.id}
          existing={editing}
          onDone={() => { setShowForm(false); setEditing(null); load() }}
          onError={setMsg}
        />
      )}

      <Card>
        <CardHeader title="Logged cases" sub={`${cases.length} most recent`} />
        {cases.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No cases logged yet. Use "+ Log a case" to get started.</p>
        ) : (
          <ul className="divide-y divide-line">
            {cases.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-ink">{c.title ?? 'Untitled case'}</span>
                  <span className="text-muted">{formatDate(c.case_date)}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {[
                    (c.diagnoses ?? []).map((d) => d.subtype ? `${d.category} — ${d.subtype}` : d.category).join('; '),
                    (c.muscles_tested?.length ?? 0) > 0 ? `${c.muscles_tested!.length} muscles` : null,
                  ].filter(Boolean).join(' · ') || 'No study details yet'}
                  {isFellow && (
                    <button className="ml-2 font-medium text-accent hover:underline" onClick={() => { setEditing(c); setShowForm(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                      Edit
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isFellow && <InterestingCases fellowId={profile.id} onError={setMsg} />}
    </div>
  )
}

function CaseForm({ fellowId, existing, onDone, onError }: {
  fellowId: string; existing: CaseRow | null; onDone: () => void; onError: (m: string) => void
}) {
  const [date, setDate] = useState(existing?.case_date ?? new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState(existing?.title ?? '')
  const [ncsCommon, setNcsCommon] = useState<string[]>(existing?.nerves_tested?.common ?? [])
  const [ncsInfrequent, setNcsInfrequent] = useState<string[]>(existing?.nerves_tested?.infrequent ?? [])
  const [rns, setRns] = useState<string[]>(existing?.nerves_tested?.rns ?? [])
  const [sfemg, setSfemg] = useState<string[]>(existing?.nerves_tested?.sfemg ?? [])
  const [muscles, setMuscles] = useState<string[]>(existing?.muscles_tested ?? [])
  const [diagCategory, setDiagCategory] = useState(existing?.diagnoses?.[0]?.category ?? '')
  const [diagSubtype, setDiagSubtype] = useState(existing?.diagnoses?.[0]?.subtype ?? '')
  const [summary, setSummary] = useState(existing?.summary ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const payload = {
      fellow_id: fellowId,
      case_date: date,
      title: title.trim() || null,
      nerves_tested: { common: ncsCommon, infrequent: ncsInfrequent, rns, sfemg },
      muscles_tested: muscles,
      diagnoses: diagCategory ? [{ category: diagCategory, subtype: diagSubtype.trim() || null }] : [],
      ncs_count: ncsCommon.length + ncsInfrequent.length,
      emg_count: muscles.length,
      rns_count: rns.length,
      sfemg_count: sfemg.length,
      summary: summary.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const q = existing
      ? supabase.from('cases').update(payload).eq('id', existing.id)
      : supabase.from('cases').insert(payload)
    const { error } = await q
    setBusy(false)
    if (error) onError(error.message)
    else onDone()
  }

  return (
    <Card>
      <CardHeader title={existing ? 'Edit case' : 'New case'} sub="No patient identifiers — use a brief descriptive title only" />
      <div className="space-y-5 px-5 py-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Progressive weakness, EMG for MND vs myopathy"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
        </div>

        <ChipGroup label="Nerve conduction — common protocol" options={NCS_COMMON} selected={ncsCommon} onChange={setNcsCommon} />
        <ChipGroup label="Nerve conduction — infrequent nerves" options={NCS_INFREQUENT} selected={ncsInfrequent} onChange={setNcsInfrequent} />
        <ChipGroup label="Repetitive nerve stimulation" options={RNS_SITES} selected={rns} onChange={setRns} />
        <ChipGroup label="Single fiber electromyography" options={SFEMG_SITES} selected={sfemg} onChange={setSfemg} />

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Electromyography — muscles sampled</p>
          <div className="space-y-3">
            {EMG_MUSCLES.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-xs font-medium text-muted">{g.group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.muscles.map((m) => (
                    <Chip key={m} label={m} active={muscles.includes(m)}
                      onToggle={() => setMuscles(muscles.includes(m) ? muscles.filter((x) => x !== m) : [...muscles, m])} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Diagnosis</label>
            <select value={diagCategory} onChange={(e) => setDiagCategory(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="">Select diagnosis…</option>
              {DIAGNOSIS_CATEGORIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Subtype (free text, optional)</label>
            <input value={diagSubtype} onChange={(e) => setDiagSubtype(e.target.value)}
              placeholder={diagCategory === 'Motor neuron disease' ? 'e.g., ALS' : 'e.g., subtype or qualifier'}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Summary / teaching points (optional)</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>

        <button onClick={save} disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Save case'}
        </button>
      </div>
    </Card>
  )
}

function InterestingCases({ fellowId, onError }: { fellowId: string; onError: (m: string) => void }) {
  const [items, setItems] = useState<InterestingCase[]>([])
  const [ref, setRef] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [provider, setProvider] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('interesting_cases')
      .select('id, reference_label, encounter_date, provider_name, follow_up, resolved')
      .order('encounter_date', { ascending: false })
    setItems((data as InterestingCase[]) ?? [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!ref.trim()) return
    setBusy(true)
    const { error } = await supabase.from('interesting_cases').insert({
      fellow_id: fellowId,
      reference_label: ref.trim(),
      encounter_date: date,
      provider_name: provider.trim() || null,
      follow_up: followUp.trim() || null,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    setRef(''); setProvider(''); setFollowUp(''); load()
  }

  async function toggleResolved(item: InterestingCase) {
    await supabase.from('interesting_cases').update({ resolved: !item.resolved }).eq('id', item.id)
    load()
  }

  return (
    <Card>
      <CardHeader
        title="Interesting cases to follow up"
        sub="Use a non-identifying reference you'll recognize — no MRNs, names, initials, or dates of birth"
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference (e.g., 'SMH Tues — suspected MMN')"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Provider seen with"
            className="w-44 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="What do you want to follow up on?"
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          <button onClick={add} disabled={busy || !ref.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            Add
          </button>
        </div>
        {items.length > 0 && (
          <ul className="divide-y divide-line pt-1">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className={it.resolved ? 'opacity-50' : ''}>
                  <p className="font-medium text-ink">{it.reference_label}</p>
                  <p className="text-muted">
                    {[formatDate(it.encounter_date), it.provider_name, it.follow_up].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button onClick={() => toggleResolved(it)} className="shrink-0 text-xs font-medium text-accent hover:underline">
                  {it.resolved ? 'Reopen' : 'Mark done'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
