import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { shortDate } from '../lib/format'

interface Rotation {
  id: string
  fellow_id: string | null
  fellow_label: string | null
  rotation_date: string
  site_code: string | null
  provider_name: string | null
  is_draft: boolean
  is_protected: boolean | null
  has_conflict: boolean
}
interface AwayDate { fellow_id: string; away_date: string }
interface ClinicCat { id: string; provider_name: string | null; provider_id: string | null; weekday: number; site_code: string; fellow_capacity: number }
interface ProviderOpt { id: string; full_name: string }
interface FellowOpt { id: string; full_name: string }
interface Template { id: string; name: string; sort_order: number }
interface TemplateSlot { id: string; template_id: string; weekday: number; slot_type: string; clinic_template_id: string | null }
interface TallyRow { fellow_id: string; fellow_label: string; provider_name: string; n: number }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function ClinicRotations() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'director' || profile?.role === 'admin'
  const isFellow = profile?.role === 'fellow'
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [away, setAway] = useState<AwayDate[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  async function load() {
    const horizon = new Date(); horizon.setDate(horizon.getDate() + 90)
    let q = supabase
      .from('clinic_rotations')
      .select('id, fellow_id, fellow_label, rotation_date, site_code, provider_name, is_draft, is_protected, has_conflict')
      .gte('rotation_date', today)
      .lte('rotation_date', horizon.toISOString().slice(0, 10))
      .order('rotation_date')
    if (isFellow && profile) q = q.eq('fellow_id', profile.id).eq('is_draft', false)
    if (!isFellow && !isManager) q = q.eq('is_draft', false)
    const { data, error } = await q
    if (error) setMsg(error.message)
    setRotations((data as Rotation[]) ?? [])

    if (isManager) {
      const { data: aw } = await supabase.from('fellow_away_dates').select('fellow_id, away_date').gte('away_date', today)
      setAway((aw as AwayDate[]) ?? [])
    }
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const awaySet = useMemo(() => new Set(away.map((a) => `${a.fellow_id}|${a.away_date}`)), [away])
  const draftCount = useMemo(() => rotations.filter((r) => r.is_draft).length, [rotations])
  const conflicts = useMemo(
    () => rotations.filter((r) => r.has_conflict || (r.fellow_id && awaySet.has(`${r.fellow_id}|${r.rotation_date}`))),
    [rotations, awaySet]
  )

  const weeks = useMemo(() => {
    const map = new Map<string, Rotation[]>()
    for (const r of rotations) {
      const d = new Date(r.rotation_date + 'T00:00:00')
      const day = d.getDay() === 0 ? 7 : d.getDay()
      const mon = new Date(d); mon.setDate(d.getDate() - day + 1)
      const key = mon.toISOString().slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rotations])

  async function removeRotation(id: string) {
    const { error } = await supabase.from('clinic_rotations').delete().eq('id', id)
    if (error) setMsg(error.message); else load()
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Clinic schedule</h1>
        <p className="mt-1 text-sm text-muted">
          {isFellow ? 'Your upcoming clinic assignments' : 'Clinic assignments for the next 12 weeks'}
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {isManager && conflicts.length > 0 && (
        <div className="rounded-md border-2 border-red-500 bg-surface px-4 py-3">
          <p className="text-sm font-semibold text-ink">
            ⚠ {conflicts.length} clinic assignment{conflicts.length === 1 ? '' : 's'} need attention
          </p>
          <p className="mt-0.5 text-xs text-muted">Conflicts (fellow on vacation, or a provider who set a new away date) are outlined in red below.</p>
        </div>
      )}

      {isManager && (
        <>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowConfig(!showConfig)}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft">
              {showConfig ? 'Hide schedule setup' : 'Schedule setup (clinics, templates, fellows)'}
            </button>
          </div>
          {showConfig && (
            <>
              <ProviderClinicCatalog onError={setMsg} />
              <FellowTemplates onError={setMsg} />
              <FellowAssignments onError={setMsg} />
            </>
          )}
          <GeneratorToolbar draftCount={draftCount} onChanged={load} onError={setMsg} />
        </>
      )}

      {weeks.length === 0 ? (
        <Card><p className="px-5 py-4 text-sm text-muted">No upcoming clinic assignments.</p></Card>
      ) : (
        weeks.map(([weekStart, rows]) => (
          <Card key={weekStart}>
            <CardHeader title={`Week of ${shortDate(weekStart)}`} />
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const conflicted = r.has_conflict || (r.fellow_id && awaySet.has(`${r.fellow_id}|${r.rotation_date}`))
                const d = new Date(r.rotation_date + 'T00:00:00')
                const wd = WEEKDAYS[(d.getDay() === 0 ? 7 : d.getDay()) - 1] ?? ''
                return (
                  <li key={r.id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm ${
                      conflicted ? 'border-l-4 border-red-500 bg-red-50' : ''
                    }`}>
                    <div>
                      <span className="font-medium text-ink">{wd} {shortDate(r.rotation_date)}</span>
                      <span className="ml-2 text-ink">{r.is_protected ? 'Protected' : r.site_code}</span>
                      {!r.is_protected && r.provider_name && <span className="ml-2 text-muted">{r.provider_name}</span>}
                      {!isFellow && r.fellow_label && <span className="ml-2 text-muted">· {r.fellow_label}</span>}
                      {r.is_draft && (
                        <span className="ml-2 rounded-full border border-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Draft</span>
                      )}
                      {conflicted && (
                        <span className="ml-2 rounded-full border border-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">Conflict</span>
                      )}
                    </div>
                    {isManager && (
                      <button onClick={() => removeRotation(r.id)} className="text-xs font-medium text-muted hover:text-ink">Remove</button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        ))
      )}

      <ClinicTally isManager={isManager} />
    </div>
  )
}

function GeneratorToolbar({ draftCount, onChanged, onError }: {
  draftCount: number; onChanged: () => void; onError: (m: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function run(kind: 'generate' | 'publish' | 'discard') {
    setBusy(kind)
    let res
    if (kind === 'generate') {
      if (!to) { setBusy(null); onError('Choose an end date (up to ~3 months out).'); return }
      res = await supabase.rpc('generate_clinic_schedule', { p_from: from, p_to: to })
    } else if (kind === 'publish') {
      res = await supabase.rpc('publish_clinic_drafts')
    } else {
      res = await supabase.rpc('discard_clinic_drafts')
    }
    setBusy(null)
    if (res.error) { onError(res.error.message); return }
    onChanged()
  }

  return (
    <Card>
      <CardHeader
        title="Schedule"
        sub="Generates a draft by cycling each fellow through their assigned template, switching templates every 3 months across the academic year. Providers who are away are auto-substituted with an alternate clinic."
      />
      <div className="flex flex-wrap items-end gap-2 px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">To (max ~3 months)</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <button onClick={() => run('generate')} disabled={busy !== null}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy === 'generate' ? 'Generating…' : 'Generate Draft Schedule'}
        </button>
        <button onClick={() => run('publish')} disabled={busy !== null || draftCount === 0}
          className="rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-40">
          {busy === 'publish' ? 'Publishing…' : 'Publish Schedule'}
        </button>
        <button onClick={() => run('discard')} disabled={busy !== null || draftCount === 0}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:text-ink disabled:opacity-40">
          {busy === 'discard' ? 'Clearing…' : 'Clear Draft Schedule'}
        </button>
        {draftCount > 0 && (
          <span className="text-sm text-muted">{draftCount} draft day{draftCount === 1 ? '' : 's'} pending</span>
        )}
      </div>
    </Card>
  )
}

function ProviderClinicCatalog({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<ClinicCat[]>([])
  const [providers, setProviders] = useState<ProviderOpt[]>([])
  const [choice, setChoice] = useState('custom')
  const [customName, setCustomName] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [site, setSite] = useState('')
  const [capacity, setCapacity] = useState('1')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.from('clinic_template')
      .select('id, provider_name, provider_id, weekday, site_code, fellow_capacity')
      .order('weekday').order('provider_name')
    setRows((data as ClinicCat[]) ?? [])
  }
  useEffect(() => {
    load()
    supabase.rpc('list_providers').then(({ data }) => setProviders((data as ProviderOpt[]) ?? []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    let provider_id: string | null = null
    let provider_name: string | null = null
    if (choice === 'custom') provider_name = customName.trim() || null
    else { provider_id = choice; provider_name = providers.find((p) => p.id === choice)?.full_name ?? null }
    if (!provider_name || !site.trim()) { onError('Provider name and clinic location are required.'); return }
    const cap = parseInt(capacity, 10)
    setBusy(true)
    const { error } = await supabase.from('clinic_template').insert({
      provider_name, provider_id, weekday, site_code: site.trim(), fellow_capacity: cap && cap > 0 ? cap : 1,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    setSite(''); setCustomName(''); load()
  }

  async function remove(id: string) { await supabase.from('clinic_template').delete().eq('id', id); load() }

  const byDay = new Map<number, ClinicCat[]>()
  for (const r of rows) { if (!byDay.has(r.weekday)) byDay.set(r.weekday, []); byDay.get(r.weekday)!.push(r) }

  return (
    <Card>
      <CardHeader title="1 · Available provider clinics" sub="Every clinic offered each week — provider, day, location, and how many fellows it can take." />
      <div className="space-y-4 px-5 py-4">
        {rows.length === 0 && <p className="text-sm text-muted">No clinics yet — add each recurring provider clinic below.</p>}
        {[1, 2, 3, 4, 5].filter((wd) => byDay.has(wd)).map((wd) => (
          <div key={wd}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{WEEKDAYS[wd - 1]}</p>
            <ul className="divide-y divide-line">
              {byDay.get(wd)!.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{r.provider_name} · {r.site_code}
                    <span className="ml-2 text-muted">{r.fellow_capacity} fellow{r.fellow_capacity === 1 ? '' : 's'}</span>
                  </span>
                  <button onClick={() => remove(r.id)} className="text-xs font-medium text-muted hover:text-ink">Remove</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Provider</label>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}
              className="max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {providers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              <option value="custom">Other (type a name)</option>
            </select>
          </div>
          {choice === 'custom' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Provider name</label>
              <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g., Dr. Charles Kassardjian"
                className="w-52 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Day</label>
            <select value={weekday} onChange={(e) => setWeekday(parseInt(e.target.value, 10))}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Clinic location</label>
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g., St. Michael's Hospital"
              className="w-48 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Fellows</label>
            <input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
              className="w-16 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <button onClick={add} disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Add clinic</button>
        </div>
      </div>
    </Card>
  )
}

function FellowTemplates({ onError }: { onError: (m: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [slots, setSlots] = useState<TemplateSlot[]>([])
  const [clinics, setClinics] = useState<ClinicCat[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: t }, { data: s }, { data: c }] = await Promise.all([
      supabase.from('fellow_templates').select('id, name, sort_order').order('sort_order').order('created_at'),
      supabase.from('fellow_template_slots').select('id, template_id, weekday, slot_type, clinic_template_id'),
      supabase.from('clinic_template').select('id, provider_name, provider_id, weekday, site_code, fellow_capacity'),
    ])
    setTemplates((t as Template[]) ?? [])
    setSlots((s as TemplateSlot[]) ?? [])
    setClinics((c as ClinicCat[]) ?? [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function addTemplate() {
    if (!newName.trim()) return
    setBusy(true)
    const { error } = await supabase.from('fellow_templates').insert({ name: newName.trim(), sort_order: templates.length })
    setBusy(false)
    if (error) { onError(error.message); return }
    setNewName(''); load()
  }
  async function removeTemplate(id: string) { await supabase.from('fellow_templates').delete().eq('id', id); load() }

  async function setSlot(templateId: string, weekday: number, value: string) {
    // value: 'protected' | 'none' | clinic_template_id
    const existing = slots.find((s) => s.template_id === templateId && s.weekday === weekday)
    if (value === 'none') {
      if (existing) await supabase.from('fellow_template_slots').delete().eq('id', existing.id)
    } else {
      const payload = {
        template_id: templateId, weekday,
        slot_type: value === 'protected' ? 'protected' : 'clinic',
        clinic_template_id: value === 'protected' ? null : value,
      }
      if (existing) await supabase.from('fellow_template_slots').update(payload).eq('id', existing.id)
      else await supabase.from('fellow_template_slots').insert(payload)
    }
    load()
  }

  function slotValue(templateId: string, weekday: number): string {
    const s = slots.find((x) => x.template_id === templateId && x.weekday === weekday)
    if (!s) return 'none'
    return s.slot_type === 'protected' ? 'protected' : (s.clinic_template_id ?? 'none')
  }

  return (
    <Card>
      <CardHeader
        title="2 · Fellow schedule templates"
        sub="Build one or more weekly patterns from the clinics above. Each fellow follows a template for 3 months, then rotates to the next — add a template per rotation block as the fellowship grows."
      />
      <div className="space-y-5 px-5 py-4">
        {templates.map((t) => (
          <div key={t.id} className="rounded-md border border-line p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium text-ink">{t.name}</p>
              <button onClick={() => removeTemplate(t.id)} className="text-xs font-medium text-muted hover:text-ink">Remove template</button>
            </div>
            <div className="space-y-2">
              {WEEKDAYS.map((label, i) => {
                const wd = i + 1
                const dayClinics = clinics.filter((c) => c.weekday === wd)
                return (
                  <div key={wd} className="flex items-center gap-2">
                    <span className="w-10 text-xs font-medium text-muted">{label}</span>
                    <select value={slotValue(t.id, wd)} onChange={(e) => setSlot(t.id, wd, e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                      <option value="none">— (nothing scheduled)</option>
                      <option value="protected">Protected (fellow day)</option>
                      {dayClinics.map((c) => (
                        <option key={c.id} value={c.id}>{c.provider_name} · {c.site_code}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">New template name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., Rotation A"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <button onClick={addTemplate} disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Add template</button>
        </div>
      </div>
    </Card>
  )
}

function FellowAssignments({ onError }: { onError: (m: string) => void }) {
  const [fellows, setFellows] = useState<FellowOpt[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [assign, setAssign] = useState<Record<string, string>>({})

  async function load() {
    const [{ data: f }, { data: t }, { data: r }] = await Promise.all([
      supabase.rpc('list_fellows'),
      supabase.from('fellow_templates').select('id, name, sort_order').order('sort_order').order('created_at'),
      supabase.from('fellow_rotation').select('fellow_id, start_template_id'),
    ])
    setFellows((f as FellowOpt[]) ?? [])
    setTemplates((t as Template[]) ?? [])
    const map: Record<string, string> = {}
    for (const row of (r as { fellow_id: string; start_template_id: string | null }[]) ?? []) {
      if (row.start_template_id) map[row.fellow_id] = row.start_template_id
    }
    setAssign(map)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function setStart(fellowId: string, templateId: string) {
    setAssign({ ...assign, [fellowId]: templateId })
    const { error } = await supabase.from('fellow_rotation')
      .upsert({ fellow_id: fellowId, start_template_id: templateId || null }, { onConflict: 'fellow_id' })
    if (error) onError(error.message)
  }

  return (
    <Card>
      <CardHeader
        title="3 · Assign a starting template to each fellow"
        sub="Each fellow begins on their chosen template; the generator rotates them to the next template every 3 months. Give fellows different starting templates so they cover different clinics."
      />
      <div className="px-5 py-4">
        {fellows.length === 0 ? (
          <p className="text-sm text-muted">No active fellows found.</p>
        ) : (
          <ul className="divide-y divide-line">
            {fellows.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-ink">{f.full_name}</span>
                <select value={assign[f.id] ?? ''} onChange={(e) => setStart(f.id, e.target.value)}
                  className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink">
                  <option value="">— choose starting template —</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function ClinicTally({ isManager }: { isManager: boolean }) {
  const [rows, setRows] = useState<TallyRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.rpc('clinic_tally').then(({ data }) => { setRows((data as TallyRow[]) ?? []); setLoaded(true) })
  }, [])

  const byFellow = new Map<string, TallyRow[]>()
  for (const r of rows) { if (!byFellow.has(r.fellow_label)) byFellow.set(r.fellow_label, []); byFellow.get(r.fellow_label)!.push(r) }

  if (loaded && rows.length === 0) return null

  return (
    <Card>
      <CardHeader title="Clinics per provider this academic year" sub="Published clinics only, July–June" />
      {!loaded ? (
        <p className="px-5 py-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-4 px-5 py-4">
          {Array.from(byFellow.entries()).map(([fellow, list]) => (
            <div key={fellow}>
              {isManager && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{fellow}</p>}
              <ul className="divide-y divide-line">
                {list.map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-ink">{r.provider_name}</span>
                    <span className="font-medium text-muted">{r.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
