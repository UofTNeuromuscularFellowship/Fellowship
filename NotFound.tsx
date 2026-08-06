import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate } from '../lib/format'
import {
  NCS_COMMON, NCS_INFREQUENT, RNS_SITES, SFEMG_SITES, EMG_MUSCLES, DIAGNOSIS_CATEGORIES,
  NM_ULTRASOUND_SITES, MUSCLE_BIOPSY_OPTIONS,
} from '../lib/caseOptions'

interface Diagnosis { category: string; subtype: string | null }
interface NervesTested { common?: string[]; infrequent?: string[]; rns?: string[]; sfemg?: string[]; ultrasound?: string[]; biopsy?: string[] }

interface CaseRow {
  id: string
  case_date: string
  title: string | null
  nerves_tested: NervesTested | null
  muscles_tested: string[] | null
  diagnoses: Diagnosis[] | null
  summary: string | null
  supervisor_id: string | null
}

interface SharedCase {
  id: string
  fellow_id: string
  fellow_name: string
  case_date: string
  title: string | null
  nerves_tested: NervesTested | null
  muscles_tested: string[] | null
  diagnoses: Diagnosis[] | null
  summary: string | null
  created_at: string
}

interface Provider { id: string; full_name: string }
interface Feedback { id: string; case_id: string; body: string; author_id: string; created_at: string }

interface InterestingCase {
  id: string
  reference_label: string
  encounter_date: string
  provider_name: string | null
  follow_up: string | null
  resolved: boolean
}

const CASE_SELECT = 'id, case_date, title, nerves_tested, muscles_tested, diagnoses, summary, supervisor_id'

function diagnosisLine(diagnoses: Diagnosis[] | null): string {
  return (diagnoses ?? []).map((d) => (d.subtype ? `${d.category} — ${d.subtype}` : d.category)).join('; ')
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

function FeedbackThread({ items, nameFor }: { items: Feedback[]; nameFor: (id: string) => string }) {
  if (items.length === 0) return null
  return (
    <div className="mt-2 space-y-2 rounded-md border border-line bg-paper/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Supervisor feedback</p>
      {items.map((f) => (
        <div key={f.id} className="text-sm">
          <p className="whitespace-pre-wrap text-ink">{f.body}</p>
          <p className="mt-0.5 text-xs text-muted">{nameFor(f.author_id)} · {formatDate(f.created_at)}</p>
        </div>
      ))}
    </div>
  )
}

export default function Cases() {
  const { profile } = useAuth()
  if (!profile) return null
  if (profile.role === 'fellow') return <FellowCases fellowId={profile.id} />
  if (profile.role === 'supervisor' || profile.role === 'director') {
    return <SupervisorCases userId={profile.id} selfName={profile.full_name ?? 'You'} />
  }
  return null
}

// ---------------------------------------------------------------------------
// Fellow view: log cases, share each with a supervisor, read their feedback.
// ---------------------------------------------------------------------------
function FellowCases({ fellowId }: { fellowId: string }) {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [supervisors, setSupervisors] = useState<Provider[]>([])
  const [feedback, setFeedback] = useState<Record<string, Feedback[]>>({})
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CaseRow | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const nameFor = useMemo(() => {
    const m = new Map(supervisors.map((s) => [s.id, s.full_name]))
    return (id: string) => m.get(id) ?? 'Supervisor'
  }, [supervisors])

  async function load() {
    const { data, error } = await supabase.from('cases').select(CASE_SELECT).order('case_date', { ascending: false }).limit(200)
    if (error) setMsg(error.message)
    const rows = (data as CaseRow[]) ?? []
    setCases(rows)
    const ids = rows.map((r) => r.id)
    if (ids.length) {
      const { data: fb } = await supabase
        .from('case_feedback')
        .select('id, case_id, body, author_id, created_at')
        .in('case_id', ids)
        .order('created_at', { ascending: true })
      const map: Record<string, Feedback[]> = {}
      for (const f of (fb as Feedback[]) ?? []) (map[f.case_id] ??= []).push(f)
      setFeedback(map)
    } else {
      setFeedback({})
    }
  }

  useEffect(() => {
    load()
    supabase.rpc('list_supervisors').then(({ data }: { data: Provider[] | null }) => setSupervisors(data ?? []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Case logger</h1>
          <p className="mt-1 text-sm text-muted">Log electrodiagnostic cases and optionally share one with a supervisor for feedback</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(!showForm) }}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {showForm ? 'Close form' : '+ Log a case'}
        </button>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {(showForm || editing) && (
        <CaseForm
          fellowId={fellowId}
          existing={editing}
          supervisors={supervisors}
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
                  {[diagnosisLine(c.diagnoses), (c.muscles_tested?.length ?? 0) > 0 ? `${c.muscles_tested!.length} muscles` : null]
                    .filter(Boolean).join(' · ') || 'No study details yet'}
                  <button className="ml-2 font-medium text-accent hover:underline" onClick={() => { setEditing(c); setShowForm(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
                    Edit
                  </button>
                </p>
                <p className="mt-0.5 text-xs">
                  {c.supervisor_id ? (
                    <span className="text-accent">Shared with {nameFor(c.supervisor_id)}</span>
                  ) : (
                    <span className="text-muted">Private — not shared</span>
                  )}
                  {(feedback[c.id]?.length ?? 0) > 0 && <span className="ml-2 text-muted">· {feedback[c.id].length} feedback</span>}
                </p>
                <FeedbackThread items={feedback[c.id] ?? []} nameFor={nameFor} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <InterestingCases fellowId={fellowId} onError={setMsg} />
    </div>
  )
}

function CaseForm({ fellowId, existing, supervisors, onDone, onError }: {
  fellowId: string; existing: CaseRow | null; supervisors: Provider[]; onDone: () => void; onError: (m: string) => void
}) {
  const [date, setDate] = useState(existing?.case_date ?? new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState(existing?.title ?? '')
  const [supervisorId, setSupervisorId] = useState(existing?.supervisor_id ?? '')
  const [ncsCommon, setNcsCommon] = useState<string[]>(existing?.nerves_tested?.common ?? [])
  const [ncsInfrequent, setNcsInfrequent] = useState<string[]>(existing?.nerves_tested?.infrequent ?? [])
  const [rns, setRns] = useState<string[]>(existing?.nerves_tested?.rns ?? [])
  const [sfemg, setSfemg] = useState<string[]>(existing?.nerves_tested?.sfemg ?? [])
  const [ultrasound, setUltrasound] = useState<string[]>(existing?.nerves_tested?.ultrasound ?? [])
  const [biopsy, setBiopsy] = useState<string[]>(existing?.nerves_tested?.biopsy ?? [])
  const [muscles, setMuscles] = useState<string[]>(existing?.muscles_tested ?? [])
  const [diagCategory, setDiagCategory] = useState(existing?.diagnoses?.[0]?.category ?? '')
  const [diagSubtype, setDiagSubtype] = useState(existing?.diagnoses?.[0]?.subtype ?? '')
  const [summary, setSummary] = useState(existing?.summary ?? '')
  const [busy, setBusy] = useState(false)
  const [showMore, setShowMore] = useState(
    (existing?.nerves_tested?.infrequent?.length ?? 0) > 0 ||
      (existing?.nerves_tested?.rns?.length ?? 0) > 0 ||
      (existing?.nerves_tested?.sfemg?.length ?? 0) > 0 ||
      (existing?.nerves_tested?.ultrasound?.length ?? 0) > 0 ||
      (existing?.nerves_tested?.biopsy?.length ?? 0) > 0,
  )

  async function save() {
    setBusy(true)
    const payload = {
      fellow_id: fellowId,
      case_date: date,
      title: title.trim() || null,
      supervisor_id: supervisorId || null,
      visibility: supervisorId ? 'shared' : 'private',
      nerves_tested: { common: ncsCommon, infrequent: ncsInfrequent, rns, sfemg, ultrasound, biopsy },
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

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Share with supervisor (optional)</label>
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}
            className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink sm:w-auto">
            <option value="">— Keep private (don't share) —</option>
            {supervisors.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">
            Choosing a supervisor lets that one person view this case and leave you feedback. It stays hidden from everyone else.
          </p>
        </div>

        <div className="space-y-4 border-t border-line pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Studies performed</p>

          <ChipGroup label="Nerve conduction — common protocol" options={NCS_COMMON} selected={ncsCommon} onChange={setNcsCommon} />

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

          {showMore ? (
            <div className="space-y-4">
              <ChipGroup label="Nerve conduction — infrequent nerves" options={NCS_INFREQUENT} selected={ncsInfrequent} onChange={setNcsInfrequent} />
              <ChipGroup label="Repetitive nerve stimulation" options={RNS_SITES} selected={rns} onChange={setRns} />
              <ChipGroup label="Single fiber electromyography" options={SFEMG_SITES} selected={sfemg} onChange={setSfemg} />
              <ChipGroup label="Neuromuscular ultrasound" options={NM_ULTRASOUND_SITES} selected={ultrasound} onChange={setUltrasound} />
              <ChipGroup label="Muscle biopsy" options={MUSCLE_BIOPSY_OPTIONS} selected={biopsy} onChange={setBiopsy} />
            </div>
          ) : (
            <button type="button" onClick={() => setShowMore(true)} className="text-sm font-medium text-accent hover:underline">
              + Add other study types (infrequent NCS, RNS, SFEMG, ultrasound, biopsy)
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
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

// ---------------------------------------------------------------------------
// Supervisor / director view: cases fellows have shared with me, grouped by
// fellow, each with a feedback thread I can add to.
// ---------------------------------------------------------------------------
function SupervisorCases({ userId, selfName }: { userId: string; selfName: string }) {
  const [cases, setCases] = useState<SharedCase[]>([])
  const [feedback, setFeedback] = useState<Record<string, Feedback[]>>({})
  const [supervisors, setSupervisors] = useState<Provider[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const nameFor = useMemo(() => {
    const m = new Map(supervisors.map((s) => [s.id, s.full_name]))
    m.set(userId, selfName)
    return (id: string) => m.get(id) ?? 'Supervisor'
  }, [supervisors, userId, selfName])

  async function loadFeedback(ids: string[]) {
    if (ids.length === 0) { setFeedback({}); return }
    const { data } = await supabase
      .from('case_feedback')
      .select('id, case_id, body, author_id, created_at')
      .in('case_id', ids)
      .order('created_at', { ascending: true })
    const map: Record<string, Feedback[]> = {}
    for (const f of (data as Feedback[]) ?? []) (map[f.case_id] ??= []).push(f)
    setFeedback(map)
  }

  async function load() {
    const { data, error } = await supabase.rpc('supervisor_shared_cases')
    if (error) { setMsg(error.message); return }
    const rows = (data as SharedCase[]) ?? []
    setCases(rows)
    loadFeedback(rows.map((r) => r.id))
  }

  useEffect(() => {
    load()
    supabase.rpc('list_supervisors').then(({ data }: { data: Provider[] | null }) => setSupervisors(data ?? []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendFeedback(caseId: string) {
    const body = (drafts[caseId] ?? '').trim()
    if (!body) return
    setBusy(caseId)
    const { error } = await supabase.from('case_feedback').insert({ case_id: caseId, author_id: userId, body })
    setBusy(null)
    if (error) { setMsg(error.message); return }
    setDrafts((d) => ({ ...d, [caseId]: '' }))
    loadFeedback(cases.map((c) => c.id))
  }

  const groups: [string, SharedCase[]][] = useMemo(() => {
    const m = new Map<string, SharedCase[]>()
    for (const c of cases) {
      const key = c.fellow_name || 'Unknown fellow'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(c)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [cases])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Cases shared with you</h1>
        <p className="mt-1 text-sm text-muted">Cases fellows have shared for your review — grouped by fellow. Add feedback and they'll see it.</p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {cases.length === 0 ? (
        <Card>
          <p className="px-5 py-6 text-sm text-muted">
            No cases have been shared with you yet. When a fellow selects you as the supervisor on a case they log, it will appear here.
          </p>
        </Card>
      ) : (
        groups.map(([fellowName, list]) => (
          <Card key={fellowName}>
            <CardHeader title={fellowName} sub={`${list.length} case${list.length === 1 ? '' : 's'} shared`} />
            <ul className="divide-y divide-line">
              {list.map((c) => {
                const open = openId === c.id
                return (
                  <li key={c.id} className="px-5 py-3">
                    <button className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOpenId(open ? null : c.id)}>
                      <span className="text-sm font-medium text-ink">{c.title ?? 'Untitled case'}</span>
                      <span className="text-sm text-muted">
                        {formatDate(c.case_date)}
                        {(feedback[c.id]?.length ?? 0) > 0 && <span className="ml-2">· {feedback[c.id].length} feedback</span>}
                        <span className="ml-2 text-accent">{open ? 'Hide' : 'Open'}</span>
                      </span>
                    </button>

                    {open && (
                      <div className="mt-2 space-y-3">
                        <div className="text-sm text-ink">
                          <p>{diagnosisLine(c.diagnoses) || 'No diagnosis recorded'}</p>
                          <p className="mt-0.5 text-muted">
                            {[
                              (c.muscles_tested?.length ?? 0) > 0 ? `${c.muscles_tested!.length} muscles on needle EMG` : null,
                              (c.nerves_tested?.common?.length ?? 0) > 0 ? `${c.nerves_tested!.common!.length} common NCS` : null,
                            ].filter(Boolean).join(' · ') || 'No study details recorded'}
                          </p>
                          {c.summary && <p className="mt-2 whitespace-pre-wrap">{c.summary}</p>}
                        </div>

                        <FeedbackThread items={feedback[c.id] ?? []} nameFor={nameFor} />

                        <div>
                          <textarea
                            value={drafts[c.id] ?? ''}
                            onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                            rows={3}
                            placeholder="Feedback for the fellow on this case…"
                            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                          />
                          <button
                            onClick={() => sendFeedback(c.id)}
                            disabled={busy === c.id || !(drafts[c.id] ?? '').trim()}
                            className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {busy === c.id ? 'Sending…' : 'Send feedback'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
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
