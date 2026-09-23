import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localToday } from '../lib/format'
import { StepBar, Notice, ChoiceCard, field, label as labelCls, primary, quiet, textBtn } from '../components/ui/Wizard'
import { WEEKDAY_NAMES, addDays, isoWeekday, dayLabel, dateLabel, rangeLabel, academicYear, plural } from '../lib/schedule'
import { SESSION_COLUMNS, regularPattern, type Session, type Teacher, type TopicDefault } from '../lib/teaching'

// ---------------------------------------------------------------------------
// Setting up a teaching year, one step at a time:
//   1 When → 2 Dates off → 3 Topics → 4 Teachers → 5 Review and publish
// Nothing reaches the schedule until the last step; until then the plan is
// kept as a draft (app_settings 'teaching_setup_draft') so it can be finished
// later, on any device.
// ---------------------------------------------------------------------------

const STEPS = ['When', 'Dates off', 'Topics', 'Teachers', 'Review & publish']
const WAVEFORM = 'Waveform Rounds'

interface Plan {
  yearStart: string
  yearEnd: string
  weekday: number
  start: string
  end: string
  every: 1 | 2
  first: string
  off: Record<string, string>          // date -> break label
  topics: string[]                     // one per session, in date order
  usual: Record<string, string>        // topic -> teacher id, or 'name:<text>'
  waveform: { provider_id: string; weight: number }[]
  overrides: Record<string, string>    // date -> teacher id / 'name:<text>' / 'none'
}

function firstWeekdayOnOrAfter(iso: string, wd: number): string {
  const delta = (wd - isoWeekday(iso) + 7) % 7
  return addDays(iso, delta)
}
function datesFor(p: Plan): string[] {
  const out: string[] = []
  for (let d = p.first; d <= p.yearEnd; d = addDays(d, 7 * p.every)) out.push(d)
  return out
}

export default function TeachingSetup() {
  const navigate = useNavigate()
  const today = localToday()
  const [step, setStep] = useState(0)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [draftFound, setDraftFound] = useState<Plan | null>(null)
  const [existing, setExisting] = useState<Session[]>([])
  const [lastYear, setLastYear] = useState<Session[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [defaults, setDefaults] = useState<TopicDefault[]>([])
  const [away, setAway] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ created: number; breaks: number; skipped: number; told: number } | null>(null)
  const [notify, setNotify] = useState(true)
  const [asked, setAsked] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const saveTimer = useRef<number | null>(null)
  // only save once the director has changed something, so a draft found on
  // the server isn't overwritten before they choose to carry on with it
  const touched = useRef(false)

  // what's there already, last year's sessions, teachers, and any saved draft
  useEffect(() => {
    ;(async () => {
      const cur = academicYear(today)
      const prev = academicYear(addDays(cur.start, -1))
      const [ex, ly, t, d, wf, draft] = await Promise.all([
        supabase.from('teaching_sessions').select(SESSION_COLUMNS).gte('session_date', today).order('session_date'),
        supabase.from('teaching_sessions').select(SESSION_COLUMNS).gte('session_date', prev.start).lte('session_date', cur.end).order('session_date'),
        supabase.rpc('list_teachers'),
        supabase.from('topic_provider_defaults').select('topic, default_provider_id, default_provider_name'),
        supabase.from('app_settings').select('key, value').in('key', ['waveform_teachers', 'waveform_allocation']),
        supabase.from('app_settings').select('value').eq('key', 'teaching_setup_draft').maybeSingle(),
      ])
      const exRows = (ex.data as Session[]) ?? []
      const tList = (t.data as Teacher[]) ?? []
      const dList = (d.data as TopicDefault[]) ?? []
      setExisting(exRows)
      setTeachers(tList)
      setDefaults(dList)
      // the most recent full year of sessions, to copy topics from and read the rhythm
      const recent = ((ly.data as Session[]) ?? []).filter((s) => !s.is_break)
      const lastAy = recent.length ? academicYear(recent[recent.length - 1].session_date) : cur
      const yearRows = recent.filter((s) => s.session_date >= lastAy.start && s.session_date <= lastAy.end)
      setLastYear(yearRows)

      if (draft.data?.value) setDraftFound(draft.data.value as Plan)

      // a sensible first plan
      const reg = regularPattern(yearRows)
      const gaps = yearRows.slice(1).map((s, i) => (new Date(s.session_date).getTime() - new Date(yearRows[i].session_date).getTime()) / 864e5).sort((a, b) => a - b)
      const every: 1 | 2 = gaps.length && gaps[Math.floor(gaps.length / 2)] >= 12 ? 2 : 1
      const hasCurrent = exRows.some((s) => !s.is_break && s.session_date <= cur.end)
      const year = hasCurrent ? academicYear(addDays(cur.end, 1)) : cur
      const weekday = reg && reg.weekday <= 5 ? reg.weekday : 4
      const startFrom = year.start > today ? year.start : today
      const usual: Record<string, string> = {}
      for (const x of dList) {
        const byId = x.default_provider_id && tList.find((t2) => t2.id === x.default_provider_id)
        const byName = !byId && x.default_provider_name ? tList.find((t2) => t2.full_name === x.default_provider_name) : undefined
        usual[x.topic] = byId ? byId.id : byName ? byName.id : x.default_provider_name ? `name:${x.default_provider_name}` : ''
      }
      const settings = (wf.data as { key: string; value: unknown }[]) ?? []
      let waveform: { provider_id: string; weight: number }[] = []
      const byAccount = settings.find((s) => s.key === 'waveform_teachers')?.value
      const byName = settings.find((s) => s.key === 'waveform_allocation')?.value
      if (Array.isArray(byAccount)) waveform = byAccount as { provider_id: string; weight: number }[]
      else if (byName && typeof byName === 'object') {
        waveform = Object.entries(byName as Record<string, number>)
          .map(([name, w]) => ({ provider_id: tList.find((t2) => t2.full_name === name)?.id ?? '', weight: Number(w) }))
          .filter((x) => x.provider_id)
      }
      setPlan({
        yearStart: year.start, yearEnd: year.end, weekday, start: reg?.start ?? '08:00', end: reg?.end ?? '09:00', every,
        first: firstWeekdayOnOrAfter(startFrom, weekday), off: {}, topics: [], usual, waveform, overrides: {},
      })
    })()
  }, [today])

  // keep the draft as the plan changes
  useEffect(() => {
    if (!plan || done || !touched.current) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      supabase.from('app_settings').upsert({ key: 'teaching_setup_draft', value: plan, updated_at: new Date().toISOString() }, { onConflict: 'site_id,key' })
        .then(({ error }) => { if (error) setErr(`Couldn’t save your progress: ${error.message}`) })
    }, 800)
  }, [plan, done])

  const all = useMemo(() => (plan ? datesFor(plan) : []), [plan])
  const taken = useMemo(() => new Set(existing.map((s) => s.session_date)), [existing])
  const fresh = useMemo(() => all.filter((d) => !taken.has(d)), [all, taken])
  const sessionDates = useMemo(() => (plan ? fresh.filter((d) => !(d in plan.off)) : []), [fresh, plan])

  // away dates for the teachers in the year
  useEffect(() => {
    if (!plan) return
    ;(async () => {
      const [pa, fa] = await Promise.all([
        supabase.from('provider_away_dates').select('provider_id, away_date').gte('away_date', plan.first).lte('away_date', plan.yearEnd),
        supabase.from('fellow_away_dates').select('fellow_id, away_date').gte('away_date', plan.first).lte('away_date', plan.yearEnd),
      ])
      const s = new Set<string>()
      for (const a of (pa.data as { provider_id: string; away_date: string }[]) ?? []) s.add(`${a.provider_id}|${a.away_date}`)
      for (const a of (fa.data as { fellow_id: string; away_date: string }[]) ?? []) s.add(`${a.fellow_id}|${a.away_date}`)
      setAway(s)
    })()
  }, [plan?.first, plan?.yearEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Plan>) => { touched.current = true; setPlan((p) => (p ? { ...p, ...patch } : p)) }
  const nameOf = (v: string | undefined) => !v ? '' : v.startsWith('name:') ? v.slice(5) : teachers.find((t) => t.id === v)?.full_name ?? ''

  /** Who teaches each session: the topic's usual teacher, or the Waveform Rounds rotation, skipping anyone away. */
  const assignment = useMemo(() => {
    if (!plan) return [] as { date: string; topic: string; teacher: string; why: string }[]
    const seq: string[] = []
    const entries = plan.waveform.filter((w) => w.provider_id && w.weight > 0)
    const ord: { id: string; o: number; i: number }[] = []
    entries.forEach((w, i) => { for (let g = 1; g <= w.weight; g++) ord.push({ id: w.provider_id, o: g / w.weight, i }) })
    ord.sort((a, b) => a.o - b.o || a.i - b.i).forEach((x) => seq.push(x.id))
    let wf = 0
    return sessionDates.map((d, i) => {
      const topic = plan.topics[i] ?? ''
      const manual = plan.overrides[d]
      if (manual !== undefined) return { date: d, topic, teacher: manual === 'none' ? '' : manual, why: 'Chosen by you' }
      if (topic === WAVEFORM && seq.length) {
        let pick = ''
        for (let t = 0; t < seq.length; t++) {
          const c = seq[(wf + t) % seq.length]
          if (!away.has(`${c}|${d}`)) { pick = c; break }
        }
        wf++
        return { date: d, topic, teacher: pick, why: pick ? 'Waveform Rounds rotation' : 'Everyone in the rotation is away' }
      }
      const u = plan.usual[topic]
      if (!u) return { date: d, topic, teacher: '', why: topic ? 'No usual teacher for this topic' : 'No topic yet' }
      if (!u.startsWith('name:') && away.has(`${u}|${d}`)) return { date: d, topic, teacher: '', why: `${nameOf(u)} is away` }
      return { date: d, topic, teacher: u, why: 'Usual teacher' }
    })
  }, [plan, sessionDates, away]) // eslint-disable-line react-hooks/exhaustive-deps

  function copyLastYear() {
    if (!plan) return
    const list = lastYear.filter((s) => s.status !== 'cancelled').map((s) => s.topic ?? '')
    set({ topics: sessionDates.map((_, i) => list[i] ?? '') })
  }
  function usePaste() {
    if (!plan) return
    const list = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    set({ topics: sessionDates.map((_, i) => list[i] ?? plan.topics[i] ?? '') })
    setPaste('')
  }

  async function askAway() {
    if (!plan) return
    const { data, error } = await supabase.rpc('request_vacation_submissions', { p_audience: 'supervisors', p_from: plan.first, p_to: plan.yearEnd })
    if (error) { setErr(error.message); return }
    const r = data as { recipients: number; period: string | null }
    setAsked(`Asked ${plural(r.recipients, 'supervisor')} for their away dates${r.period ? ` for ${r.period}` : ''}.`)
  }

  async function publish() {
    if (!plan) return
    setBusy(true); setErr(null)
    const sessions = [
      ...fresh.filter((d) => d in plan.off).map((d) => ({ date: d, is_break: true, break_label: plan.off[d] || 'No session' })),
      ...assignment.map((a) => ({
        date: a.date, start: plan.start, end: plan.end, topic: a.topic || null,
        provider_id: a.teacher && !a.teacher.startsWith('name:') ? a.teacher : null,
        provider_name: a.teacher.startsWith('name:') ? a.teacher.slice(5) : null,
      })),
    ].sort((x, y) => x.date.localeCompare(y.date))
    const topics = Array.from(new Set(plan.topics.filter(Boolean))).map((t) => {
      const u = plan.usual[t] ?? ''
      return { topic: t, provider_id: u && !u.startsWith('name:') ? u : null, provider_name: u.startsWith('name:') ? u.slice(5) : null }
    })
    const { data, error } = await supabase.rpc('create_teaching_year', {
      p_sessions: sessions, p_topics: topics,
      p_waveform: plan.waveform.filter((w) => w.provider_id && w.weight > 0), p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(data as { created: number; breaks: number; skipped: number; told: number })
  }

  async function startAgain() {
    await supabase.from('app_settings').delete().eq('key', 'teaching_setup_draft')
    setDraftFound(null)
  }

  if (!plan) return <p className="text-sm text-muted">Loading…</p>

  const topicList = Array.from(new Set(plan.topics.filter(Boolean)))
  const ay = academicYear(plan.yearStart)
  const unassigned = assignment.filter((a) => !a.teacher).length

  if (done) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="font-display text-2xl font-bold text-ink">The {ay.label} teaching year is set</h1>
        <Notice tone="ok">
          {plural(done.created, 'session')} and {plural(done.breaks, 'break')} added{done.skipped ? ` (${plural(done.skipped, 'date')} already on the schedule were left alone)` : ''}.
          {done.told > 0 ? ` ${plural(done.told, 'person', 'people')} emailed — teachers were asked to confirm their sessions.` : ''}
        </Notice>
        <div className="flex flex-wrap gap-3">
          <Link to="/teaching" className={primary}>See the teaching schedule</Link>
          <Link to="/my-teaching" className={quiet}>Teaching assignments</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/my-teaching" className="text-xs font-medium text-muted hover:text-ink">← My Teaching</Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">Set up the {ay.label} teaching year</h1>
          <p className="mt-1 text-sm text-muted">Step {step + 1} of 5 · Your progress is kept as you go; nothing is published until the last step.</p>
        </div>
        <button type="button" className={quiet} onClick={() => navigate('/my-teaching')}>Save and finish later</button>
      </div>
      <StepBar steps={STEPS} current={step} onJump={setStep} />
      {err && <Notice tone="bad">{err}</Notice>}
      {draftFound && step === 0 && (
        <Notice>
          You have a setup in progress for {academicYear(draftFound.yearStart).label}.{' '}
          <button type="button" className="font-semibold underline" onClick={() => { touched.current = true; setPlan(draftFound); setDraftFound(null) }}>Carry on with it</button>
          {' '}or{' '}
          <button type="button" className="font-semibold underline" onClick={startAgain}>start again</button>.
        </Notice>
      )}

      {step === 0 && (
        <div className="space-y-5">
          <h2 className="font-display text-lg font-semibold text-ink">When does teaching happen?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {[academicYear(today), academicYear(addDays(academicYear(today).end, 1))].map((y) => (
              <ChoiceCard key={y.start} name="ts-year" checked={plan.yearStart === y.start} title={`${y.label} academic year`}
                onChange={() => set({ yearStart: y.start, yearEnd: y.end, first: firstWeekdayOnOrAfter(y.start > today ? y.start : today, plan.weekday), off: {}, topics: [], overrides: {} })}>
                {rangeLabel(y.start > today ? y.start : today, y.end)}
              </ChoiceCard>
            ))}
          </div>
          <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block"><span className={labelCls}>Day</span>
              <select id="ts-weekday" className={field} value={plan.weekday}
                onChange={(e) => { const wd = Number(e.target.value); set({ weekday: wd, first: firstWeekdayOnOrAfter(plan.first, wd), off: {}, overrides: {} }) }}>
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
              </select>
            </label>
            <label className="block"><span className={labelCls}>Starts</span><input id="ts-start" type="time" className={field} value={plan.start} onChange={(e) => set({ start: e.target.value })} /></label>
            <label className="block"><span className={labelCls}>Ends</span><input id="ts-end" type="time" className={field} value={plan.end} onChange={(e) => set({ end: e.target.value })} /></label>
            <label className="block"><span className={labelCls}>How often</span>
              <select id="ts-every" className={field} value={plan.every} onChange={(e) => set({ every: Number(e.target.value) as 1 | 2, off: {}, overrides: {} })}>
                <option value={1}>Every week</option>
                <option value={2}>Every two weeks</option>
              </select>
            </label>
            <label className="block sm:col-span-2"><span className={labelCls}>First session</span>
              <input id="ts-first" type="date" className={field} value={plan.first} min={today}
                onChange={(e) => e.target.value && set({ first: firstWeekdayOnOrAfter(e.target.value, plan.weekday), off: {}, overrides: {} })} />
            </label>
            <div className="flex items-end sm:col-span-2">
              <p className="text-sm text-ink">
                <strong>{plural(all.length, 'date')}</strong> from {dateLabel(plan.first)} to {dateLabel(all[all.length - 1] ?? plan.yearEnd)}
                {all.length !== fresh.length && <span className="block text-xs text-muted">{plural(all.length - fresh.length, 'date is', 'dates are')} already on the schedule and will be left as they are.</span>}
              </p>
            </div>
          </div>
          {plan.end <= plan.start && <Notice tone="warn">The session has to end after it starts.</Notice>}
          <Nav onNext={() => setStep(1)} disabled={plan.end <= plan.start || fresh.length === 0} />
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Any dates off?</h2>
            <p className="mt-1 text-sm text-muted">Untick a date to make it a break — holidays, conferences, exam weeks. Breaks show on the schedule with their name.</p>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {fresh.map((d) => {
              const off = d in plan.off
              return (
                <li key={d} className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${off ? 'border-line bg-paper' : 'border-line bg-surface'}`}>
                  <input type="checkbox" checked={!off} aria-label={`Session on ${dayLabel(d)}`}
                    onChange={(e) => {
                      const next = { ...plan.off }
                      if (e.target.checked) delete next[d]; else next[d] = plan.off[addDays(d, -7 * plan.every)] ?? 'Break'
                      set({ off: next, overrides: {} })
                    }} />
                  <span className={`w-28 shrink-0 ${off ? 'text-muted' : 'text-ink'}`}>{dayLabel(d)}</span>
                  {off && (
                    <input className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm" aria-label={`Name of the break on ${dayLabel(d)}`}
                      value={plan.off[d]} onChange={(e) => set({ off: { ...plan.off, [d]: e.target.value } })} />
                  )}
                </li>
              )
            })}
          </ul>
          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)}>
            <span className="text-sm text-muted">{plural(sessionDates.length, 'session')} · {plural(Object.keys(plan.off).length, 'break')}</span>
          </Nav>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Topics, and who usually teaches them</h2>
            <p className="mt-1 text-sm text-muted">Give each session a topic — copy last year’s in order, paste a list, or type them. Then pick the usual teacher for each topic.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quiet} onClick={copyLastYear} disabled={lastYear.length === 0}>
              Copy last year’s topics{lastYear.length ? ` (${lastYear.length})` : ''}
            </button>
            <details className="w-full sm:w-auto">
              <summary className={`${quiet} cursor-pointer list-none`}>Paste a list</summary>
              <div className="mt-2 space-y-2">
                <textarea className={field} rows={6} placeholder="One topic per line, in date order" value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Topics, one per line" />
                <button type="button" className={primary} onClick={usePaste} disabled={!paste.trim()}>Use this list</button>
              </div>
            </details>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[28rem] text-sm">
              <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted"><th className="w-36 px-4 py-2">Date</th><th className="px-4 py-2">Topic</th></tr></thead>
              <tbody>
                {sessionDates.map((d, i) => (
                  <tr key={d} className="border-t border-line">
                    <td className="px-4 py-1.5 text-ink">{dayLabel(d)}</td>
                    <td className="px-4 py-1.5">
                      <input list="ts-topic-list" aria-label={`Topic on ${dayLabel(d)}`} value={plan.topics[i] ?? ''}
                        onChange={(e) => { const t = [...plan.topics]; while (t.length < sessionDates.length) t.push(''); t[i] = e.target.value; set({ topics: t }) }}
                        className="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="ts-topic-list">{Array.from(new Set([...defaults.map((d) => d.topic), ...topicList, WAVEFORM])).map((t) => <option key={t} value={t} />)}</datalist>
          </div>

          {topicList.length > 0 && (
            <div className="rounded-lg border border-line bg-surface">
              <p className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">Usual teacher for each topic</p>
              <ul className="divide-y divide-line">
                {topicList.filter((t) => t !== WAVEFORM).map((t) => (
                  <li key={t} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span className="text-ink">{t} <span className="text-xs text-muted">· {plural(plan.topics.filter((x) => x === t).length, 'session')}</span></span>
                    <select aria-label={`Usual teacher for ${t}`} value={plan.usual[t] ?? ''} onChange={(e) => set({ usual: { ...plan.usual, [t]: e.target.value } })}
                      className="min-w-[12rem] rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                      <option value="">No usual teacher</option>
                      {teachers.map((x) => <option key={x.id} value={x.id}>{x.full_name}{x.role === 'fellow' ? ' (fellow)' : ''}</option>)}
                      {(plan.usual[t] ?? '').startsWith('name:') && <option value={plan.usual[t]}>{nameOf(plan.usual[t])} (no account)</option>}
                    </select>
                  </li>
                ))}
              </ul>
              {topicList.includes(WAVEFORM) && (
                <div className="border-t border-line px-4 py-3">
                  <p className="text-sm font-semibold text-ink">Waveform Rounds rotation</p>
                  <p className="text-xs text-muted">Teachers take turns in proportion to their share.</p>
                  <ul className="mt-2 space-y-1.5">
                    {plan.waveform.map((w, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <select aria-label="Rotation teacher" value={w.provider_id} className="min-w-[12rem] rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
                          onChange={(e) => set({ waveform: plan.waveform.map((x, j) => (j === i ? { ...x, provider_id: e.target.value } : x)) })}>
                          <option value="">Choose…</option>
                          {teachers.filter((x) => x.role !== 'fellow').map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                        </select>
                        <label className="flex items-center gap-1 text-xs text-muted">share
                          <input type="number" min={0} max={20} value={w.weight} aria-label="Share"
                            onChange={(e) => set({ waveform: plan.waveform.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })}
                            className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-sm" />
                        </label>
                        <button type="button" className={textBtn} onClick={() => set({ waveform: plan.waveform.filter((_, j) => j !== i) })}>Remove</button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className={`${textBtn} mt-2`} onClick={() => set({ waveform: [...plan.waveform, { provider_id: '', weight: 1 }] })}>+ Add a teacher</button>
                </div>
              )}
            </div>
          )}
          <Nav onBack={() => setStep(1)} onNext={() => setStep(3)}>
            <span className="text-sm text-muted">{plan.topics.filter(Boolean).length} of {sessionDates.length} have a topic</span>
          </Nav>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Teachers and their away dates</h2>
            <p className="mt-1 text-sm text-muted">Sessions are given to each topic’s usual teacher, skipping anyone away that day. Ask for away dates now so the plan is right first time.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={askAway}>Email supervisors for their away dates</button>
            <Link to="/vacation" className={quiet}>Add away dates</Link>
          </div>
          {asked && <Notice tone="ok">{asked}</Notice>}
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[30rem] text-sm">
              <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted"><th className="px-4 py-2">Teacher</th><th className="px-4 py-2">Sessions</th><th className="px-4 py-2">Away on a session date</th></tr></thead>
              <tbody>
                {Array.from(new Set(assignment.map((a) => a.teacher).filter(Boolean))).map((tid) => {
                  const mine = assignment.filter((a) => a.teacher === tid)
                  const clashes = sessionDates.filter((d) => away.has(`${tid}|${d}`))
                  return (
                    <tr key={tid} className="border-t border-line">
                      <td className="px-4 py-2 text-ink">{nameOf(tid)}</td>
                      <td className="px-4 py-2 text-ink">{mine.length}</td>
                      <td className="px-4 py-2 text-muted">{clashes.length ? clashes.map(dayLabel).join(', ') : 'None'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Nav onBack={() => setStep(2)} onNext={() => setStep(4)}>
            <span className="text-sm text-muted">{unassigned ? `${plural(unassigned, 'session')} without a teacher yet` : 'Every session has a teacher'}</span>
          </Nav>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Review and publish</h2>
            <p className="mt-1 text-sm text-muted">Change any teacher below. Publishing adds the year to the teaching schedule, asks each teacher to confirm their sessions, and emails fellows and supervisors the schedule.</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[36rem] text-sm">
              <thead><tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="w-32 px-4 py-2">Date</th><th className="px-4 py-2">Topic</th><th className="px-4 py-2">Teacher</th>
              </tr></thead>
              <tbody>
                {[...assignment.map((a) => ({ ...a, brk: null as string | null })), ...fresh.filter((d) => d in plan.off).map((d) => ({ date: d, topic: '', teacher: '', why: '', brk: plan.off[d] }))]
                  .sort((x, y) => x.date.localeCompare(y.date)).map((a) => a.brk !== null ? (
                    <tr key={a.date} className="border-t border-line bg-paper">
                      <td className="px-4 py-2 text-muted">{dayLabel(a.date)}</td>
                      <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{a.brk}</td>
                    </tr>
                  ) : (
                    <tr key={a.date} className={`border-t border-line ${!a.teacher ? 'bg-amber-50 dark:bg-amber-950' : ''}`}>
                      <td className="px-4 py-2 text-ink">{dayLabel(a.date)}</td>
                      <td className="px-4 py-2 text-ink">{a.topic || <span className="text-muted">No topic</span>}</td>
                      <td className="px-4 py-2">
                        <select aria-label={`Teacher on ${dayLabel(a.date)}`} value={a.teacher || 'none'}
                          onChange={(e) => set({ overrides: { ...plan.overrides, [a.date]: e.target.value } })}
                          className="w-full min-w-[11rem] rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink">
                          <option value="none">No teacher yet</option>
                          {teachers.map((x) => <option key={x.id} value={x.id}>{x.full_name}{away.has(`${x.id}|${a.date}`) ? ' — away' : ''}</option>)}
                          {a.teacher.startsWith('name:') && <option value={a.teacher}>{nameOf(a.teacher)} (no account)</option>}
                        </select>
                        <span className="mt-0.5 block text-[11px] text-muted">{a.why}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
            <input type="checkbox" className="mt-1" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span><span className="block font-semibold text-ink">Email teachers, fellows and supervisors</span>
              <span className="block text-xs text-muted">Teachers get their own sessions to confirm; fellows in their fellowship that year and supervisors get the schedule.</span></span>
          </label>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <button type="button" className={quiet} onClick={() => setStep(3)}>← Back</button>
            <button type="button" className={primary} onClick={publish} disabled={busy || sessionDates.length === 0}>
              {busy ? 'Publishing…' : `Publish ${plural(sessionDates.length, 'session')}`}
            </button>
            {unassigned > 0 && <span className="text-sm text-amber-700 dark:text-amber-300">{plural(unassigned, 'session')} without a teacher — you can assign them later.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function Nav({ onBack, onNext, disabled, children }: { onBack?: () => void; onNext?: () => void; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
      {onBack && <button type="button" className={quiet} onClick={onBack}>← Back</button>}
      {onNext && <button type="button" className={primary} onClick={onNext} disabled={disabled}>Continue →</button>}
      {children}
    </div>
  )
}
