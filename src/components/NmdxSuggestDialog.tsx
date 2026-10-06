import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Notice, field, label as labelCls, primary, quiet } from './ui/Wizard'
import {
  SECTION_LABEL, submitSuggestion,
  type SuggestionDraft, type SuggestionKind, type SuggestionSection,
} from '../lib/nmdxSuggestions'

// ---------------------------------------------------------------------------
// The form for an NMDx suggestion: a correction to a topic (opened from the
// topic itself, so the topic, section and any highlighted text come with it)
// or a request for a new topic. Both ask for source material.
// ---------------------------------------------------------------------------

export interface DialogStart {
  kind: SuggestionKind
  entryId?: string
  entryName?: string
  section?: SuggestionSection
  quote?: string
  topicName?: string
}

const SECTIONS = Object.keys(SECTION_LABEL) as SuggestionSection[]

export default function NmdxSuggestDialog({ start, onClose, onSubmitted }: {
  start: DialogStart
  onClose: () => void
  onSubmitted: () => void
}) {
  const [d, setD] = useState<SuggestionDraft>({
    kind: start.kind,
    entryId: start.entryId ?? '',
    entryName: start.entryName ?? '',
    section: start.section ?? 'other',
    quote: start.quote ?? '',
    topicName: start.topicName ?? '',
    body: '',
    sources: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const first = useRef<HTMLTextAreaElement & HTMLInputElement>(null)
  const isCorrection = d.kind === 'correction'

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof SuggestionDraft>(k: K, v: SuggestionDraft[K]) => setD((x) => ({ ...x, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isCorrection && !d.topicName.trim()) { setError('Name the topic you would like added.'); return }
    if (!d.body.trim()) { setError(isCorrection ? 'Describe the error and how it should read.' : 'Describe what the topic should cover.'); return }
    setBusy(true)
    try {
      await submitSuggestion(d)
      setDone(true)
      onSubmitted()
    } catch (x) {
      setError((x as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nmdx-suggest-title" className="my-8 w-full max-w-xl rounded-xl border border-line bg-surface p-5 shadow-xl">
        <h2 id="nmdx-suggest-title" className="font-display text-lg font-semibold text-ink">
          {isCorrection ? 'Suggest a correction' : 'Request a new topic'}
        </h2>
        {isCorrection && <p className="mt-1 text-sm text-muted">{d.entryName || d.entryId}</p>}

        {done ? (
          <div className="mt-4 space-y-4">
            <Notice tone="ok">Thanks. Your suggestion has been sent to the program director for review, and it now appears on the suggestions page for everyone to see.</Notice>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={primary} onClick={onClose}>Close</button>
              <Link to="/compendium/suggestions" className={quiet}>See all suggestions</Link>
            </div>
          </div>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={submit}>
            {isCorrection ? (
              <>
                <div>
                  <label className={labelCls} htmlFor="sg-section">Section</label>
                  <select id="sg-section" className={field} value={d.section} onChange={(e) => set('section', e.target.value as SuggestionSection)}>
                    {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="sg-quote">The text in question (optional)</label>
                  <textarea id="sg-quote" className={field} rows={3} maxLength={2000} value={d.quote}
                    placeholder="Highlight text in the topic before clicking, or paste it here"
                    onChange={(e) => set('quote', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sg-body">What is wrong, and how should it read?</label>
                  <textarea id="sg-body" ref={first} className={field} rows={5} maxLength={5000} value={d.body}
                    onChange={(e) => set('body', e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={labelCls} htmlFor="sg-topic">Topic</label>
                  <input id="sg-topic" ref={first} className={field} maxLength={300} value={d.topicName}
                    placeholder="e.g. Anti-NF155 nodopathy" onChange={(e) => set('topicName', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="sg-body">What should it cover, and why add it?</label>
                  <textarea id="sg-body" className={field} rows={5} maxLength={5000} value={d.body}
                    onChange={(e) => set('body', e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label className={labelCls} htmlFor="sg-sources">Source material</label>
              <textarea id="sg-sources" className={field} rows={3} maxLength={5000} value={d.sources}
                placeholder="Citations, DOIs, PubMed IDs or links, one per line. Review articles, guidelines and textbooks are most helpful."
                onChange={(e) => set('sources', e.target.value)} />
              <p className="mt-1 text-xs text-muted">Changes are made only when they are supported by a source, so please include one if you can.</p>
            </div>
            <p className="text-xs text-muted">Suggestions are visible to everyone in the program. Do not include anything that could identify a patient.</p>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={primary} disabled={busy}>{busy ? 'Sending…' : 'Send suggestion'}</button>
              <button type="button" className={quiet} onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
