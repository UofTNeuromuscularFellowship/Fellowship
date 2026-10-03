import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { Notice, field, label as labelCls, primary, quiet, textBtn } from '../components/ui/Wizard'
import { roleLabel } from '../lib/format'
import {
  EMPTY_DRAFT, POLICY_POINTS, POLICY_TITLE, acceptPolicy, articleLink, citation, deleteComment, dismissReports,
  editComment, hasAcceptedPolicy, loadArticle, loadArticles, loadComments, loadOpenReports, loadPeople, postComment,
  recommend, removeArticle, removeComment, reportComment, saveSummary, updateArticle,
  type ArticleDraft, type JcArticle, type JcComment, type JcPerson,
} from '../lib/journalClub'

// ---------------------------------------------------------------------------
// Journal Club.
//
//   /journal-club        the list: recommend an article, see each one's
//                        one-line outcome and how much discussion it has
//   /journal-club/:id    one article: its shared summary (one-line outcome,
//                        limitations) and the discussion
//
// Anyone in the program can recommend, summarize and discuss, once they have
// accepted the conduct policy. The director/admin can remove comments and
// articles, and sees reported comments at the top of the list.
// ---------------------------------------------------------------------------

type Msg = { tone: 'ok' | 'bad'; text: string } | null
const when = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
const whenTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function usePolicy() {
  const { profile } = useAuth()
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => { if (profile?.id) hasAcceptedPolicy(profile.id).then(setOk).catch(() => setOk(false)) }, [profile?.id])
  return [ok, () => setOk(true)] as const
}

function usePeople() {
  const [people, setPeople] = useState<Map<string, JcPerson>>(new Map())
  useEffect(() => { loadPeople().then(setPeople).catch(() => {}) }, [])
  const name = useCallback((id: string | null) => (id && people.get(id)?.full_name) || 'A former member', [people])
  const role = useCallback((id: string | null) => {
    const r = id ? people.get(id)?.role : undefined
    return r ? roleLabel(r as never) : ''
  }, [people])
  return { name, role }
}

/** The policy, with an accept button the first time. */
function PolicyCard({ onAccepted, compact = false }: { onAccepted?: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="rounded-xl border border-accent/40 bg-accent-soft/30 px-5 py-4">
      <p className="font-display text-base font-semibold text-ink">{POLICY_TITLE}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
        {POLICY_POINTS.map((p) => <li key={p}>{p}</li>)}
      </ul>
      {onAccepted && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className={primary} disabled={busy} onClick={async () => {
            setBusy(true); setMsg(null)
            try { await acceptPolicy(); onAccepted() } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
          }}>{busy ? 'Saving…' : 'I agree — let me post'}</button>
          {!compact && <span className="text-xs text-muted">You’ll only be asked once.</span>}
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-rose-700">{msg}</p>}
    </div>
  )
}

function ArticleForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial: ArticleDraft; submitLabel: string; onSubmit: (d: ArticleDraft) => Promise<void>; onCancel: () => void
}) {
  const [d, setD] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const set = (k: keyof ArticleDraft, v: string) => setD((x) => ({ ...x, [k]: v }))
  async function go() {
    if (!d.title.trim()) { setMsg('Add the article’s title.'); return }
    setBusy(true); setMsg(null)
    try { await onSubmit(d) } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <label className="block"><span className={labelCls}>Title *</span>
        <input className={field} value={d.title} onChange={(e) => set('title', e.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
        <label className="block"><span className={labelCls}>Authors</span>
          <input className={field} value={d.authors} placeholder="e.g. Smith J, et al." onChange={(e) => set('authors', e.target.value)} /></label>
        <label className="block"><span className={labelCls}>Journal</span>
          <input className={field} value={d.journal} onChange={(e) => set('journal', e.target.value)} /></label>
        <label className="block"><span className={labelCls}>Year</span>
          <input className={field} inputMode="numeric" value={d.year} onChange={(e) => set('year', e.target.value)} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className={labelCls}>Link</span>
          <input className={field} value={d.url} placeholder="https://" onChange={(e) => set('url', e.target.value)} /></label>
        <label className="block"><span className={labelCls}>DOI</span>
          <input className={field} value={d.doi} placeholder="10.…" onChange={(e) => set('doi', e.target.value)} /></label>
        <label className="block"><span className={labelCls}>PubMed ID</span>
          <input className={field} inputMode="numeric" value={d.pmid} onChange={(e) => set('pmid', e.target.value)} /></label>
      </div>
      <label className="block"><span className={labelCls}>Why it’s worth reading <span className="font-normal">(optional)</span></span>
        <textarea className={field} rows={2} value={d.why} onChange={(e) => set('why', e.target.value)} /></label>
      {msg && <Notice tone="bad">{msg}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button className={primary} disabled={busy} onClick={go}>{busy ? 'Saving…' : submitLabel}</button>
        <button className={quiet} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ================================================================ the list

export default function JournalClub() {
  const { id } = useParams()
  return id ? <ArticlePage id={id} /> : <ArticleList />
}

function ArticleList() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isDirector = profile?.role === 'director' || profile?.role === 'admin'
  const [articles, setArticles] = useState<JcArticle[] | null>(null)
  const [reports, setReports] = useState<Awaited<ReturnType<typeof loadOpenReports>>>([])
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [policyOk, setPolicyOk] = usePolicy()
  const { name } = usePeople()

  const load = useCallback(async () => {
    try {
      setArticles(await loadArticles())
      if (isDirector) setReports(await loadOpenReports())
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); setArticles([]) }
  }, [isDirector])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!articles || !s) return articles ?? []
    return articles.filter((a) => [a.title, a.authors, a.journal, a.summary_outcome, String(a.year ?? '')].some((x) => x?.toLowerCase().includes(s)))
  }, [articles, q])

  const titleOf = new Map((articles ?? []).map((a) => [a.id, a.title]))
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Journal Club</h1>
          <p className="mt-1 text-sm text-muted">Recommend an article, sum it up in a line, and talk it through.</p>
        </div>
        {!adding && <button className={primary} onClick={() => setAdding(true)}>Recommend an article</button>}
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {isDirector && reports.length > 0 && (
        <Card>
          <CardHeader title={`Reported comments (${reports.length})`} sub="Review each against the conduct policy. Open the discussion to remove a comment or dismiss the report." />
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id} className="px-5 py-3 text-sm">
                <p className="line-clamp-2 text-ink">“{r.jc_comments?.body ?? '—'}”</p>
                <p className="mt-1 text-xs text-muted">
                  On {titleOf.get(r.jc_comments?.article_id ?? '') ?? 'an article'} · reported {when(r.created_at)}{r.reason ? ` · “${r.reason}”` : ''}
                </p>
                {r.jc_comments?.article_id && (
                  <Link className="mt-1 inline-block text-xs font-semibold text-accent hover:underline" to={`/journal-club/${r.jc_comments.article_id}#c-${r.comment_id}`}>Review</Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {adding && (
        <Card>
          <CardHeader title="Recommend an article" sub="It goes straight onto the list for everyone in the program." />
          <div className="px-5 py-4">
            {policyOk === false
              ? <PolicyCard onAccepted={setPolicyOk} />
              : <ArticleForm initial={EMPTY_DRAFT} submitLabel="Add to Journal Club" onCancel={() => setAdding(false)}
                  onSubmit={async (d) => { const newId = await recommend(d); setAdding(false); navigate(`/journal-club/${newId}`) }} />}
          </div>
        </Card>
      )}

      {articles && articles.length > 4 && (
        <input className={field} placeholder="Search titles, authors, journals, outcomes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Journal Club" />
      )}

      {articles === null ? <p className="text-sm text-muted">Loading…</p>
        : shown.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
            {articles.length === 0 ? 'No articles yet. Be the first to recommend one.' : 'Nothing matches that search.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((a) => (
              <li key={a.id}>
                <Link to={`/journal-club/${a.id}`} className="block rounded-xl border border-line bg-surface px-5 py-4 transition-colors hover:border-accent">
                  <p className="font-display text-base font-semibold text-ink">{a.title}</p>
                  {citation(a) && <p className="mt-0.5 text-xs text-muted">{citation(a)}</p>}
                  <p className={`mt-2 text-sm ${a.summary_outcome ? 'text-ink' : 'italic text-muted'}`}>
                    {a.summary_outcome ? <><span className="font-semibold">Outcome: </span>{a.summary_outcome}</> : 'No summary yet — add the one-line outcome.'}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Recommended by {name(a.recommended_by)} · {when(a.created_at)} · {a.comment_count ?? 0} comment{(a.comment_count ?? 0) === 1 ? '' : 's'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      <p className="text-xs text-muted">
        Everything here is governed by the {POLICY_TITLE.toLowerCase()}: respectful discussion only, no abuse or harassment, and nothing that could identify a patient.
      </p>
    </div>
  )
}

// ============================================================== one article

function ArticlePage({ id }: { id: string }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const me = profile?.id ?? null
  const isDirector = profile?.role === 'director' || profile?.role === 'admin'
  const [a, setA] = useState<JcArticle | null | undefined>(undefined)
  const [comments, setComments] = useState<JcComment[]>([])
  const [reported, setReported] = useState<Map<string, number>>(new Map())
  const [msg, setMsg] = useState<Msg>(null)
  const [editingDetails, setEditingDetails] = useState(false)
  const [policyOk, setPolicyOk] = usePolicy()
  const { name, role } = usePeople()

  const load = useCallback(async () => {
    try {
      const [art, cs] = await Promise.all([loadArticle(id), loadComments(id)])
      setA(art); setComments(cs)
      if (isDirector) {
        const rs = await loadOpenReports()
        const m = new Map<string, number>()
        for (const r of rs) m.set(r.comment_id, (m.get(r.comment_id) ?? 0) + 1)
        setReported(m)
      }
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); setA(null) }
  }, [id, isDirector])
  useEffect(() => { load() }, [load])

  async function act(fn: () => Promise<void>, ok?: string) {
    setMsg(null)
    try { await fn(); if (ok) setMsg({ tone: 'ok', text: ok }); await load() } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }) }
  }

  if (a === undefined) return <p className="text-sm text-muted">Loading…</p>
  if (a === null) return (
    <div className="space-y-2">
      <p className="text-sm text-muted">That article isn’t on the Journal Club list any more.</p>
      <Link to="/journal-club" className="text-sm font-medium text-accent hover:underline">Back to Journal Club</Link>
    </div>
  )
  const link = articleLink(a)
  const mayEditDetails = a.recommended_by === me || isDirector

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/journal-club" className="text-xs font-medium text-muted hover:text-ink">← Journal Club</Link>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {a.removed_at && <Notice tone="warn">This article was removed from the list. Only the director can see it.</Notice>}

      {/* ---- the article ---- */}
      <Card>
        <div className="px-5 py-4">
          {editingDetails ? (
            <ArticleForm submitLabel="Save" onCancel={() => setEditingDetails(false)}
              initial={{ title: a.title, authors: a.authors ?? '', journal: a.journal ?? '', year: a.year ? String(a.year) : '', url: a.url ?? '', doi: a.doi ?? '', pmid: a.pmid ?? '', why: a.why ?? '' }}
              onSubmit={async (d) => { await updateArticle(a.id, d); setEditingDetails(false); await load() }} />
          ) : (
            <>
              <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">{a.title}</h1>
              {citation(a) && <p className="mt-1 text-sm text-muted">{citation(a)}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {link && <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">Read the article ↗</a>}
                {a.pmid && <span className="text-xs text-muted">PMID {a.pmid}</span>}
                {a.doi && <span className="break-all text-xs text-muted">DOI {a.doi}</span>}
              </div>
              {a.why && <p className="mt-3 whitespace-pre-line text-sm text-ink"><span className="font-semibold">Why read it: </span>{a.why}</p>}
              <p className="mt-3 text-xs text-muted">Recommended by {name(a.recommended_by)} · {when(a.created_at)}</p>
              {(mayEditDetails || isDirector) && !a.removed_at && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {mayEditDetails && <button className={textBtn} onClick={() => setEditingDetails(true)}>Edit details</button>}
                  {isDirector && (
                    <button className="text-sm font-medium text-rose-700 hover:underline" onClick={() => {
                      const reason = window.prompt('Remove this article and its discussion from Journal Club? Add a short reason (kept in the moderation log):', '')
                      if (reason === null) return
                      act(async () => { await removeArticle(a.id, reason); navigate('/journal-club') })
                    }}>Remove article</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <Summary a={a} policyOk={policyOk} onPolicy={setPolicyOk} name={name} onSaved={load} />

      {/* ---- discussion ---- */}
      <Card>
        <CardHeader title={`Discussion (${comments.filter((c) => !c.removed_at).length})`} sub="Comments and questions about the article." />
        {comments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No comments yet. Start the discussion, or ask a question.</p>
        ) : (
          <ul className="divide-y divide-line">
            {comments.map((c) => (
              <CommentItem key={c.id} c={c} me={me} isDirector={isDirector} reports={reported.get(c.id) ?? 0}
                name={name} role={role} act={act} policyOk={policyOk === true} />
            ))}
          </ul>
        )}
        {!a.removed_at && (
          <div className="border-t border-line px-5 py-4">
            {policyOk === false ? <PolicyCard onAccepted={setPolicyOk} compact /> : <Composer onPost={(body, qn) => act(() => postComment(a.id, body, qn))} />}
          </div>
        )}
      </Card>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer">{POLICY_TITLE}</summary>
        <div className="mt-2"><PolicyCard /></div>
      </details>
    </div>
  )
}

function Summary({ a, policyOk, onPolicy, name, onSaved }: {
  a: JcArticle; policyOk: boolean | null; onPolicy: () => void; name: (id: string | null) => string; onSaved: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [outcome, setOutcome] = useState(a.summary_outcome ?? '')
  const [limits, setLimits] = useState(a.summary_limitations ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { setOutcome(a.summary_outcome ?? ''); setLimits(a.summary_limitations ?? '') }, [a.summary_outcome, a.summary_limitations])
  const empty = !a.summary_outcome && !a.summary_limitations
  return (
    <Card>
      <CardHeader title="Summary" sub="One shared summary — anyone can write or improve it."
        action={!editing && !a.removed_at ? <button className={quiet} onClick={() => setEditing(true)}>{empty ? 'Write the summary' : 'Edit'}</button> : undefined} />
      <div className="px-5 py-4">
        {editing ? (
          policyOk === false ? <PolicyCard onAccepted={onPolicy} compact /> : (
            <div className="space-y-3">
              <label className="block"><span className={labelCls}>Outcome, in one line</span>
                <input className={field} maxLength={400} value={outcome} placeholder="e.g. Drug X improved the primary endpoint vs placebo at 12 weeks." onChange={(e) => setOutcome(e.target.value)} />
                <span className="mt-1 block text-right text-xs text-muted">{outcome.length}/400</span></label>
              <label className="block"><span className={labelCls}>Limitations</span>
                <textarea className={field} rows={4} maxLength={3000} value={limits} placeholder="Sample size, follow-up, population, design…" onChange={(e) => setLimits(e.target.value)} /></label>
              {msg && <Notice tone="bad">{msg}</Notice>}
              <div className="flex flex-wrap gap-2">
                <button className={primary} disabled={busy} onClick={async () => {
                  setBusy(true); setMsg(null)
                  try { await saveSummary(a.id, outcome, limits); setEditing(false); await onSaved() } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
                }}>{busy ? 'Saving…' : 'Save summary'}</button>
                <button className={quiet} onClick={() => { setEditing(false); setOutcome(a.summary_outcome ?? ''); setLimits(a.summary_limitations ?? '') }}>Cancel</button>
              </div>
            </div>
          )
        ) : empty ? (
          <p className="text-sm italic text-muted">No summary yet.</p>
        ) : (
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Outcome</dt><dd className="mt-0.5 text-ink">{a.summary_outcome ?? '—'}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted">Limitations</dt><dd className="mt-0.5 whitespace-pre-line text-ink">{a.summary_limitations ?? '—'}</dd></div>
            {a.summary_at && <p className="text-xs text-muted">Last edited by {name(a.summary_by)} · {when(a.summary_at)}</p>}
          </dl>
        )}
      </div>
    </Card>
  )
}

function Composer({ onPost }: { onPost: (body: string, question: boolean) => Promise<void> }) {
  const [body, setBody] = useState('')
  const [question, setQuestion] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-2">
      <label className="block"><span className={labelCls}>Add to the discussion</span>
        <textarea className={field} rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="A comment, or a question for the group" /></label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4" checked={question} onChange={(e) => setQuestion(e.target.checked)} /> This is a question
        </label>
        <button className={primary} disabled={busy || !body.trim()} onClick={async () => {
          setBusy(true); await onPost(body, question); setBusy(false); setBody(''); setQuestion(false)
        }}>{busy ? 'Posting…' : 'Post'}</button>
      </div>
      <p className="text-xs text-muted">Be respectful — no abuse or harassment, and nothing that could identify a patient.</p>
    </div>
  )
}

function CommentItem({ c, me, isDirector, reports, name, role, act, policyOk }: {
  c: JcComment; me: string | null; isDirector: boolean; reports: number
  name: (id: string | null) => string; role: (id: string | null) => string
  act: (fn: () => Promise<void>, ok?: string) => Promise<void>; policyOk: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(c.body ?? '')
  const mine = c.author_id === me
  if (c.removed_at) {
    return (
      <li id={`c-${c.id}`} className="px-5 py-3 text-sm italic text-muted">
        {c.removed_kind === 'moderator' ? 'This comment was removed by the program director.' : 'This comment was deleted by its author.'}
      </li>
    )
  }
  return (
    <li id={`c-${c.id}`} className={`px-5 py-3 ${reports ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span className="font-semibold text-ink">{name(c.author_id)}</span>
        {role(c.author_id) && <span>{role(c.author_id)}</span>}
        <span>· {whenTime(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
        {c.is_question && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">Question</span>}
        {isDirector && reports > 0 && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">Reported ×{reports}</span>}
      </p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea className={field} rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit your comment" />
          <div className="flex gap-2">
            <button className={primary} disabled={!text.trim()} onClick={() => act(async () => { await editComment(c.id, text); setEditing(false) })}>Save</button>
            <button className={quiet} onClick={() => { setEditing(false); setText(c.body ?? '') }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-line text-sm text-ink">{c.body}</p>
      )}
      {!editing && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {mine && policyOk && <button className="font-medium text-muted hover:text-ink" onClick={() => setEditing(true)}>Edit</button>}
          {mine && <button className="font-medium text-muted hover:text-ink" onClick={() => { if (window.confirm('Delete your comment?')) act(() => deleteComment(c.id)) }}>Delete</button>}
          {!mine && (
            <button className="font-medium text-muted hover:text-ink" onClick={() => {
              const reason = window.prompt('Report this comment to the program director. What’s the concern? (optional)', '')
              if (reason === null) return
              act(() => reportComment(c.id, reason), 'Thanks — the program director has been told.')
            }}>Report</button>
          )}
          {isDirector && !mine && (
            <button className="font-medium text-rose-700 hover:underline" onClick={() => {
              const reason = window.prompt('Remove this comment? Add a short reason (kept in the moderation log, not shown to others):', '')
              if (reason === null) return
              act(() => removeComment(c.id, reason), 'Comment removed.')
            }}>Remove</button>
          )}
          {isDirector && reports > 0 && (
            <button className="font-medium text-muted hover:text-ink" onClick={() => act(() => dismissReports(c.id), 'Report dismissed.')}>Dismiss report</button>
          )}
        </div>
      )}
    </li>
  )
}
