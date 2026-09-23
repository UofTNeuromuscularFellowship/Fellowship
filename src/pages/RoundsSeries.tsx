import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'
import { Notice, primary, quiet, field, label as labelCls } from '../components/ui/Wizard'
import { LogoPicker } from '../components/LogoPicker'
import { plural, toIso } from '../lib/schedule'
import { useRoundsAccess, NotAllowed } from './Rounds'
import { Toggle } from './RoundsWizard'
import {
  describeRule, FORMAT_LABEL, FORMAT_SHORT, inMyZone, inviteDue, rsvpLabel, sessionWhen, utcToZoned, zonedToUtc, zoneLabel, zoneOptions,
  type RoundsFormat, type RoundsInvite, type RoundsList, type RoundsSeries as Series, type RoundsSession,
} from '../lib/rounds'

// ---------------------------------------------------------------------------
// One rounds series: its sessions (topic, speaker, moving one to another date,
// time or time zone, cancelling), who's coming, attendance and feedback, and
// the series' own settings.
// ---------------------------------------------------------------------------

type Msg = { tone: 'ok' | 'bad'; text: string } | null
type Counts = Record<string, { invited: number; yes: number; no: number; rated: number; ratingSum: number }>

export default function RoundsSeries() {
  const { id } = useParams<{ id: string }>()
  const [qs] = useSearchParams()
  const access = useRoundsAccess()
  const [series, setSeries] = useState<Series | null | undefined>(undefined)
  const [sessions, setSessions] = useState<RoundsSession[]>([])
  const [counts, setCounts] = useState<Counts>({})
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState<Msg>(qs.get('created') ? { tone: 'ok', text: 'Your rounds are set up. Each session needs a topic: its invitation goes out a week after the session before it (the day after, for weekly rounds), or as soon as the topic is added if that date has passed.' } : null)

  const load = useCallback(async () => {
    const [s, ss] = await Promise.all([
      supabase.from('rounds_series').select('*').eq('id', id).maybeSingle(),
      supabase.from('rounds_sessions').select('*').eq('series_id', id).order('starts_at'),
    ])
    setSeries((s.data as Series) ?? null)
    const list = (ss.data as RoundsSession[]) ?? []
    setSessions(list)
    if (list.length) {
      const { data } = await supabase.from('rounds_invites').select('session_id, response, rating').in('session_id', list.map((x) => x.id))
      const c: Counts = {}
      for (const r of (data as { session_id: string; response: string | null; rating: number | null }[]) ?? []) {
        const k = (c[r.session_id] ??= { invited: 0, yes: 0, no: 0, rated: 0, ratingSum: 0 })
        k.invited++
        if (r.response === 'in_person' || r.response === 'virtual') k.yes++
        if (r.response === 'declined') k.no++
        if (r.rating) { k.rated++; k.ratingSum += r.rating }
      }
      setCounts(c)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const now = Date.now()
  const groups = useMemo(() => ({
    upcoming: sessions.filter((s) => s.status === 'scheduled' && new Date(s.ends_at).getTime() > now),
    past: sessions.filter((s) => s.status === 'scheduled' && new Date(s.ends_at).getTime() <= now).reverse(),
    cancelled: sessions.filter((s) => s.status === 'cancelled'),
  }), [sessions, now])

  if (!access || series === undefined) return <p className="text-sm text-muted">Loading…</p>
  if (!access.can_manage) return <NotAllowed />
  if (!series) return <Notice tone="bad">These rounds weren’t found. <Link className="underline" to="/rounds">Back to Rounds</Link></Notice>

  const shown = groups[tab]
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link to="/rounds" className="text-xs font-medium text-muted hover:text-ink">← Rounds</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {series.logo_url && <img src={series.logo_url} alt="" className="h-10 max-w-[7rem] object-contain" />}
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-ink">{series.title}</h1>
              <p className="text-sm text-muted">
                {describeRule(series.recurrence, series.recurrence_rule)} · {FORMAT_SHORT[series.format]}
                {series.location ? ` · ${series.location}` : ''}{series.status === 'archived' ? ' · Archived' : ''}
              </p>
            </div>
          </div>
          <button className={quiet} onClick={() => setEditing(!editing)}>{editing ? 'Close settings' : 'Settings'}</button>
        </div>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {editing && <SeriesSettings series={series} onSaved={(t) => { setMsg({ tone: 'ok', text: t }); setEditing(false); load() }} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1 border-b border-line">
          {(['upcoming', 'past', 'cancelled'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {k} <span className="text-xs text-muted">({groups[k].length})</span>
            </button>
          ))}
        </div>
        {tab === 'upcoming' && <AddSession series={series} onAdded={() => { setMsg({ tone: 'ok', text: 'Session added.' }); load() }} />}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {tab === 'upcoming' ? 'No upcoming sessions. Add one above.' : tab === 'past' ? 'No sessions have happened yet.' : 'Nothing cancelled.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => (
            <SessionItem key={s.id} s={s} all={sessions} series={series} c={counts[s.id]} open={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
              onChanged={(t) => { if (t) setMsg({ tone: 'ok', text: t }); load() }} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- a session

function SessionItem({ s, all, series, c, open, onToggle, onChanged }: {
  s: RoundsSession; all: RoundsSession[]; series: Series; c?: Counts[string]; open: boolean; onToggle: () => void; onChanged: (t?: string) => void
}) {
  const past = new Date(s.ends_at).getTime() <= Date.now()
  const mine = inMyZone(s.starts_at, s.timezone)
  return (
    <li className="rounded-lg border border-line bg-surface">
      <button className="flex w-full flex-wrap items-start justify-between gap-2 px-5 py-4 text-left" onClick={onToggle} aria-expanded={open}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{sessionWhen(s.starts_at, s.ends_at, s.timezone)}</span>
          {mine && <span className="block text-xs text-muted">{mine}</span>}
          <span className={`mt-0.5 block text-sm ${s.topic ? 'text-ink' : 'text-amber-700 dark:text-amber-300'}`}>
            {s.topic || 'No topic yet'}{s.speaker ? <span className="text-muted"> · {s.speaker}</span> : null}
          </span>
          {s.status === 'cancelled' && <span className="block text-xs text-muted">Cancelled{s.cancel_reason ? ` — ${s.cancel_reason}` : ''}</span>}
        </span>
        <span className="text-right text-xs text-muted">
          {s.invite_sent_at
            ? <>{c?.invited ?? 0} invited · {c?.yes ?? 0} coming · {c?.no ?? 0} can’t</>
            : s.status === 'scheduled' && !past
              ? (() => {
                  const due = inviteDue(s, all)
                  const when = due && due.getTime() > Date.now() ? due.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : null
                  if (!s.topic) return when ? `Needs a topic — invitations due ${when}` : 'Needs a topic — invitations are waiting for one'
                  return when ? `Invitations go out ${when}` : 'Invitations go out within 15 minutes'
                })()
              : null}
          {past && c?.rated ? <span className="block">Rated {(c.ratingSum / c.rated).toFixed(1)} / 5 ({c.rated})</span> : null}
        </span>
      </button>
      {open && (
        <div className="space-y-5 border-t border-line px-5 py-4">
          {s.status === 'scheduled' && !past && <SessionEditor s={s} series={series} invited={c?.invited ?? 0} onChanged={onChanged} />}
          <Attendance s={s} series={series} past={past} />
        </div>
      )}
    </li>
  )
}

function SessionEditor({ s, series, invited, onChanged }: { s: RoundsSession; series: Series; invited: number; onChanged: (t?: string) => void }) {
  const start = utcToZoned(s.starts_at, s.timezone)
  const [topic, setTopic] = useState(s.topic ?? '')
  const [speaker, setSpeaker] = useState(s.speaker ?? '')
  const [details, setDetails] = useState(s.details ?? '')
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [tz, setTz] = useState(s.timezone)
  const [minutes, setMinutes] = useState(Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000))
  const [format, setFormat] = useState<RoundsFormat | ''>(s.format ?? '')
  const [location, setLocation] = useState(s.location ?? '')
  const [video, setVideo] = useState(s.video_url ?? '')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')

  const startsAt = date && time ? zonedToUtc(date, time, tz) : null
  const moved = !!startsAt && (startsAt.toISOString() !== new Date(s.starts_at).toISOString() || tz !== s.timezone
    || minutes !== Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000))
  const placeChanged = (format || null) !== s.format || (location.trim() || null) !== s.location || (video.trim() || null) !== s.video_url
  const told = !!s.invite_sent_at && (moved || placeChanged)
  const eff = (format || series.format) as RoundsFormat

  async function save() {
    if (!startsAt) { setMsg({ tone: 'bad', text: 'Give the session a date and time.' }); return }
    if (startsAt.getTime() < Date.now()) { setMsg({ tone: 'bad', text: 'That time has already passed.' }); return }
    if (!(minutes >= 5 && minutes <= 720)) { setMsg({ tone: 'bad', text: 'The length should be between 5 and 720 minutes.' }); return }
    if (video.trim() && !/^https?:\/\//.test(video.trim())) { setMsg({ tone: 'bad', text: 'The video link should start with https://' }); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('rounds_sessions').update({
      topic: topic.trim() || null, speaker: speaker.trim() || null, details: details.trim() || null,
      starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + minutes * 60000).toISOString(), timezone: tz,
      format: format || null, location: location.trim() || null, video_url: video.trim() || null,
    }).eq('id', s.id)
    if (error) { setBusy(false); setMsg({ tone: 'bad', text: error.message }); return }
    let text = 'Saved.'
    if (told && notify) {
      const { data, error: e2 } = await supabase.rpc('rounds_notify_change', { p_session: s.id })
      text = e2 ? `Saved, but the update email failed: ${e2.message}` : `Saved · ${plural((data as number) ?? 0, 'person', 'people')} emailed about the change.`
    } else if (!s.invite_sent_at && topic.trim()) {
      text = 'Saved. The invitation goes out on schedule (shown on the session), or send it now.'
    }
    setBusy(false)
    onChanged(text)
  }

  async function sendNow() {
    setBusy(true)
    if (topic.trim() !== (s.topic ?? '')) await supabase.from('rounds_sessions').update({ topic: topic.trim() || null }).eq('id', s.id)
    const { data, error } = await supabase.rpc('rounds_send_invites', { p_session: s.id })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: error.message }); return }
    onChanged(`${plural((data as number) ?? 0, 'invitation')} sent.`)
  }

  async function cancel() {
    setBusy(true)
    const { data, error } = await supabase.rpc('rounds_cancel_session', { p_session: s.id, p_reason: reason.trim() || null })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: error.message }); return }
    onChanged(`Session cancelled${(data as number) ? ` · ${plural(data as number, 'person', 'people')} told` : ''}.`)
  }

  async function remove() {
    if (!window.confirm('Delete this session? Nobody has been invited to it yet.')) return
    await supabase.from('rounds_sessions').delete().eq('id', s.id)
    onChanged('Session deleted.')
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <L text="Topic"><input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Invitations go out once this is filled in" /></L>
        <L text="Speaker"><input className={field} value={speaker} onChange={(e) => setSpeaker(e.target.value)} /></L>
      </div>
      <L text="Details (optional)"><textarea rows={2} className={field} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Anything to read beforehand, who it’s for…" /></L>
      <div className="grid gap-3 sm:grid-cols-4">
        <L text="Date"><input type="date" className={field} value={date} min={toIso(new Date())} onChange={(e) => setDate(e.target.value)} /></L>
        <L text="Start time"><input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} /></L>
        <L text="Minutes"><input type="number" min={5} max={720} step={5} className={field} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></L>
        <L text="Time zone">
          <select className={field} value={tz} onChange={(e) => setTz(e.target.value)}>
            {zoneOptions(tz, series.timezone).map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
          </select>
        </L>
      </div>
      <details open={!!(s.format || s.location || s.video_url)}>
        <summary className="cursor-pointer text-sm font-medium text-accent">Different place or format this time</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <L text="Format">
            <select className={field} value={format} onChange={(e) => setFormat(e.target.value as RoundsFormat | '')}>
              <option value="">Same as usual ({FORMAT_SHORT[series.format]})</option>
              {(['in_person', 'virtual', 'hybrid'] as RoundsFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
            </select>
          </L>
          {eff !== 'virtual' && <L text="Where"><input className={field} value={location} placeholder={series.location ?? ''} onChange={(e) => setLocation(e.target.value)} /></L>}
          {eff !== 'in_person' && <L text="Video link"><input type="url" className={field} value={video} placeholder={series.video_url ?? 'https://'} onChange={(e) => setVideo(e.target.value)} /></L>}
        </div>
      </details>
      {told && (
        <label className="flex items-start gap-3 rounded-lg border border-line bg-paper px-4 py-3 text-sm">
          <input type="checkbox" className="mt-1" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>
            <span className="block font-semibold text-ink">Email the {plural(invited, 'person', 'people')} invited about the change</span>
            <span className="block text-xs text-muted">Everyone except those who said they can’t come, with the new details and joining link. A fresh reminder goes out the day before.</span>
          </span>
        </label>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <button className={primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {!s.invite_sent_at && (
          <button className={quiet} onClick={sendNow} disabled={busy || !topic.trim()} title={topic.trim() ? '' : 'Add a topic first'}>Send invitations now</button>
        )}
        {s.invite_sent_at && <button className={quiet} onClick={sendNow} disabled={busy} title="Invites anyone added to the lists since">Invite people added since</button>}
        {!cancelling && <button className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-300" onClick={() => setCancelling(true)}>Cancel this session</button>}
        {!s.invite_sent_at && <button className="text-sm font-medium text-muted hover:text-ink" onClick={remove}>Delete</button>}
      </div>
      {cancelling && (
        <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3 dark:border-rose-900 dark:bg-rose-950/40">
          <L text="Reason (optional, included in the email)"><input className={field} value={reason} onChange={(e) => setReason(e.target.value)} /></L>
          <p className="text-xs text-muted">{s.invite_sent_at ? 'Everyone invited who hasn’t said no is emailed.' : 'No invitations have gone out, so nobody is emailed.'}</p>
          <div className="flex gap-3">
            <button className={primary} onClick={cancel} disabled={busy}>Cancel session</button>
            <button className={quiet} onClick={() => setCancelling(false)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Attendance({ s, series, past }: { s: RoundsSession; series: Series; past: boolean }) {
  const [rows, setRows] = useState<RoundsInvite[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('rounds_invites')
      .select('id, session_id, email, full_name, response, responded_at, attended, rating, comments, feedback_at, invited_at')
      .eq('session_id', s.id).order('full_name', { nullsFirst: false })
    setRows((data as RoundsInvite[]) ?? [])
  }, [s.id])
  useEffect(() => { load() }, [load])

  async function mark(r: RoundsInvite, attended: boolean) {
    setRows((rs) => rs?.map((x) => (x.id === r.id ? { ...x, attended } : x)) ?? null)
    await supabase.from('rounds_invites').update({ attended }).eq('id', r.id)
  }

  function csv() {
    const head = ['Name', 'Email', 'RSVP', 'Attended', 'Rating', 'Comments']
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const body = (rows ?? []).map((r) => [r.full_name, r.email, rsvpLabel(r.response),
      r.response === 'in_person' || r.response === 'virtual' ? (r.attended === false ? 'No' : 'Yes') : '', r.rating, r.comments].map(esc).join(','))
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${series.title} ${utcToZoned(s.starts_at, s.timezone).date} attendance.csv`.replace(/[^\w .-]/g, '')
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!rows) return <p className="text-sm text-muted">Loading RSVPs…</p>
  if (rows.length === 0) return <p className="text-sm text-muted">Nobody has been invited to this session yet.</p>
  const coming = rows.filter((r) => r.response === 'in_person' || r.response === 'virtual')
  const rated = rows.filter((r) => r.rating)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {past ? 'Attendance & feedback' : 'RSVPs'} · {coming.length} of {rows.length} coming
          {rated.length > 0 && ` · rated ${(rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length).toFixed(1)} / 5`}
        </p>
        <button className="text-xs font-medium text-accent hover:underline" onClick={csv}>Download CSV</button>
      </div>
      {past && coming.length > 0 && <p className="text-xs text-muted">Untick anyone who said yes but didn’t come — they won’t be asked for feedback or offered a certificate.</p>}
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-3 py-2">Who</th><th className="px-3 py-2">RSVP</th>
              {past && <th className="px-3 py-2">Came</th>}{past && <th className="px-3 py-2">Feedback</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const yes = r.response === 'in_person' || r.response === 'virtual'
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-3 py-2"><span className="block text-ink">{r.full_name || r.email}</span>{r.full_name && <span className="block text-xs text-muted">{r.email}</span>}</td>
                  <td className="px-3 py-2 text-muted">{rsvpLabel(r.response)}</td>
                  {past && <td className="px-3 py-2">{yes && <input type="checkbox" aria-label={`${r.full_name || r.email} came`} checked={r.attended !== false} onChange={(e) => mark(r, e.target.checked)} />}</td>}
                  {past && <td className="px-3 py-2 text-muted">{r.rating ? <><span className="text-ink">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>{r.comments && <span className="block text-xs">{r.comments}</span>}</> : '—'}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- add session

function AddSession({ series, onAdded }: { series: Series; onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState((series.recurrence_rule as { time?: string }).time ?? '12:00')
  const [tz, setTz] = useState(series.timezone)
  const [topic, setTopic] = useState('')
  const [err, setErr] = useState<string | null>(null)
  async function add() {
    if (!date || !time) { setErr('Choose a date and time.'); return }
    const start = zonedToUtc(date, time, tz)
    if (start.getTime() < Date.now()) { setErr('That time has already passed.'); return }
    const { error } = await supabase.from('rounds_sessions').insert({
      series_id: series.id, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + series.duration_min * 60000).toISOString(),
      timezone: tz, topic: topic.trim() || null,
    })
    if (error) { setErr(error.message); return }
    setOpen(false); setDate(''); setTopic(''); setErr(null); onAdded()
  }
  if (!open) return <button className={quiet} onClick={() => setOpen(true)}>+ Add a session</button>
  return (
    <div className="w-full space-y-3 rounded-lg border border-line bg-surface px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <L text="Date"><input type="date" className={field} min={toIso(new Date())} value={date} onChange={(e) => setDate(e.target.value)} /></L>
        <L text="Time"><input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} /></L>
        <L text="Time zone">
          <select className={field} value={tz} onChange={(e) => setTz(e.target.value)}>{zoneOptions(tz).map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}</select>
        </L>
        <L text="Topic (optional)"><input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} /></L>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex gap-3"><button className={primary} onClick={add}>Add session</button><button className={quiet} onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  )
}

// ---------------------------------------------------------- series settings

function SeriesSettings({ series, onSaved }: { series: Series; onSaved: (t: string) => void }) {
  const [d, setD] = useState(series)
  const [lists, setLists] = useState<RoundsList[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [credit, setCredit] = useState(series.credit_hours == null ? '' : String(series.credit_hours))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Series>(k: K, v: Series[K]) => setD((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    ;(async () => {
      const [l, sl] = await Promise.all([
        supabase.from('rounds_lists').select('id, name, created_at').order('name'),
        supabase.from('rounds_series_lists').select('list_id').eq('series_id', series.id),
      ])
      setLists((l.data as RoundsList[]) ?? [])
      setChosen(new Set(((sl.data as { list_id: string }[]) ?? []).map((x) => x.list_id)))
    })()
  }, [series.id])

  async function save(status?: 'active' | 'archived') {
    if (!d.title.trim()) { setErr('The rounds need a name.'); return }
    if (credit.trim() && !(Number(credit) >= 0)) { setErr('Credit hours should be a number.'); return }
    if (d.video_url?.trim() && !/^https?:\/\//.test(d.video_url.trim())) { setErr('The video link should start with https://'); return }
    setBusy(true); setErr(null)
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null)
    const { error } = await supabase.from('rounds_series').update({
      title: d.title.trim(), description: clean(d.description), format: d.format, location: clean(d.location),
      video_url: clean(d.video_url), video_passcode: clean(d.video_passcode), organizer_name: clean(d.organizer_name),
      organizer_email: clean(d.organizer_email), logo_url: d.logo_url, invite_program: d.invite_program,
      reminder_enabled: d.reminder_enabled, feedback_enabled: d.feedback_enabled,
      credit_hours: credit.trim() ? Number(credit) : null, credits_statement: clean(d.credits_statement),
      duration_min: d.duration_min, timezone: d.timezone, updated_at: new Date().toISOString(),
      ...(status ? { status } : {}),
    }).eq('id', series.id)
    if (!error) {
      await supabase.from('rounds_series_lists').delete().eq('series_id', series.id)
      if (chosen.size) await supabase.from('rounds_series_lists').insert([...chosen].map((list_id) => ({ series_id: series.id, list_id })))
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved(status === 'archived' ? 'Archived. No more emails go out for these rounds.' : status === 'active' ? 'Reopened.' : 'Settings saved. They apply to sessions from now on.')
  }

  return (
    <Card>
      <CardHeader title="Settings" sub="Changes apply to every session that doesn’t have its own" />
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <L text="Name" wide><input className={field} value={d.title} onChange={(e) => set('title', e.target.value)} /></L>
        <L text="Description" wide><textarea rows={2} className={field} value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} /></L>
        <L text="Organizer"><input className={field} value={d.organizer_name ?? ''} onChange={(e) => set('organizer_name', e.target.value)} /></L>
        <L text="Organizer email"><input type="email" className={field} value={d.organizer_email ?? ''} onChange={(e) => set('organizer_email', e.target.value)} /></L>
        <div className="sm:col-span-2"><LogoPicker value={d.logo_url} onChange={(u) => set('logo_url', u)} /></div>
        <L text="Format">
          <select className={field} value={d.format} onChange={(e) => set('format', e.target.value as RoundsFormat)}>
            {(['in_person', 'virtual', 'hybrid'] as RoundsFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
        </L>
        <L text="Usual length (minutes)"><input type="number" min={5} max={720} className={field} value={d.duration_min} onChange={(e) => set('duration_min', Number(e.target.value))} /></L>
        {d.format !== 'virtual' && <L text="Where" wide><input className={field} value={d.location ?? ''} onChange={(e) => set('location', e.target.value)} /></L>}
        {d.format !== 'in_person' && <>
          <L text="Video link"><input type="url" className={field} value={d.video_url ?? ''} onChange={(e) => set('video_url', e.target.value)} /></L>
          <L text="Passcode"><input className={field} value={d.video_passcode ?? ''} onChange={(e) => set('video_passcode', e.target.value)} /></L>
        </>}
        <div className="space-y-2 sm:col-span-2">
          <span className={labelCls}>Invited</span>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={d.invite_program} onChange={(e) => set('invite_program', e.target.checked)} /> Everyone in the program</label>
          {lists.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={chosen.has(l.id)}
                onChange={(e) => setChosen((c) => { const n = new Set(c); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n })} /> {l.name}
            </label>
          ))}
          <Link to="/rounds" className="text-xs font-medium text-accent hover:underline">Manage mailing lists</Link>
        </div>
        <L text="Credit hours per session"><input inputMode="decimal" className={field} value={credit} onChange={(e) => setCredit(e.target.value)} /></L>
        <L text="Credit statement (printed on the certificate)" wide>
          <textarea rows={2} className={field} value={d.credits_statement ?? ''} onChange={(e) => set('credits_statement', e.target.value)} />
        </L>
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
          <Toggle checked={d.reminder_enabled} onChange={(v) => set('reminder_enabled', v)} title="Reminder the day before" text="To everyone invited who hasn’t said no, including people who never RSVP’d." />
          <Toggle checked={d.feedback_enabled} onChange={(v) => set('feedback_enabled', v)} title="Ask for feedback afterwards" text="Needed before a certificate can be downloaded." />
        </div>
      </div>
      {err && <div className="px-5"><Notice tone="bad">{err}</Notice></div>}
      <div className="flex flex-wrap gap-3 px-5 py-4">
        <button className={primary} onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        {series.status === 'active'
          ? <button className={quiet} disabled={busy} onClick={() => { if (window.confirm('Archive these rounds? No more invitations, reminders or feedback requests go out. RSVP pages and certificates keep working.')) save('archived') }}>Archive</button>
          : <button className={quiet} disabled={busy} onClick={() => save('active')}>Reopen</button>}
      </div>
    </Card>
  )
}

function L({ text, hint, wide, children }: { text: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className={labelCls}>{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}
