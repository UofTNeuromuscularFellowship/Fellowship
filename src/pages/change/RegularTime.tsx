import { useEffect, useMemo, useState } from 'react'
import { localToday } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { field, Notice } from '../../components/ui/Wizard'
import {
  ChangeFrame, StepNav, DayTable, WhoIsTold, NotifyChoice, SummaryList, Applied, Field, type DayRow,
} from '../../components/change/ChangeKit'
import { WEEKDAY_NAMES, addDays, dayLabel, dateLabel, isoWeekday, plural } from '../../lib/schedule'
import { loadTeachingWorld, regularPattern, time5, type TeachingWorld } from '../../lib/teaching'

const STEPS = ['New day and time', 'Check the sessions', 'Confirm']

/** Move the regular teaching slot — the day, the time or both — from a date onward. */
export default function RegularTime() {
  const today = localToday()
  const [step, setStep] = useState(0)
  const [world, setWorld] = useState<TeachingWorld | null>(null)
  const [from, setFrom] = useState(today)
  const [weekday, setWeekday] = useState(4)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('09:00')
  const [rows, setRows] = useState<DayRow[]>([])
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number } | null>(null)

  useEffect(() => {
    loadTeachingWorld(today, addDays(today, 400)).then((w) => {
      setWorld(w)
      const reg = regularPattern(w.sessions)
      if (reg) { setWeekday(reg.weekday <= 5 ? reg.weekday : 4); setStart(reg.start); setEnd(reg.end) }
    }).catch((e) => setErr((e as Error).message))
  }, [today])

  const reg = useMemo(() => (world ? regularPattern(world.sessions) : null), [world])

  function check() {
    if (!world) return
    setErr(null)
    if (!from || from < today) { setErr('Choose a date from today on.'); return }
    if (!start || !end || end <= start) { setErr('The session has to end after it starts.'); return }
    if (reg && reg.weekday === weekday && reg.start === start && reg.end === end) { setErr('That is the regular day and time already.'); return }
    const live = world.sessions.filter((s) => !s.is_break && s.status !== 'cancelled' && s.session_date >= from)
    setRows(live.map((s) => {
      const onRegular = !reg || (isoWeekday(s.session_date) === reg.weekday && time5(s.start_time) === reg.start)
      const target = onRegular ? addDays(s.session_date, weekday - isoWeekday(s.session_date)) : s.session_date
      let blocked: string | null = null
      const warns: string[] = []
      if (target < today) blocked = 'The new day has already passed that week'
      if (s.provider_id && world.away.has(`${s.provider_id}|${target}`)) warns.push(`${s.provider_name} is away then`)
      if (world.sessions.some((o) => o.id !== s.id && o.session_date === target && !o.is_break && o.status !== 'cancelled')) warns.push('Another session is already that day')
      if (!onRegular) warns.push('Not on the regular day and time — left as it is unless you tick it')
      return {
        key: s.id, date: s.session_date, who: s.provider_name ?? 'No teacher yet',
        current: `${time5(s.start_time)}–${time5(s.end_time)} · ${s.topic ?? 'Topic to be confirmed'}`,
        choice: `${target}|${start}|${end}`,
        options: [{ value: `${target}|${start}|${end}`, label: `${dayLabel(target)}, ${start}–${end}` }],
        include: onRegular && !blocked,
        blocked, warn: warns.join(' · ') || null,
      }
    }))
    setStep(1)
  }

  const changes = rows.filter((r) => r.include && !r.blocked).map((r) => {
    const [date, s, e] = r.choice.split('|')
    return { session_id: r.key, date, start: s, end: e }
  })
  const summary = `Regular teaching moves to ${WEEKDAY_NAMES[weekday]}s, ${start}–${end}, from ${dateLabel(from)} (${plural(changes.length, 'session')})`
  const teachers = Array.from(new Set(rows.filter((r) => r.include && !r.blocked && r.who !== 'No teacher yet').map((r) => r.who)))

  async function apply() {
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('apply_teaching_changes', {
      p_kind: 'regular_time', p_summary: summary, p_changes: changes, p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(data as { changed: number; told: number })
  }

  if (done) return <ChangeFrame title="Change the regular day or time" steps={STEPS} current={2}><Applied changed={done.changed} told={done.told} unit="session" /></ChangeFrame>

  return (
    <ChangeFrame title="Change the regular day or time" steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}
      {!world && <p className="text-sm text-muted">Loading…</p>}
      {world && step === 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">The new regular day and time</h2>
            <p className="mt-1 text-sm text-muted">
              {reg ? `Sessions are now mostly ${WEEKDAY_NAMES[reg.weekday]}s, ${reg.start}–${reg.end}.` : 'There are no upcoming sessions yet.'}
              {' '}Each session moves within its own week. Breaks keep their dates.
            </p>
          </div>
          <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
            <Field label="From"><input id="rt-from" type="date" min={today} className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Day">
              <select id="rt-weekday" className={field} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
              </select>
            </Field>
            <Field label="Starts"><input id="rt-start" type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Ends"><input id="rt-end" type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <StepNav onNext={check} nextLabel="Check the sessions →" />
        </div>
      )}
      {world && step === 1 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">{plural(changes.length, 'session')} will move</h2>
          <DayTable rows={rows} onChange={setRows} whoHeading="Teacher" unit="session" emptyText="No sessions from that date." />
          <WhoIsTold names={[...teachers.map((t) => `${t} — asked to confirm`), 'Fellows']} notify={notify} />
          <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} nextDisabled={changes.length === 0} />
        </div>
      )}
      {world && step === 2 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm the change</h2>
          <SummaryList items={[['Change', summary]]} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={[...teachers.map((t) => `${t} — asked to confirm`), 'Fellows']} notify={notify} />
          <StepNav onBack={() => setStep(1)} onNext={apply} nextLabel="Apply the change" busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}
