import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { localToday } from '../../lib/format'
import { field, ChoiceCard, Notice } from '../../components/ui/Wizard'
import {
  ChangeFrame, StepNav, DayTable, WhoIsTold, NotifyChoice, SummaryList, Applied, Field, type DayRow,
} from '../../components/change/ChangeKit'
import {
  CLINIC_COLUMNS, WEEKDAY_NAMES, loadClinicWorld, scheduleHorizon, rowIsClinic, clinicsWithRoom, clinicName,
  clinicWhen, cellLabel, choiceToOp, whoIsTold, daysBetween, addDays, isoWeekday, rangeLabel, dateLabel,
  plural, capacityWarnings, rowFor, inFellowship,
  type Clinic, type ClinicWorld, type Person, type DayOp, type Pattern, type Slot, type Rotation,
} from '../../lib/schedule'

type Kind = 'start' | 'day' | 'location' | 'capacity' | 'pause' | 'stop'
const STEPS = ['What', 'Check the effect', 'Confirm']
const KIND_TITLE: Record<Kind, string> = {
  start: 'A new clinic is starting',
  day: 'Moving to another day',
  location: 'Moving to another location',
  capacity: 'Taking more or fewer fellows',
  pause: 'Pausing for a while',
  stop: 'Stopping',
}

export default function ClinicChange() {
  const [params] = useSearchParams()
  const today = localToday()
  const [step, setStep] = useState(0)
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [providers, setProviders] = useState<Person[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [isNew, setIsNew] = useState(false)
  const [clinicId, setClinicId] = useState('')
  const [kind, setKind] = useState<Kind>((params.get('type') as Kind) || 'day')
  const [from, setFrom] = useState(today)
  const [until, setUntil] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [site, setSite] = useState('')
  const [capacity, setCapacity] = useState(1)
  // a new clinic
  const [providerChoice, setProviderChoice] = useState('')
  const [providerName, setProviderName] = useState('')
  const [chosenPatterns, setChosenPatterns] = useState<string[]>([])

  const [world, setWorld] = useState<ClinicWorld | null>(null)
  const [rows, setRows] = useState<DayRow[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number; extra: string[] } | null>(null)

  useEffect(() => {
    ;(async () => {
      const [c, p, t, s] = await Promise.all([
        supabase.from('clinic_template').select(CLINIC_COLUMNS).order('weekday').order('provider_name'),
        supabase.rpc('list_providers'),
        supabase.from('fellow_templates').select('id, name, sort_order').order('sort_order').order('created_at'),
        supabase.from('fellow_template_slots').select('id, template_id, weekday, slot_type, clinic_template_id, monthly_cap, fallback_clinic_template_id'),
      ])
      const list = ((c.data as Clinic[]) ?? []).filter((x) => !x.active_until || x.active_until >= today)
      setClinics(list)
      setProviders((p.data as Person[]) ?? [])
      setPatterns((t.data as Pattern[]) ?? [])
      setSlots((s.data as Slot[]) ?? [])
      if (list.length === 0) setIsNew(true)
    })()
  }, [today])

  const clinic = clinics.find((c) => c.id === clinicId)
  const effectiveKind: Kind = isNew ? 'start' : kind

  // keep the per-kind fields sensible when the clinic changes
  useEffect(() => {
    if (!clinic) return
    setCapacity(clinic.fellow_capacity)
    setSite(clinic.site_code)
    setWeekday(clinic.weekday >= 1 && clinic.weekday <= 5 ? (clinic.weekday === 5 ? 4 : clinic.weekday + 1) : 1)
  }, [clinicId]) // eslint-disable-line react-hooks/exhaustive-deps

  const newProviderName = providerChoice === 'other' ? providerName.trim() : providers.find((p) => p.id === providerChoice)?.full_name ?? ''

  function patternDayLabel(tid: string, wd: number): string {
    const s = slots.find((x) => x.template_id === tid && x.weekday === wd)
    if (!s) return 'nothing scheduled'
    if (s.slot_type === 'protected') return 'protected'
    return clinicName(clinics.find((c) => c.id === s.clinic_template_id))
  }

  function validate(): string | null {
    if (effectiveKind === 'start') {
      if (!newProviderName) return 'Choose who runs the new clinic.'
      if (!site.trim()) return 'Say where the new clinic is.'
      if (!from || from < today) return 'Choose the day it starts, from today on.'
      if (until && until < from) return 'It ends before it starts.'
      return null
    }
    if (!clinic) return 'Choose the clinic.'
    if (effectiveKind === 'capacity') return capacity === clinic.fellow_capacity ? 'That is the number of places it already has.' : null
    if (!from || from < today) return 'Choose a date from today on.'
    if (effectiveKind === 'day') {
      if (clinic.recurrence !== 'weekly') return 'A clinic that runs on specific dates can’t move to another weekday — change its dates on the setup screen.'
      if (weekday === clinic.weekday) return 'Choose a different day.'
    }
    if (effectiveKind === 'location' && (!site.trim() || site.trim() === clinic.site_code)) return 'Type the new location.'
    if (effectiveKind === 'pause' && (!until || until < from)) return 'Choose the last day of the pause.'
    return null
  }

  async function check() {
    const problem = validate()
    if (problem) { setErr(problem); return }
    setErr(null); setBusy(true)
    try {
      const horizon = (await scheduleHorizon()) ?? today
      const start = effectiveKind === 'capacity' ? today : from
      const end = effectiveKind === 'pause' ? until : horizon > start ? horizon : start
      const w = await loadClinicWorld(start, end)
      setWorld(w)
      const built = await buildEffect(w, end)
      setRows(built.rows)
      setNotes(built.notes)
      setStep(1)
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  /** What this change does to the days already on the schedule. */
  async function buildEffect(w: ClinicWorld, end: string): Promise<{ rows: DayRow[]; notes: string[] }> {
    const notes: string[] = []
    const k = effectiveKind
    const fellowName = (id: string) => w.fellows.find((f) => f.id === id)?.full_name ?? 'Fellow'

    if (k === 'start') {
      if (chosenPatterns.length === 0) {
        notes.push('It isn’t in any weekly pattern yet, so nobody is placed in it. You can add it to a pattern later, or place fellows day by day on the schedule.')
        return { rows: [], notes }
      }
      const last = until && until < end ? until : end
      if (last < from) {
        notes.push('The schedule hasn’t been made that far ahead yet. When it is, fellows on the chosen patterns are placed in the new clinic.')
        return { rows: [], notes }
      }
      const { data, error } = await supabase.rpc('clinic_pattern_days', { p_from: from, p_to: last > addDays(from, 399) ? addDays(from, 399) : last })
      if (error) throw new Error(error.message)
      const days = ((data as { fellow_id: string; d: string; template_id: string | null }[]) ?? [])
        .filter((x) => x.template_id && chosenPatterns.includes(x.template_id) && isoWeekday(x.d) === weekday)
      const perDay = new Map<string, number>()
      const rows: DayRow[] = days.map((x) => {
        const cur = rowFor(w, x.fellow_id, x.d)
        const away = cur?.is_away || w.fellowAway.has(`${x.fellow_id}|${x.d}`)
        const n = (perDay.get(x.d) ?? 0) + (away ? 0 : 1)
        perDay.set(x.d, n)
        const over = n > capacity
        return {
          key: `${x.fellow_id}|${x.d}`, date: x.d, who: fellowName(x.fellow_id),
          current: cellLabel(cur) + (cur?.is_draft ? ' (draft)' : ''),
          choice: 'new',
          options: [{ value: 'new', label: `${newProviderName} · ${site.trim()}` }, { value: 'keep', label: 'Keep what they have' }],
          include: !away && !over,
          blocked: away ? 'Away that day' : null,
          warn: over ? `Over its ${plural(capacity, 'place')} that day` : null,
        }
      }).sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who))
      notes.push(`From ${dateLabel(from)}, ${chosenPatterns.map((t) => patterns.find((p) => p.id === t)?.name).join(', ')} ${chosenPatterns.length === 1 ? 'has' : 'have'} the new clinic on ${WEEKDAY_NAMES[weekday]}s instead of what ${chosenPatterns.length === 1 ? 'it has' : 'they have'} now.`)
      return { rows, notes }
    }

    const c = clinic!
    const mineOn = (d: string) => w.rotations.filter((r) => r.fellow_id && r.rotation_date === d && rowIsClinic(r, c))

    if (k === 'location') {
      const rows: DayRow[] = w.rotations
        .filter((r) => r.fellow_id && r.rotation_date >= from && rowIsClinic(r, c))
        .map((r) => ({
          key: `${r.fellow_id}|${r.rotation_date}`, date: r.rotation_date, who: fellowName(r.fellow_id!),
          current: cellLabel(r) + (r.is_draft ? ' (draft)' : ''), choice: c.id,
          options: [{ value: c.id, label: `${site.trim()}${c.provider_name ? ` · ${c.provider_name}` : ''}` }],
          include: true,
        }))
      notes.push(`${clinicName(c)} moves to ${site.trim()} from ${dateLabel(from)}. Days before then stay where they are.`)
      return { rows, notes }
    }

    if (k === 'capacity') {
      if (capacity > c.fellow_capacity) {
        notes.push(`${clinicName(c)} will take up to ${plural(capacity, 'fellow')}. Fellows already placed elsewhere stay where they are; generating the schedule again fills the extra places on days that are still empty.`)
        return { rows: [], notes }
      }
      const rows: DayRow[] = []
      const taken = new Map<string, number>()
      for (const d of daysBetween(today, end)) {
        const here = mineOn(d).sort((a, b) => (a.fellow_label ?? '').localeCompare(b.fellow_label ?? ''))
        for (const r of here.slice(capacity)) rows.push(coverRow(w, r, new Set([c.id]), taken, fellowName(r.fellow_id!)))
      }
      notes.push(rows.length === 0
        ? `No day has more than ${plural(capacity, 'fellow')} in ${clinicName(c)}, so no day changes.`
        : `On these days ${clinicName(c)} has more fellows than its new ${plural(capacity, 'place')}. The ones listed move; a suggestion is filled in for each.`)
      return { rows, notes }
    }

    if (k === 'pause' || k === 'stop') {
      const last = k === 'pause' ? until : end
      const taken = new Map<string, number>()
      const rows = w.rotations
        .filter((r) => r.fellow_id && r.rotation_date >= from && r.rotation_date <= last && rowIsClinic(r, c))
        .sort((a, b) => a.rotation_date.localeCompare(b.rotation_date))
        .map((r) => coverRow(w, r, new Set([c.id]), taken, fellowName(r.fellow_id!)))
      if (k === 'stop') {
        const inPatterns = slots.filter((s) => s.clinic_template_id === c.id).map((s) => patterns.find((p) => p.id === s.template_id)?.name).filter(Boolean)
        notes.push(inPatterns.length
          ? `It comes out of ${inPatterns.join(', ')} — that day becomes free in ${inPatterns.length === 1 ? 'that pattern' : 'those patterns'}.`
          : 'It isn’t in any weekly pattern.')
      } else {
        notes.push(`Generating the schedule again won’t use it between ${dateLabel(from)} and ${dateLabel(until)}.`)
      }
      return { rows, notes }
    }

    // k === 'day'
    const delta = weekday - c.weekday
    const moved = { ...c, weekday }
    const preview: ClinicWorld = { ...w, clinics: w.clinics.map((x) => (x.id === c.id ? moved : x)) }
    const rows: DayRow[] = []
    const taken = new Map<string, number>()
    const oldRows = w.rotations
      .filter((r) => r.fellow_id && r.rotation_date >= from && rowIsClinic(r, c))
      .sort((a, b) => a.rotation_date.localeCompare(b.rotation_date))
    for (const r of oldRows) {
      const fid = r.fellow_id!
      // the old day is freed…
      rows.push({
        key: `${fid}|${r.rotation_date}`, date: r.rotation_date, who: fellowName(fid),
        current: cellLabel(r) + (r.is_draft ? ' (draft)' : ''), choice: 'free',
        options: [
          { value: 'free', label: 'Nothing scheduled' },
          { value: 'protected', label: 'Protected day' },
          ...clinicsWithRoom(w, r.rotation_date, { exclude: new Set([c.id]), ignoreFellows: new Set([fid]), taken })
            .map(({ clinic: x }) => ({ value: x.id, label: clinicName(x) })),
        ],
        include: true,
      })
      // …and the clinic moves to the new day that week
      const target = addDays(r.rotation_date, delta)
      if (target < from || target < today || target > w.to) continue
      const f = w.fellows.find((x) => x.id === fid)
      if (!inFellowship(f, target)) continue
      const cur = rowFor(w, fid, target)
      const away = cur?.is_away || w.fellowAway.has(`${fid}|${target}`)
      const hasClinic = !!cur && !cur.is_protected && !cur.is_away && cur.status !== 'cancelled'
      rows.push({
        key: `${fid}|${target}`, date: target, who: fellowName(fid),
        current: cellLabel(cur) + (cur?.is_draft ? ' (draft)' : ''), choice: hasClinic ? 'keep' : c.id,
        options: [{ value: c.id, label: `${clinicName(c)} (moved)` }, { value: 'keep', label: 'Keep what they have' }],
        include: !away,
        blocked: away ? 'Away that day' : null,
        warn: hasClinic ? `Already has ${cellLabel(cur)} — choose what happens` : cur?.is_protected ? 'Replaces a protected day' : null,
      })
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who))
    const withIt = slots.filter((s) => s.clinic_template_id === c.id)
    for (const s of withIt) {
      const name = patterns.find((p) => p.id === s.template_id)?.name ?? 'A pattern'
      const clash = slots.find((o) => o.template_id === s.template_id && o.weekday === weekday)
      notes.push(clash
        ? `${name} already has ${patternDayLabel(s.template_id, weekday)} on ${WEEKDAY_NAMES[weekday]}s, so the clinic comes out of ${name} — add it back on the setup screen if you want it there.`
        : `${name}: the clinic moves from ${WEEKDAY_NAMES[c.weekday]} to ${WEEKDAY_NAMES[weekday]}.`)
    }
    setWorld(preview)
    return { rows, notes }
  }

  const ops: DayOp[] = useMemo(() => {
    const out: DayOp[] = []
    for (const r of rows) {
      if (!r.include || r.blocked) continue
      const [fid, date] = r.key.split('|')
      const op = choiceToOp(fid, date, r.choice)
      if (op) out.push(op)
    }
    return out
  }, [rows])

  const previewWorld: ClinicWorld | null = useMemo(() => {
    if (!world) return null
    if (effectiveKind === 'start') {
      const fake: Clinic = {
        id: 'new', provider_name: newProviderName, provider_id: providerChoice && providerChoice !== 'other' ? providerChoice : null,
        weekday, site_code: site.trim(), fellow_capacity: capacity, recurrence: 'weekly', specific_dates: [],
        active_from: from, active_until: until || null, paused_dates: [],
      }
      return { ...world, clinics: [...world.clinics, fake] }
    }
    if (effectiveKind === 'capacity' && clinic) {
      return { ...world, clinics: world.clinics.map((x) => (x.id === clinic.id ? { ...x, fellow_capacity: capacity } : x)) }
    }
    return world
  }, [world, effectiveKind, newProviderName, providerChoice, weekday, site, capacity, from, until, clinic])

  const warnings = previewWorld ? capacityWarnings(previewWorld, rows) : new Map<string, string>()
  const shown = rows.map((r) => ({ ...r, warn: warnings.get(r.key) ?? r.warn }))
  const told = previewWorld ? whoIsTold(previewWorld, ops) : []

  function summary(): string {
    const c = clinic
    switch (effectiveKind) {
      case 'start': return `New clinic: ${newProviderName} · ${site.trim()}, ${WEEKDAY_NAMES[weekday]}s from ${dateLabel(from)}${until ? ` to ${dateLabel(until)}` : ''}`
      case 'day': return `${clinicName(c)} moves from ${WEEKDAY_NAMES[c!.weekday]}s to ${WEEKDAY_NAMES[weekday]}s from ${dateLabel(from)}`
      case 'location': return `${clinicName(c)} moves to ${site.trim()} from ${dateLabel(from)}`
      case 'capacity': return `${clinicName(c)} now takes up to ${plural(capacity, 'fellow')} (was ${c!.fellow_capacity})`
      case 'pause': return `${clinicName(c)} paused ${rangeLabel(from, until)}`
      case 'stop': return `${clinicName(c)} stops from ${dateLabel(from)}`
    }
  }

  async function apply() {
    setBusy(true); setErr(null)
    const k = effectiveKind
    let setup: Record<string, unknown> = {}
    if (k === 'start') {
      setup = { start: {
        provider_id: providerChoice && providerChoice !== 'other' ? providerChoice : null,
        provider_name: newProviderName, weekday, site_code: site.trim(), capacity,
        from, until: until || null, patterns: chosenPatterns,
      } }
    } else if (k === 'day') setup = { move: { clinic_id: clinicId, weekday } }
    else if (k === 'location') setup = { move: { clinic_id: clinicId, site_code: site.trim() } }
    else if (k === 'capacity') setup = { capacity: { clinic_id: clinicId, value: capacity } }
    else if (k === 'pause') setup = { pause: { clinic_id: clinicId, dates: daysBetween(from, until) } }
    else if (k === 'stop') setup = { stop: { clinic_id: clinicId, from } }
    const { data, error } = await supabase.rpc('apply_clinic_changes', {
      p_kind: `clinic_${k}`, p_summary: summary(), p_ops: ops, p_setup: setup, p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const res = data as { changed: number; told: number; patterns_moved: string[]; patterns_cleared: string[] }
    const extra: string[] = []
    if (res.patterns_moved?.length) extra.push(`Moved in ${res.patterns_moved.join(', ')}.`)
    if (res.patterns_cleared?.length) extra.push(`Taken out of ${res.patterns_cleared.join(', ')} — check ${res.patterns_cleared.length === 1 ? 'that pattern' : 'those patterns'} on the setup screen.`)
    setDone({ changed: res.changed, told: res.told, extra })
  }

  if (done) {
    return (
      <ChangeFrame title={KIND_TITLE[effectiveKind]} steps={STEPS} current={2}>
        <Applied changed={done.changed} told={done.told}>
          {done.extra.map((t) => <p key={t} className="text-sm text-muted">{t}</p>)}
          <p className="text-sm"><Link to="/clinic/setup?step=1" className="font-medium text-accent hover:underline">Look over the clinics and weekly patterns →</Link></p>
        </Applied>
      </ChangeFrame>
    )
  }

  return (
    <ChangeFrame title={step === 0 ? 'A clinic is changing' : KIND_TITLE[effectiveKind]} steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}

      {step === 0 && (
        <div className="space-y-5">
          <h2 className="font-display text-lg font-semibold text-ink">Which clinic, and what’s changing?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard name="cc-new" checked={!isNew} onChange={() => setIsNew(false)} title="An existing clinic is changing">
              A new day or location, more or fewer fellows, a pause, or it stops
            </ChoiceCard>
            <ChoiceCard name="cc-new" checked={isNew} onChange={() => setIsNew(true)} title="A new clinic is starting">
              Add it, and put it into the weekly patterns from a date
            </ChoiceCard>
          </div>

          {!isNew && (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <Field label="Clinic">
                <select id="cc-clinic" className={field} value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
                  <option value="">Choose…</option>
                  {clinics.map((c) => <option key={c.id} value={c.id}>{clinicName(c)} — {clinicWhen(c)}</option>)}
                </select>
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['day', 'location', 'capacity', 'pause', 'stop'] as Kind[]).map((k) => (
                  <ChoiceCard key={k} name="cc-kind" checked={kind === k} onChange={() => setKind(k)} title={KIND_TITLE[k]}>
                    {k === 'day' ? 'From a date onward' : k === 'location' ? 'From a date onward' : k === 'capacity' ? 'From now on'
                      : k === 'pause' ? 'e.g. a leave — it comes back after' : 'From a date onward; it leaves the weekly patterns'}
                  </ChoiceCard>
                ))}
              </div>
              {clinic && (
                <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                  {kind === 'day' && (
                    <Field label="New day">
                      <select id="cc-weekday" className={field} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5].filter((d) => d !== clinic.weekday).map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
                      </select>
                    </Field>
                  )}
                  {kind === 'location' && (
                    <Field label="New location"><input id="cc-site" className={field} value={site} onChange={(e) => setSite(e.target.value)} /></Field>
                  )}
                  {kind === 'capacity' && (
                    <Field label="Fellows it takes on one day" hint={`Now ${plural(clinic.fellow_capacity, 'fellow')}`}>
                      <select id="cc-capacity" className={field} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </Field>
                  )}
                  {kind !== 'capacity' && (
                    <Field label={kind === 'stop' ? 'First day it no longer runs' : kind === 'pause' ? 'Paused from' : 'From'}>
                      <input id="cc-from" type="date" min={today} className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
                    </Field>
                  )}
                  {kind === 'pause' && (
                    <Field label="Until (last day paused)"><input id="cc-until" type="date" min={from} className={field} value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
                  )}
                </div>
              )}
            </div>
          )}

          {isNew && (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Provider">
                  <select id="cc-provider" className={field} value={providerChoice} onChange={(e) => setProviderChoice(e.target.value)}>
                    <option value="">Choose…</option>
                    {providers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                    <option value="other">Someone without an account…</option>
                  </select>
                </Field>
                {providerChoice === 'other' && (
                  <Field label="Provider’s name"><input id="cc-provider-name" className={field} value={providerName} onChange={(e) => setProviderName(e.target.value)} /></Field>
                )}
                <Field label="Day">
                  <select id="cc-weekday" className={field} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
                  </select>
                </Field>
                <Field label="Where"><input id="cc-site" className={field} value={site} onChange={(e) => setSite(e.target.value)} placeholder="Hospital and clinic" /></Field>
                <Field label="Fellows it takes on one day">
                  <select id="cc-capacity" className={field} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Starts on"><input id="cc-from" type="date" min={today} className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="Ends (optional)" hint="Leave empty if it carries on"><input id="cc-until" type="date" min={from} className={field} value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
              </div>
              {patterns.length > 0 && (
                <div className="border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Which weekly patterns get it on {WEEKDAY_NAMES[weekday]}s?</p>
                  <p className="text-xs text-muted">It replaces whatever that pattern has on {WEEKDAY_NAMES[weekday]}s now. Leave all unticked to place fellows yourself.</p>
                  <ul className="mt-2 space-y-1.5">
                    {patterns.map((p) => (
                      <li key={p.id}>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input type="checkbox" checked={chosenPatterns.includes(p.id)}
                            onChange={(e) => setChosenPatterns(e.target.checked ? [...chosenPatterns, p.id] : chosenPatterns.filter((x) => x !== p.id))} />
                          {p.name} <span className="text-muted">— {WEEKDAY_NAMES[weekday]} now: {patternDayLabel(p.id, weekday)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <StepNav onNext={check} nextLabel="Check the effect →" busy={busy} />
        </div>
      )}

      {step === 1 && world && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Here’s what this changes</h2>
          <p className="text-sm text-ink">{summary()}.</p>
          {notes.map((n) => <Notice key={n}>{n}</Notice>)}
          <DayTable rows={shown} onChange={setRows}
            emptyText={effectiveKind === 'start' ? 'No fellow days are placed in it yet.' : 'No fellow days on the schedule are affected.'} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </div>
      )}

      {step === 2 && world && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm the change</h2>
          <SummaryList items={[
            ['Change', summary()],
            ['Clinic days', ops.length === 0 ? 'None change' : `${plural(ops.length, 'day')} change`],
            ...(notes.length ? [['Weekly patterns', notes.join(' ')] as [string, string]] : []),
          ]} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(1)} onNext={apply} nextLabel="Apply the change" busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}

/** A row for a fellow-day that has to leave a clinic, with the best place to go instead. */
function coverRow(w: ClinicWorld, r: Rotation, exclude: Set<string>, taken: Map<string, number>, who: string): DayRow {
  const d = r.rotation_date
  const fid = r.fellow_id!
  const withRoom = clinicsWithRoom(w, d, { exclude, ignoreFellows: new Set([fid]), taken })
  const best = withRoom[0]?.clinic
  if (best) taken.set(`${best.id}|${d}`, (taken.get(`${best.id}|${d}`) ?? 0) + 1)
  return {
    key: `${fid}|${d}`, date: d, who,
    current: cellLabel(r) + (r.is_draft ? ' (draft)' : ''),
    choice: best ? best.id : 'protected',
    options: [
      ...withRoom.map(({ clinic, room }) => ({ value: clinic.id, label: `${clinicName(clinic)} (${plural(room, 'place')} free)` })),
      { value: 'protected', label: 'Protected day' },
      { value: 'free', label: 'Nothing scheduled' },
      { value: 'keep', label: 'Leave it — I’ll sort it out' },
    ],
    include: true,
    warn: best ? null : 'No other clinic has room that day',
  }
}
