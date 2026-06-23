import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate } from '../lib/format'
import type { TeachingSession } from '../types/database'

export default function TeachingSchedule() {
  const [rows, setRows] = useState<TeachingSession[]>([])
  const [loading, setLoading] = useState(true)

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

  const todayIso = new Date().toISOString().slice(0, 10)
  const nextId = useMemo(
    () => rows.find((r) => r.session_date >= todayIso && !r.is_break && r.topic)?.id,
    [rows, todayIso],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Teaching schedule</h1>
        <p className="mt-1 text-sm text-muted">Thursdays, 08:00–09:00 · 2026–27 academic year</p>
      </div>

      <Card>
        <CardHeader title="Didactic sessions" sub="Set sessions every two weeks throughout the year" />
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
              return (
                <li
                  key={r.id}
                  className={`flex items-start gap-4 px-5 py-3 ${isNext ? 'bg-accent-soft/50' : ''}`}
                >
                  <span className="w-28 shrink-0 pt-0.5 text-xs text-muted nums">
                    {formatDate(r.session_date)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {r.topic ?? <span className="text-muted">To be confirmed</span>}
                    </p>
                    {r.provider_name && <p className="text-xs text-muted">{r.provider_name}</p>}
                  </div>
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
