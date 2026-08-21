import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { formatDate } from '../lib/format'

// ---------------------------------------------------------------------------
// Feedback review — the director's cross-session view.
//
// Ratings already existed one session at a time on My Teaching. This answers the
// questions that need the whole year at once: how is a supervisor doing, which
// fellows are actually responding, which sessions went unrated, and what have
// people asked us to teach.
//
// Director and program admin only, matching the RPCs behind it.
// ---------------------------------------------------------------------------

interface Response {
  session_id: string
  session_date: string
  topic: string | null
  provider_id: string | null
  provider_name: string | null
  fellow_id: string
  fellow_name: string
  rating: number
  comments: string | null
  suggested_topics: string | null
  created_at: string
}

interface SessionRow {
  session_id: string
  session_date: string
  topic: string | null
  provider_id: string | null
  provider_name: string | null
  status: string
  response_count: number
  avg_rating: number | null
  attended_count: number
  report_submitted_at: string | null
  topics_covered: string | null
  learning_gaps: string | null
  suggested_topics: string | null
  feedback_requested: boolean
}

interface TopicRow {
  topic_key: string
  label: string
  request_count: number
  fellow_requests: number
  teacher_requests: number
  first_requested: string
  last_requested: string
  status: 'open' | 'covered' | 'not_planned'
  detail: { source: string; person: string; text: string; session_date: string; after_session: string | null }[]
}

type GroupBy = 'supervisor' | 'fellow' | 'session'
type SortBy = 'rating_asc' | 'rating_desc' | 'count_desc' | 'name' | 'recent'

/** Academic year runs 1 July – 30 June. */
function academicYear(offset = 0): { from: string; to: string; label: string } {
  const now = new Date()
  const startYear = (now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1) + offset
  return {
    from: `${startYear}-07-01`,
    to: `${startYear + 1}-06-30`,
    label: `${startYear}–${String(startYear + 1).slice(2)}`,
  }
}

export default function FeedbackReview() {
  const { profile } = useAuth()
  const [period, setPeriod] = useState<'current' | 'previous' | 'all'>('current')
  const [groupBy, setGroupBy] = useState<GroupBy>('supervisor')
  const [sortBy, setSortBy] = useState<SortBy>('rating_asc')
  const [responses, setResponses] = useState<Response[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const range = useMemo(() => {
    if (period === 'all') return { from: null, to: null, label: 'All time' }
    const y = academicYear(period === 'current' ? 0 : -1)
    return { from: y.from, to: y.to, label: `${y.label} academic year` }
  }, [period])

  async function load() {
    setLoading(true)
    const args = { p_from: range.from, p_to: range.to }
    const [r, s, t] = await Promise.all([
      supabase.rpc('feedback_review_responses', args),
      supabase.rpc('feedback_review_sessions', args),
      supabase.rpc('suggested_topic_summary', args),
    ])
    const err = r.error ?? s.error ?? t.error
    if (err) setMsg(err.message)
    setResponses((r.data as Response[]) ?? [])
    setSessions((s.data as SessionRow[]) ?? [])
    setTopics((t.data as TopicRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, period])

  // --- headline numbers ---------------------------------------------------
  const stats = useMemo(() => {
    const rated = sessions.filter((s) => s.response_count > 0)
    const held = sessions.filter((s) => s.status !== 'cancelled')
    const avg = responses.length
      ? responses.reduce((a, r) => a + r.rating, 0) / responses.length
      : null
    return {
      responses: responses.length,
      avg,
      rated: rated.length,
      held: held.length,
      fellows: new Set(responses.map((r) => r.fellow_id)).size,
      unrated: held.filter((s) => s.response_count === 0 && s.feedback_requested).length,
    }
  }, [responses, sessions])

  // --- grouping -----------------------------------------------------------
  interface Group {
    key: string
    name: string
    sub: string
    ratings: number[]
    items: Response[]
    recent: string
  }

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const r of responses) {
      let key: string, name: string, sub: string
      if (groupBy === 'supervisor') {
        key = r.provider_id ?? r.provider_name ?? 'unassigned'
        name = r.provider_name ?? 'Unassigned'
        sub = ''
      } else if (groupBy === 'fellow') {
        key = r.fellow_id
        name = r.fellow_name
        sub = ''
      } else {
        key = r.session_id
        name = r.topic ?? 'Session'
        sub = `${formatDate(r.session_date)}${r.provider_name ? ` · ${r.provider_name}` : ''}`
      }
      const g = map.get(key) ?? { key, name, sub, ratings: [], items: [], recent: r.session_date }
      g.ratings.push(r.rating)
      g.items.push(r)
      if (r.session_date > g.recent) g.recent = r.session_date
      map.set(key, g)
    }
    if (groupBy === 'supervisor') {
      for (const g of map.values()) {
        const n = new Set(g.items.map((i) => i.session_id)).size
        g.sub = `${n} session${n === 1 ? '' : 's'} rated`
      }
    }
    if (groupBy === 'fellow') {
      for (const g of map.values()) {
        const n = new Set(g.items.map((i) => i.session_id)).size
        g.sub = `responded to ${n} session${n === 1 ? '' : 's'}`
      }
    }
    const list = Array.from(map.values())
    const avgOf = (g: Group) => g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length
    list.sort((a, b) => {
      switch (sortBy) {
        case 'rating_asc': return avgOf(a) - avgOf(b)
        case 'rating_desc': return avgOf(b) - avgOf(a)
        case 'count_desc': return b.items.length - a.items.length
        case 'recent': return b.recent.localeCompare(a.recent)
        default: return a.name.localeCompare(b.name)
      }
    })
    return list
  }, [responses, groupBy, sortBy])

  // Sessions nobody rated — invisible in a view built from responses alone.
  const unrated = useMemo(
    () => sessions.filter((s) => s.response_count === 0 && s.status !== 'cancelled' && s.feedback_requested),
    [sessions]
  )

  async function setTopicStatus(t: TopicRow, status: TopicRow['status']) {
    const { error } = await supabase.rpc('set_topic_status', {
      p_key: t.topic_key, p_label: t.label, p_status: status,
    })
    if (error) { setMsg(error.message); return }
    setTopics((prev) => prev.map((x) => (x.topic_key === t.topic_key ? { ...x, status } : x)))
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Feedback review</h1>
          <p className="mt-1 text-sm text-muted">
            Every rating and topic request across {range.label.toLowerCase()}. Fellows are told their ratings reach
            teachers without names — this page is the only place names are attached, so treat it accordingly.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
          >
            <option value="current">This academic year ({academicYear(0).label})</option>
            <option value="previous">Last academic year ({academicYear(-1).label})</option>
            <option value="all">All time</option>
          </select>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper"
          >
            Print
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink print:hidden">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Responses" value={String(stats.responses)} sub={`${stats.fellows} fellow${stats.fellows === 1 ? '' : 's'}`} />
        <Stat label="Average rating" value={stats.avg ? `${stats.avg.toFixed(1)} / 5` : '—'} sub="across all responses" />
        <Stat label="Sessions rated" value={`${stats.rated} / ${stats.held}`} sub="sessions held" />
        <Stat label="Awaiting feedback" value={String(stats.unrated)} sub="asked, none received" />
      </div>

      {loading ? (
        <Card><p className="px-5 py-4 text-sm text-muted">Loading…</p></Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Ratings and comments"
              sub={`${responses.length} response${responses.length === 1 ? '' : 's'}`}
              action={
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <div className="flex rounded-md border border-line">
                    {(['supervisor', 'fellow', 'session'] as GroupBy[]).map((g) => (
                      <button
                        key={g}
                        onClick={() => { setGroupBy(g); setOpen(null) }}
                        className={`px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md ${
                          groupBy === g ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'
                        }`}
                      >
                        {g === 'supervisor' ? 'By supervisor' : g === 'fellow' ? 'By fellow' : 'By session'}
                      </button>
                    ))}
                  </div>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                  >
                    <option value="rating_asc">Lowest rated first</option>
                    <option value="rating_desc">Highest rated first</option>
                    <option value="count_desc">Most responses</option>
                    <option value="recent">Most recent</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </div>
              }
            />
            {groups.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">No feedback in this period yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {groups.map((g) => {
                  const avg = g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length
                  const isOpen = open === g.key
                  return (
                    <li key={g.key} className="px-5 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{g.name}</p>
                          <p className="text-sm text-muted">{g.sub}</p>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <Distribution ratings={g.ratings} />
                          <span className="tabular-nums font-medium text-ink">{avg.toFixed(1)} / 5</span>
                          <span className="tabular-nums text-muted">
                            {g.items.length} response{g.items.length === 1 ? '' : 's'}
                          </span>
                          <button
                            onClick={() => setOpen(isOpen ? null : g.key)}
                            className="font-medium text-accent hover:underline print:hidden"
                          >
                            {isOpen ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                      <ul className={`mt-2 space-y-1 border-l-2 border-line pl-3 ${isOpen ? '' : 'hidden print:block'}`}>
                        {g.items.map((r, i) => (
                          <li key={i} className="text-sm">
                            <span className="font-medium text-ink">{r.rating}/5</span>
                            <span className="text-muted">
                              {' · '}
                              {groupBy === 'fellow'
                                ? `${r.topic ?? 'Session'}, ${formatDate(r.session_date)}${r.provider_name ? ` · ${r.provider_name}` : ''}`
                                : groupBy === 'supervisor'
                                  ? `${r.topic ?? 'Session'}, ${formatDate(r.session_date)} · ${r.fellow_name}`
                                  : r.fellow_name}
                            </span>
                            {r.comments && <span className="block text-muted">“{r.comments}”</span>}
                            {r.suggested_topics && (
                              <span className="block text-muted">Would like taught: {r.suggested_topics}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {unrated.length > 0 && (
            <Card>
              <CardHeader
                title="Sessions awaiting feedback"
                sub="A request went out and nothing came back"
              />
              <ul className="divide-y divide-line">
                {unrated.map((s) => (
                  <li key={s.session_id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                    <span className="font-medium text-ink">{s.topic ?? 'Session'}</span>
                    <span className="text-muted">
                      {formatDate(s.session_date)}
                      {s.provider_name ? ` · ${s.provider_name}` : ''}
                      {s.attended_count > 0 ? ` · ${s.attended_count} attended` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <RecommendedSessions topics={topics} onSetStatus={setTopicStatus} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  )
}

/** Five stacked bars, one per star, so a 4.0 built from 5s and 3s is
 *  distinguishable from a 4.0 where everyone said 4. */
function Distribution({ ratings }: { ratings: number[] }) {
  const counts = [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r === n).length)
  const max = Math.max(...counts, 1)
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true" title={counts.map((c, i) => `${i + 1}★ ${c}`).join(', ')}>
      {counts.map((c, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-sm ${c === 0 ? 'bg-line' : i < 2 ? 'bg-red-500' : i === 2 ? 'bg-amber-400' : 'bg-accent'}`}
          style={{ height: `${Math.max(3, (c / max) * 18)}px` }}
        />
      ))}
    </span>
  )
}

function RecommendedSessions({
  topics, onSetStatus,
}: {
  topics: TopicRow[]
  onSetStatus: (t: TopicRow, s: TopicRow['status']) => void
}) {
  const [showDismissed, setShowDismissed] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const visible = showDismissed ? topics : topics.filter((t) => t.status === 'open')
  const dismissedCount = topics.filter((t) => t.status !== 'open').length

  return (
    <Card>
      <CardHeader
        title="Recommended sessions"
        sub="Topics fellows and teachers have asked to see covered, most requested first"
        action={
          dismissedCount > 0 ? (
            <button
              onClick={() => setShowDismissed(!showDismissed)}
              className="text-sm font-medium text-accent hover:underline print:hidden"
            >
              {showDismissed ? 'Hide handled' : `Show ${dismissedCount} handled`}
            </button>
          ) : undefined
        }
      />
      {visible.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          {topics.length === 0 ? 'No topic requests in this period yet.' : 'Everything requested has been handled.'}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((t) => (
            <li key={t.topic_key} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {t.label}
                    {t.status === 'covered' && <Tag>Covered</Tag>}
                    {t.status === 'not_planned' && <Tag>Not planned</Tag>}
                  </p>
                  <p className="text-sm text-muted">
                    asked {t.request_count}×
                    {t.fellow_requests > 0 && ` · ${t.fellow_requests} by fellows`}
                    {t.teacher_requests > 0 && ` · ${t.teacher_requests} by teachers`}
                    {' · last '}{formatDate(t.last_requested)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm print:hidden">
                  <button
                    onClick={() => setExpanded(expanded === t.topic_key ? null : t.topic_key)}
                    className="font-medium text-accent hover:underline"
                  >
                    {expanded === t.topic_key ? 'Hide who' : 'Who asked'}
                  </button>
                  {t.status === 'open' ? (
                    <>
                      <button onClick={() => onSetStatus(t, 'covered')} className="font-medium text-accent hover:underline">
                        Mark covered
                      </button>
                      <button onClick={() => onSetStatus(t, 'not_planned')} className="font-medium text-muted hover:text-ink">
                        Not planned
                      </button>
                    </>
                  ) : (
                    <button onClick={() => onSetStatus(t, 'open')} className="font-medium text-accent hover:underline">
                      Reopen
                    </button>
                  )}
                </div>
              </div>
              {expanded === t.topic_key && (
                <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-sm text-muted">
                  {t.detail.map((d, i) => (
                    <li key={i}>
                      “{d.text}” — {d.person} ({d.source}), after {d.after_session ?? 'a session'} on{' '}
                      {formatDate(d.session_date)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Requests are grouped by their wording after case and spacing are ignored, so “Myasthenia gravis.” and
        “myasthenia gravis” count together but “MG” is listed separately. Open “Who asked” to see the raw wording of
        every request in a group.
      </p>
    </Card>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </span>
  )
}
