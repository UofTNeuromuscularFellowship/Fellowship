import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate, localToday } from '../lib/format'
import type { TeachingSession } from '../types/database'
import { useAuth } from '../context/AuthContext'
import { regularPattern, type Session } from '../lib/teaching'
import { WEEKDAY_NAMES, academicYear } from '../lib/schedule'

export default function TeachingSchedule() {
  const [rows, setRows] = useState<TeachingSession[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useAuth()
  const isManager = profile?.role === 'director' || profile?.role === 'admin'

  useEffect(() => {
    supabase
      .from('teaching_sessions')
      .select('*')
      .order('session_date', { ascending: true })
      .then(({ data }) => {
        setRows((data as TeachingSession[]) ?? [])
        setLoading(false)
      })
  }, [])

  const todayIso = localToday()
  // the subtitle comes from the sessions themselves, not a fixed line
  const subtitle = useMemo(() => {
    const upcoming = rows.filter((r) => r.session_date >= todayIso) as unknown as Session[]
    const reg = regularPattern(upcoming.length ? upcoming : (rows as unknown as Session[]))
    if (!reg) return null
    const years = Array.from(new Set(rows.map((r) => academicYear(r.session_date).label)))
    const current = academicYear(todayIso).label
    return `${WEEKDAY_NAMES[reg.weekday]}s, ${reg.start}–${reg.end} · ${years.includes(current) ? current : years[years.length - 1]} academic year`
  }, [rows, todayIso])
  const nextId = useMemo(
    () => rows.find((r) => r.session_date >= todayIso && !r.is_break && r.topic && r.status !== 'cancelled')?.id,
    [rows, todayIso],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Teaching schedule</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>

      <Card>
        <CardHeader title="Didactic sessions" />
        {loading ? (
          <p className="px-5 py-8 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              if (r.is_break) {
                return (
                  <li key={r.id} className="flex items-center gap-4 bg-paper px-5 py-3">
                    <span className="w-28 shrink-0 text-xs text-muted nums">{formatDate(r.session_date)}</span>
                    <span className="text-sm font-medium uppercase tracking-wide text-muted">
                      {r.break_label}
                    </span>
                  </li>
                )
              }
              const isNext = r.id === nextId
              const cancelled = r.status === 'cancelled'
              return (
                <li
                  key={r.id}
                  className={`flex items-start gap-4 px-5 py-3 ${isNext ? 'bg-accent-soft/50' : ''}`}
                >
                  <span className="w-28 shrink-0 pt-0.5 text-xs text-muted nums">
                    {formatDate(r.session_date)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${cancelled ? 'text-muted line-through' : 'text-ink'}`}>
                      {r.topic ?? <span className="text-muted">To be confirmed</span>}
                    </p>
                    {r.provider_name && (isManager || !r.assignment_draft)
                      ? <p className={`text-xs text-muted ${cancelled ? 'line-through' : ''}`}>{r.provider_name}{r.assignment_draft ? ' (draft)' : ''}</p>
                      : r.assignment_draft ? <p className="text-xs text-muted">Teacher to be confirmed</p> : null}
                  </div>
                  {cancelled && (
                    <span className="shrink-0 rounded-full border border-red-600 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                      Cancelled
                    </span>
                  )}
                  {isNext && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                      Next
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
