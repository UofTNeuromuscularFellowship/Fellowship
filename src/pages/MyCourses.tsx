import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { eventWhen, localIsoDate, RSVP_LABEL, RSVP_TONE, type MyCourse } from '../lib/conference'

// ---------------------------------------------------------------------------
// My courses: every conference or course this login is registered for or
// invited to, in any program.
//
// For a fellowship member this sits in the portal menu under Events. For an
// attendee account - one that belongs to no program - it is the whole portal,
// shown in the small AttendeeShell rather than the program rail.
// ---------------------------------------------------------------------------

export default function MyCourses() {
  const { refreshCourses } = useAuth()
  const [rows, setRows] = useState<MyCourse[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('conf_my_courses').then(({ data, error }) => {
      if (error) { setErr('We couldn’t load your courses. Please refresh the page.'); setRows([]); return }
      setRows((data as MyCourse[]) ?? [])
    })
    refreshCourses()
  }, [refreshCourses])

  const today = localIsoDate()
  const upcoming = (rows ?? []).filter((r) => r.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  const past = (rows ?? []).filter((r) => r.ends_on < today)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">My courses</h1>
        <p className="mt-1 text-sm text-muted">Courses and conferences you’re invited to or registered for.</p>
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="px-5 py-6 text-sm text-muted">
            Nothing here yet. When you register for a course from an invitation email, it appears here.
          </p>
        </Card>
      ) : (
        <>
          <CourseList title="Upcoming" rows={upcoming} empty="No upcoming courses." />
          {past.length > 0 && <CourseList title="Past" rows={past} empty="" />}
        </>
      )}
    </div>
  )
}

function CourseList({ title, rows, empty }: { title: string; rows: MyCourse[]; empty: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.token}>
              <Link to={`/courses/${r.token}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-paper">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.event_name}</p>
                  <p className="truncate text-xs text-muted">
                    {eventWhen(r.starts_on, r.ends_on)}
                    {r.venue_name ? ` · ${r.venue_name}` : r.online ? ' · Online' : ''}
                    {' · '}{r.organizer_name ?? r.program}
                  </p>
                </div>
                <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-medium ${RSVP_TONE[r.rsvp_status]}`}>
                  {r.rsvp_status === 'pending' ? 'Reply needed' : RSVP_LABEL[r.rsvp_status]}
                  {r.rsvp_status === 'waitlist' && r.waitlist_for ? ` · ${r.waitlist_for === 'in_person' ? 'in person' : 'online'}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
