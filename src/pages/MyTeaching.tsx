import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate } from '../lib/format'

interface Session {
  id: string
  session_date: string
  start_time: string
  end_time: string
  topic: string | null
  provider_name: string | null
  provider_id: string | null
  zoom_link: string | null
  delivered_at: string | null
  is_break: boolean
  assignment_draft: boolean
}

interface FeedbackRow { rating: number; comments: string | null; created_at: string }
interface NamedFeedbackRow extends FeedbackRow { fellow_name: string }
interface Person { id: string; full_name: string }
type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'session_cancelled'

export default function MyTeaching() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [openPanel, setOpenPanel] = useState<{ id: string; kind: 'feedback' | 'attendance' | 'zoom' | 'edit' } | null>(null)
  const [providers, setProviders] = useState<Person[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    let q = supabase
      .from('teaching_sessions')
      .select('id, session_date, start_time, end_time, topic, provider_name, provider_id, zoom_link, delivered_at, is_break, assignment_draft')
      .eq('is_break', false)
      .order('session_date')
    if (!isDirector && profile) q = q.eq('provider_id', profile.id).eq('assignment_draft', false)
    const { data, error } = await q
    if (error) setMsg(error.message)
    setSessions((data as Session[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    if (isDirector) {
      supabase.rpc('list_providers').then(({ data }) => setProviders((data as Person[]) ?? []))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = useMemo(() => sessions.filter((s) => s.session_date >= today), [sessions, today])
  const past = useMemo(() => sessions.filter((s) => s.session_date < today).reverse(), [sessions, today])
  const draftCount = useMemo(() => sessions.filter((s) => s.assignment_draft).length, [sessions])

  async function markDelivered(s: Session) {
    const { error } = await supabase.rpc('mark_session_delivered', { p_session: s.id })
    if (error) setMsg(error.message)
    else load()
  }

  if (!profile) return null

  function togglePanel(id: string, kind: 'feedback' | 'attendance' | 'zoom' | 'edit') {
    setOpenPanel(openPanel?.id === id && openPanel.kind === kind ? null : { id, kind })
  }

  function renderSession(s: Session, isPast: boolean) {
    return (
      <li key={s.id} className="px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">
              {s.topic ?? 'TBD'}
              {s.assignment_draft && (
                <span className="ml-2 rounded-full border border-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Draft</span>
              )}
            </p>
            <p className="text-sm text-muted">
              {formatDate(s.session_date)} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
              {isDirector && s.provider_name ? ` · ${s.provider_name}` : ''}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          {!isPast && (s.zoom_link ? (
            <a href={s.zoom_link} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Join Zoom</a>
          ) : (
            <span className="text-muted">No Zoom link yet</span>
          ))}
          {!isPast && (
            <button className="font-medium text-accent hover:underline" onClick={() => togglePanel(s.id, 'zoom')}>
              {s.zoom_link ? 'Edit link' : 'Add link'}
            </button>
          )}
          {isPast && (s.delivered_at ? (
            <span className="text-muted">Delivered {new Date(s.delivered_at).toLocaleDateString('en-CA')}</span>
          ) : (
            <button className="font-medium text-accent hover:underline" onClick={() => markDelivered(s)}>Mark as delivered</button>
          ))}
          {isPast && (
            <button className="font-medium text-accent hover:underline" onClick={() => togglePanel(s.id, 'attendance')}>Attendance</button>
          )}
          {isPast && (
            <button className="font-medium text-accent hover:underline" onClick={() => togglePanel(s.id, 'feedback')}>Feedback</button>
          )}
          {isPast && s.delivered_at && (
            <button className="font-medium text-accent hover:underline" onClick={() => openCompletionLetter(s)}>Completion letter</button>
          )}
          {isDirector && (
            <button className="font-medium text-accent hover:underline" onClick={() => togglePanel(s.id, 'edit')}>Edit session</button>
          )}
        </div>
        {openPanel?.id === s.id && openPanel.kind === 'zoom' && (
          <ZoomEditor session={s} onDone={() => { setOpenPanel(null); load() }} onError={setMsg} />
        )}
        {openPanel?.id === s.id && openPanel.kind === 'attendance' && (
          <AttendancePanel session={s} recorderId={profile!.id} onError={setMsg} />
        )}
        {openPanel?.id === s.id && openPanel.kind === 'feedback' && (
          <FeedbackPanel session={s} isDirector={isDirector} onError={setMsg} />
        )}
        {openPanel?.id === s.id && openPanel.kind === 'edit' && (
          <EditSessionPanel session={s} providers={providers} onDone={() => { setOpenPanel(null); load() }} onError={setMsg} />
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">My Teaching</h1>
        <p className="mt-1 text-sm text-muted">
          {isDirector ? 'All teaching sessions, assignments, delivery status, and feedback' : 'Your assigned sessions, delivery log, and feedback'}
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {isDirector && <AutoAssignToolbar draftCount={draftCount} onChanged={load} onError={setMsg} />}

      <Card>
        <CardHeader title="Upcoming sessions" sub={`${upcoming.length} scheduled`} />
        {loading ? (
          <p className="px-5 py-4 text-sm text-muted">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No upcoming assignments.</p>
        ) : (
          <ul className="divide-y divide-line">{upcoming.map((s) => renderSession(s, false))}</ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Past sessions" sub="Log delivery, mark attendance, review feedback, download completion letters" />
        {loading ? (
          <p className="px-5 py-4 text-sm text-muted">Loading…</p>
        ) : past.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing here yet.</p>
        ) : (
          <ul className="divide-y divide-line">{past.map((s) => renderSession(s, true))}</ul>
        )}
      </Card>
    </div>
  )
}

function AutoAssignToolbar({ draftCount, onChanged, onError }: { draftCount: number; onChanged: () => void; onError: (m: string) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function run(kind: 'assign' | 'publish' | 'discard') {
    setBusy(kind)
    let res
    if (kind === 'assign') {
      if (!to) { setBusy(null); onError('Choose an end date for auto-assignment.'); return }
      res = await supabase.rpc('auto_assign_teaching', { p_from: from, p_to: to })
    } else if (kind === 'publish') {
      res = await supabase.rpc('publish_teaching_drafts')
    } else {
      res = await supabase.rpc('discard_teaching_drafts')
    }
    setBusy(null)
    if (res.error) { onError(res.error.message); return }
    onChanged()
  }

  return (
    <Card>
      <CardHeader
        title="Auto-assign teaching"
        sub="Fills unassigned sessions from topic defaults and the Waveform Rounds allocation, skipping providers who are away. Everything lands as a draft for your review."
      />
      <div className="flex flex-wrap items-end gap-2 px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <button onClick={() => run('assign')} disabled={busy !== null}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy === 'assign' ? 'Assigning…' : 'Auto-assign (draft)'}
        </button>
        {draftCount > 0 && (
          <>
            <span className="text-sm text-muted">{draftCount} draft assignment{draftCount === 1 ? '' : 's'} pending</span>
            <button onClick={() => run('publish')} disabled={busy !== null}
              className="rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-50">
              {busy === 'publish' ? 'Publishing…' : 'Publish drafts'}
            </button>
            <button onClick={() => run('discard')} disabled={busy !== null}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:text-ink disabled:opacity-50">
              {busy === 'discard' ? 'Discarding…' : 'Discard drafts'}
            </button>
          </>
        )}
      </div>
    </Card>
  )
}

function EditSessionPanel({ session, providers, onDone, onError }: {
  session: Session; providers: Person[]; onDone: () => void; onError: (m: string) => void
}) {
  const linked = providers.find((p) => p.id === session.provider_id)
  const [date, setDate] = useState(session.session_date)
  const [startTime, setStartTime] = useState(session.start_time.slice(0, 5))
  const [endTime, setEndTime] = useState(session.end_time.slice(0, 5))
  const [topic, setTopic] = useState(session.topic ?? '')
  const [choice, setChoice] = useState<string>(linked ? linked.id : session.provider_name ? 'custom' : 'none')
  const [customName, setCustomName] = useState(linked ? '' : session.provider_name ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    let provider_id: string | null = null
    let provider_name: string | null = null
    if (choice === 'custom') {
      provider_name = customName.trim() || null
    } else if (choice !== 'none') {
      const p = providers.find((x) => x.id === choice)
      provider_id = choice
      provider_name = p?.full_name ?? null
    }
    setBusy(true)
    const { error } = await supabase
      .from('teaching_sessions')
      .update({
        session_date: date,
        start_time: startTime,
        end_time: endTime,
        topic: topic.trim() || null,
        provider_id,
        provider_name,
        assignment_draft: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
    setBusy(false)
    if (error) onError(error.message)
    else onDone()
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-line p-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Start</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">End</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Topic</label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)}
          className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Teacher</label>
        <select value={choice} onChange={(e) => setChoice(e.target.value)}
          className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink">
          <option value="none">Unassigned</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          <option value="custom">Other (name only, no portal account)</option>
        </select>
        {choice === 'custom' && (
          <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Teacher's name"
            className="mt-2 w-full max-w-md rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        )}
        <p className="mt-1 text-xs text-muted">
          Teachers picked from the list see this session on their own My Teaching page. Saving confirms the session (clears any draft flag).
        </p>
      </div>
      <button onClick={save} disabled={busy}
        className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

function ZoomEditor({ session, onDone, onError }: { session: Session; onDone: () => void; onError: (m: string) => void }) {
  const [link, setLink] = useState(session.zoom_link ?? '')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const { error } = await supabase.rpc('set_session_zoom_link', { p_session: session.id, p_link: link })
    setBusy(false)
    if (error) onError(error.message)
    else onDone()
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://zoom.us/j/…"
        className="w-full max-w-md rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
      <button onClick={save} disabled={busy}
        className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function AttendancePanel({ session, recorderId, onError }: { session: Session; recorderId: string; onError: (m: string) => void }) {
  const [fellows, setFellows] = useState<Person[]>([])
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: fl, error: fe } = await supabase.rpc('list_fellows')
      if (fe) { onError(fe.message); return }
      setFellows((fl as Person[]) ?? [])
      const { data: existing } = await supabase
        .from('session_attendance')
        .select('fellow_id, status')
        .eq('session_id', session.id)
      const m: Record<string, AttendanceStatus> = {}
      for (const row of (existing as { fellow_id: string; status: AttendanceStatus }[]) ?? []) m[row.fellow_id] = row.status
      setMarks(m)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  async function save() {
    setBusy(true)
    const rows = Object.entries(marks).map(([fellow_id, status]) => ({
      session_id: session.id,
      fellow_id,
      status,
      check_in_method: 'marked_by_provider',
      recorded_by: recorderId,
      recorded_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('session_attendance').upsert(rows, { onConflict: 'session_id,fellow_id' })
    setBusy(false)
    if (error) onError(error.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  const statuses: AttendanceStatus[] = ['attended', 'absent', 'excused', 'session_cancelled']
  const labels: Record<AttendanceStatus, string> = {
    attended: 'Attended', absent: 'Absent', excused: 'Excused', session_cancelled: 'Cancelled',
  }

  return (
    <div className="mt-3 rounded-md border border-line p-4">
      {fellows.length === 0 ? (
        <p className="text-sm text-muted">No active fellows found.</p>
      ) : (
        <div className="space-y-2">
          {fellows.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-ink">{f.full_name}</span>
              <div className="flex gap-1">
                {statuses.map((st) => (
                  <button key={st}
                    onClick={() => setMarks({ ...marks, [f.id]: st })}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${
                      marks[f.id] === st ? 'border-accent text-accent' : 'border-line text-muted'
                    }`}>
                    {labels[st]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-2">
            <button onClick={save} disabled={busy}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50">
              {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save attendance'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FeedbackPanel({ session, isDirector, onError }: { session: Session; isDirector: boolean; onError: (m: string) => void }) {
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [named, setNamed] = useState<NamedFeedbackRow[] | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.rpc('provider_session_feedback', { p_session: session.id })
      if (error) { onError(error.message); setLoaded(true); return }
      setRows((data as FeedbackRow[]) ?? [])
      if (isDirector) {
        try {
          const { data: raw } = await supabase
            .from('teaching_feedback')
            .select('rating, comments, created_at, fellow_id')
            .eq('session_id', session.id)
          const list = (raw as (FeedbackRow & { fellow_id: string })[]) ?? []
          if (list.length > 0) {
            const ids = Array.from(new Set(list.map((r) => r.fellow_id)))
            const { data: names } = await supabase.rpc('profile_names', { ids })
            const nameMap: Record<string, string> = {}
            for (const n of (names as { id: string; full_name: string }[]) ?? []) nameMap[n.id] = n.full_name
            setNamed(list.map((r) => ({ rating: r.rating, comments: r.comments, created_at: r.created_at, fellow_name: nameMap[r.fellow_id] ?? 'Fellow' })))
          } else setNamed([])
        } catch { /* fall back to anonymized view */ }
      }
      setLoaded(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  const avg = rows.length ? (rows.reduce((a, r) => a + r.rating, 0) / rows.length).toFixed(1) : null
  const display = named ?? rows

  return (
    <div className="mt-3 rounded-md border border-line p-4">
      {!loaded ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">No feedback submitted yet.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">
            Average rating {avg} / 5 · {rows.length} response{rows.length === 1 ? '' : 's'}
            {!isDirector && <span className="ml-2 font-normal text-muted">(responses are anonymous)</span>}
          </p>
          <ul className="space-y-2">
            {display.map((r, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="font-medium">{r.rating}/5</span>
                {'fellow_name' in r && <span className="text-muted"> · {(r as NamedFeedbackRow).fellow_name}</span>}
                {r.comments && <span className="text-muted"> — {r.comments}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

async function openCompletionLetter(s: Session) {
  let feedbackLine = ''
  try {
    const { data } = await supabase.rpc('provider_session_feedback', { p_session: s.id })
    const rows = (data as FeedbackRow[]) ?? []
    if (rows.length > 0) {
      const avg = (rows.reduce((a, r) => a + r.rating, 0) / rows.length).toFixed(1)
      feedbackLine = `<p>Learner feedback: average rating ${avg} / 5 across ${rows.length} fellow response${rows.length === 1 ? '' : 's'}.</p>`
    }
  } catch { /* letter still valid without feedback */ }

  let attendanceLine = ''
  try {
    const { data } = await supabase
      .from('session_attendance')
      .select('status')
      .eq('session_id', s.id)
      .eq('status', 'attended')
    const n = (data ?? []).length
    if (n > 0) attendanceLine = `<p>Recorded attendance: ${n} fellow${n === 1 ? '' : 's'}.</p>`
  } catch { /* optional */ }

  const html = `<!doctype html><html><head><title>Teaching Completion Letter</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 42rem; margin: 3rem auto; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 1.15rem; letter-spacing: .02em; } h2 { font-size: 1rem; margin-top: 2rem; }
  .muted { color: #555; font-size: .9rem; } .sig { margin-top: 4rem; }
  @media print { body { margin: 1rem auto; } }
</style></head><body>
<h1>Citywide Neuromuscular Fellowship<br/><span class="muted">Division of Neurology, University of Toronto</span></h1>
<p class="muted">${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
<h2>Confirmation of Teaching Activity</h2>
<p>This letter confirms that <strong>${s.provider_name ?? ''}</strong> delivered the following didactic teaching session to the fellows of the Citywide Neuromuscular Fellowship:</p>
<p><strong>Topic:</strong> ${s.topic ?? ''}<br/>
<strong>Date:</strong> ${new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}<br/>
<strong>Time:</strong> ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}</p>
${attendanceLine}
${feedbackLine}
<p>This letter documents the teaching activity described above for the recipient's continuing professional development records.</p>
<div class="sig">
<p>_______________________________<br/>
Dr. Aaron Izenberg<br/>
Fellowship Director, Citywide Neuromuscular Fellowship<br/>
aaron.izenberg@sunnybrook.ca · 416-480-4475</p>
</div>
<script>window.print()</script>
</body></html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}
