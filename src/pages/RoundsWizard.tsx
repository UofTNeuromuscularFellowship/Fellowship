import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { StepBar, ChoiceCard, Notice, primary, quiet, field, label as labelCls, niceDay } from '../components/ui/Wizard'
import { SummaryList } from '../components/change/ChangeKit'
import { LogoPicker } from '../components/LogoPicker'
import { plural, toIso, addDays } from '../lib/schedule'
import { useRoundsAccess, NotAllowed } from './Rounds'
import {
  describeRule, expandRule, FORMAT_LABEL, MAX_SESSIONS, NTH, parsePeople, WEEKDAYS, zonedToUtc, zoneLabel, zoneOptions,
  type Recurrence, type RepeatRule, type RoundsFormat, type RoundsList,
} from '../lib/rounds'

// ---------------------------------------------------------------------------
// Set up rounds, one step at a time: what it is, when (one date, weekly,
// monthly or every few weeks — then any date, time or time zone can be
// changed), where (in person, online or both), who's invited, and credit and
// follow-up. Nothing is saved until the last step.
// ---------------------------------------------------------------------------

const STEPS = ['About', 'When', 'Where', 'Who’s invited', 'Credit & follow-up', 'Review']

interface DateRow { key: string; date: string; time: string; tz: string; topic: string; speaker: string; removed: boolean; extra?: boolean }
type Override = Partial<Omit<DateRow, 'key'>>

function nextWeekday(dow: number): string {
  const today = new Date()
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const cur = ((d.getDay() + 6) % 7) + 1
  d.setDate(d.getDate() + (((dow - cur + 7) % 7) || 7))
  return toIso(d)
}

export default function RoundsWizard() {
  const access = useRoundsAccess()
  const { site, profile } = useAuth()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // about
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [organizerEmail, setOrganizerEmail] = useState('')
  const [logo, setLogo] = useState<string | null>(null)
  useEffect(() => { if (site?.name && !organizerName) setOrganizerName(site.name) }, [site?.name]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (profile?.email && !organizerEmail) setOrganizerEmail(profile.email) }, [profile?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  // when
  const [kind, setKind] = useState<Recurrence>('weekly')
  const [rule, setRule] = useState<RepeatRule>(() => {
    const start = nextWeekday(4)
    return { start, time: '12:00', weekdays: [4], every: 2, monthly: 'nth', nth: 1, weekday: 4, day: 1, end: 'until', until: addDays(start, 7 * 12), count: 10 }
  })
  const [duration, setDuration] = useState(60)
  const [tz, setTz] = useState('America/Toronto')
  const [overrides, setOverrides] = useState<Record<string, Override>>({})
  const [extras, setExtras] = useState<DateRow[]>([])

  // where
  const [format, setFormat] = useState<RoundsFormat>('in_person')
  const [location, setLocation] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [passcode, setPasscode] = useState('')

  // who
  const [lists, setLists] = useState<(RoundsList & { n: number })[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [inviteProgram, setInviteProgram] = useState(false)
  const [newList, setNewList] = useState('')
  const [newPeople, setNewPeople] = useState('')
  const [leadMode, setLeadMode] = useState<'topic' | 'days'>('topic')
  const [leadDays, setLeadDays] = useState(14)

  // credit & follow-up
  const [reminder, setReminder] = useState(true)
  const [feedback, setFeedback] = useState(true)
  const [credit, setCredit] = useState('')
  const [creditStatement, setCreditStatement] = useState('')

  async function loadLists() {
    const [l, m] = await Promise.all([
      supabase.from('rounds_lists').select('id, name, created_at').order('name'),
      supabase.from('rounds_list_members').select('list_id'),
    ])
    const counts: Record<string, number> = {}
    for (const r of (m.data as { list_id: string }[]) ?? []) counts[r.list_id] = (counts[r.list_id] ?? 0) + 1
    setLists(((l.data as RoundsList[]) ?? []).map((x) => ({ ...x, n: counts[x.id] ?? 0 })))
  }
  useEffect(() => { loadLists() }, [])

  const setR = (patch: Partial<RepeatRule>) => setRule((r) => ({ ...r, ...patch }))
  const generated = useMemo(() => expandRule(kind, rule), [kind, rule])
  const rows: DateRow[] = useMemo(() => [
    ...generated.map((d) => ({ key: d, date: d, time: rule.time, tz, topic: '', speaker: '', removed: false, ...overrides[d] })),
    ...extras,
  ], [generated, overrides, extras, rule.time, tz])
  const live = rows.filter((r) => !r.removed).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  function editRow(r: DateRow, patch: Override) {
    if (r.extra) setExtras((xs) => xs.map((x) => (x.key === r.key ? { ...x, ...patch } : x)))
    else setOverrides((o) => ({ ...o, [r.key]: { ...o[r.key], ...patch } }))
  }
  function addDate() {
    const last = live[live.length - 1]
    const date = last ? addDays(last.date, 7) : rule.start
    setExtras((xs) => [...xs, { key: `x${Date.now()}`, date, time: rule.time, tz, topic: '', speaker: '', removed: false, extra: true }])
  }

  const today = toIso(new Date())
  function check(i: number): string | null {
    if (i === 0) {
      if (!title.trim()) return 'Give the rounds a name.'
      if (organizerEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(organizerEmail.trim())) return 'The organizer email doesn’t look right.'
    }
    if (i === 1) {
      if (!rule.start) return 'Choose the first date.'
      if ((kind === 'weekly' || kind === 'interval') && !(rule.weekdays?.length)) return 'Choose at least one day of the week.'
      if (live.length === 0) return 'There are no dates. Change the repeat, or add a date.'
      if (live.length > MAX_SESSIONS) return `That’s more than ${MAX_SESSIONS} sessions. End the series sooner.`
      if (live.some((r) => !r.date || !r.time)) return 'Every session needs a date and a time.'
      if (live.some((r) => r.date < today)) return 'One of the dates is in the past.'
      if (!(duration >= 5 && duration <= 720)) return 'The length should be between 5 minutes and 12 hours.'
    }
    if (i === 2) {
      if (format !== 'virtual' && !location.trim()) return 'Say where it is held.'
      if (format !== 'in_person' && videoUrl.trim() && !/^https?:\/\//.test(videoUrl.trim())) return 'The video link should start with https://'
    }
    if (i === 3) {
      if (!inviteProgram && chosen.size === 0) return 'Choose at least one mailing list, or invite everyone in the program.'
    }
    if (i === 4) {
      if (credit.trim() && !(Number(credit) >= 0 && Number(credit) <= 100)) return 'Credit hours should be a number, like 1 or 1.5.'
    }
    return null
  }
  function next() {
    const e = check(step)
    setErr(e)
    if (!e) setStep(step + 1)
  }

  async function createList() {
    const people = parsePeople(newPeople)
    if (!newList.trim()) { setErr('Give the new list a name.'); return }
    setBusy(true)
    const { data, error } = await supabase.from('rounds_lists').insert({ name: newList.trim() }).select('id').single()
    if (!error && people.length) {
      await supabase.from('rounds_list_members').insert(people.map((p) => ({ list_id: (data as { id: string }).id, email: p.email, full_name: p.full_name })))
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
    setErr(null)
    setChosen((c) => new Set([...c, (data as { id: string }).id]))
    setNewList(''); setNewPeople('')
    loadLists()
  }

  async function create() {
    for (let i = 0; i < 5; i++) { const e = check(i); if (e) { setErr(e); setStep(i); return } }
    setBusy(true); setErr(null)
    const clean = (v: string) => (v.trim() ? v.trim() : null)
    const { data: ser, error } = await supabase.from('rounds_series').insert({
      title: title.trim(), description: clean(description), format,
      location: format === 'virtual' ? null : clean(location),
      video_url: format === 'in_person' ? null : clean(videoUrl),
      video_passcode: format === 'in_person' ? null : clean(passcode),
      timezone: tz, duration_min: duration, recurrence: kind, recurrence_rule: { ...rule, weekdays: rule.weekdays },
      credit_hours: credit.trim() ? Number(credit) : null, credits_statement: clean(creditStatement),
      organizer_name: clean(organizerName), organizer_email: clean(organizerEmail), logo_url: logo,
      invite_program: inviteProgram, invite_lead_days: leadMode === 'days' ? leadDays : null,
      reminder_enabled: reminder, feedback_enabled: feedback,
    }).select('id').single()
    if (error || !ser) { setBusy(false); setErr(error?.message ?? 'The rounds couldn’t be saved.'); return }
    const id = (ser as { id: string }).id
    const sessions = live.map((r) => {
      const start = zonedToUtc(r.date, r.time, r.tz)
      return {
        series_id: id, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + duration * 60000).toISOString(),
        timezone: r.tz, topic: clean(r.topic), speaker: clean(r.speaker),
      }
    })
    const [a, b] = await Promise.all([
      supabase.from('rounds_sessions').insert(sessions),
      chosen.size ? supabase.from('rounds_series_lists').insert([...chosen].map((list_id) => ({ series_id: id, list_id }))) : Promise.resolve({ error: null }),
    ])
    setBusy(false)
    if (a.error || b.error) { setErr(`The rounds were saved, but ${a.error ? 'the dates' : 'the mailing lists'} weren’t: ${(a.error ?? b.error)!.message}`); return }
    nav(`/rounds/${id}?created=1`)
  }

  if (!access) return <p className="text-sm text-muted">Loading…</p>
  if (!access.can_manage) return <NotAllowed />

  const zones = zoneOptions(tz)
  const withTopic = live.filter((r) => r.topic.trim()).length
  const listNames = lists.filter((l) => chosen.has(l.id)).map((l) => `${l.name} (${l.n})`)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/rounds" className="text-xs font-medium text-muted hover:text-ink">← Rounds</Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Set up rounds</h1>
        <p className="mt-1 text-sm text-muted">Step {step + 1} of {STEPS.length} · Nothing is saved until the last step.</p>
      </div>
      <StepBar steps={STEPS} current={step} onJump={(i) => { setErr(null); setStep(i) }} />

      {step === 0 && (
        <section className="space-y-4">
          <Lbl text="Name">
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Neuromuscular Grand Rounds" autoFocus />
          </Lbl>
          <Lbl text="Description (optional)" hint="A line or two for the invitation.">
            <textarea rows={3} className={field} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Lbl>
          <div className="grid gap-4 sm:grid-cols-2">
            <Lbl text="Organizer" hint="Named at the foot of every email, and on the certificate.">
              <input className={field} value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
            </Lbl>
            <Lbl text="Organizer email" hint="Where questions should go.">
              <input type="email" className={field} value={organizerEmail} onChange={(e) => setOrganizerEmail(e.target.value)} />
            </Lbl>
          </div>
          <LogoPicker value={logo} onChange={setLogo}
            help="Shown on the invitations, reminders, RSVP page and attendance certificates. PNG, JPEG or WebP, up to 2 MB." />
        </section>
      )}

      {step === 1 && (
        <section className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard name="rep" checked={kind === 'once'} onChange={() => setKind('once')} title="One date">A single session.</ChoiceCard>
            <ChoiceCard name="rep" checked={kind === 'weekly'} onChange={() => setKind('weekly')} title="Weekly">The same day (or days) every week.</ChoiceCard>
            <ChoiceCard name="rep" checked={kind === 'interval'} onChange={() => setKind('interval')} title="Every few weeks">Every other week, every 3 weeks…</ChoiceCard>
            <ChoiceCard name="rep" checked={kind === 'monthly'} onChange={() => setKind('monthly')} title="Monthly">The 2nd Tuesday, or the 15th, each month.</ChoiceCard>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Lbl text={kind === 'once' ? 'Date' : 'First date'}>
              <input type="date" className={field} min={today} value={rule.start} onChange={(e) => setR({ start: e.target.value })} />
            </Lbl>
            <Lbl text="Start time">
              <input type="time" className={field} value={rule.time} onChange={(e) => setR({ time: e.target.value })} />
            </Lbl>
            <Lbl text="Length (minutes)">
              <input type="number" min={5} max={720} step={5} className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </Lbl>
            <Lbl text="Time zone">
              <select className={field} value={tz} onChange={(e) => setTz(e.target.value)}>
                {zones.map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
              </select>
            </Lbl>
          </div>

          {(kind === 'weekly' || kind === 'interval') && (
            <div className="space-y-3">
              {kind === 'interval' && (
                <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  Every
                  <input type="number" min={2} max={12} className="w-20 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
                    value={rule.every ?? 2} onChange={(e) => setR({ every: Math.max(2, Math.min(12, Number(e.target.value) || 2)) })} />
                  weeks
                </label>
              )}
              <fieldset>
                <legend className={labelCls}>On</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((w, i) => {
                    const on = rule.weekdays?.includes(i + 1)
                    return (
                      <button key={w} type="button" aria-pressed={on}
                        onClick={() => setR({ weekdays: on ? (rule.weekdays ?? []).filter((x) => x !== i + 1) : [...(rule.weekdays ?? []), i + 1].sort() })}
                        className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-accent bg-accent-soft font-semibold text-ink' : 'border-line text-muted hover:border-accent'}`}>
                        {w.slice(0, 3)}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {kind === 'monthly' && (
            <div className="space-y-2 text-sm text-ink">
              <label className="flex flex-wrap items-center gap-2">
                <input type="radio" name="mon" checked={rule.monthly !== 'day'} onChange={() => setR({ monthly: 'nth' })} />
                The
                <select className="rounded-md border border-line bg-surface px-2 py-1.5" value={rule.nth} onChange={(e) => setR({ monthly: 'nth', nth: Number(e.target.value) })}>
                  {NTH.map((n) => <option key={n.v} value={n.v}>{n.l}</option>)}
                </select>
                <select className="rounded-md border border-line bg-surface px-2 py-1.5" value={rule.weekday} onChange={(e) => setR({ monthly: 'nth', weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
                </select>
                of each month
              </label>
              <label className="flex flex-wrap items-center gap-2">
                <input type="radio" name="mon" checked={rule.monthly === 'day'} onChange={() => setR({ monthly: 'day' })} />
                Day
                <input type="number" min={1} max={31} className="w-20 rounded-md border border-line bg-surface px-2 py-1.5"
                  value={rule.day ?? 1} onChange={(e) => setR({ monthly: 'day', day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })} />
                of each month <span className="text-xs text-muted">(the last day, in shorter months)</span>
              </label>
            </div>
          )}

          {kind !== 'once' && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink">
              <span className={labelCls + ' mb-0'}>Ends</span>
              <label className="flex items-center gap-2">
                <input type="radio" name="end" checked={rule.end === 'until'} onChange={() => setR({ end: 'until' })} /> on
                <input type="date" className="rounded-md border border-line bg-surface px-2 py-1.5" value={rule.until ?? ''} min={rule.start}
                  onChange={(e) => setR({ end: 'until', until: e.target.value })} />
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="end" checked={rule.end === 'count'} onChange={() => setR({ end: 'count' })} /> after
                <input type="number" min={1} max={MAX_SESSIONS} className="w-20 rounded-md border border-line bg-surface px-2 py-1.5" value={rule.count ?? 10}
                  onChange={(e) => setR({ end: 'count', count: Math.max(1, Math.min(MAX_SESSIONS, Number(e.target.value) || 1)) })} /> sessions
              </label>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2 text-xs text-muted">
              <span>{plural(live.length, 'session')} · change any date, time or time zone, or add a topic now if you know it</span>
              <button type="button" className="font-medium text-accent hover:underline" onClick={addDate}>+ Add a date</button>
            </div>
            <ul className="divide-y divide-line">
              {[...rows].sort((a, b) => a.date.localeCompare(b.date)).map((r) => (
                <li key={r.key} className={`grid gap-2 px-4 py-3 sm:grid-cols-[9.5rem_8rem_minmax(0,1fr)_auto] sm:items-center ${r.removed ? 'opacity-50' : ''}`}>
                  <input type="date" aria-label="Date" className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={r.date} disabled={r.removed}
                    onChange={(e) => editRow(r, { date: e.target.value })} />
                  <input type="time" aria-label="Time" className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={r.time} disabled={r.removed}
                    onChange={(e) => editRow(r, { time: e.target.value })} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input aria-label="Topic" placeholder="Topic (optional)" className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={r.topic} disabled={r.removed}
                      onChange={(e) => editRow(r, { topic: e.target.value })} />
                    <select aria-label="Time zone" className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm" value={r.tz} disabled={r.removed}
                      onChange={(e) => editRow(r, { tz: e.target.value })}>
                      {zoneOptions(r.tz).map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
                    </select>
                  </div>
                  <button type="button" className="justify-self-start text-xs font-medium text-muted hover:text-ink"
                    onClick={() => (r.extra ? setExtras((xs) => xs.filter((x) => x.key !== r.key)) : editRow(r, { removed: !r.removed }))}>
                    {r.removed ? 'Put back' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {(['in_person', 'virtual', 'hybrid'] as RoundsFormat[]).map((f) => (
              <ChoiceCard key={f} name="fmt" checked={format === f} onChange={() => setFormat(f)} title={FORMAT_LABEL[f]}>
                {f === 'in_person' ? 'People come to a room.' : f === 'virtual' ? 'Everyone joins by video.' : 'People choose when they RSVP.'}
              </ChoiceCard>
            ))}
          </div>
          {format !== 'virtual' && (
            <Lbl text="Where" hint="Room and building, as it should appear on the invitation.">
              <input className={field} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Room M1-400, Sunnybrook" />
            </Lbl>
          )}
          {format !== 'in_person' && (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <Lbl text="Video link (Zoom, Teams…)" hint="Only shown to people who say they’re coming, so a forwarded invitation doesn’t give out the link. You can add it later.">
                <input type="url" className={field} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://" />
              </Lbl>
              <Lbl text="Passcode (optional)">
                <input className={field} value={passcode} onChange={(e) => setPasscode(e.target.value)} />
              </Lbl>
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <fieldset className="space-y-2">
            <legend className={labelCls}>Invite</legend>
            <label className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
              <input type="checkbox" className="mt-1" checked={inviteProgram} onChange={(e) => setInviteProgram(e.target.checked)} />
              <span>
                <span className="block font-semibold text-ink">Everyone in the program</span>
                <span className="block text-xs text-muted">Fellows, supervisors, the director and staff with portal accounts.</span>
              </span>
            </label>
            {lists.map((l) => (
              <label key={l.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
                <input type="checkbox" className="mt-1" checked={chosen.has(l.id)}
                  onChange={(e) => setChosen((c) => { const n = new Set(c); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n })} />
                <span>
                  <span className="block font-semibold text-ink">{l.name}</span>
                  <span className="block text-xs text-muted">{plural(l.n, 'person', 'people')}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <details className="rounded-lg border border-dashed border-line px-4 py-3" open={lists.length === 0}>
            <summary className="cursor-pointer text-sm font-medium text-accent">Make a new mailing list</summary>
            <div className="mt-3 space-y-3">
              <Lbl text="List name"><input className={field} value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="e.g. Neurology residents" /></Lbl>
              <Lbl text="People — one per line" hint={`${plural(parsePeople(newPeople).length, 'email')} found. Names are optional: “Jane Doe <jane@example.org>”.`}>
                <textarea rows={4} className={field} value={newPeople} onChange={(e) => setNewPeople(e.target.value)} />
              </Lbl>
              <button type="button" className={quiet} disabled={busy || !newList.trim()} onClick={createList}>{busy ? 'Saving…' : 'Create and use this list'}</button>
              <p className="text-xs text-muted">Lists are kept for other rounds, and can be changed any time under Rounds → Mailing lists.</p>
            </div>
          </details>
          <fieldset className="space-y-2">
            <legend className={labelCls}>When invitations go out</legend>
            <ChoiceCard name="lead" checked={leadMode === 'topic'} onChange={() => setLeadMode('topic')} title="As soon as a session has a topic">
              Add a topic here or later, and that session’s invitation goes out within 15 minutes.
            </ChoiceCard>
            <ChoiceCard name="lead" checked={leadMode === 'days'} onChange={() => setLeadMode('days')} title="A set number of days before">
              Better for a long weekly series, so people aren’t sent a term’s invitations at once. The session still needs a topic by then.
            </ChoiceCard>
            {leadMode === 'days' && (
              <label className="flex items-center gap-2 pl-1 text-sm text-ink">
                <input type="number" min={1} max={60} className="w-20 rounded-md border border-line bg-surface px-2 py-1.5"
                  value={leadDays} onChange={(e) => setLeadDays(Math.max(1, Math.min(60, Number(e.target.value) || 14)))} />
                days before each session
              </label>
            )}
          </fieldset>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <Toggle checked={reminder} onChange={setReminder} title="Reminder the day before"
            text="Everyone who said they’re coming gets a reminder about 24 hours before, with the room or the video link." />
          <Toggle checked={feedback} onChange={setFeedback} title="Ask for feedback afterwards"
            text="When a session ends, people who RSVP’d yes are emailed a short rating form. You see the results on the session." />
          <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Lbl text="Credit hours (optional)" hint="Per session.">
              <input inputMode="decimal" className={field} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="e.g. 1" />
            </Lbl>
            <Lbl text="Credit statement (optional)" hint="Printed on the certificate. Use the exact wording your accreditation provider approved — the portal records attendance, it doesn’t grant credit.">
              <textarea rows={3} className={field} value={creditStatement} onChange={(e) => setCreditStatement(e.target.value)} />
            </Lbl>
          </div>
          <Notice>
            {credit.trim()
              ? <>People who RSVP’d yes can download a certificate of attendance after each session{feedback ? ', once they’ve given feedback' : ''}. You can untick anyone who didn’t come.</>
              : <>Without credit hours, no certificate is offered. Add them now or later.</>}
          </Notice>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-4">
          <SummaryList items={[
            ['Rounds', <span key="t" className="flex items-center gap-3">{logo && <img src={logo} alt="" className="h-8 max-w-[5rem] object-contain" />}{title}</span>],
            ['When', <span key="w">{describeRule(kind, rule)} · {rule.time}, {duration} min · {zoneLabel(tz)}<br />
              <span className="text-muted">{plural(live.length, 'session')}{live.length ? `: ${niceDay(live[0].date)}${live.length > 1 ? ` to ${niceDay(live[live.length - 1].date)}` : ''}` : ''}</span></span>],
            ['Where', <span key="p">{FORMAT_LABEL[format]}{format !== 'virtual' && location ? ` · ${location}` : ''}{format !== 'in_person' ? (videoUrl ? ' · video link added' : ' · video link to add later') : ''}</span>],
            ['Invited', [inviteProgram ? 'Everyone in the program' : null, ...listNames].filter(Boolean).join(', ') || '—'],
            ['Invitations', leadMode === 'topic'
              ? `Sent once a session has a topic${withTopic ? ` — ${plural(withTopic, 'session')} already ${withTopic === 1 ? 'has' : 'have'} one` : ''}`
              : `Sent ${leadDays} days before each session that has a topic`],
            ['Follow-up', [reminder ? 'reminder the day before' : null, feedback ? 'feedback request' : null, credit.trim() ? `certificate (${credit} h)` : null].filter(Boolean).join(', ') || 'none'],
            ['Organizer', [organizerName, organizerEmail].filter(Boolean).join(' · ') || '—'],
          ]} />
          {withTopic > 0 && leadMode === 'topic' && (
            <Notice>Invitations for the {plural(withTopic, 'session')} with a topic go out within 15 minutes of saving.</Notice>
          )}
        </section>
      )}

      {err && <Notice tone="bad">{err}</Notice>}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        {step > 0 && <button type="button" className={quiet} onClick={() => { setErr(null); setStep(step - 1) }} disabled={busy}>← Back</button>}
        {step < STEPS.length - 1
          ? <button type="button" className={primary} onClick={next}>Continue →</button>
          : <button type="button" className={primary} onClick={create} disabled={busy}>{busy ? 'Saving…' : 'Create rounds'}</button>}
      </div>
    </div>
  )
}

function Lbl({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </label>
  )
}
