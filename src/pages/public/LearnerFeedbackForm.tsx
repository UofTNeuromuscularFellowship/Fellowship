import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicClient as supabase } from '../../lib/publicClient'
import { PublicFrame, Panel, Notice, Invalid, rpcMessage } from './PublicFrame'
import { dateLabel } from '../../lib/schedule'

// ---------------------------------------------------------------------------
// The form a supervisor opens from the end-of-day email about a learner who
// was in their clinic: did they meet the level expected, what did they do
// well, what could they work on. No sign-in; the link is the key. The answer
// goes to the fellowship director's learner feedback page.
// ---------------------------------------------------------------------------

interface Form {
  learner: string; level: string | null; school: string | null; learner_type: string
  date: string; clinic: string; supervisor: string | null; program: string | null
  submitted: boolean; meets_level: 'below' | 'meets' | 'above' | null; did_well: string | null; improve: string | null
}

const CHOICES: { v: 'below' | 'meets' | 'above'; l: string }[] = [
  { v: 'below', l: 'Below the level expected' },
  { v: 'meets', l: 'Meets the level expected' },
  { v: 'above', l: 'Above the level expected' },
]

export default function LearnerFeedbackForm() {
  const { token = '' } = useParams<{ token: string }>()
  const [f, setF] = useState<Form | null | undefined>(undefined)
  const [meets, setMeets] = useState<Form['meets_level']>(null)
  const [well, setWell] = useState('')
  const [improve, setImprove] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  useEffect(() => {
    supabase.rpc('learner_feedback_form', { p_token: token }).then(({ data, error }) => {
      const d = error ? null : (data as Form)
      setF(d)
      if (d) { setMeets(d.meets_level); setWell(d.did_well ?? ''); setImprove(d.improve ?? '') }
    })
  }, [token])

  async function send() {
    if (!meets) { setMsg({ tone: 'bad', text: 'Please say whether they met the level expected.' }); return }
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('learner_feedback_submit', { p_token: token, p_meets: meets, p_did_well: well, p_improve: improve })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'Your feedback couldn’t be saved.') }); return }
    setF(data as Form)
    setMsg({ tone: 'ok', text: 'Thank you — your feedback was sent to the fellowship director.' })
  }

  if (f === undefined) return <PublicFrame><p className="text-sm text-muted">Loading…</p></PublicFrame>
  if (f === null) return <Invalid what="feedback form" />
  const who = [f.level, f.school].filter(Boolean).join(', ')
  return (
    <PublicFrame kicker={f.program ? `${f.program} · learner feedback` : 'Learner feedback'} title={f.learner} organizer={f.program}>
      <Panel>
        <p className="text-sm">
          {who && <>{who}. </>}In clinic at <strong>{f.clinic}</strong> on <strong>{dateLabel(f.date)}</strong>{f.supervisor ? <> with {f.supervisor}</> : null}.
        </p>
        {f.submitted && !msg && <p className="mt-2 text-xs text-muted">You’ve already sent feedback for this day. You can change it below.</p>}
      </Panel>
      <Panel title="Did they meet the level expected for their stage of training?">
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
          {CHOICES.map((c) => (
            <label key={c.v} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm ${meets === c.v ? 'border-accent bg-accent-soft font-semibold' : 'border-line'}`}>
              <input type="radio" name="meets" checked={meets === c.v} onChange={() => setMeets(c.v)} /> {c.l}
            </label>
          ))}
        </div>
      </Panel>
      <Panel title="What did they do well?">
        <textarea rows={4} className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink" value={well} onChange={(e) => setWell(e.target.value)} />
      </Panel>
      <Panel title="What could they work on?">
        <textarea rows={4} className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink" value={improve} onChange={(e) => setImprove(e.target.value)} />
      </Panel>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" onClick={send} disabled={busy}>
        {busy ? 'Sending…' : f.submitted ? 'Update feedback' : 'Send feedback'}
      </button>
      <p className="text-xs text-muted">Only the fellowship director and program admin read this. Please keep it to the learner’s performance — no patient details.</p>
    </PublicFrame>
  )
}
