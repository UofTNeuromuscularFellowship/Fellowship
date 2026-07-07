import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { shortDate } from '../lib/format'

interface Rotation { id: string; rotation_date: string; site_code: string; fellow_label: string | null; is_draft: boolean }
interface Session { id: string; session_date: string; start_time: string; topic: string | null; provider_name: string | null; zoom_link: string | null }
interface Notification { id: string; title: string; body: string | null; link: string | null; created_at: string }
interface Publication { title: string; journal: string | null; authors: string | null; published_on: string | null; url: string | null }

function weekRange(): { from: string; to: string } {
  const now = new Date()
  const day = now.getDay() === 0 ? 7 : now.getDay()
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
}

export default function Dashboard() {
  const { profile } = useAuth()
  const isFellow = profile?.role === 'fellow'
  const isDirector = profile?.role === 'director'
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [pubs, setPubs] = useState<Publication[]>([])
  const [pubsLoading, setPubsLoading] = useState(true)
  const [pendingVacations, setPendingVacations] = useState(0)

  useEffect(() => {
    if (!profile) return
    const { from, to } = weekRange()

    supabase
      .from('notifications')
      .select('id, title, body, link, created_at')
      .is('read_at', null)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setNotifications((data as Notification[]) ?? []))

    let rq = supabase
      .from('clinic_rotations')
      .select('id, rotation_date, site_code, fellow_label, is_draft')
      .gte('rotation_date', from).lte('rotation_date', to)
      .eq('is_draft', false)
      .order('rotation_date')
    if (isFellow) rq = rq.eq('fellow_id', profile.id)
    rq.then(({ data }) => setRotations((data as Rotation[]) ?? []))

    supabase
      .from('teaching_sessions')
      .select('id, session_date, start_time, topic, provider_name, zoom_link')
      .gte('session_date', from).lte('session_date', to)
      .eq('is_break', false)
      .order('session_date')
      .then(({ data }) => setSessions((data as Session[]) ?? []))

    supabase.functions.invoke('pubmed-digest').then(({ data }) => {
      setPubs((data?.publications as Publication[]) ?? [])
      setPubsLoading(false)
    }).catch(() => setPubsLoading(false))

    if (isDirector) {
      supabase.from('vacation_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        .then(({ count }) => setPendingVacations(count ?? 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function acknowledge(n: Notification) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    setNotifications(notifications.filter((x) => x.id !== n.id))
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Welcome, {profile.full_name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-muted">Your week at a glance</p>
      </div>

      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-md border border-accent bg-accent-soft px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                {n.link && <Link to={n.link} className="text-sm font-medium text-accent hover:underline">View →</Link>}
              </div>
              <button onClick={() => acknowledge(n)} className="shrink-0 text-xs font-medium text-accent hover:underline">
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}

      {isDirector && (
        <Card>
          <CardHeader title="Director quick actions" />
          <div className="flex flex-wrap gap-4 px-5 py-4 text-sm">
            <Link to="/vacation" className="font-medium text-accent hover:underline">
              Vacation requests{pendingVacations > 0 ? ` (${pendingVacations} pending)` : ''}
            </Link>
            <Link to="/my-teaching" className="font-medium text-accent hover:underline">Teaching assignments</Link>
            <Link to="/clinic" className="font-medium text-accent hover:underline">Clinic schedule</Link>
            <Link to="/people" className="font-medium text-accent hover:underline">Add a user</Link>
            <Link to="/settings" className="font-medium text-accent hover:underline">Settings & broadcasts</Link>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Clinics this week" action={<Link to="/clinic" className="text-sm font-medium text-accent hover:underline">Full schedule</Link>} />
          {rotations.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No clinics scheduled this week.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rotations.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between px-5 py-3 text-sm">
                  <span className="font-medium text-ink">
                    {r.site_code}{!isFellow && r.fellow_label ? ` — ${r.fellow_label}` : ''}
                  </span>
                  <span className="text-muted">{shortDate(r.rotation_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Teaching this week" action={<Link to="/teaching" className="text-sm font-medium text-accent hover:underline">Full schedule</Link>} />
          {sessions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No teaching sessions this week.</p>
          ) : (
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id} className="px-5 py-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-ink">{s.topic ?? 'TBD'}</span>
                    <span className="text-muted">{shortDate(s.session_date)} · {s.start_time.slice(0, 5)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-muted">
                    {s.provider_name && <span>{s.provider_name}</span>}
                    {s.zoom_link && (
                      <a href={s.zoom_link} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Join Zoom</a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {isFellow && <QuickCaseLog fellowId={profile.id} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <JotNotes userId={profile.id} />
        <Card>
          <CardHeader title="Handbook" />
          <div className="px-5 py-4 text-sm">
            <Link to="/handbook" className="font-medium text-accent hover:underline">Open the Fellowship Handbook →</Link>
            <p className="mt-1 text-muted">Housekeeping, EMG reporting, and site-by-site guides.</p>
          </div>
        </Card>
      </div>

      <CalendarSubscribe userId={profile.id} />

      <Card>
        <CardHeader title="Interesting reads" sub="Recent neuromuscular publications, refreshed weekly from PubMed" />
        {pubsLoading ? (
          <p className="px-5 py-4 text-sm text-muted">Checking for new publications…</p>
        ) : pubs.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing new this week.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pubs.map((p, i) => (
              <li key={i} className="px-5 py-3 text-sm">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">{p.title}</a>
                ) : (
                  <span className="font-medium text-ink">{p.title}</span>
                )}
                <p className="mt-0.5 text-muted">
                  {[p.authors, p.journal, p.published_on ? shortDate(p.published_on) : null].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function QuickCaseLog({ fellowId }: { fellowId: string }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('cases').insert({ fellow_id: fellowId, case_date: date, title: title.trim() })
    setBusy(false)
    if (err) { setError(err.message); return }
    setTitle(''); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Card>
      <CardHeader
        title="Quick case log"
        sub="Capture a case in seconds — add details later in the Case logger"
        action={<Link to="/cases" className="text-sm font-medium text-accent hover:underline">Open Case logger</Link>}
      />
      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
        <input
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          placeholder="Brief case title (e.g., 'CTS study, moderate')"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
        <button onClick={save} disabled={busy || !title.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Saving…' : saved ? 'Logged ✓' : 'Log case'}
        </button>
      </div>
      {error && <p className="px-5 pb-3 text-sm text-muted">{error}</p>}
    </Card>
  )
}

function JotNotes({ userId }: { userId: string }) {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from('jot_notes').select('content').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data) setContent(data.content) })
  }, [userId])

  function onChange(v: string) {
    setContent(v)
    setStatus('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      await supabase.from('jot_notes').upsert({ user_id: userId, content: v, updated_at: new Date().toISOString() })
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
    }, 800)
  }

  return (
    <Card>
      <CardHeader title="Jot notes" sub="Your personal to-do list — saves automatically" />
      <div className="px-5 py-4">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder={'- Follow up on biopsy result\n- Read CIDP guideline\n- Book AANEM travel'}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
        <p className="mt-1 text-xs text-muted">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : ' '}</p>
      </div>
    </Card>
  )
}

function CalendarSubscribe({ userId }: { userId: string }) {
  const [links, setLinks] = useState<{ all: string; teaching: string; clinic: string } | null>(null)
  const [choice, setChoice] = useState<'all' | 'teaching' | 'clinic'>('all')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  async function ensureLinks() {
    setLoading(true)
    let { data: tok } = await supabase.from('calendar_tokens').select('token').eq('user_id', userId).maybeSingle()
    if (!tok) {
      const { data: created } = await supabase.from('calendar_tokens').insert({ user_id: userId }).select('token').single()
      tok = created
    }
    if (tok) {
      const base = `https://joraxuxuzynyrfmtqghp.supabase.co/functions/v1/calendar-feed?token=${tok.token}`
      setLinks({ all: `${base}&kind=all`, teaching: `${base}&kind=teaching`, clinic: `${base}&kind=clinic` })
    }
    setLoading(false)
  }

  useEffect(() => { ensureLinks() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentLink = links ? links[choice] : ''

  async function copy() {
    if (!currentLink) return
    await navigator.clipboard.writeText(currentLink)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader
        title="Sync your schedule to your calendar"
        sub="Add the fellowship schedule to Apple Calendar, Google Calendar, or Outlook. It updates automatically whenever the schedule changes — you never have to re-add it."
      />
      <div className="space-y-4 px-5 py-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">1. Choose what to include</p>
          <div className="flex flex-wrap gap-2">
            {([['all', 'Everything'], ['teaching', 'Teaching only'], ['clinic', 'Clinics only']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setChoice(val)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  choice === val ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">2. Copy your private link</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={loading ? 'Preparing your link…' : currentLink}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-muted"
            />
            <button onClick={copy} disabled={!currentLink}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">This link is private to you — please don't share it.</p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">3. Add it to your calendar app</p>
          <div className="space-y-1.5 text-sm text-ink">
            <p><span className="font-medium">Apple Calendar (iPhone/Mac):</span> Calendar → File → New Calendar Subscription (or on iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar), then paste the link.</p>
            <p><span className="font-medium">Google Calendar:</span> On a computer, open Google Calendar → next to "Other calendars" click + → From URL → paste the link.</p>
            <p><span className="font-medium">Outlook:</span> Calendar → Add calendar → Subscribe from web → paste the link.</p>
          </div>
          <p className="mt-2 text-xs text-muted">
            Calendar apps refresh subscriptions on their own schedule (often several times a day), so updates may take a few hours to appear — you don't need to do anything.
          </p>
        </div>
      </div>
    </Card>
  )
}
