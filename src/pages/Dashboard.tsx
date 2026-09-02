import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { shortDate, localToday } from '../lib/format'
import { useActingProvider } from '../components/ActingFor'
import {
  ReadingList, SaveStar, PublicationBody, useSavedPublications,
} from '../components/ReadingList'
import type { Publication } from '../components/ReadingList'

interface Rotation {
  id: string
  rotation_date: string
  site_code: string | null
  fellow_id: string | null
  fellow_label: string | null
  provider_name: string | null
  supervisor_id: string | null
  is_draft: boolean
  is_protected: boolean | null
  is_away: boolean | null
  status: string
}
interface Session { id: string; session_date: string; start_time: string; topic: string | null; provider_name: string | null; zoom_link: string | null; status: string }
interface Notification { id: string; title: string; body: string | null; link: string | null; created_at: string }
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Local-calendar YYYY-MM-DD. Not toISOString() — that is the UTC date, which
 *  in Toronto rolls over to tomorrow at 20:00 and shifts the whole week. */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function weekRange(now: Date = new Date()): { from: string; to: string } {
  const day = now.getDay() === 0 ? 7 : now.getDay()
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: isoLocal(mon), to: isoLocal(sun) }
}

function weekdayOf(iso: string): string {
  return WEEKDAY_LABELS[new Date(iso + 'T00:00:00').getDay()]
}

export default function Dashboard() {
  const { profile } = useAuth()
  const isFellow = profile?.role === 'fellow'
  const isDirector = profile?.role === 'director'
  const isManager = profile?.role === 'director' || profile?.role === 'admin'
  const isSupervisor = profile?.role === 'supervisor'
  const acting = useActingProvider(profile?.role, profile?.id)
  const isAssistant = acting.isAssistant
  // The provider whose clinics count as "yours" — the user themselves, or the
  // linked provider an assistant is acting for.
  const viewerProviderId = isAssistant ? acting.effectiveId : (profile?.id ?? null)
  // Supervisors and assistants see only that provider's clinics; a director
  // sees every fellow's week.
  const providerScopeId = isManager || isFellow ? null : viewerProviderId
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [pubs, setPubs] = useState<Publication[]>([])
  const { saved, savedIds, save: savePublication, unsave: unsavePublication } = useSavedPublications(profile?.id)
  const [pubsLoading, setPubsLoading] = useState(true)
  const [pendingVacations, setPendingVacations] = useState(0)

  const { from: weekFrom, to: weekTo } = useMemo(() => weekRange(), [])
  const today = localToday()

  // Clinics are fetched on their own because the scope depends on the acting
  // provider, which for assistants resolves a beat after the profile does.
  useEffect(() => {
    if (!profile) return
    if ((isSupervisor || isAssistant) && !providerScopeId) {
      if (!acting.loading) setRotations([])
      return
    }
    let rq = supabase
      .from('clinic_rotations')
      .select('id, rotation_date, site_code, fellow_id, fellow_label, provider_name, supervisor_id, is_draft, is_protected, is_away, status')
      .gte('rotation_date', weekFrom).lte('rotation_date', weekTo)
      .eq('is_draft', false)
      .order('rotation_date')
    if (isFellow) rq = rq.eq('fellow_id', profile.id)
    else if (providerScopeId) rq = rq.eq('supervisor_id', providerScopeId)
    rq.then(({ data }) => setRotations((data as Rotation[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, providerScopeId, acting.loading])

  useEffect(() => {
    if (!profile) return
    const { from, to } = { from: weekFrom, to: weekTo }

    supabase
      .from('notifications')
      .select('id, title, body, link, created_at')
      .is('read_at', null)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setNotifications((data as Notification[]) ?? []))

    supabase
      .from('teaching_sessions')
      .select('id, session_date, start_time, topic, provider_name, zoom_link, status')
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

  // Mon–Fri columns, plus any weekend date that actually has a clinic on it so
  // nothing is silently dropped from the grid.
  const weekDays = useMemo(() => {
    const days: string[] = []
    const mon = new Date(weekFrom + 'T00:00:00')
    for (let i = 0; i < 5; i++) { const d = new Date(mon); d.setDate(mon.getDate() + i); days.push(isoLocal(d)) }
    const extra = rotations.map((r) => r.rotation_date).filter((d) => !days.includes(d))
    return Array.from(new Set([...days, ...extra])).sort()
  }, [weekFrom, rotations])

  // One row per fellow appearing in the week, each keyed date -> clinics.
  const clinicRows = useMemo(() => {
    const m = new Map<string, { key: string; label: string; cells: Map<string, Rotation[]> }>()
    for (const r of rotations) {
      const key = r.fellow_id ?? r.fellow_label ?? 'unassigned'
      const row = m.get(key) ?? { key, label: r.fellow_label ?? 'Unassigned', cells: new Map<string, Rotation[]>() }
      row.cells.set(r.rotation_date, [...(row.cells.get(r.rotation_date) ?? []), r])
      m.set(key, row)
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [rotations])

  const myClinicCount = useMemo(
    () => (viewerProviderId ? rotations.filter((r) => r.supervisor_id === viewerProviderId && r.status !== 'cancelled').length : 0),
    [rotations, viewerProviderId]
  )

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
        <p className="mt-1 text-sm text-muted">
          {isFellow ? 'Your week at a glance' : 'The fellowship week at a glance'}
        </p>
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

      <GettingStartedCard userId={profile.id} role={profile.role} />

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

      <Card>
        <CardHeader
          title={isFellow ? 'Your clinics this week' : 'Clinic schedule this week'}
          sub={
            isFellow
              ? undefined
              : isManager
                ? `Every fellow's clinic week${myClinicCount > 0 ? ` — ${myClinicCount} of these ${myClinicCount === 1 ? 'day is' : 'days are'} supervised by you, marked “With you.”` : '. None of this week\'s clinics are supervised by you.'}`
                : 'The clinics you are supervising this week, and the fellow assigned to each.'
          }
          action={<Link to="/clinic" className="text-sm font-medium text-accent hover:underline">Full schedule</Link>}
        />
        <ClinicWeekGrid
          rows={clinicRows}
          weekDays={weekDays}
          today={today}
          showFellowColumn={!isFellow}
          viewerProviderId={viewerProviderId}
        />
      </Card>

      <div>
        <Card>
          <CardHeader title="Teaching this week" action={<Link to="/teaching" className="text-sm font-medium text-accent hover:underline">Full schedule</Link>} />
          {sessions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No teaching sessions this week.</p>
          ) : (
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id} className="px-5 py-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className={s.status === 'cancelled' ? 'font-medium text-muted line-through' : 'font-medium text-ink'}>{s.topic ?? 'TBD'}</span>
                    <span className="text-muted">
                      {s.status === 'cancelled' && <span className="mr-2 font-semibold text-red-600">Cancelled</span>}
                      {shortDate(s.session_date)} · {s.start_time.slice(0, 5)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-muted">
                    {s.provider_name && <span>{s.provider_name}</span>}
                    {s.status !== 'cancelled' && s.zoom_link && (
                      <a href={s.zoom_link} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">Join Zoom</a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

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

      <div id="calendar-sync">
        <CalendarSubscribe userId={profile.id} />
      </div>

      <ReadingList saved={saved} onRemove={unsavePublication} />

      <InterestingReads
        publications={pubs}
        loading={pubsLoading}
        savedIds={savedIds}
        onSave={savePublication}
        onUnsave={unsavePublication}
      />
    </div>
  )
}

export interface ClinicRow { key: string; label: string; cells: Map<string, Rotation[]> }

/** The dashboard's Mon–Fri clinic grid: one column per weekday, one row per
 *  fellow (fellows see a single unlabelled row of their own days). */
export function ClinicWeekGrid({ rows, weekDays, today, showFellowColumn, viewerProviderId }: {
  rows: ClinicRow[]
  weekDays: string[]
  today: string
  showFellowColumn: boolean
  viewerProviderId: string | null
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted">No clinics scheduled this week.</p>
  }
  return (
    <div className="overflow-x-auto px-2 py-2">
      <table className={`w-full ${showFellowColumn ? 'min-w-[680px]' : 'min-w-[560px]'} table-fixed border-collapse text-sm`}>
        <thead>
          <tr>
            {showFellowColumn && <th className="w-32 p-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">Fellow</th>}
            {weekDays.map((dt) => (
              <th key={dt} className={`p-2 text-left text-xs font-semibold uppercase tracking-wider ${dt === today ? 'text-accent' : 'text-muted'}`}>
                {weekdayOf(dt)}
                <span className={`block font-normal normal-case ${dt === today ? 'text-accent' : 'text-muted'}`}>
                  {shortDate(dt)}{dt === today ? ' · Today' : ''}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line align-top">
              {showFellowColumn && <td className="p-2 font-medium text-ink">{row.label}</td>}
              {weekDays.map((dt) => {
                const cell = row.cells.get(dt) ?? []
                return (
                  <td key={dt} className={`p-2 ${dt === today ? 'bg-accent-soft/40' : ''}`}>
                    {cell.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      cell.map((r) => (
                        <ClinicCell key={r.id} r={r} mine={Boolean(viewerProviderId) && r.supervisor_id === viewerProviderId} />
                      ))
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One clinic inside a day cell of the dashboard week grid. */
function ClinicCell({ r, mine }: { r: Rotation; mine: boolean }) {
  if (r.is_away) {
    return <span className="block text-xs font-semibold uppercase tracking-wide text-amber-600">Away</span>
  }
  if (r.is_protected) {
    return <span className="block text-xs text-muted">Protected</span>
  }
  // The teal outline means "an active clinic of yours" — a cancelled one is
  // no longer yours to attend, so it drops the highlight.
  const highlight = mine && r.status !== 'cancelled'
  return (
    <div className={`rounded-md px-1.5 py-1 ${highlight ? 'bg-accent-soft ring-1 ring-accent' : ''}`}>
      <span className={`block text-xs font-semibold leading-tight ${r.status === 'cancelled' ? 'text-muted line-through' : 'text-ink'}`}>
        {r.site_code ?? 'TBD'}
      </span>
      {r.provider_name && r.provider_name !== r.site_code && (
        <span className="block text-[11px] leading-tight text-muted">{r.provider_name}</span>
      )}
      {r.status === 'cancelled' && (
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-red-600">Cancelled</span>
      )}
      {highlight && (
        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-accent">With you</span>
      )}
    </div>
  )
}

/** The digest: all three journals pooled into one run of papers, newest first.
 *  The journal name sits in each entry's byline, which is what tells them apart
 *  now that they are no longer in separate sections. */
function InterestingReads({ publications, loading, savedIds, onSave, onUnsave }: {
  publications: Publication[]
  loading: boolean
  savedIds: Set<string>
  onSave: (p: Publication) => void
  onUnsave: (pubmedId: string) => void
}) {
  return (
    <Card>
      <CardHeader
        title="Interesting reads"
        sub="Muscle & Nerve, the Journal of Neuromuscular Diseases and the JAMA journals — checked weekly, each paper stays for a month. Titles open the full text through the U of T library; star a paper to keep it on your reading list."
      />
      {loading ? (
        <p className="px-5 py-4 text-sm text-muted">Checking for new publications…</p>
      ) : publications.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nothing new in the last month.</p>
      ) : (
        <ul className="divide-y divide-line">
          {publications.map((p) => {
            const isSaved = savedIds.has(p.pubmed_id)
            return (
              <li key={p.pubmed_id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <PublicationBody p={p} />
                <SaveStar saved={isSaved} onClick={() => (isSaved ? onUnsave(p.pubmed_id) : onSave(p))} />
              </li>
            )
          })}
        </ul>
      )}
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
        sub="Add your own fellowship schedule — your clinics and teaching sessions — to Apple Calendar, Google Calendar, or Outlook. It updates automatically whenever the schedule changes; the portal remains the master calendar for everyone's schedule."
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

function GettingStartedCard({ userId, role }: { userId: string; role: string }) {
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.from('users').select('onboarding_dismissed_at').eq('id', userId).maybeSingle()
      .then(({ data }) => setDismissed(data ? data.onboarding_dismissed_at !== null : true))
  }, [userId])

  async function dismiss() {
    setDismissed(true)
    await supabase.from('users')
      .update({ onboarding_dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', userId)
  }

  if (dismissed !== false) return null

  const isSupervisor = role === 'supervisor' || role === 'director'
  const isFellow = role === 'fellow'
  const isAssistant = role === 'assistant'

  const steps = [
    {
      text: <>
        <Link to="/settings" className="font-medium text-accent hover:underline">Change your password</Link>
        {' '}— replace the temporary one you signed in with (Settings).
      </>,
    },
    ...(isAssistant ? [{
      text: <>
        Use the <span className="font-medium text-ink">“Managing schedule for”</span> selector on the
        {' '}<Link to="/my-teaching" className="font-medium text-accent hover:underline">Teaching</Link>,
        {' '}<Link to="/clinic" className="font-medium text-accent hover:underline">Clinic</Link>, and
        {' '}<Link to="/vacation" className="font-medium text-accent hover:underline">Away dates</Link> pages to
        act on behalf of the provider you support.
      </>,
    }] : []),
    ...(isFellow || isSupervisor ? [{
      text: <>
        <Link to="/vacation" className="font-medium text-accent hover:underline">
          {isFellow ? 'Request vacation & set away dates' : 'Set your away dates'}
        </Link>
        {' '}— so schedules are built around your availability.
      </>,
    }] : []),
    ...(isSupervisor ? [{
      text: <>
        <Link to="/settings" className="font-medium text-accent hover:underline">Add your admin assistant's email</Link>
        {' '}— they'll get a copy of every portal email so they can help manage your schedule (Settings).
      </>,
    }] : []),
    ...(!isAssistant ? [{
      text: <>
        <a href="#calendar-sync" className="font-medium text-accent hover:underline">Subscribe to the calendar</a>
        {' '}— see teaching and clinic activities in your own calendar app, updated automatically (below on this page).
      </>,
    }] : []),
  ]

  return (
    <div className="rounded-lg border-2 border-accent bg-accent-soft/60 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-semibold text-ink">Welcome! A few quick steps to get set up</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink">
            {steps.map((s, i) => <li key={i}>{s.text}</li>)}
          </ol>
        </div>
      </div>
      <button onClick={dismiss}
        className="mt-3 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft">
        Got it — don't show this again
      </button>
    </div>
  )
}
