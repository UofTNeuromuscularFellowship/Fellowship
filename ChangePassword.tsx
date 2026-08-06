import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate } from '../lib/format'

interface Session {
  id: string
  session_date: string
  topic: string | null
  provider_name: string | null
}

interface MyFeedback {
  session_id: string
  rating: number
  comments: string | null
}

export default function RateTeaching() {
  const { profile } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [mine, setMine] = useState<Record<string, MyFeedback>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const [{ data: sess, error: se }, { data: fb, error: fe }] = await Promise.all([
      supabase
        .from('teaching_sessions')
        .select('id, session_date, topic, provider_name')
        .eq('is_break', false)
        .lte('session_date', today)
        .order('session_date', { ascending: false })
        .limit(30),
      supabase.from('teaching_feedback').select('session_id, rating, comments'),
    ])
    if (se) setMsg(se.message)
    if (fe) setMsg(fe.message)
    setSessions((sess as Session[]) ?? [])
    const map: Record<string, MyFeedback> = {}
    for (const row of (fb as MyFeedback[]) ?? []) map[row.session_id] = row
    setMine(map)
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Rate Teaching</h1>
        <p className="mt-1 text-sm text-muted">
          Your feedback helps teachers improve and supports their CME documentation. Teachers see ratings and comments
          without names; the fellowship director can see who submitted what.
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      <Card>
        <CardHeader title="Recent sessions" sub="Sessions from the last few months" />
        {loading ? (
          <p className="px-5 py-4 text-sm text-muted">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No past sessions yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sessions.map((s) => {
              const fb = mine[s.id]
              return (
                <li key={s.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{s.topic ?? 'TBD'}</p>
                      <p className="text-sm text-muted">
                        {formatDate(s.session_date)}
                        {s.provider_name ? ` · ${s.provider_name}` : ''}
                      </p>
                    </div>
                    <div className="text-sm">
                      {fb ? (
                        <span className="text-muted">
                          Rated {fb.rating}/5{' '}
                          <button className="ml-1 font-medium text-accent hover:underline" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                            Edit
                          </button>
                        </span>
                      ) : (
                        <button className="font-medium text-accent hover:underline" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                          Rate this session
                        </button>
                      )}
                    </div>
                  </div>
                  {editing === s.id && (
                    <FeedbackForm
                      sessionId={s.id}
                      fellowId={profile.id}
                      existing={fb}
                      onDone={() => { setEditing(null); load() }}
                      onError={setMsg}
                    />
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

function FeedbackForm({
  sessionId, fellowId, existing, onDone, onError,
}: {
  sessionId: string
  fellowId: string
  existing?: MyFeedback
  onDone: () => void
  onError: (m: string) => void
}) {
  const [rating, setRating] = useState<number>(existing?.rating ?? 0)
  const [comments, setComments] = useState(existing?.comments ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (rating < 1) { onError('Please choose a rating from 1 to 5.'); return }
    setBusy(true)
    const { error } = await supabase.from('teaching_feedback').upsert(
      {
        session_id: sessionId,
        fellow_id: fellowId,
        rating,
        comments: comments.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,fellow_id' }
    )
    setBusy(false)
    if (error) onError(error.message)
    else onDone()
  }

  return (
    <div className="mt-3 rounded-md border border-line p-4">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} out of 5`}
            className={`text-xl ${n <= rating ? 'text-accent' : 'text-muted'}`}>
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-muted">{rating > 0 ? `${rating}/5` : 'Tap to rate'}</span>
      </div>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        placeholder="Comments on teaching effectiveness (optional)"
        rows={3}
        className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
      />
      <div className="mt-2">
        <button onClick={save} disabled={busy}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50">
          {busy ? 'Saving…' : 'Submit feedback'}
        </button>
      </div>
    </div>
  )
}
