import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { hhmm, prettyDay, type ConfEvent, type ConfFeedback, type ConfSession } from '../../lib/conference'

export function FeedbackResults({ event }: { event: ConfEvent }) {
  const [rows, setRows] = useState<ConfFeedback[]>([])
  const [sessions, setSessions] = useState<ConfSession[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('conf_feedback').select('*').eq('event_id', event.id).order('created_at'),
      supabase.from('conf_sessions').select('*').eq('event_id', event.id).order('session_date').order('start_time'),
    ]).then(([f, s]) => {
      setRows((f.data as ConfFeedback[]) ?? [])
      setSessions(((s.data as ConfSession[]) ?? []).filter((x) => !['break', 'meal'].includes(x.format)))
    })
  }, [event.id])

  const groups = [
    { id: null as string | null, title: 'The event overall', meta: '' },
    ...sessions.map((s) => ({ id: s.id as string | null, title: s.title, meta: `${prettyDay(s.session_date)}, ${hhmm(s.start_time)}` })),
  ]

  return (
    <Card>
      <CardHeader
        title="Feedback"
        sub={!event.feedback_enabled
          ? 'Feedback requests are switched off in Settings.'
          : event.feedback_sent_at
            ? `Requests went out ${new Date(event.feedback_sent_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}. ${rows.length} response${rows.length === 1 ? '' : 's'} so far.`
            : 'Requests go out automatically once the last session ends.'}
      />
      <div className="divide-y divide-line">
        {groups.map((g) => {
          const mine = rows.filter((r) => r.session_id === g.id)
          const rated = mine.filter((r) => r.rating != null)
          const avg = rated.length ? rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length : null
          const comments = mine.filter((r) => r.comments)
          return (
            <div key={g.id ?? 'event'} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-ink">{g.title}{g.meta && <span className="ml-2 text-xs font-normal text-muted">{g.meta}</span>}</p>
                <p className="text-sm tabular-nums text-ink">
                  {avg == null ? <span className="text-muted">No ratings</span> : <><strong>{avg.toFixed(1)}</strong> / 5 <span className="text-muted">· {rated.length} rating{rated.length === 1 ? '' : 's'}</span></>}
                </p>
              </div>
              {comments.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {comments.map((c) => (
                    <li key={c.id} className="rounded-md bg-paper px-3 py-2 text-sm text-ink">“{c.comments}”</li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
