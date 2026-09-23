import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { publicClient as supabase } from '../../lib/publicClient'
import { PublicFrame, Panel, Notice, Invalid, rpcMessage } from './PublicFrame'
import { inMyZone } from '../../lib/rounds'

// ---------------------------------------------------------------------------
// The page a rounds invitee opens from their email: RSVP (in person or
// online, as the session allows), the room or joining link,
// feedback afterwards, and their certificate of attendance. No sign-in —
// the token in the link is the whole key.
//   /rsvp/:token               RSVP and feedback
//   /rsvp/:token/certificate   printable certificate
//   /rsvp/:token/unsubscribe   stop rounds emails
// ---------------------------------------------------------------------------

interface Payload {
  series: {
    title: string; description: string | null; logo_url: string | null
    organizer_name: string | null; organizer_email: string | null
    feedback_enabled: boolean; credit_hours: number | null
  }
  session: {
    topic: string | null; speaker: string | null; details: string | null
    starts_at: string; ends_at: string; timezone: string; when: string
    format: 'in_person' | 'virtual' | 'hybrid'; location: string | null
    video_url: string | null; video_passcode: string | null
    status: 'scheduled' | 'cancelled'; cancel_reason: string | null; started: boolean; ended: boolean
  }
  invite: {
    full_name: string | null; email: string; response: 'in_person' | 'virtual' | 'declined' | null
    attended: boolean | null; rating: number | null; comments: string | null; feedback_at: string | null; certificate: boolean
  }
  unsubscribed: boolean
}

export default function RoundsPublic() {
  const { token = '', view } = useParams<{ token: string; view?: string }>()
  const [data, setData] = useState<Payload | null | undefined>(undefined)
  const load = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('rounds_public', { p_token: token })
    setData(error ? null : (d as Payload))
  }, [token])
  useEffect(() => { load() }, [load])

  if (data === undefined) return <PublicFrame><p className="text-sm text-muted">Loading…</p></PublicFrame>
  if (data === null) return <Invalid what="invitation" />
  if (view === 'certificate') return <Certificate token={token} data={data} />
  if (view === 'unsubscribe') return <Unsubscribe token={token} data={data} />

  const s = data.session
  return (
    <PublicFrame kicker={data.series.title} title={s.topic ?? data.series.title} logoUrl={data.series.logo_url}
      organizer={data.series.organizer_name} organizerEmail={data.series.organizer_email}
      footer={<p><Link className="text-accent hover:underline" to={`/rsvp/${token}/unsubscribe`}>Stop emails about rounds</Link></p>}>
      <Details data={data} />
      {s.status === 'cancelled'
        ? <Notice tone="bad">This session is cancelled.{s.cancel_reason ? ` ${s.cancel_reason}` : ''}</Notice>
        : s.ended
          ? <After token={token} data={data} onDone={setData} />
          : <Rsvp token={token} data={data} onDone={setData} />}
    </PublicFrame>
  )
}

function Details({ data }: { data: Payload }) {
  const s = data.session
  const mine = inMyZone(s.starts_at, s.timezone)
  return (
    <Panel>
      <dl className="space-y-2 text-sm">
        <div><dt className="inline font-semibold">When: </dt><dd className="inline">{s.when}</dd>{mine && <dd className="text-xs text-muted">{mine}</dd>}</div>
        {s.speaker && <div><dt className="inline font-semibold">Speaker: </dt><dd className="inline">{s.speaker}</dd></div>}
        {s.format !== 'virtual' && s.location && <div><dt className="inline font-semibold">Where: </dt><dd className="inline">{s.location}</dd></div>}
        {s.format !== 'in_person' && (
          <div>
            <dt className="inline font-semibold">Online: </dt>
            <dd className="inline">
              {s.video_url
                ? <><a className="break-all text-accent hover:underline" href={s.video_url} target="_blank" rel="noreferrer">{s.video_url}</a>{s.video_passcode ? ` · passcode ${s.video_passcode}` : ''}</>
                : 'The organizer will share the joining link.'}
            </dd>
          </div>
        )}
      </dl>
      {s.details && <p className="mt-3 whitespace-pre-line text-sm">{s.details}</p>}
      {data.series.description && <p className="mt-3 whitespace-pre-line text-sm text-muted">{data.series.description}</p>}
    </Panel>
  )
}

function Rsvp({ token, data, onDone }: { token: string; data: Payload; onDone: (p: Payload) => void }) {
  const [name, setName] = useState(data.invite.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const f = data.session.format
  const r = data.invite.response

  async function answer(response: 'in_person' | 'virtual' | 'declined') {
    if (response !== 'declined' && !name.trim()) { setMsg({ tone: 'bad', text: 'Please add your name as it should appear on your certificate.' }); return }
    setBusy(true); setMsg(null)
    const { data: d, error } = await supabase.rpc('rounds_public_rsvp', { p_token: token, p_response: response, p_name: name.trim() || null })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'Your answer couldn’t be saved.') }); return }
    onDone(d as Payload)
    setMsg({ tone: 'ok', text: response === 'declined' ? 'Thanks for letting us know.' : 'You’re on the list. You’ll get a reminder the day before.' })
  }

  const btn = (on: boolean) => `rounded-md border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${on ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink hover:border-accent'}`
  return (
    <Panel title={r ? 'Your RSVP' : 'Can you come?'} sub={r ? `You said: ${r === 'in_person' ? 'coming in person' : r === 'virtual' ? 'joining online' : 'can’t come'}. You can change it until the session ends.` : undefined}>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Your name</span>
        <input className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        {f !== 'virtual' && <button className={btn(r === 'in_person')} disabled={busy} onClick={() => answer('in_person')}>{f === 'hybrid' ? 'I’ll come in person' : 'I’ll be there'}</button>}
        {f !== 'in_person' && <button className={btn(r === 'virtual')} disabled={busy} onClick={() => answer('virtual')}>{f === 'hybrid' ? 'I’ll join online' : 'I’ll join'}</button>}
        <button className={btn(r === 'declined')} disabled={busy} onClick={() => answer('declined')}>I can’t make it</button>
      </div>
      {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </Panel>
  )
}

function After({ token, data, onDone }: { token: string; data: Payload; onDone: (p: Payload) => void }) {
  const [rating, setRating] = useState(data.invite.rating ?? 0)
  const [comments, setComments] = useState(data.invite.comments ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const coming = data.invite.response === 'in_person' || data.invite.response === 'virtual'

  async function send() {
    if (!rating) { setMsg({ tone: 'bad', text: 'Choose a rating from 1 to 5.' }); return }
    setBusy(true); setMsg(null)
    const { data: d, error } = await supabase.rpc('rounds_public_feedback', { p_token: token, p_rating: rating, p_comments: comments })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'Your feedback couldn’t be saved.') }); return }
    onDone(d as Payload)
    setMsg({ tone: 'ok', text: 'Thank you — your feedback was sent to the organizers.' })
  }

  return (
    <>
      {data.series.feedback_enabled && (coming || data.invite.feedback_at) && (
        <Panel title={data.invite.feedback_at ? 'Your feedback' : 'How was it?'} sub="Your comments help the organizers plan future rounds.">
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n} of 5`} onClick={() => setRating(n)}
                className={`h-10 w-10 rounded-md border text-lg ${n <= rating ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted'}`}>★</button>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-muted">Comments (optional)</span>
            <textarea rows={3} className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink" value={comments} onChange={(e) => setComments(e.target.value)} />
          </label>
          <button className="mt-3 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={send}>
            {busy ? 'Sending…' : data.invite.feedback_at ? 'Update feedback' : 'Send feedback'}
          </button>
          {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        </Panel>
      )}
      {data.invite.certificate ? (
        <Panel tone="accent" title="Certificate of attendance">
          <p className="text-sm">Your certificate is ready to print or save as a PDF.</p>
          <Link className="mt-3 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white" to={`/rsvp/${token}/certificate`}>Open certificate</Link>
        </Panel>
      ) : coming && data.series.credit_hours != null && data.invite.attended !== false && data.series.feedback_enabled && !data.invite.feedback_at ? (
        <p className="text-sm text-muted">Once you’ve sent your feedback, your certificate of attendance can be downloaded here.</p>
      ) : !coming && !data.invite.feedback_at ? (
        <Panel><p className="text-sm">This session has ended. Thanks for your interest.</p></Panel>
      ) : null}
    </>
  )
}

interface Cert {
  full_name: string; series: string; topic: string | null; speaker: string | null; when: string; attended: string
  credit_hours: number | null; credits_statement: string | null; organizer_name: string | null; program: string | null
  logo_url: string | null; issued_on: string
}

function Certificate({ token, data }: { token: string; data: Payload }) {
  const [c, setC] = useState<Cert | null | undefined>(undefined)
  useEffect(() => {
    supabase.rpc('rounds_public_certificate', { p_token: token }).then(({ data: d, error }) => setC(error ? null : (d as Cert | null)))
  }, [token])
  if (c === undefined) return <PublicFrame><p className="text-sm text-muted">Loading…</p></PublicFrame>
  if (!c) {
    return (
      <PublicFrame kicker="Certificate of attendance" title={data.series.title} logoUrl={data.series.logo_url}
        organizer={data.series.organizer_name} organizerEmail={data.series.organizer_email}>
        <Panel>
          <p className="text-sm">
            {data.series.credit_hours == null ? 'Certificates aren’t offered for these rounds.'
              : !data.session.ended ? 'Your certificate is available after the session.'
                : data.series.feedback_enabled && !data.invite.feedback_at ? 'Please send your feedback first — then your certificate is available.'
                  : 'A certificate isn’t available for this invitation. If you attended, please contact the organizer.'}
          </p>
          <Link className="mt-3 inline-block text-sm text-accent hover:underline" to={`/rsvp/${token}`}>← Back</Link>
        </Panel>
      </PublicFrame>
    )
  }
  const hours = c.credit_hours == null ? null : Number(c.credit_hours)
  return (
    <div className="min-h-screen bg-paper text-ink print:bg-white">
      <div className="mx-auto flex max-w-[11in] flex-wrap items-center justify-between gap-3 px-4 py-4 print:hidden">
        <Link className="text-sm text-accent hover:underline" to={`/rsvp/${token}`}>← Back</Link>
        <button type="button" className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <style>{'@page { size: letter landscape; margin: 0.4in; }'}</style>
      <article className="mx-auto max-w-[10in] border-[6px] border-double border-[#0E7C86] bg-white px-[0.8in] py-[0.6in] text-center text-[#0F1B2D] shadow-sm print:shadow-none"
        style={{ fontFamily: 'Georgia, serif' }}>
        {c.logo_url && <img src={c.logo_url} alt="" className="mx-auto mb-5 block max-h-16 max-w-[260px] object-contain" />}
        <p className="text-sm uppercase tracking-[0.18em] text-[#5B6677]">{c.organizer_name}</p>
        <h1 className="mt-4 text-4xl">Certificate of Attendance</h1>
        <p className="mt-8 text-lg">This certifies that</p>
        <p className="mt-2 text-3xl font-semibold">{c.full_name}</p>
        <p className="mt-6 text-lg leading-relaxed">
          attended {c.attended} <strong>{c.series}</strong>{c.topic ? <>: <em>{c.topic}</em></> : null}
          {c.speaker ? <>, presented by {c.speaker}</> : null}, on {c.when}.
        </p>
        {hours != null && <p className="mt-4 text-lg">Duration recorded: <strong>{hours} hour{hours === 1 ? '' : 's'}</strong></p>}
        {c.credits_statement && <p className="mx-auto mt-5 max-w-[7.5in] whitespace-pre-line text-sm leading-relaxed">{c.credits_statement}</p>}
        <div className="mt-10 flex items-end justify-between text-left text-sm">
          <div><p className="border-t border-[#0F1B2D] pt-1">{c.organizer_name}</p></div>
          <div className="text-right"><p>Issued {c.issued_on}</p></div>
        </div>
      </article>
      <p className="mx-auto max-w-[10in] px-4 py-4 text-xs text-muted print:hidden">
        This certificate records your attendance. Whether these hours count toward a credit or certification program is
        decided by that program; please check with them.
      </p>
    </div>
  )
}

function Unsubscribe({ token, data }: { token: string; data: Payload }) {
  const [state, setState] = useState<'ask' | 'done' | 'bad'>(data.unsubscribed ? 'done' : 'ask')
  async function go() {
    const { data: ok, error } = await supabase.rpc('rounds_public_unsubscribe', { p_token: token })
    setState(error || !ok ? 'bad' : 'done')
  }
  return (
    <PublicFrame kicker="Email preferences" title={data.series.title} logoUrl={data.series.logo_url}
      organizer={data.series.organizer_name} organizerEmail={data.series.organizer_email}>
      <Panel>
        {state === 'done' ? (
          <p className="text-sm">You won’t get any more emails about rounds from this program. If that was a mistake, please contact the organizer.</p>
        ) : state === 'bad' ? (
          <Notice tone="bad">That didn’t work. Please try again, or contact the organizer.</Notice>
        ) : (
          <>
            <p className="text-sm">Stop all emails about rounds from this program, sent to {data.invite.email}?</p>
            <div className="mt-4 flex gap-3">
              <button className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white" onClick={go}>Unsubscribe</button>
              <Link className="rounded-md border border-line px-4 py-2.5 text-sm" to={`/rsvp/${token}`}>Keep getting them</Link>
            </div>
          </>
        )}
      </Panel>
    </PublicFrame>
  )
}
