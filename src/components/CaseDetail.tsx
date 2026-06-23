import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/format'
import { PROCEDURE_METRICS } from '../lib/nm'
import type { CaseRow, CaseFeedbackRow } from '../types/database'

export function CaseDetail({
  row, onClose, onEdit, onChanged,
}: {
  row: CaseRow
  onClose: () => void
  onEdit?: () => void
  onChanged: () => void
}) {
  const { session, profile } = useAuth()
  const isOwner = profile?.role === 'fellow' && row.fellow_id === session?.user.id
  const canGiveFeedback = profile?.role === 'supervisor' || profile?.role === 'director'

  const [feedback, setFeedback] = useState<CaseFeedbackRow[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadFeedback() {
    const { data } = await supabase
      .from('case_feedback')
      .select('*')
      .eq('case_id', row.id)
      .order('created_at', { ascending: true })
    const fb = (data as CaseFeedbackRow[]) ?? []

    // Resolve author names via the profile_names function (names + role only).
    const ids = [...new Set(fb.map((f) => f.author_id))]
    const names: Record<string, { full_name: string; role: string }> = {}
    if (ids.length) {
      const { data: profs } = await supabase.rpc('profile_names', { ids })
      for (const p of (profs as { id: string; full_name: string; role: string }[]) ?? []) {
        names[p.id] = { full_name: p.full_name, role: p.role }
      }
    }
    setFeedback(fb.map((f) => ({
      ...f,
      author: names[f.author_id]
        ? { full_name: names[f.author_id].full_name, role: names[f.author_id].role as never }
        : null,
    })))
  }
  useEffect(() => { loadFeedback() }, [row.id])

  async function addFeedback() {
    if (!draft.trim()) return
    setBusy(true)
    const { error } = await supabase.from('case_feedback').insert({
      case_id: row.id, author_id: session!.user.id, body: draft.trim(),
    })
    setBusy(false)
    if (!error) { setDraft(''); loadFeedback() }
  }

  async function remove() {
    if (!confirm('Delete this case? This cannot be undone.')) return
    const { error } = await supabase.from('cases').delete().eq('id', row.id)
    if (!error) { onChanged(); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40">
      <div className="flex h-full w-full max-w-lg flex-col bg-surface shadow-xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{row.title}</h2>
            <p className="text-sm text-muted nums">{formatDate(row.case_date)}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">×</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${row.visibility === 'shared' ? 'bg-accent-soft text-accent' : 'bg-paper text-muted'}`}>
              {row.visibility === 'shared' ? 'Shared' : 'Private'}
            </span>
            {row.age != null && <span className="rounded-full bg-paper px-2 py-0.5 text-muted">{row.age}y {row.sex ?? ''}</span>}
          </div>

          {row.presentation && <Section title="Presentation">{row.presentation}</Section>}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Procedures</p>
            <div className="mt-2 grid grid-cols-4 gap-2 text-center">
              {PROCEDURE_METRICS.map((m) => (
                <div key={m.key} className="rounded-md border border-line py-2">
                  <p className="font-display text-lg font-semibold text-ink nums">{(row as any)[m.column] ?? 0}</p>
                  <p className="text-[11px] uppercase text-muted">{m.key}</p>
                </div>
              ))}
            </div>
          </div>

          {row.diagnoses?.length > 0 && (
            <TagSection title="Diagnoses" items={row.diagnoses} />
          )}
          {row.nerves_tested?.length > 0 && <TagSection title="Nerves tested" items={row.nerves_tested} />}
          {row.muscles_tested?.length > 0 && <TagSection title="Muscles tested" items={row.muscles_tested} />}

          {row.summary && <Section title="Summary">{row.summary}</Section>}
          {row.teaching_points && <Section title="Teaching points">{row.teaching_points}</Section>}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Feedback</p>
            {row.visibility === 'private' ? (
              <p className="mt-2 text-sm text-muted">Share this case to receive supervisor feedback.</p>
            ) : feedback.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No feedback yet.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {feedback.map((f) => (
                  <li key={f.id} className="rounded-md bg-paper px-3 py-2">
                    <p className="text-sm text-ink">{f.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {f.author?.full_name ?? 'Faculty'} · {new Date(f.created_at).toLocaleDateString('en-CA')}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {canGiveFeedback && row.visibility === 'shared' && (
              <div className="mt-3">
                <textarea
                  rows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
                  placeholder="Add feedback…"
                  className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
                <button onClick={addFeedback} disabled={busy || !draft.trim()} className="mt-2 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">
                  Post feedback
                </button>
              </div>
            )}
          </div>
        </div>

        {isOwner && (
          <div className="flex justify-between border-t border-line px-5 py-4">
            <button onClick={remove} className="text-sm font-medium text-red-600 hover:underline">Delete</button>
            {onEdit && <button onClick={onEdit} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">Edit</button>}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{children}</p>
    </div>
  )
}

function TagSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((i) => <span key={i} className="rounded bg-paper px-2 py-0.5 text-xs text-ink">{i}</span>)}
      </div>
    </div>
  )
}
