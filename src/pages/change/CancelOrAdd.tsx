import { useEffect, useMemo, useState } from 'react'
import { localToday } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { field, ChoiceCard, Notice } from '../../components/ui/Wizard'
import { ChangeFrame, StepNav, WhoIsTold, NotifyChoice, SummaryList, Applied, Field } from '../../components/change/ChangeKit'
import { addDays, dayLabel } from '../../lib/schedule'
import {
  loadTeachingWorld, rankTeachers, sessionLabel, teacherLabel, regularPattern, type TeachingWorld,
} from '../../lib/teaching'

const STEPS = ['What', 'Confirm']

/** Cancel a session, or add a one-off one. */
export default function CancelOrAdd() {
  const today = localToday()
  const [step, setStep] = useState(0)
  const [world, setWorld] = useState<TeachingWorld | null>(null)
  const [mode, setMode] = useState<'cancel' | 'add'>('cancel')
  const [sessionId, setSessionId] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('09:00')
  const [topic, setTopic] = useState('')
  const [teacher, setTeacher] = useState('none')
  const [otherName, setOtherName] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number } | null>(null)

  useEffect(() => {
    loadTeachingWorld(today, addDays(today, 400)).then((w) => {
      setWorld(w)
      const reg = regularPattern(w.sessions)
      if (reg) { setStart(reg.start); setEnd(reg.end) }
    }).catch((e) => setErr((e as Error).message))
  }, [today])

  const upcoming = useMemo(() => (world?.sessions ?? []).filter((s) => !s.is_break && s.status !== 'cancelled'), [world])
  const session = upcoming.find((s) => s.id === sessionId)
  const ranked = world && date ? rankTeachers(world, date, topic.trim() || null) : []
  const teacherName = teacher === 'none' ? null : teacher === 'other' ? otherName.trim() || null : world?.teachers.find((t) => t.id === teacher)?.full_name ?? null

  const checks: string[] = []
  if (world && mode === 'add' && date) {
    if (upcoming.some((s) => s.session_date === date)) checks.push(`There is already a session on ${dayLabel(date)}.`)
    if (teacher !== 'none' && teacher !== 'other' && world.away.has(`${teacher}|${date}`)) checks.push(`${teacherName} is away that day.`)
  }

  function summary(): string {
    if (mode === 'cancel' && session) return `Cancelled: ${sessionLabel(session)}${reason.trim() ? ` (${reason.trim()})` : ''}`
    return `New session: ${topic.trim() || 'topic to be confirmed'}, ${date ? dayLabel(date) : ''} ${start}–${end}${teacherName ? `, ${teacherName}` : ''}`
  }

  function next() {
    setErr(null)
    if (mode === 'cancel' && !session) { setErr('Choose the session to cancel.'); return }
    if (mode === 'add') {
      if (!date || date < today) { setErr('Choose a date from today on.'); return }
      if (!start || !end || end <= start) { setErr('The session has to end after it starts.'); return }
      if (teacher === 'other' && !otherName.trim()) { setErr('Type the teacher’s name.'); return }
    }
    setStep(1)
  }

  async function apply() {
    setBusy(true); setErr(null)
    const change = mode === 'cancel'
      ? { session_id: sessionId, cancel: true, reason: reason.trim() || null }
      : {
          add: true, date, start, end, topic: topic.trim() || null,
          teacher: teacher === 'none' ? null : teacher === 'other' ? { provider_id: null, provider_name: otherName.trim() } : { provider_id: teacher },
        }
    const { data, error } = await supabase.rpc('apply_teaching_changes', {
      p_kind: mode === 'cancel' ? 'cancel' : 'add', p_summary: summary(), p_changes: [change], p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(data as { changed: number; told: number })
  }

  const title = step === 0 ? 'Cancel or add a session' : mode === 'cancel' ? 'Cancel a session' : 'Add a session'
  if (done) return <ChangeFrame title={title} steps={STEPS} current={1}><Applied changed={done.changed} told={done.told} unit="session" /></ChangeFrame>

  const told = mode === 'cancel'
    ? [...(session?.provider_name ? [`${session.provider_name} — told it’s cancelled`] : []), 'Fellows']
    : [...(teacherName && teacher !== 'other' ? [`${teacherName} — asked to confirm`] : []), 'Fellows']

  return (
    <ChangeFrame title={title} steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}
      {!world && <p className="text-sm text-muted">Loading…</p>}
      {world && step === 0 && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard name="ca-mode" checked={mode === 'cancel'} onChange={() => setMode('cancel')} title="Cancel a session">The teacher and fellows are told</ChoiceCard>
            <ChoiceCard name="ca-mode" checked={mode === 'add'} onChange={() => setMode('add')} title="Add a one-off session">An extra session on any day</ChoiceCard>
          </div>
          {mode === 'cancel' ? (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <Field label="Session">
                <select id="ca-session" className={field} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  <option value="">Choose…</option>
                  {upcoming.map((s) => <option key={s.id} value={s.id}>{sessionLabel(s)} — {teacherLabel(s)}</option>)}
                </select>
              </Field>
              <Field label="Reason (optional)" hint="Included in the emails"><input id="ca-reason" className={field} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Date"><input id="ca-date" type="date" min={today} className={field} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Starts"><input id="ca-start" type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                <Field label="Ends"><input id="ca-end" type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
              </div>
              <Field label="Topic"><input id="ca-topic" className={field} value={topic} onChange={(e) => setTopic(e.target.value)} /></Field>
              <Field label="Teacher">
                <select id="ca-teacher" className={field} value={teacher} onChange={(e) => setTeacher(e.target.value)}>
                  <option value="none">No teacher yet</option>
                  {(date ? ranked : (world.teachers.map((t) => ({ t, note: '' })))).map(({ t, note }) => (
                    <option key={t.id} value={t.id}>{t.full_name}{note ? ` — ${note}` : ''}</option>
                  ))}
                  <option value="other">Someone without an account…</option>
                </select>
              </Field>
              {teacher === 'other' && <Field label="Teacher’s name"><input id="ca-other" className={field} value={otherName} onChange={(e) => setOtherName(e.target.value)} /></Field>}
            </div>
          )}
          {checks.map((c) => <Notice key={c} tone="warn">{c}</Notice>)}
          <StepNav onNext={next} />
        </div>
      )}
      {world && step === 1 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm</h2>
          <SummaryList items={[['Change', summary()], ...(checks.length ? [['Check', checks.join(' ')] as [string, string]] : [])]} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(0)} onNext={apply} nextLabel={mode === 'cancel' ? 'Cancel the session' : 'Add the session'} busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}
