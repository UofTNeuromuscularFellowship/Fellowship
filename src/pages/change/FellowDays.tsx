import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localToday } from '../../lib/format'
import { field, Notice } from '../../components/ui/Wizard'
import {
  ChangeFrame, StepNav, DayTable, WhoIsTold, NotifyChoice, SummaryList, Applied, Field, type DayRow,
} from '../../components/change/ChangeKit'
import {
  CLINIC_COLUMNS, WEEKDAY_SHORT, loadClinicWorld, clinicName, clinicWhen, cellLabel, choiceToOp, choiceLabel,
  whoIsTold, weekdaysBetween, isoWeekday, rangeLabel, plural, capacityWarnings, rowFor, inFellowship,
  clinicOffersDay, clinicClosedReason, dateLabel,
  type Clinic, type ClinicWorld, type Fellow, type DayOp,
} from '../../lib/schedule'

const STEPS = ['Which days', 'Check them', 'Confirm']

export default function FellowDays() {
  const today = localToday()
  const [step, setStep] = useState(0)
  const [fellows, setFellows] = useState<Fellow[]>([])
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [fellowId, setFellowId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [choice, setChoice] = useState('protected')
  const [note, setNote] = useState('')
  const [world, setWorld] = useState<ClinicWorld | null>(null)
  const [rows, setRows] = useState<DayRow[]>([])
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number } | null>(null)

  useEffect(() => {
    supabase.rpc('list_fellows', { p_from: today, p_to: null, p_all: true })
      .then(({ data }) => setFellows(((data as Fellow[]) ?? []).filter((f) => !f.fellowship_end || f.fellowship_end >= today)))
    supabase.from('clinic_template').select(CLINIC_COLUMNS).order('weekday').order('provider_name')
      .then(({ data }) => setClinics(((data as Clinic[]) ?? []).filter((c) => !c.active_until || c.active_until >= today)))
  }, [today])

  const fellow = fellows.find((f) => f.id === fellowId)
  const last = to || from
  const long = !!from && !!last && last > from

  async function check() {
    setErr(null)
    if (!fellowId || !from) { setErr('Choose the fellow and the first day.'); return }
    if (from < today) { setErr('Choose a day from today on.'); return }
    if (last < from) { setErr('The last day is before the first day.'); return }
    if (long && days.length === 0) { setErr('Tick at least one weekday.'); return }
    setBusy(true)
    try {
      const w = await loadClinicWorld(from, last)
      setWorld(w)
      const dates = weekdaysBetween(from, last).filter((d) => !long || days.includes(isoWeekday(d)))
      const target = clinics.find((c) => c.id === choice)
      setRows(dates.map((d) => {
        const cur = rowFor(w, fellowId, d)
        let blocked: string | null = null
        if (!inFellowship(w.fellows.find((f) => f.id === fellowId) ?? fellow, d)) blocked = 'Outside their fellowship'
        else if (target && !clinicOffersDay(target, d)) blocked = 'The clinic doesn’t run that day'
        else if (target && clinicClosedReason(target, d, w)) blocked = `The clinic isn’t running (${clinicClosedReason(target, d, w)})`
        const awayWarn = (cur?.is_away || w.fellowAway.has(`${fellowId}|${d}`)) && choice !== 'away' ? 'They are away that day' : null
        return {
          key: `${fellowId}|${d}`, date: d, who: fellow?.full_name ?? 'Fellow',
          current: cellLabel(cur) + (cur?.is_draft ? ' (draft)' : ''),
          choice, options: [{ value: choice, label: choiceLabel(choice, clinics) }],
          include: !blocked && cellLabel(cur) !== choiceLabel(choice, clinics),
          blocked, warn: awayWarn,
        }
      }))
      setStep(1)
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  const ops: DayOp[] = useMemo(() => rows.filter((r) => r.include && !r.blocked)
    .map((r) => {
      const [fid, d] = r.key.split('|')
      const op = choiceToOp(fid, d, r.choice)
      return op ? { ...op, note: note.trim() || undefined } : null
    }).filter(Boolean) as DayOp[], [rows, note])

  const warnings = world ? capacityWarnings(world, rows) : new Map<string, string>()
  const shown = rows.map((r) => ({ ...r, warn: warnings.get(r.key) ?? r.warn }))
  const told = world ? whoIsTold(world, ops) : []

  async function apply() {
    setBusy(true); setErr(null)
    const summary = `${fellow?.full_name}: ${plural(ops.length, 'day')} ${rangeLabel(from, last)} changed to ${choiceLabel(choice, clinics)}${note.trim() ? ` (${note.trim()})` : ''}`
    const { data, error } = await supabase.rpc('apply_clinic_changes', {
      p_kind: 'fellow_days', p_summary: summary, p_ops: ops, p_setup: {}, p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(data as { changed: number; told: number })
  }

  if (done) {
    return <ChangeFrame title="Change one fellow’s days" steps={STEPS} current={2}><Applied changed={done.changed} told={done.told} /></ChangeFrame>
  }

  return (
    <ChangeFrame title="Change one fellow’s days" steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Whose days, and what instead?</h2>
          <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Fellow" hint={fellow ? `Fellowship: ${rangeLabel(fellow.fellowship_start, fellow.fellowship_end)}` : undefined}>
                <select id="fd-fellow" className={field} value={fellowId} onChange={(e) => setFellowId(e.target.value)}>
                  <option value="">Choose…</option>
                  {fellows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="First day"><input id="fd-from" type="date" min={today} className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Last day" hint="Leave empty for one day"><input id="fd-to" type="date" min={from || today} className={field} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            {long && (
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-muted">On these weekdays</span>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <label key={d} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${days.includes(d) ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted'}`}>
                      <input type="checkbox" className="sr-only" checked={days.includes(d)}
                        onChange={(e) => setDays(e.target.checked ? [...days, d].sort() : days.filter((x) => x !== d))} />
                      {WEEKDAY_SHORT[d]}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <Field label="Instead">
                <select id="fd-choice" className={field} value={choice} onChange={(e) => setChoice(e.target.value)}>
                  <option value="protected">Protected day</option>
                  <option value="free">Nothing scheduled</option>
                  <option value="away">Away</option>
                  <optgroup label="A clinic">
                    {clinics.map((c) => <option key={c.id} value={c.id}>{clinicName(c)} — {clinicWhen(c)}</option>)}
                  </optgroup>
                </select>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Note (optional)" hint="Shown on the schedule for those days"><input id="fd-note" className={field} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </div>
          </div>
          <p className="text-xs text-muted">For vacation, a fellow’s request on the Vacation page keeps their approved time off in one place; use “Away” here for time off that’s already been agreed.</p>
          <StepNav onNext={check} nextLabel="Check the days →" busy={busy} />
        </div>
      )}

      {step === 1 && world && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">{fellow?.full_name}: {choiceLabel(choice, clinics)}</h2>
          <DayTable rows={shown} onChange={setRows} emptyText="There are no weekdays in that range." />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={ops.length === 0} />
        </div>
      )}

      {step === 2 && world && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm the change</h2>
          <SummaryList items={[
            ['Fellow', fellow?.full_name ?? ''],
            ['Days', `${plural(ops.length, 'day')} between ${dateLabel(from)} and ${dateLabel(last)}`],
            ['Instead', choiceLabel(choice, clinics)],
          ]} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(1)} onNext={apply} nextLabel="Apply the change" busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}
