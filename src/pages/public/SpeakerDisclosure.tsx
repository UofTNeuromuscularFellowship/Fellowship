import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicClient } from '../../lib/publicClient'
import { input, primaryBtn, prettyDay, DISCLOSURE_LABEL, type DisclosureStatus, type SpeakerRole } from '../../lib/conference'
import { PublicFrame, Panel, Notice, Invalid, rpcMessage } from './PublicFrame'

// ---------------------------------------------------------------------------
// A speaker's conflict-of-interest disclosure, at /speaker/<token>.
//
// Reached from the "Your speaker disclosure" email. Whatever is submitted is
// shown to attendees beside the speaker's name in the itinerary, and the page
// says so before they write it. What period and level of detail is required
// is for the organizer's accrediting body to say, so this page does not
// state a rule of its own.
// ---------------------------------------------------------------------------

interface Disclosure {
  speaker_name: string
  event_name: string
  when: string
  organizer_name: string | null
  organizer_email: string | null
  status: DisclosureStatus
  text: string | null
  sessions: { title: string; role: SpeakerRole; session_date: string; start_time: string }[]
}

const ROLE: Record<SpeakerRole, string> = { speaker: 'Speaker', moderator: 'Moderator', panelist: 'Panelist' }

export default function SpeakerDisclosure() {
  const { token = '' } = useParams<{ token: string }>()
  const [d, setD] = useState<Disclosure | null | undefined>(undefined)
  const [mode, setMode] = useState<'none' | 'some' | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await publicClient.rpc('conf_public_disclosure', { p_token: token })
    const row = error ? null : ((data as Disclosure | null) ?? null)
    setD(row)
    if (row) {
      setMode(row.status === 'nothing_to_declare' ? 'none' : row.status === 'received' ? 'some' : null)
      setText(row.text ?? '')
    }
  }, [token])
  useEffect(() => { load() }, [load])

  if (d === undefined) return <PublicFrame><p className="text-sm text-muted">Loading…</p></PublicFrame>
  if (d === null) return <Invalid what="disclosure request" />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) { setMsg({ tone: 'bad', text: 'Choose one of the two options.' }); return }
    if (mode === 'some' && !text.trim()) { setMsg({ tone: 'bad', text: 'Describe the relationships you are disclosing.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await publicClient.rpc('conf_public_disclosure_submit', {
      p_token: token, p_nothing_to_declare: mode === 'none', p_text: mode === 'some' ? text : null,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'We couldn’t save your disclosure. Please try again.') }); return }
    setMsg({ tone: 'ok', text: 'Thank you — your disclosure is saved. You can come back to this page to update it.' })
    await load()
  }

  const submitted = d.status === 'received' || d.status === 'nothing_to_declare'

  return (
    <PublicFrame kicker="Speaker disclosure" title={d.event_name} organizer={d.organizer_name} organizerEmail={d.organizer_email}>
      <Panel>
        <p className="text-sm">Hi {d.speaker_name.split(' ')[0]}, thank you for speaking at <strong>{d.event_name}</strong>, {d.when}.</p>
        {d.sessions.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {d.sessions.map((s, i) => (
              <li key={i}>
                <span className="text-muted">{ROLE[s.role]} · {prettyDay(s.session_date)}, {s.start_time} · </span>
                {s.title}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Status: {DISCLOSURE_LABEL[d.status]}</p>
      </Panel>

      <Panel title={submitted ? 'Update your disclosure' : 'Your disclosure'}>
        <form onSubmit={submit} className="space-y-4 text-sm">
          <p>
            Please disclose any financial relationships relevant to the content of your presentation — for example
            consulting or advisory roles, speaking fees, research funding, or equity — or confirm that you have none.
            If you’re unsure what period or level of detail applies, please ask the organizer.
          </p>
          <p className="text-muted">What you submit is shown to attendees beside your name in the event itinerary.</p>

          <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 ${mode === 'none' ? 'border-accent bg-accent-soft' : 'border-line'}`}>
            <input type="radio" name="disc" className="mt-1" checked={mode === 'none'} onChange={() => setMode('none')} />
            <span>I have no relevant financial relationships to disclose.</span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 ${mode === 'some' ? 'border-accent bg-accent-soft' : 'border-line'}`}>
            <input type="radio" name="disc" className="mt-1" checked={mode === 'some'} onChange={() => setMode('some')} />
            <span>I have relationships to disclose.</span>
          </label>
          {mode === 'some' && (
            <textarea className={input} rows={5} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Company or organization, and the nature of the relationship" />
          )}

          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <button className={primaryBtn} disabled={busy}>{busy ? 'Saving…' : submitted ? 'Update disclosure' : 'Submit disclosure'}</button>
        </form>
      </Panel>
    </PublicFrame>
  )
}
