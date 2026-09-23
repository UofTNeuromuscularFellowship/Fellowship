import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { localToday } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { field, Notice } from '../../components/ui/Wizard'
import { ChangeFrame, StepNav, WhoIsTold, NotifyChoice, SummaryList, Applied, Field } from '../../components/change/ChangeKit'
import { addDays, dayLabel } from '../../lib/schedule'
import {
  loadTeachingWorld, rankTeachers, sessionLabel, teacherLabel, time5, type TeachingWorld,
} from '../../lib/teaching'

const STEPS = ['Which session', 'What changes', 'Confirm']
const BADGE: Record<string, string> = {
  usual: 'border-accent text-accent', free: 'border-line text-muted', busy: 'border-amber-400 text-amber-700 dark:text-amber-300', away: 'border-rose-300 text-rose-700 dark:text-rose-300',
}
const BADGE_TEXT: Record<string, string> = { usual: 'Best match', free: 'Available', busy: 'Busy', away: 'Away' }

/** Move a session, or give it a different teacher or topic. */
export default function SessionChange() {
  const [params] = useSearchParams()
  const today = localToday()
  const [step, setStep] = useState(0)
  const [world, setWorld] = useState<TeachingWorld | null>(null)
  const [filter, setFilter] = useState('')
  const [sessionId, setSessionId] = useState(params.get('session') ?? '')
  const [changeTeacher, setChangeTeacher] = useState(true)
  const [changeWhen, setChangeWhen] = useState(false)
  const [changeTopic, setChangeTopic] = useState(false)
  const [teacher, setTeacher] = useState('')        // id, 'none' or 'other'
  const [otherName, setOtherName] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [topic, setTopic] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number } | null>(null)

  useEffect(() => {
    loadTeachingWorld(today, addDays(today, 400)).then(setWorld).catch((e) => setErr((e as Error).message))
  }, [today])

  const upcoming = useMemo(() => (world?.sessions ?? []).filter((s) => !s.is_break && s.status !== 'cancelled'), [world])
  const session = upcoming.find((s) => s.id === sessionId)
  useEffect(() => {
    if (!session) return
    setDate(session.session_date); setStart(time5(session.start_time)); setEnd(time5(session.end_time)); setTopic(session.topic ?? '')
    setTeacher(session.provider_id ?? (session.provider_name ? 'other' : 'none')); setOtherName(session.provider_id ? '' : session.provider_name ?? '')
  }, [sessionId, world]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (params.get('session') && session) setStep(1) }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const topics = useMemo(() => Array.from(new Set([...(world?.defaults ?? []).map((d) => d.topic), ...upcoming.map((s) => s.topic ?? '')].filter(Boolean))).sort(), [world, upcoming])
  const newDate = changeWhen ? date : session?.session_date ?? ''
  const newTopic = changeTopic ? topic.trim() : session?.topic ?? ''
  const ranked = world && session ? rankTeachers(world, newDate, newTopic || null, session.id) : []
  const teacherName = teacher === 'none' ? null : teacher === 'other' ? otherName.trim() || null : world?.teachers.find((t) => t.id === teacher)?.full_name ?? null

  const checks: string[] = []
  if (world && session) {
    if (changeWhen) {
      if (world.sessions.some((s) => s.id !== session.id && s.session_date === date && !s.is_break && s.status !== 'cancelled')) checks.push(`There is already a session on ${dayLabel(date)}.`)
      if (world.sessions.some((s) => s.session_date === date && s.is_break)) checks.push(`${dayLabel(date)} is marked as a break.`)
    }
    const tid = changeTeacher ? (teacher !== 'none' && teacher !== 'other' ? teacher : null) : session.provider_id
    if (tid && world.away.has(`${tid}|${newDate}`)) checks.push(`${world.teachers.find((t) => t.id === tid)?.full_name ?? 'The teacher'} is away on ${dayLabel(newDate)}.`)
  }

  function describe(): string {
    if (!session) return ''
    const bits: string[] = []
    if (changeWhen && (date !== session.session_date || start !== time5(session.start_time) || end !== time5(session.end_time))) bits.push(`moved to ${dayLabel(date)}, ${start}–${end}`)
    if (changeTopic && newTopic !== (session.topic ?? '')) bits.push(`topic now ${newTopic || 'to be confirmed'}`)
    if (changeTeacher && (teacherName ?? null) !== (session.provider_name ?? null)) bits.push(teacherName ? `now taught by ${teacherName}` : 'teacher to be confirmed')
    return bits.length ? `${session.topic ?? 'Session'} on ${dayLabel(session.session_date)}: ${bits.join('; ')}` : ''
  }

  function next() {
    setErr(null)
    if (!session) { setErr('Choose a session.'); return }
    if (!changeTeacher && !changeWhen && !changeTopic) { setErr('Choose what changes.'); return }
    if (changeWhen && (!date || date < today)) { setErr('Choose a date from today on.'); return }
    if (changeWhen && (!start || !end || end <= start)) { setErr('The session has to end after it starts.'); return }
    if (changeTeacher && teacher === 'other' && !otherName.trim()) { setErr('Type the teacher’s name.'); return }
    if (!describe()) { setErr('Nothing is different yet.'); return }
    setStep(2)
  }

  const told: string[] = []
  if (session && changeTeacher && teacherName !== session.provider_name) {
    if (session.provider_name) told.push(`${session.provider_name} — no longer teaching`)
    if (teacherName && teacher !== 'other') told.push(`${teacherName} — asked to confirm`)
  } else if (session?.provider_id) told.push(`${session.provider_name} — asked to confirm the change`)
  told.push('Fellows — schedule updated')

  async function apply() {
    if (!session) return
    setBusy(true); setErr(null)
    const change: Record<string, unknown> = { session_id: session.id }
    if (changeWhen) Object.assign(change, { date, start, end })
    if (changeTopic) change.topic = newTopic || null
    if (changeTeacher) change.teacher = teacher === 'none' ? null
      : teacher === 'other' ? { provider_id: null, provider_name: otherName.trim() } : { provider_id: teacher }
    const { data, error } = await supabase.rpc('apply_teaching_changes', {
      p_kind: 'session', p_summary: describe(), p_changes: [change], p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(data as { changed: number; told: number })
  }

  if (done) return <ChangeFrame title="Move or reassign a session" steps={STEPS} current={2}><Applied changed={done.changed} told={done.told} unit="session" /></ChangeFrame>

  const list = upcoming.filter((s) => !filter.trim() || `${s.topic} ${s.provider_name} ${dayLabel(s.session_date)}`.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <ChangeFrame title="Move or reassign a session" steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}
      {!world && <p className="text-sm text-muted">Loading…</p>}

      {world && step === 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Which session?</h2>
          <input className={field} placeholder="Search by topic, teacher or date" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search sessions" />
          <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto rounded-lg border border-line bg-surface">
            {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No upcoming sessions match.</li>}
            {list.map((s) => (
              <li key={s.id}>
                <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 text-sm ${sessionId === s.id ? 'bg-accent-soft' : 'hover:bg-paper'}`}>
                  <input type="radio" name="sc-session" className="mt-1" checked={sessionId === s.id} onChange={() => setSessionId(s.id)} />
                  <span>
                    <span className="block font-medium text-ink">{sessionLabel(s)}</span>
                    <span className="block text-xs text-muted">{teacherLabel(s)}{s.provider_confirmed ? ' · confirmed' : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <StepNav onNext={() => (session ? setStep(1) : setErr('Choose a session.'))} />
        </div>
      )}

      {world && step === 1 && session && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{sessionLabel(session)}</h2>
            <p className="mt-1 text-sm text-muted">{teacherLabel(session)}. Pick what changes — the teacher list shows who is free that day.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([['Different teacher', changeTeacher, setChangeTeacher], ['Different date or time', changeWhen, setChangeWhen], ['Different topic', changeTopic, setChangeTopic]] as [string, boolean, (v: boolean) => void][]).map(([t, on, set]) => (
              <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${on ? 'border-accent bg-accent-soft font-medium text-ink' : 'border-line text-muted'}`}>
                <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />{t}
              </label>
            ))}
          </div>

          {changeWhen && (
            <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-3">
              <Field label="Date"><input id="sc-date" type="date" min={today} className={field} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Starts"><input id="sc-start" type="time" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="Ends"><input id="sc-end" type="time" className={field} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            </div>
          )}
          {changeTopic && (
            <div className="rounded-lg border border-line bg-surface p-5">
              <Field label="Topic">
                <input id="sc-topic" list="sc-topics" className={field} value={topic} onChange={(e) => setTopic(e.target.value)} />
              </Field>
              <datalist id="sc-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          )}
          {changeTeacher && (
            <div className="rounded-lg border border-line bg-surface">
              <p className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">Who teaches it on {dayLabel(newDate)}</p>
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {ranked.map(({ t, a, note }) => (
                  <li key={t.id}>
                    <label className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm ${teacher === t.id ? 'bg-accent-soft' : 'hover:bg-paper'}`}>
                      <span className="flex items-center gap-3">
                        <input type="radio" name="sc-teacher" checked={teacher === t.id} onChange={() => setTeacher(t.id)} />
                        <span><span className="block text-ink">{t.full_name}{t.role === 'fellow' ? ' (fellow)' : ''}</span><span className="block text-xs text-muted">{t.id === session.provider_id ? 'Teaching it now' : note}</span></span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE[a]}`}>{BADGE_TEXT[a]}</span>
                    </label>
                  </li>
                ))}
                <li>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper">
                    <input type="radio" name="sc-teacher" checked={teacher === 'other'} onChange={() => setTeacher('other')} />
                    <span className="text-ink">Someone without an account</span>
                  </label>
                  {teacher === 'other' && (
                    <div className="px-4 pb-3"><input className={field} placeholder="Their name" value={otherName} onChange={(e) => setOtherName(e.target.value)} aria-label="Teacher's name" /></div>
                  )}
                </li>
                <li>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper">
                    <input type="radio" name="sc-teacher" checked={teacher === 'none'} onChange={() => setTeacher('none')} />
                    <span className="text-ink">No teacher yet</span>
                  </label>
                </li>
              </ul>
            </div>
          )}
          {checks.map((c) => <Notice key={c} tone="warn">{c}</Notice>)}
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(0)} onNext={next} />
        </div>
      )}

      {world && step === 2 && session && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm the change</h2>
          <SummaryList items={[
            ['Session', sessionLabel(session)],
            ['Change', describe()],
            ...(checks.length ? [['Check', checks.join(' ')] as [string, string]] : []),
          ]} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(1)} onNext={apply} nextLabel="Apply the change" busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}

