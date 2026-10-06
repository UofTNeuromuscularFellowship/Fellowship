import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Notice, field, label as labelCls, primary, textBtn } from '../components/ui/Wizard'
import NmdxSuggestDialog from '../components/NmdxSuggestDialog'
import {
  SECTION_LABEL, STATUS_LABEL, loadPeopleNames, loadSuggestions, resolveSuggestion, withdrawSuggestion,
  type Suggestion, type SuggestionStatus,
} from '../lib/nmdxSuggestions'

// ---------------------------------------------------------------------------
// /compendium/suggestions: the NMDx talk page. Everyone in the program sees
// every correction and topic request with its status and the reviewer's note.
// Authors can withdraw their own open suggestions. The director/admin marks
// each one accepted, declined or done, with a note.
// ---------------------------------------------------------------------------

type Filter = 'open' | 'all' | 'mine'
type KindFilter = 'all' | 'correction' | 'new_topic'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

const STATUS_TONE: Record<SuggestionStatus, string> = {
  open: 'bg-accent-soft text-accent',
  accepted: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  declined: 'bg-line text-muted',
  withdrawn: 'bg-line text-muted',
}

/** Turns URLs, DOIs and PubMed IDs in the sources into links. */
function Sources({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>()]+|\b10\.\d{4,9}\/[^\s<>()]+|\bPMID:?\s*\d{1,10}\b)/gi)
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-ink">
      {parts.map((p, i) => {
        if (/^https?:\/\//i.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{p}</a>
        if (/^10\.\d{4,9}\//.test(p)) return <a key={i} href={`https://doi.org/${p}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{p}</a>
        const pm = /^PMID:?\s*(\d{1,10})$/i.exec(p)
        if (pm) return <a key={i} href={`https://pubmed.ncbi.nlm.nih.gov/${pm[1]}/`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{p}</a>
        return <span key={i}>{p}</span>
      })}
    </p>
  )
}

function Review({ s, onSaved }: { s: Suggestion; onSaved: () => void }) {
  const [status, setStatus] = useState<Exclude<SuggestionStatus, 'withdrawn'>>(s.status === 'withdrawn' ? 'open' : s.status)
  const [note, setNote] = useState(s.resolution_note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    setBusy(true); setError(null)
    try { await resolveSuggestion(s.id, status, note); onSaved() } catch (x) { setError((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Review</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className={labelCls} htmlFor={`st-${s.id}`}>Status</label>
          <select id={`st-${s.id}`} className={field} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {(['open', 'accepted', 'declined', 'done'] as const).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor={`nt-${s.id}`}>Note to the author (shown to everyone)</label>
          <input id={`nt-${s.id}`} className={field} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Corrected in the next NMDx update, or why it was declined" />
        </div>
      </div>
      {error && <div className="mt-2"><Notice tone="bad">{error}</Notice></div>}
      <button type="button" className={`${primary} mt-2`} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save review'}</button>
    </div>
  )
}

export default function NmdxSuggestions() {
  const { profile } = useAuth()
  const isEditor = profile?.role === 'director' || profile?.role === 'admin'
  const [list, setList] = useState<Suggestion[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const [kind, setKind] = useState<KindFilter>('all')
  const [requesting, setRequesting] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)

  const reload = useCallback(() => {
    loadSuggestions().then(setList).catch((x) => setError((x as Error).message))
  }, [])
  useEffect(() => { reload(); loadPeopleNames().then(setNames).catch(() => {}) }, [reload])

  const shown = useMemo(() => (list ?? []).filter((s) =>
    (filter === 'all' || (filter === 'open' ? s.status === 'open' : s.created_by === profile?.id)) &&
    (kind === 'all' || s.kind === kind)), [list, filter, kind, profile?.id])

  const name = (id: string | null) => (id && names.get(id)) || 'A former member'

  async function withdraw(id: string) {
    if (!window.confirm('Withdraw this suggestion?')) return
    try { await withdrawSuggestion(id); reload() } catch (x) { setError((x as Error).message) }
  }

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? 'border-accent bg-accent text-surface' : 'border-line text-muted hover:text-ink'}`

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm"><Link to="/compendium" className="text-accent hover:underline">← NMDx</Link></p>
          <h1 className="font-display text-2xl font-bold text-ink">NMDx suggestions</h1>
          <p className="mt-1 text-sm text-muted">
            Corrections and new topic requests from the program, with their status. To suggest a correction, open the topic in NMDx and use
            “Suggest a correction”; highlight the text first to quote it.
          </p>
        </div>
        <button type="button" className={primary} onClick={() => setRequesting(true)}>Request a new topic</button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter suggestions">
        {(['open', 'all', 'mine'] as const).map((f) => (
          <button key={f} type="button" className={chip(filter === f)} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'open' ? 'Open' : f === 'all' ? 'All' : 'Mine'}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        {(['all', 'correction', 'new_topic'] as const).map((k) => (
          <button key={k} type="button" className={chip(kind === k)} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'all' ? 'Everything' : k === 'correction' ? 'Corrections' : 'New topics'}
          </button>
        ))}
      </div>

      {error && <Notice tone="bad">{error}</Notice>}
      {list === null && !error && <p className="text-sm text-muted">Loading…</p>}
      {list !== null && shown.length === 0 && (
        <p className="text-sm text-muted">{filter === 'open' ? 'No open suggestions.' : 'Nothing here yet.'}</p>
      )}

      <ul className="space-y-3">
        {shown.map((s) => (
          <li key={s.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {s.kind === 'correction' ? `Correction · ${SECTION_LABEL[s.section ?? 'other']}` : 'New topic'}
                </p>
                <p className="font-display text-base font-semibold text-ink">
                  {s.kind === 'correction' && s.entry_id
                    ? <Link to={`/compendium#${s.entry_id}`} className="hover:underline">{s.entry_name || s.entry_id}</Link>
                    : s.topic_name}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
            </div>
            {s.quote && (
              <blockquote className="mt-2 border-l-2 border-accent pl-3 text-sm italic text-muted whitespace-pre-wrap break-words">{s.quote}</blockquote>
            )}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{s.body}</p>
            {s.sources && (
              <div className="mt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sources</p>
                <Sources text={s.sources} />
              </div>
            )}
            <p className="mt-2 text-xs text-muted">{name(s.created_by)} · {when(s.created_at)}</p>
            {s.status !== 'open' && (s.resolution_note || s.resolved_by) && (
              <div className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm">
                <span className="font-medium text-ink">{s.status === 'withdrawn' ? 'Withdrawn by the author' : `${STATUS_LABEL[s.status]} by ${name(s.resolved_by)}`}</span>
                {s.resolved_at && <span className="text-muted"> · {when(s.resolved_at)}</span>}
                {s.resolution_note && <p className="mt-1 whitespace-pre-wrap text-ink">{s.resolution_note}</p>}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-4">
              {s.status === 'open' && s.created_by === profile?.id && (
                <button type="button" className={textBtn} onClick={() => withdraw(s.id)}>Withdraw</button>
              )}
              {isEditor && s.status !== 'withdrawn' && (
                <button type="button" className={textBtn} onClick={() => setReviewing(reviewing === s.id ? null : s.id)}>
                  {reviewing === s.id ? 'Close review' : 'Review'}
                </button>
              )}
            </div>
            {isEditor && reviewing === s.id && <Review s={s} onSaved={() => { setReviewing(null); reload() }} />}
          </li>
        ))}
      </ul>

      {requesting && <NmdxSuggestDialog start={{ kind: 'new_topic' }} onClose={() => setRequesting(false)} onSubmitted={reload} />}
    </div>
  )
}
