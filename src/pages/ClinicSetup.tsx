import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { localToday } from '../lib/format'
import { StepBar, Notice, field, label as labelCls, primary, quiet, textBtn } from '../components/ui/Wizard'
import {
  CLINIC_COLUMNS, WEEKDAY_NAMES, WEEKDAY_SHORT, loadClinicWorld, clinicName, clinicWhen, cellLabel, rowFor,
  clinicsWithRoom, inFellowship, rangeLabel, dateLabel, dayLabel, addDays, mondayOf, academicYear, plural,
  type Clinic, type ClinicWorld, type Fellow, type Pattern, type Slot, type Person,
} from '../lib/schedule'

// ---------------------------------------------------------------------------
// Setting up the clinic schedule, one step at a time:
//   1 Clinics → 2 Weekly patterns → 3 Fellows → 4 Away dates → 5 Generate & review
// Steps 1–4 save as you go (they only change the setup, which fellows never
// see). Step 5 makes a draft, which nobody else sees until it is published.
// ---------------------------------------------------------------------------

const STEPS = ['Clinics', 'Weekly patterns', 'Fellows', 'Away dates', 'Generate & review']

export default function ClinicSetup() {
  const [params, setParams] = useSearchParams()
  const step = Math.min(Math.max(Number(params.get('step') ?? '1') || 1, 1), 5) - 1
  const go = (i: number) => {
    const next = new URLSearchParams(params)
    next.set('step', String(i + 1))
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [providers, setProviders] = useState<Person[]>([])
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [c, t, s, p] = await Promise.all([
      supabase.from('clinic_template').select(CLINIC_COLUMNS).order('weekday').order('provider_name'),
      supabase.from('fellow_templates').select('id, name, sort_order').order('sort_order').order('created_at'),
      supabase.from('fellow_template_slots').select('id, template_id, weekday, slot_type, clinic_template_id, monthly_cap, fallback_clinic_template_id'),
      supabase.rpc('list_providers'),
    ])
    if (c.error) setErr(c.error.message)
    setClinics((c.data as Clinic[]) ?? [])
    setPatterns((t.data as Pattern[]) ?? [])
    setSlots((s.data as Slot[]) ?? [])
    setProviders((p.data as Person[]) ?? [])
  }, [])
  useEffect(() => { reload() }, [reload])

  const today = localToday()
  const current = clinics.filter((c) => !c.active_until || c.active_until >= today)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/clinic" className="text-xs font-medium text-muted hover:text-ink">← Clinic schedule</Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">Set up the clinic schedule</h1>
          <p className="mt-1 text-sm text-muted">Step {step + 1} of 5 · Everything saves as you go.</p>
        </div>
        <Link to="/clinic" className={quiet}>Save and finish later</Link>
      </div>
      <nav aria-label="Setup steps"><StepBar steps={STEPS} current={step} onJump={go} /></nav>
      <div className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => i !== step && (
          <button key={s} type="button" onClick={() => go(i)} className="rounded-full border border-line px-2.5 py-1 text-muted hover:border-accent hover:text-ink">
            Go to {i + 1}. {s}
          </button>
        ))}
      </div>
      {err && <Notice tone="bad">{err} <button className="ml-2 font-medium underline" onClick={() => setErr(null)}>dismiss</button></Notice>}

      {step === 0 && <ClinicsStep clinics={current} providers={providers} onChanged={reload} onError={setErr} onNext={() => go(1)} />}
      {step === 1 && <PatternsStep clinics={current} patterns={patterns} slots={slots} onChanged={reload} onError={setErr} onBack={() => go(0)} onNext={() => go(2)} />}
      {step === 2 && <FellowsStep patterns={patterns} onError={setErr} onBack={() => go(1)} onNext={() => go(3)} />}
      {step === 3 && <AwayStep clinics={current} onError={setErr} onBack={() => go(2)} onNext={() => go(4)} />}
      {step === 4 && <GenerateStep clinics={current} onError={setErr} onBack={() => go(3)} />}
    </div>
  )
}

function Nav({ onBack, onNext, nextLabel, children }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
      {onBack && <button type="button" className={quiet} onClick={onBack}>← Back</button>}
      {onNext && <button type="button" className={primary} onClick={onNext}>{nextLabel ?? 'Continue →'}</button>}
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ 1 clinics

function ClinicsStep({ clinics, providers, onChanged, onError, onNext }: {
  clinics: Clinic[]; providers: Person[]; onChanged: () => void; onError: (m: string) => void; onNext: () => void
}) {
  const [who, setWho] = useState('')
  const [name, setName] = useState('')
  const [recur, setRecur] = useState<'weekly' | 'dates'>('weekly')
  const [weekday, setWeekday] = useState(1)
  const [dates, setDates] = useState<string[]>([])
  const [dateDraft, setDateDraft] = useState('')
  const [site, setSite] = useState('')
  const [cap, setCap] = useState(1)
  const [busy, setBusy] = useState(false)

  async function add() {
    const provider_id = who && who !== 'other' ? who : null
    const provider_name = who === 'other' ? name.trim() : providers.find((p) => p.id === who)?.full_name ?? ''
    if (!provider_name) { onError('Choose who runs the clinic.'); return }
    if (!site.trim()) { onError('Say where the clinic is.'); return }
    if (recur === 'dates' && dates.length === 0) { onError('Add at least one date the clinic runs on.'); return }
    setBusy(true)
    const { error } = await supabase.from('clinic_template').insert({
      provider_id, provider_name, weekday: recur === 'dates' ? 0 : weekday, recurrence: recur,
      specific_dates: recur === 'dates' ? dates : [], site_code: site.trim(), fellow_capacity: cap,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    setSite(''); setName(''); setDates([]); setWho('')
    onChanged()
  }
  async function update(c: Clinic, patch: Partial<Clinic>) {
    const { error } = await supabase.from('clinic_template').update(patch).eq('id', c.id)
    if (error) onError(error.message); else onChanged()
  }
  async function remove(c: Clinic) {
    if (!window.confirm(`Remove ${clinicName(c)}? Days already on the schedule stay as they are; it comes out of the weekly patterns.`)) return
    const { error } = await supabase.from('clinic_template').delete().eq('id', c.id)
    if (error) onError(error.message); else onChanged()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Which clinics do fellows attend?</h2>
        <p className="mt-1 text-sm text-muted">Add each provider’s clinic once — who runs it, when, where, and how many fellows it takes. You build fellows’ weeks from these next.</p>
      </div>

      {clinics.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[36rem] text-sm">
            <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-4 py-2">Provider</th><th className="px-4 py-2">When</th><th className="px-4 py-2">Where</th><th className="px-4 py-2">Fellows</th><th className="px-4 py-2" />
            </tr></thead>
            <tbody>
              {clinics.map((c) => (
                <tr key={c.id} className="border-t border-line align-top">
                  <td className="px-4 py-2.5 text-ink">{c.provider_name}</td>
                  <td className="px-4 py-2.5 text-ink">
                    {clinicWhen(c)}
                    {c.active_from && c.active_from > localToday() && <span className="block text-xs text-muted">Starts {dateLabel(c.active_from)}</span>}
                    {c.active_until && <span className="block text-xs text-muted">Ends {dateLabel(c.active_until)}</span>}
                    {c.recurrence === 'dates' && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {(c.specific_dates ?? []).map((d) => (
                          <span key={d} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs">
                            {dateLabel(d)}
                            <button type="button" aria-label={`Remove ${dateLabel(d)}`} className="text-muted hover:text-ink"
                              onClick={() => update(c, { specific_dates: (c.specific_dates ?? []).filter((x) => x !== d) })}>×</button>
                          </span>
                        ))}
                        <input type="date" aria-label="Add a date" className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-xs"
                          onChange={(e) => { const v = e.target.value; if (v && !(c.specific_dates ?? []).includes(v)) update(c, { specific_dates: [...(c.specific_dates ?? []), v].sort() }); e.target.value = '' }} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{c.site_code}</td>
                  <td className="px-4 py-2.5">
                    <select aria-label={`Fellows for ${clinicName(c)}`} value={c.fellow_capacity}
                      onChange={(e) => update(c, { fellow_capacity: Number(e.target.value) })}
                      className="rounded-md border border-line bg-surface px-2 py-1 text-sm">
                      {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right"><button type="button" className={textBtn} onClick={() => remove(c)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-line bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-ink">Add a clinic</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block"><span className={labelCls}>Provider</span>
            <select id="cs-provider" className={field} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Choose…</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              <option value="other">Someone without an account…</option>
            </select>
          </label>
          {who === 'other' && (
            <label className="block"><span className={labelCls}>Provider’s name</span>
              <input id="cs-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className="block"><span className={labelCls}>Repeats</span>
            <select id="cs-recur" className={field} value={recur} onChange={(e) => setRecur(e.target.value as 'weekly' | 'dates')}>
              <option value="weekly">Every week</option>
              <option value="dates">On specific dates</option>
            </select>
          </label>
          {recur === 'weekly' ? (
            <label className="block"><span className={labelCls}>Day</span>
              <select id="cs-weekday" className={field} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
              </select>
            </label>
          ) : (
            <div className="sm:col-span-2 lg:col-span-1">
              <span className={labelCls}>Dates</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {dates.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-xs">
                    {dateLabel(d)}<button type="button" onClick={() => setDates(dates.filter((x) => x !== d))} className="text-muted">×</button>
                  </span>
                ))}
                <input type="date" aria-label="Pick a date" value={dateDraft} onChange={(e) => setDateDraft(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm" />
                <button type="button" className={textBtn} onClick={() => { if (dateDraft && !dates.includes(dateDraft)) setDates([...dates, dateDraft].sort()); setDateDraft('') }}>Add</button>
              </div>
            </div>
          )}
          <label className="block"><span className={labelCls}>Where</span>
            <input id="cs-site" className={field} value={site} onChange={(e) => setSite(e.target.value)} placeholder="Hospital and clinic" />
          </label>
          <label className="block"><span className={labelCls}>Fellows it takes</span>
            <select id="cs-cap" className={field} value={cap} onChange={(e) => setCap(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={primary} onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add clinic'}</button>
          <span className="text-xs text-muted">A clinic that only runs on some dates? Choose “On specific dates”.</span>
        </div>
      </div>

      <Nav onNext={onNext} nextLabel="Continue to weekly patterns →">
        <span className="text-sm text-muted">{plural(clinics.length, 'clinic')} added</span>
      </Nav>
    </div>
  )
}

// ---------------------------------------------------------- 2 weekly patterns

function PatternsStep({ clinics, patterns, slots, onChanged, onError, onBack, onNext }: {
  clinics: Clinic[]; patterns: Pattern[]; slots: Slot[]; onChanged: () => void; onError: (m: string) => void; onBack: () => void; onNext: () => void
}) {
  const [newName, setNewName] = useState('')

  async function addPattern() {
    const name = newName.trim() || `Pattern ${String.fromCharCode(65 + patterns.length)}`
    const { error } = await supabase.from('fellow_templates').insert({ name, sort_order: patterns.length })
    if (error) { onError(error.message); return }
    setNewName(''); onChanged()
  }
  async function rename(p: Pattern, name: string) {
    if (!name.trim() || name.trim() === p.name) return
    const { error } = await supabase.from('fellow_templates').update({ name: name.trim() }).eq('id', p.id)
    if (error) onError(error.message); else onChanged()
  }
  async function removePattern(p: Pattern) {
    if (!window.confirm(`Remove ${p.name}? Fellows starting on it will need another starting pattern.`)) return
    const { error } = await supabase.from('fellow_templates').delete().eq('id', p.id)
    if (error) onError(error.message); else onChanged()
  }
  async function setDay(p: Pattern, wd: number, value: string) {
    const existing = slots.find((s) => s.template_id === p.id && s.weekday === wd)
    let error
    if (value === 'none') {
      if (existing) ({ error } = await supabase.from('fellow_template_slots').delete().eq('id', existing.id))
    } else {
      const payload = {
        template_id: p.id, weekday: wd, slot_type: value === 'protected' ? 'protected' : 'clinic',
        clinic_template_id: value === 'protected' ? null : value, monthly_cap: null, fallback_clinic_template_id: null,
      }
      ;({ error } = existing
        ? await supabase.from('fellow_template_slots').update(payload).eq('id', existing.id)
        : await supabase.from('fellow_template_slots').insert(payload))
    }
    if (error) onError(error.message); else onChanged()
  }
  async function setCap(s: Slot, patch: Partial<Slot>) {
    const { error } = await supabase.from('fellow_template_slots').update(patch).eq('id', s.id)
    if (error) onError(error.message); else onChanged()
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">What does a fellow’s week look like?</h2>
        <p className="mt-1 text-sm text-muted">
          A pattern is a typical week, Monday to Friday. Each fellow moves on to the next pattern every three months,
          counted from the day their fellowship starts, so two to four patterns cover the year.
        </p>
      </div>
      {clinics.length === 0 && <Notice tone="warn">Add clinics in step 1 first — patterns are built from them.</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        {patterns.map((p, pi) => (
          <div key={p.id} className="rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <input defaultValue={p.name} aria-label="Pattern name" onBlur={(e) => rename(p, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink hover:border-line focus:border-line" />
              {patterns.length > 1 && <span className="shrink-0 text-xs text-muted">then → {patterns[(pi + 1) % patterns.length].name}</span>}
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => removePattern(p)}>Remove</button>
            </div>
            <ul className="divide-y divide-line">
              {[1, 2, 3, 4, 5].map((wd) => {
                const s = slots.find((x) => x.template_id === p.id && x.weekday === wd)
                const value = !s ? 'none' : s.slot_type === 'protected' ? 'protected' : s.clinic_template_id ?? 'none'
                const dayClinics = clinics.filter((c) => c.recurrence === 'weekly' && c.weekday === wd)
                const isClinic = s?.slot_type === 'clinic' && !!s.clinic_template_id
                return (
                  <li key={wd} className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <span className="w-9 text-xs font-semibold text-muted">{WEEKDAY_SHORT[wd]}</span>
                      <select aria-label={`${p.name} ${WEEKDAY_NAMES[wd]}`} value={value} onChange={(e) => setDay(p, wd, e.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                        <option value="none">Nothing scheduled</option>
                        <option value="protected">Protected (fellow day)</option>
                        {dayClinics.map((c) => <option key={c.id} value={c.id}>{clinicName(c)}</option>)}
                      </select>
                    </div>
                    {isClinic && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-12 text-xs text-muted">
                        <select aria-label="How often" value={s!.monthly_cap ?? ''}
                          onChange={(e) => setCap(s!, { monthly_cap: e.target.value ? Number(e.target.value) : null, ...(e.target.value ? {} : { fallback_clinic_template_id: null }) })}
                          className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink">
                          <option value="">every week</option>
                          <option value="1">once a month</option>
                          <option value="2">twice a month</option>
                          <option value="3">3 times a month</option>
                        </select>
                        {s!.monthly_cap != null && (
                          <>
                            <span>else</span>
                            <select aria-label="Other weeks" value={s!.fallback_clinic_template_id ?? ''}
                              onChange={(e) => setCap(s!, { fallback_clinic_template_id: e.target.value || null })}
                              className="min-w-0 max-w-[14rem] rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink">
                              <option value="">free</option>
                              {dayClinics.filter((c) => c.id !== s!.clinic_template_id).map((c) => <option key={c.id} value={c.id}>{clinicName(c)}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        <div className="flex flex-col justify-center gap-2 rounded-lg border border-dashed border-line p-5">
          <input className={field} placeholder={`Pattern ${String.fromCharCode(65 + patterns.length)}`} value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New pattern name" />
          <button type="button" className={quiet} onClick={addPattern}>+ Add another pattern</button>
        </div>
      </div>
      <p className="text-xs text-muted">Only clinics that run on that weekday are offered for it. A clinic used once or twice a month can fall back to another clinic on the other weeks.</p>
      <Nav onBack={onBack} onNext={onNext} nextLabel="Continue to fellows →">
        <span className="text-sm text-muted">{plural(patterns.length, 'pattern')}</span>
      </Nav>
    </div>
  )
}

// ------------------------------------------------------------------ 3 fellows

function FellowsStep({ patterns, onError, onBack, onNext }: {
  patterns: Pattern[]; onError: (m: string) => void; onBack: () => void; onNext: () => void
}) {
  const today = localToday()
  const [fellows, setFellows] = useState<Fellow[] | null>(null)
  const [starts, setStarts] = useState<Record<string, string>>({})

  useEffect(() => {
    ;(async () => {
      const [f, r] = await Promise.all([
        supabase.rpc('list_fellows', { p_from: today, p_to: addDays(today, 400) }),
        supabase.from('fellow_rotation').select('fellow_id, start_template_id'),
      ])
      if (f.error) onError(f.error.message)
      setFellows((f.data as Fellow[]) ?? [])
      const m: Record<string, string> = {}
      for (const x of (r.data as { fellow_id: string; start_template_id: string | null }[]) ?? []) if (x.start_template_id) m[x.fellow_id] = x.start_template_id
      setStarts(m)
    })()
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps

  async function setStart(fid: string, tid: string) {
    setStarts({ ...starts, [fid]: tid })
    const { error } = await supabase.from('fellow_rotation').upsert({ fellow_id: fid, start_template_id: tid || null }, { onConflict: 'fellow_id' })
    if (error) onError(error.message)
  }

  const ready = (fellows ?? []).filter((f) => starts[f.id] && patterns.some((p) => p.id === starts[f.id])).length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Where does each fellow start?</h2>
        <p className="mt-1 text-sm text-muted">Pick the pattern each fellow begins their fellowship on. They rotate through the others from there. Fellows are only scheduled between their start and end dates.</p>
      </div>
      {fellows === null ? <p className="text-sm text-muted">Loading…</p> : fellows.length === 0 ? (
        <Notice tone="warn">No current or incoming fellows yet. <Link to="/people/new" className="font-medium underline">Add them</Link>, then come back to this step.</Notice>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[34rem] text-sm">
            <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-4 py-2">Fellow</th><th className="px-4 py-2">Fellowship</th><th className="px-4 py-2">Starts on</th><th className="px-4 py-2" />
            </tr></thead>
            <tbody>
              {fellows.map((f) => {
                const ok = !!starts[f.id] && patterns.some((p) => p.id === starts[f.id])
                return (
                  <tr key={f.id} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium text-ink">{f.full_name}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {rangeLabel(f.fellowship_start, f.fellowship_end)}
                      {!f.fellowship_start && !f.fellowship_end && <Link to="/people" className="ml-1 text-xs text-accent hover:underline">Add dates</Link>}
                    </td>
                    <td className="px-4 py-2.5">
                      <select aria-label={`Starting pattern for ${f.full_name}`} value={starts[f.id] ?? ''} onChange={(e) => setStart(f.id, e.target.value)}
                        className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                        <option value="">Choose a pattern…</option>
                        {patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-semibold">
                      {ok ? <span className="text-emerald-700 dark:text-emerald-300">Ready</span> : <span className="text-amber-700 dark:text-amber-300">Needs a pattern</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm">
        <span className="text-muted">Someone missing? Add them, then come back to this step.</span>
        <Link to="/people/new" className={quiet}>Add a person</Link>
      </div>
      <Nav onBack={onBack} onNext={onNext} nextLabel="Continue to away dates →">
        {fellows && <span className="text-sm text-muted">{ready} of {fellows.length} ready</span>}
      </Nav>
    </div>
  )
}

// --------------------------------------------------------------- 4 away dates

function periodsOf(dates: string[]): { from: string; to: string }[] {
  const sorted = Array.from(new Set(dates)).sort()
  const out: { from: string; to: string }[] = []
  for (const d of sorted) {
    const last = out[out.length - 1]
    // weekends inside an away period don't split it
    if (last && (addDays(last.to, 1) === d || (addDays(last.to, 3) >= d && new Date(last.to + 'T00:00:00').getDay() === 5))) last.to = d
    else out.push({ from: d, to: d })
  }
  return out
}

function AwayStep({ clinics, onError, onBack, onNext }: { clinics: Clinic[]; onError: (m: string) => void; onBack: () => void; onNext: () => void }) {
  const today = localToday()
  const ay = academicYear(today)
  const until = ay.end > today ? ay.end : academicYear(addDays(ay.end, 1)).end
  const [people, setPeople] = useState<{ id: string; name: string; role: string; periods: { from: string; to: string }[] }[] | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [pr, fl, pa, fa] = await Promise.all([
        supabase.rpc('list_providers'),
        supabase.rpc('list_fellows', { p_from: today, p_to: until }),
        supabase.from('provider_away_dates').select('provider_id, away_date').gte('away_date', today).lte('away_date', until),
        supabase.from('fellow_away_dates').select('fellow_id, away_date').gte('away_date', today).lte('away_date', until),
      ])
      const running = new Set(clinics.map((c) => c.provider_id).filter(Boolean))
      const provs = ((pr.data as Person[]) ?? []).filter((p) => running.has(p.id))
      const pAway = (pa.data as { provider_id: string; away_date: string }[]) ?? []
      const fAway = (fa.data as { fellow_id: string; away_date: string }[]) ?? []
      setPeople([
        ...provs.map((p) => ({ id: p.id, name: p.full_name, role: 'Provider', periods: periodsOf(pAway.filter((a) => a.provider_id === p.id).map((a) => a.away_date)) })),
        ...((fl.data as Fellow[]) ?? []).map((f) => ({ id: f.id, name: f.full_name, role: 'Fellow', periods: periodsOf(fAway.filter((a) => a.fellow_id === f.id).map((a) => a.away_date)) })),
      ])
    })()
  }, [clinics, today, until])

  async function ask() {
    setBusy(true)
    const { data, error } = await supabase.rpc('request_vacation_submissions', { p_audience: 'everyone', p_from: today, p_to: until })
    setBusy(false)
    if (error) { onError(error.message); return }
    const r = data as { recipients: number; period: string | null }
    setSent(`Asked ${plural(r.recipients, 'person', 'people')} for their away dates${r.period ? ` for ${r.period}` : ''}.`)
  }

  const withDates = (people ?? []).filter((p) => p.periods.length > 0).length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Who’s away this year?</h2>
        <p className="mt-1 text-sm text-muted">
          The schedule leaves gaps where fellows are away and moves fellows to another clinic when a provider is off,
          so collect away dates before you generate. Showing {rangeLabel(today, until)}.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={primary} onClick={ask} disabled={busy}>{busy ? 'Sending…' : 'Email everyone for their away dates'}</button>
        <Link to="/vacation" className={quiet}>Add away dates</Link>
      </div>
      {sent && <Notice tone="ok">{sent}</Notice>}
      {people === null ? <p className="text-sm text-muted">Loading…</p> : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[32rem] text-sm">
            <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-4 py-2">Person</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Away</th>
            </tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={`${p.role}-${p.id}`} className="border-t border-line align-top">
                  <td className="px-4 py-2.5 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-2.5 text-muted">{p.role}</td>
                  <td className="px-4 py-2.5 text-ink">
                    {p.periods.length === 0 ? <span className="text-muted">None yet</span>
                      : p.periods.map((x) => rangeLabel(x.from, x.to === x.from ? x.from : x.to)).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">You can generate without them — add dates later and use “Make a change” or generate again.</p>
      <Nav onBack={onBack} onNext={onNext}>
        {people && <span className="text-sm text-muted">{withDates} of {people.length} have away dates on file</span>}
      </Nav>
    </div>
  )
}

// ------------------------------------------------------- 5 generate and review

function GenerateStep({ clinics, onError, onBack }: { clinics: Clinic[]; onError: (m: string) => void; onBack: () => void }) {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const [params] = useSearchParams()
  const today = localToday()
  const ay = academicYear(today)
  const [from, setFrom] = useState(params.get('from') ?? today)
  const [to, setTo] = useState(params.get('to') ?? ay.end)
  const [world, setWorld] = useState<ClinicWorld | null>(null)
  const [week, setWeek] = useState(mondayOf(params.get('from') ?? today))
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    if (!from || !to || to < from) return
    try { setWorld(await loadClinicWorld(from, to)) } catch (e) { onError((e as Error).message) }
  }, [from, to, onError])
  useEffect(() => { load() }, [load])

  const drafts = useMemo(() => (world?.rotations ?? []).filter((r) => r.is_draft), [world])
  // show the first week that has draft days, so the review starts where the draft does
  const [weekChosen, setWeekChosen] = useState(false)
  useEffect(() => {
    if (weekChosen || drafts.length === 0) return
    setWeek(mondayOf(drafts.reduce((m, r) => (r.rotation_date < m ? r.rotation_date : m), drafts[0].rotation_date)))
  }, [drafts, weekChosen])
  const conflicts = useMemo(() => drafts.filter((r) => r.has_conflict).sort((a, b) => a.rotation_date.localeCompare(b.rotation_date)), [drafts])
  const weeksInRange = world ? Math.max(1, Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / (7 * 864e5))) : 0

  async function generate() {
    if (!from || !to || to < from) { onError('Choose the dates to generate.'); return }
    setBusy('generate'); setNote(null)
    const { data, error } = await supabase.rpc('generate_clinic_schedule', { p_from: from, p_to: to })
    setBusy(null)
    if (error) { onError(error.message); return }
    const n = data as number
    setNote(n > 0 ? `Added ${plural(n, 'draft day')}. Days that were already on the schedule were left as they are.` : 'Nothing new to add — every fellow day in that period already has something on it.')
    setWeekChosen(false)
    load()
  }
  async function publish() {
    if (!window.confirm('Publish the draft? Fellows and supervisors are emailed their clinics, and your CC list gets the full schedule.')) return
    setBusy('publish')
    const { data, error } = await supabase.rpc('publish_clinic_drafts')
    setBusy(null)
    if (error) { onError(error.message); return }
    setNote(`Published ${plural(data as number, 'day')}. Everyone has been emailed their clinics.`)
    load()
  }
  async function discard() {
    if (!window.confirm('Clear every draft day? Published days are not touched.')) return
    setBusy('discard')
    const { error } = await supabase.rpc('discard_clinic_drafts')
    setBusy(null)
    if (error) { onError(error.message); return }
    setNote('Draft cleared.')
    load()
  }
  async function fix(fellowId: string, date: string, choice: string) {
    const mode = choice === 'protected' ? 'protected' : choice === 'free' ? 'clear' : 'clinic'
    const { error } = await supabase.rpc('set_clinic_cell', { p_fellow: fellowId, p_date: date, p_mode: mode, p_clinic: mode === 'clinic' ? choice : null })
    if (error) { onError(error.message); return }
    load()
  }

  const weekDays = [0, 1, 2, 3, 4].map((i) => addDays(week, i))
  const fellowsThisWeek = (world?.fellows ?? []).filter((f) => weekDays.some((d) => inFellowship(f, d)))
  const shownConflicts = showAll ? conflicts : conflicts.slice(0, 12)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Generate a draft and check it</h2>
        <p className="mt-1 text-sm text-muted">Nothing is sent until you publish. Fix anything flagged, then publish — fellows and supervisors are emailed their clinics.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
        <label className="block"><span className={labelCls}>From</span><input id="gs-from" type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="block"><span className={labelCls}>To</span><input id="gs-to" type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" className={quiet} onClick={() => { setFrom(today > ay.start ? today : ay.start); setTo(ay.end) }}>Rest of {ay.label}</button>
        <button type="button" className={primary} onClick={generate} disabled={busy !== null || clinics.length === 0}>{busy === 'generate' ? 'Generating…' : 'Generate draft'}</button>
      </div>
      {clinics.length === 0 && <Notice tone="warn">Add clinics and weekly patterns first.</Notice>}
      {note && <Notice tone="ok">{note}</Notice>}

      {world && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[[world.fellows.length, 'fellows'], [weeksInRange, 'weeks'], [clinics.length, 'clinics'], [conflicts.length, 'to fix']].map(([n, l]) => (
            <div key={l as string} className="rounded-lg border border-line bg-surface px-4 py-3">
              <p className={`font-display text-2xl font-bold ${l === 'to fix' && (n as number) > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-ink'}`}>{n}</p>
              <p className="text-xs text-muted">{l}</p>
            </div>
          ))}
        </div>
      )}

      {world && (
        <div className="rounded-lg border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">Week of {dateLabel(week)} <span className="ml-1 text-xs font-normal text-muted">· drafts are marked, and not visible to fellows yet</span></p>
            <div className="flex gap-2">
              <button type="button" className={textBtn} onClick={() => { setWeekChosen(true); setWeek(addDays(week, -7)) }}>‹ Prev</button>
              <button type="button" className={textBtn} onClick={() => { setWeekChosen(true); setWeek(addDays(week, 7)) }}>Next ›</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] table-fixed text-sm">
              <thead><tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="w-32 px-3 py-2">Fellow</th>
                {weekDays.map((d) => <th key={d} className="px-2 py-2">{dayLabel(d)}</th>)}
              </tr></thead>
              <tbody>
                {fellowsThisWeek.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-muted">No fellows in their fellowship this week.</td></tr>}
                {fellowsThisWeek.map((f) => (
                  <tr key={f.id} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-medium text-ink">{f.full_name}</td>
                    {weekDays.map((d) => {
                      if (!inFellowship(f, d)) return <td key={d} className="bg-paper px-2 py-2 text-xs text-muted">Not in fellowship</td>
                      const r = rowFor(world, f.id, d)
                      return (
                        <td key={d} className={`px-2 py-2 ${r?.has_conflict ? 'bg-rose-50 dark:bg-rose-950' : ''}`}>
                          <span className={r ? 'text-ink' : 'text-muted'}>{r?.has_conflict ? 'Needs a clinic' : r ? cellLabel(r) : '—'}</span>
                          {r?.is_draft && <span className="block text-[10px] font-semibold uppercase tracking-wide text-accent">Draft</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {conflicts.length > 0 && world && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">{plural(conflicts.length, 'day needs', 'days need')} attention</p>
          <ul className="divide-y divide-line rounded-lg border border-amber-300 bg-surface dark:border-amber-800">
            {shownConflicts.map((r) => {
              const options = clinicsWithRoom(world, r.rotation_date, { ignoreFellows: new Set([r.fellow_id!]) })
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span>
                    <button type="button" className="font-medium text-ink hover:underline" onClick={() => { setWeekChosen(true); setWeek(mondayOf(r.rotation_date)) }}>{dayLabel(r.rotation_date)} · {r.fellow_label}</button>
                    <span className="block text-xs text-muted">{r.notes ?? 'Needs a clinic'}</span>
                  </span>
                  <select aria-label={`Fix ${dayLabel(r.rotation_date)} for ${r.fellow_label}`} defaultValue=""
                    onChange={(e) => e.target.value && fix(r.fellow_id!, r.rotation_date, e.target.value)}
                    className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                    <option value="">Choose…</option>
                    {options.map(({ clinic, room }) => <option key={clinic.id} value={clinic.id}>{clinicName(clinic)} ({plural(room, 'place')} free)</option>)}
                    <option value="protected">Make it protected</option>
                    <option value="free">Leave it free</option>
                  </select>
                </li>
              )
            })}
          </ul>
          {conflicts.length > 12 && !showAll && <button type="button" className={textBtn} onClick={() => setShowAll(true)}>Show all {conflicts.length}</button>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="button" className={quiet} onClick={onBack}>← Back</button>
        {isDirector ? (
          <button type="button" className={primary} onClick={publish} disabled={busy !== null || drafts.length === 0}>
            {busy === 'publish' ? 'Publishing…' : `Publish schedule${drafts.length ? ` (${plural(drafts.length, 'draft day')})` : ''}`}
          </button>
        ) : (
          <span className="text-sm text-muted">The fellowship director publishes the schedule.</span>
        )}
        {drafts.length > 0 && <button type="button" className={textBtn} onClick={discard} disabled={busy !== null}>Clear the draft</button>}
        <span className="text-xs text-muted">Publishing emails fellows, supervisors and your CC list.</span>
      </div>
    </div>
  )
}
