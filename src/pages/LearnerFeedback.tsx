import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'
import { field } from '../components/ui/Wizard'
import { dateLabel, plural, toIso } from '../lib/schedule'
import {
  LEARNER_COLUMNS, learnerSummary, MEETS_LABEL, MEETS_TONE,
  type Learner, type LearnerDay, type LearnerFeedbackRow,
} from '../lib/learners'

// ---------------------------------------------------------------------------
// What supervisors said about each learner at the end of each clinic day,
// for the director to read through — plus the requests still unanswered.
// ---------------------------------------------------------------------------

export default function LearnerFeedback() {
  const [learners, setLearners] = useState<Learner[] | null>(null)
  const [rows, setRows] = useState<LearnerFeedbackRow[]>([])
  const [days, setDays] = useState<LearnerDay[]>([])
  const [who, setWho] = useState('')
  const [level, setLevel] = useState('')

  useEffect(() => {
    ;(async () => {
      const [l, f, d] = await Promise.all([
        supabase.from('learners').select(LEARNER_COLUMNS).order('rotation_start', { ascending: false }),
        supabase.from('learner_feedback').select('id, learner_rotation_id, learner_id, supervisor_id, supervisor_name, meets_level, did_well, improve, submitted_at').order('submitted_at', { ascending: false }),
        supabase.from('learner_rotations').select('id, learner_id, rotation_date, clinic_template_id, site_code, provider_name, supervisor_id, is_draft, status, feedback_requested_at')
          .eq('is_draft', false).lte('rotation_date', toIso(new Date())),
      ])
      setLearners((l.data as Learner[]) ?? [])
      setRows((f.data as LearnerFeedbackRow[]) ?? [])
      setDays((d.data as LearnerDay[]) ?? [])
    })()
  }, [])

  const dayBy = useMemo(() => new Map(days.map((d) => [d.id, d])), [days])
  const answered = new Set(rows.map((r) => r.learner_rotation_id))
  const waiting = days.filter((d) => d.feedback_requested_at && !answered.has(d.id) && (!who || d.learner_id === who))
  const shown = rows.filter((r) => (!who || r.learner_id === who) && (!level || r.meets_level === level))
  const withFeedback = (learners ?? []).filter((l) => rows.some((r) => r.learner_id === l.id) || days.some((d) => d.learner_id === l.id))

  if (!learners) return <p className="text-sm text-muted">Loading…</p>
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Learner feedback</h1>
        <p className="mt-1 text-sm text-muted">
          Each supervisor is emailed a three-question form at 4 pm on the clinic day. Learners don’t see who wrote what.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[14rem]">
          <span className="mb-1 block text-xs font-medium text-muted">Learner</span>
          <select className={field} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">All learners</option>
            {withFeedback.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
          </select>
        </label>
        <label className="min-w-[14rem]">
          <span className="mb-1 block text-xs font-medium text-muted">Level expected</span>
          <select className={field} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Any</option>
            {(['below', 'meets', 'above'] as const).map((k) => <option key={k} value={k}>{MEETS_LABEL[k]}</option>)}
          </select>
        </label>
      </div>

      {who && <LearnerSummary l={learners.find((l) => l.id === who)!} rows={rows.filter((r) => r.learner_id === who)} />}

      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {rows.length === 0 ? 'No feedback yet. It arrives after each published clinic day.' : 'Nothing matches these filters.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => {
            const d = dayBy.get(r.learner_rotation_id)
            const l = learners.find((x) => x.id === r.learner_id)
            return (
              <li key={r.id} className="rounded-lg border border-line bg-surface px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{l?.full_name ?? 'Learner'}</p>
                    <p className="text-xs text-muted">
                      {d ? `${dateLabel(d.rotation_date)} · ${d.site_code}` : dateLabel(r.submitted_at.slice(0, 10))} · from {r.supervisor_name ?? 'supervisor'}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${MEETS_TONE[r.meets_level]}`}>{MEETS_LABEL[r.meets_level]}</span>
                </div>
                {r.did_well && <p className="mt-3 text-sm"><span className="font-semibold text-ink">Did well: </span><span className="whitespace-pre-line">{r.did_well}</span></p>}
                {r.improve && <p className="mt-1 text-sm"><span className="font-semibold text-ink">To work on: </span><span className="whitespace-pre-line">{r.improve}</span></p>}
              </li>
            )
          })}
        </ul>
      )}

      {waiting.length > 0 && (
        <Card>
          <CardHeader title="Still waiting" sub={`${plural(waiting.length, 'feedback request')} sent but not answered yet`} />
          <ul className="divide-y divide-line">
            {waiting.sort((a, b) => b.rotation_date.localeCompare(a.rotation_date)).map((d) => (
              <li key={d.id} className="px-5 py-2.5 text-sm">
                <span className="text-ink">{learners.find((l) => l.id === d.learner_id)?.full_name}</span>
                <span className="text-muted"> · {dateLabel(d.rotation_date)} · {d.site_code}{d.provider_name ? ` with ${d.provider_name}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted"><Link to="/learners" className="text-accent hover:underline">Learner schedule</Link></p>
    </div>
  )
}

function LearnerSummary({ l, rows }: { l: Learner; rows: LearnerFeedbackRow[] }) {
  const n = (k: LearnerFeedbackRow['meets_level']) => rows.filter((r) => r.meets_level === k).length
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="font-semibold text-ink">{l.full_name}</p>
          <p className="text-xs text-muted">{learnerSummary(l)} · {dateLabel(l.rotation_start)} – {dateLabel(l.rotation_end)}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(['above', 'meets', 'below'] as const).map((k) => (
            <span key={k} className={`rounded-full border px-2.5 py-0.5 font-medium ${MEETS_TONE[k]}`}>{n(k)} {k === 'meets' ? 'meets' : k}</span>
          ))}
        </div>
      </div>
    </Card>
  )
}
