import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'
import { Notice, primary, quiet, field, label as labelCls } from '../components/ui/Wizard'
import { LogoPicker } from '../components/LogoPicker'
import { RecordTable } from '../components/conference/RecordTable'
import { ROUNDS_SPONSOR_COLUMNS } from '../lib/sponsors'
import { plural, toIso } from '../lib/schedule'
import { useRoundsAccess, NotAllowed } from './Rounds'
import { Toggle } from './RoundsWizard'
import {
  describeRule, FORMAT_LABEL, FORMAT_SHORT, inMyZone, inviteDue, rsvpLabel, sessionWhen, utcToZoned, zonedToUtc, zoneLabel, zoneOptions,
  type RoundsCase, type RoundsFormat, type RoundsInvite, type RoundsKind, type RoundsList, type RoundsSeries as Series, type RoundsSession,
} from '../lib/rounds'

// ---------------------------------------------------------------------------
// One rounds series: its sessions (topic, speaker, moving one to another date,
// time or time zone, cancelling), who's coming, attendance and feedback, the
// cases discussed (case rounds only), and the series' own settings.
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
  const [caseCounts, setCaseCounts] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming')
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [sponsoring, setSponsoring] = useState(false)
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
      const { data: cs } = await supabase.from('rounds_cases').select('session_id').in('session_id', list.map((x) => x.id))
      const cc: Record<string, number> = {}
      for (const r of (cs as { session_id: string }[]) ?? []) cc[r.session_id] = (cc[r.session_id] ?? 0) + 1
      setCaseCounts(cc)
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
                {series.kind === 'case' ? 'Case rounds · ' : ''}{describeRule(series.recurrence, series.recurrence_rule)} · {FORMAT_SHORT[series.format]}
                {series.location ? ` · ${series.location}` : ''}{series.status === 'archived' ? ' · Archived' : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {series.kind === 'case' && <button className={quiet} onClick={() => downloadCases(series, sessions)}>Download cases (CSV)</button>}
            <button className={quiet} aria-expanded={sponsoring} onClick={() => setSponsoring(!sponsoring)}>{sponsoring ? 'Close sponsors' : 'Sponsors'}</button>
            <button className={quiet} onClick={() => setEditing(!editing)}>{editing ? 'Close settings' : 'Settings'}</button>
          </div>
        </div>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {sponsoring && (
        <RecordTable table="rounds_sponsors" parentKey="series_id" eventId={series.id} orderBy="name"
          title="Sponsors" sub="Logos and levels shown on every session's RSVP page and at the foot of every email for this series, higher levels first and larger."
          empty="No sponsors yet." addLabel="+ Add a sponsor"
          defaults={{ level: 'supporter', acknowledged: true }}
          columns={ROUNDS_SPONSOR_COLUMNS} />
      )}
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
            <SessionItem key={s.id} s={s} all={sessions} series={series} c={counts[s.id]} cases={caseCounts[s.id] ?? 0} open={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
              onChanged={(t) => { if (t) setMsg({ tone: 'ok', text: t }); load() }}
              onCasesChanged={(n) => setCaseCounts((cc) => ({ ...cc, [s.id]: n }))} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- a session

function SessionItem({ s, all, series, c, cases, open, onToggle, onChanged, onCasesChanged }: {
  s: RoundsSession; all: RoundsSession[]; series: Series; c?: Counts[string]; cases: number; open: boolean
  onToggle: () => void; onChanged: (t?: string) => void; onCasesChanged: (n: number) => void
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
          {series.kind === 'case' && s.status === 'scheduled' && (
            <span className="block text-xs text-muted">{cases ? plural(cases, 'case') + ' recorded' : 'No cases recorded yet'}</span>
          )}
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
          {series.kind === 'case' && s.status === 'scheduled' && <SessionCases session={s} seriesId={series.id} onCount={onCasesChanged} />}
          <Attendance s={s} series={series} past={past} />
        </div>
      )}
    </li>
  )
}

function SessionEditor({ s, series, invited, onChanged }: { s: RoundsSession; series: Series; invited: number; onChanged: (t?: string) => void }) {
  const start = utcToZoned(s.starts_at, s.timezone)
  const [topic, setTopic] = useState(s.topic ?? '')
  // Where and how this week: open whenever the session has a topic (that's
  // when its details get settled) or already has its own place, so it isn't
  // missed. Closing it by hand is respected.
  const [placeOpen, setPlaceOpen] = useState(!!(s.topic?.trim() || s.format || s.location || s.video_url))
  const [placeTouched, setPlaceTouched] = useState(false)
  useEffect(() => {
    if (!placeTouched && topic.trim()) setPlaceOpen(true)
  }, [topic, placeTouched])
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
      <details open={placeOpen} onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open
        if (open !== placeOpen) { setPlaceOpen(open); setPlaceTouched(true) }
      }}>
        <summary className="cursor-pointer text-sm font-medium text-accent">
          Different place or format this time
          <span className="ml-1 font-normal text-muted">— leave blank to use the usual {series.format === 'virtual' ? 'video link' : series.format === 'hybrid' ? 'room and video link' : 'room'}</span>
        </summary>
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

// ----------------------------------------------------------- case rounds

type CaseDraft = { presenter: string; disease_state: string; learning_point: string }
const blankCase: CaseDraft = { presenter: '', disease_state: '', learning_point: '' }
const caseDraft = (c: RoundsCase): CaseDraft => ({ presenter: c.presenter ?? '', disease_state: c.disease_state ?? '', learning_point: c.learning_point ?? '' })
const caseRow = (d: CaseDraft) => ({
  presenter: d.presenter.trim() || null, disease_state: d.disease_state.trim() || null, learning_point: d.learning_point.trim() || null,
})
const caseEmpty = (d: CaseDraft) => !d.presenter.trim() && !d.disease_state.trim() && !d.learning_point.trim()

/** The cases discussed at one session: as many as there were, each with its presenter, disease state and key learning point. */
function SessionCases({ session, seriesId, onCount }: { session: RoundsSession; seriesId: string; onCount: (n: number) => void }) {
  const [rows, setRows] = useState<RoundsCase[] | null>(null)
  const [suggest, setSuggest] = useState<{ presenters: string[]; diseases: string[] }>({ presenters: [], diseases: [] })
  const [adding, setAdding] = useState<CaseDraft | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('rounds_cases')
      .select('id, session_id, position, presenter, disease_state, learning_point')
      .eq('session_id', session.id).order('position').order('created_at')
    if (error) { setErr(error.message); setRows([]); return }
    const list = (data as RoundsCase[]) ?? []
    setRows(list)
    onCount(list.length)
  }, [session.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  // Names and disease states already used in this series, offered as you type.
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('rounds_cases').select('presenter, disease_state, rounds_sessions!inner(series_id)')
        .eq('rounds_sessions.series_id', seriesId)
      const r = (data as { presenter: string | null; disease_state: string | null }[]) ?? []
      const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter((x): x is string => !!x && !!x.trim()))).sort((a, b) => a.localeCompare(b))
      setSuggest({ presenters: uniq(r.map((x) => x.presenter)), diseases: uniq(r.map((x) => x.disease_state)) })
    })()
  }, [seriesId, rows?.length])

  async function add() {
    if (!adding || caseEmpty(adding)) { setErr('Fill in at least one of presenter, disease state or learning point.'); return }
    setBusy(true); setErr(null)
    const position = rows?.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0
    const { error } = await supabase.from('rounds_cases').insert({ session_id: session.id, position, ...caseRow(adding) })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setAdding(null)
    load()
  }

  const listIds = `rc-${session.id}`
  if (!rows) return <p className="text-sm text-muted">Loading cases…</p>
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Cases discussed · {rows.length}</p>
      <datalist id={`${listIds}-p`}>{suggest.presenters.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id={`${listIds}-d`}>{suggest.diseases.map((x) => <option key={x} value={x} />)}</datalist>
      {rows.length === 0 && !adding && <p className="text-sm text-muted">No cases recorded for this session yet.</p>}
      {rows.length > 0 && (
        <ol className="space-y-3">
          {rows.map((r, i) => <CaseEditor key={r.id} n={i + 1} row={r} listIds={listIds} onChanged={load} />)}
        </ol>
      )}
      {adding ? (
        <div className="space-y-3 rounded-lg border border-accent bg-paper px-4 py-3">
          <p className="text-sm font-semibold text-ink">Case {rows.length + 1}</p>
          <CaseFields d={adding} onChange={setAdding} listIds={listIds} />
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex gap-3">
            <button className={primary} onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add case'}</button>
            <button className={quiet} onClick={() => { setAdding(null); setErr(null) }} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className={quiet} onClick={() => setAdding({ ...blankCase })}>+ Add a case</button>
      )}
    </div>
  )
}

function CaseEditor({ n, row, listIds, onChanged }: { n: number; row: RoundsCase; listIds: string; onChanged: () => void }) {
  const [d, setD] = useState<CaseDraft>(() => caseDraft(row))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const orig = caseDraft(row)
  const dirty = d.presenter !== orig.presenter || d.disease_state !== orig.disease_state || d.learning_point !== orig.learning_point

  async function save() {
    if (caseEmpty(d)) { setErr('Fill in at least one field, or delete the case.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.from('rounds_cases').update({ ...caseRow(d), updated_at: new Date().toISOString() }).eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setSaved(true)
    onChanged()
  }
  async function remove() {
    if (!window.confirm(`Delete case ${n}?`)) return
    setBusy(true)
    const { error } = await supabase.from('rounds_cases').delete().eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }

  return (
    <li className="space-y-3 rounded-lg border border-line bg-paper px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Case {n}</p>
        <button className="text-xs font-medium text-muted hover:text-rose-700 dark:hover:text-rose-300" onClick={remove} disabled={busy}>Delete</button>
      </div>
      <CaseFields d={d} onChange={(x) => { setD(x); setSaved(false) }} listIds={listIds} />
      {err && <Notice tone="bad">{err}</Notice>}
      {(dirty || saved) && (
        <div className="flex items-center gap-3">
          {dirty && <button className={primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save case'}</button>}
          {dirty && <button className={quiet} onClick={() => setD(orig)} disabled={busy}>Undo changes</button>}
          {!dirty && saved && <span className="text-xs text-muted">Saved.</span>}
        </div>
      )}
    </li>
  )
}

function CaseFields({ d, onChange, listIds }: { d: CaseDraft; onChange: (d: CaseDraft) => void; listIds: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <L text="Case presenter"><input className={field} list={`${listIds}-p`} value={d.presenter} onChange={(e) => onChange({ ...d, presenter: e.target.value })} /></L>
      <L text="Disease state"><input className={field} list={`${listIds}-d`} value={d.disease_state} onChange={(e) => onChange({ ...d, disease_state: e.target.value })} /></L>
      <L text="Key learning point" wide>
        <textarea rows={2} className={field} value={d.learning_point} onChange={(e) => onChange({ ...d, learning_point: e.target.value })} />
      </L>
    </div>
  )
}

/** Every case recorded across the series, one row per case, for the organizer's records. */
async function downloadCases(series: Series, sessions: RoundsSession[]) {
  const live = sessions.filter((s) => s.status === 'scheduled')
  if (!live.length) { window.alert('There are no sessions in this series yet.'); return }
  const { data, error } = await supabase.from('rounds_cases')
    .select('session_id, position, presenter, disease_state, learning_point, created_at')
    .in('session_id', live.map((s) => s.id))
  if (error) { window.alert(`The cases couldn’t be loaded: ${error.message}`); return }
  const rows = (data as (Omit<RoundsCase, 'id'> & { created_at: string })[]) ?? []
  if (!rows.length) { window.alert('No cases have been recorded for this series yet.'); return }
  const byId = new Map(live.map((s) => [s.id, s]))
  rows.sort((a, b) => byId.get(a.session_id)!.starts_at.localeCompare(byId.get(b.session_id)!.starts_at)
    || a.position - b.position || a.created_at.localeCompare(b.created_at))
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Session date', 'Session topic', 'Case', 'Presenter', 'Disease state', 'Key learning point']
  const n: Record<string, number> = {}
  const body = rows.map((r) => {
    const s = byId.get(r.session_id)!
    n[r.session_id] = (n[r.session_id] ?? 0) + 1
    return [utcToZoned(s.starts_at, s.timezone).date, s.topic, n[r.session_id], r.presenter, r.disease_state, r.learning_point].map(esc).join(',')
  })
  const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${series.title} cases.csv`.replace(/[^\w .-]/g, '')
  a.click()
  URL.revokeObjectURL(a.href)
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
      title: d.title.trim(), description: clean(d.description), kind: d.kind, format: d.format, location: clean(d.location),
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
        <L text="Type of rounds" wide hint={series.kind === 'case' && d.kind !== 'case' ? 'Cases already recorded are kept, and come back if you switch to case rounds again.' : undefined}>
          <select className={field} value={d.kind} onChange={(e) => set('kind', e.target.value as RoundsKind)}>
            <option value="standard">Standard rounds — a topic and a speaker</option>
            <option value="case">Case rounds — record presenter, disease state and key learning point for each case</option>
          </select>
        </L>
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
