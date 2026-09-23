import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, FUNCTIONS_URL, PUBLIC_ANON_KEY } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  eventWhen, prettyDay, safeUrl, input, primaryBtn, quietBtn, FORMAT_LABEL,
  type RsvpStatus, type SessionFormat, type SpeakerRole,
} from '../../lib/conference'
import { PublicFrame, Panel, Notice, Invalid, rpcMessage } from './PublicFrame'

// ---------------------------------------------------------------------------
// An invitee's side of a conference.
//
//   /e/<token>[/view]        standalone, for someone arriving from an email
//   /courses/<token>[/view]  the same pages inside the portal (My courses)
//
//   views: (none)  RSVP, itinerary, updates, joining details, payment
//          feedback, presentations, letter, unsubscribe
//
// Nothing here reads a table. Every call is a conf_public_* function taking
// the invitation's token; the database decides what to show from the token
// AND the signed-in account (0033):
//   * the account this invitation belongs to sees everything
//   * with no account linked yet, the link shows the event and the RSVP
//     form, and accepting asks the person to create an account (or sign in)
//   * once an account is linked, the link alone shows only the event and
//     itinerary - joining details, slides, feedback and letters need the
//     account, so a forwarded email does not carry them
// Unsubscribing never needs an account.
// ---------------------------------------------------------------------------

interface PubSpeaker { name: string; affiliation: string | null; role: SpeakerRole; disclosure: string | null }
interface PubSession {
  id: string; title: string; description: string | null; session_date: string
  start_time: string; end_time: string; format: SessionFormat; room: string | null
  credit_hours: number; zoom_url: string | null; speakers: PubSpeaker[]
}
interface PubEvent {
  name: string; description: string | null; starts_on: string; ends_on: string; timezone: string
  venue_name: string | null; venue_address: string | null; has_virtual: boolean
  zoom_url: string | null; zoom_passcode: string | null; status: string; open: boolean
  in_person_full: boolean; virtual_full: boolean
  feedback_enabled: boolean; letters_enabled: boolean; presentations_enabled: boolean
  payment: { url: string; label: string | null; note: string | null } | null
  organizer_name: string | null; organizer_email: string | null
  logo_url?: string | null
}
interface PubInvitee {
  full_name: string | null; email: string; institution: string | null; role_title: string | null
  rsvp_status: RsvpStatus; waitlist_for: 'in_person' | 'virtual' | null; waitlist_position: number | null
  dietary: string | null; accessibility: string | null
  checked_in: boolean; unsubscribed: boolean; letter_available: boolean
}
interface PubAccommodation {
  hotel_name: string; address: string | null; booking_url: string | null; group_code: string | null
  nightly_rate: string | null; cutoff_date: string | null; contact_phone: string | null
}
interface PubSponsor { name: string; tier: string | null; kind: 'sponsor' | 'exhibitor' }
interface PubMessage { subject: string; body: string; sent_at: string }
interface Account {
  /** An account is linked to this invitation. */
  linked: boolean
  /** ...and it is the one signed in right now. */
  me: boolean
  /** No account linked yet, but the invitation's address already has one. */
  exists: boolean | null
}
interface Payload {
  account: Account
  event: PubEvent; invitee: PubInvitee; sessions: PubSession[]
  accommodations: PubAccommodation[]; sponsors: PubSponsor[]; feedback_given: string[]
  messages: PubMessage[]
}

const NON_TEACHING: SessionFormat[] = ['break', 'meal']
const ROLE_LABEL: Record<SpeakerRole, string> = { speaker: 'Speaker', moderator: 'Moderator', panelist: 'Panelist' }

/** The invitation as the signed-in person (or nobody) may see it. Reloads on sign-in and sign-out. */
function useInvitation(token: string) {
  const { session } = useAuth()
  const uid = session?.user?.id ?? null
  const [data, setData] = useState<Payload | null | undefined>(undefined)
  const load = useCallback(async () => {
    const { data: d, error } = await supabase.rpc('conf_public_event', { p_token: token })
    setData(error ? null : ((d as Payload | null) ?? null))
  }, [token])
  useEffect(() => { load() }, [load, uid])
  return { data, load }
}

// ============================== the two frames ==============================

export default function EventPublic() {
  const { token = '', view } = useParams<{ token: string; view?: string }>()
  const { data, load } = useInvitation(token)
  const { session, signOut } = useAuth()

  if (view === 'unsubscribe') return <Unsubscribe token={token} data={data ?? null} />
  if (data === undefined) return <PublicFrame><p className="text-sm text-muted">Loading…</p></PublicFrame>
  if (data === null) return <Invalid />
  if (view === 'letter') return <Letter token={token} data={data} onAuthed={load} />

  const base = `/e/${token}`
  const bar = session ? (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>Signed in as {session.user.email}</span>
      <Link className="font-medium text-accent hover:underline" to="/courses">My courses</Link>
      <button className="font-medium text-muted hover:text-ink" onClick={() => signOut()}>Sign out</button>
    </span>
  ) : null

  return (
    <PublicFrame
      kicker={view === 'feedback' ? 'Session feedback' : view === 'presentations' ? 'Presentations' : eventWhen(data.event.starts_on, data.event.ends_on)}
      title={data.event.name}
      organizer={data.event.organizer_name}
      organizerEmail={data.event.organizer_email}
      logoUrl={data.event.logo_url}
      topRight={bar}
      footer={
        <p>
          <Link className="text-accent hover:underline" to={base}>Event page</Link>
          {' · '}
          <Link className="text-accent hover:underline" to={`${base}/unsubscribe`}>Unsubscribe from emails about this event</Link>
        </p>
      }
    >
      <EventBody token={token} view={view} data={data} load={load} base={base} />
    </PublicFrame>
  )
}

/** The same pages inside the portal, from My courses. */
export function EventInPortal() {
  const { token = '', view } = useParams<{ token: string; view?: string }>()
  const { data, load } = useInvitation(token)
  if (data === undefined) return <p className="text-sm text-muted">Loading…</p>
  if (data === null) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">This course could not be found. It may have been removed by its organizers.</p>
        <Link to="/courses" className="text-sm font-medium text-accent hover:underline">Back to My courses</Link>
      </div>
    )
  }
  const base = `/courses/${token}`
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link to={view ? base : '/courses'} className="text-xs font-medium text-muted hover:text-ink">
          ← {view ? data.event.name : 'My courses'}
        </Link>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {view === 'feedback' ? 'Session feedback' : view === 'presentations' ? 'Presentations' : eventWhen(data.event.starts_on, data.event.ends_on)}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">{data.event.name}</h1>
        {data.event.organizer_name && (
          <p className="mt-1 text-sm text-muted">
            Organized by {data.event.organizer_name}
            {data.event.organizer_email && <> · <a className="text-accent hover:underline" href={`mailto:${data.event.organizer_email}`}>{data.event.organizer_email}</a></>}
          </p>
        )}
      </div>
      <EventBody token={token} view={view} data={data} load={load} base={base} />
    </div>
  )
}

function EventBody({ token, view, data, load, base }: {
  token: string; view?: string; data: Payload; load: () => Promise<void>; base: string
}) {
  if (view === 'feedback') return <Feedback token={token} data={data} onSaved={load} />
  if (view === 'presentations') return <Presentations token={token} data={data} onAuthed={load} />
  return <Overview token={token} data={data} onChanged={load} base={base} />
}

// ================================ overview =================================

function Overview({ token, data, onChanged, base }: {
  token: string; data: Payload; onChanged: () => Promise<void>; base: string
}) {
  const { event: ev, invitee: me, account } = data
  const going = me.rsvp_status === 'in_person' || me.rsvp_status === 'virtual'
  const attended = going || me.checked_in
  const zoom = safeUrl(ev.zoom_url)
  const pay = ev.payment ? safeUrl(ev.payment.url) : null
  // The letter prints best on its own page, outside the portal frame.
  const letterHref = `/e/${token}/letter`

  return (
    <>
      <Panel>
        <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-medium text-muted">When</dt>
          <dd>{eventWhen(ev.starts_on, ev.ends_on)}</dd>
          {(ev.venue_name || ev.venue_address) && <>
            <dt className="font-medium text-muted">Where</dt>
            <dd>
              {ev.venue_name}
              {ev.venue_address && <span className="block text-muted">{ev.venue_address}</span>}
            </dd>
          </>}
          {ev.has_virtual && <>
            <dt className="font-medium text-muted">Online</dt>
            <dd>{going && account.me
              ? 'Available on Zoom — your link is under Joining details below.'
              : 'Available on Zoom. The link appears here once you have registered and signed in.'}</dd>
          </>}
        </dl>
        {ev.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{ev.description}</p>}
      </Panel>

      {account.linked && !account.me
        ? <SignInToContinue token={token} data={data} onDone={onChanged}
            why="This invitation is linked to an account. Sign in to see your registration, joining details and course materials." />
        : <Rsvp token={token} data={data} onChanged={onChanged} />}

      {data.messages.length > 0 && <Updates messages={data.messages} />}

      {going && account.me && (
        <Panel title="Joining details">
          <div className="space-y-3 text-sm">
            {me.rsvp_status === 'in_person' && ev.venue_name && (
              <p>You’re registered to attend in person at <strong>{ev.venue_name}</strong>.</p>
            )}
            {zoom && (
              <p>
                <span className="font-medium">Zoom: </span>
                <a className="break-all text-accent hover:underline" href={zoom} target="_blank" rel="noreferrer">{zoom}</a>
                {ev.zoom_passcode && <span className="block text-muted">Passcode: {ev.zoom_passcode}</span>}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={quietBtn} onClick={() => downloadIcs(token, data)}>Add to my calendar</button>
            </div>
          </div>
        </Panel>
      )}

      {pay && me.rsvp_status !== 'declined' && (
        <Panel title={ev.payment?.label || 'Registration payment'}>
          {ev.payment?.note && <p className="mb-3 whitespace-pre-line text-sm">{ev.payment.note}</p>}
          <a className={`${primaryBtn} inline-block`} href={pay} target="_blank" rel="noreferrer">
            {ev.payment?.label || 'Pay registration'}
          </a>
          <p className="mt-2 text-xs text-muted">Opens the organizer’s payment page. Card details are never entered on this site.</p>
        </Panel>
      )}

      {attended && account.me && (ev.feedback_enabled || ev.presentations_enabled || me.letter_available) && (
        <Panel title="During and after the event">
          <ul className="space-y-2 text-sm">
            {ev.presentations_enabled && (
              <li><Link className="font-medium text-accent hover:underline" to={`${base}/presentations`}>Presentations</Link> — slides and handouts posted by the organizers.</li>
            )}
            {ev.feedback_enabled && (
              <li><Link className="font-medium text-accent hover:underline" to={`${base}/feedback`}>Give feedback</Link> — rate the sessions you attended.</li>
            )}
            {me.letter_available && (
              <li><Link className="font-medium text-accent hover:underline" to={letterHref}>Participation letter</Link> — print or save as PDF.</li>
            )}
          </ul>
        </Panel>
      )}

      <Itinerary sessions={data.sessions} eventZoom={going ? zoom : null} />

      {data.accommodations.length > 0 && (
        <Panel title="Accommodations" sub="Hotels the organizers have arranged rates with.">
          <ul className="divide-y divide-line">
            {data.accommodations.map((a, i) => {
              const book = safeUrl(a.booking_url)
              return (
                <li key={i} className="py-3 text-sm first:pt-0 last:pb-0">
                  <p className="font-medium">{a.hotel_name}</p>
                  {a.address && <p className="text-muted">{a.address}</p>}
                  <p className="mt-1 space-x-3">
                    {a.nightly_rate && <span>Rate: {a.nightly_rate}</span>}
                    {a.group_code && <span>Group code <strong>{a.group_code}</strong></span>}
                    {a.cutoff_date && <span>Book by {prettyDay(a.cutoff_date)}</span>}
                  </p>
                  {(book || a.contact_phone) && (
                    <p className="mt-1 space-x-3">
                      {book && <a className="text-accent hover:underline" href={book} target="_blank" rel="noreferrer">Book online</a>}
                      {a.contact_phone && <a className="text-accent hover:underline" href={`tel:${a.contact_phone.replace(/[^\d+]/g, '')}`}>{a.contact_phone}</a>}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </Panel>
      )}

      {data.sponsors.length > 0 && (
        <Panel title="With thanks to">
          {(['sponsor', 'exhibitor'] as const).map((k) => {
            const list = data.sponsors.filter((s) => s.kind === k)
            if (list.length === 0) return null
            return (
              <div key={k} className="mb-2 last:mb-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{k === 'sponsor' ? 'Sponsors' : 'Exhibitors'}</p>
                <p className="mt-1 text-sm">
                  {list.map((s, i) => (
                    <span key={s.name + i}>{i > 0 && ' · '}{s.name}{s.tier && <span className="text-muted"> ({s.tier})</span>}</span>
                  ))}
                </p>
              </div>
            )
          })}
        </Panel>
      )}
    </>
  )
}

function Updates({ messages }: { messages: PubMessage[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? messages : messages.slice(0, 3)
  return (
    <Panel title="Updates from the organizers">
      <ul className="space-y-4">
        {shown.map((m, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium">{m.subject}</p>
            <p className="text-xs text-muted">
              {new Date(m.sent_at).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
            <p className="mt-1 whitespace-pre-line leading-relaxed">{m.body}</p>
          </li>
        ))}
      </ul>
      {messages.length > 3 && !all && (
        <button className="mt-3 text-sm font-medium text-accent hover:underline" onClick={() => setAll(true)}>Show all {messages.length}</button>
      )}
    </Panel>
  )
}

// ================================== RSVP ===================================

type Choice = 'in_person' | 'virtual' | 'declined'

function Rsvp({ token, data, onChanged }: { token: string; data: Payload; onChanged: () => Promise<void> }) {
  const { event: ev, invitee: me, account } = data
  const offersInPerson = !!ev.venue_name || !ev.has_virtual
  const [editing, setEditing] = useState(me.rsvp_status === 'pending')
  const [choice, setChoice] = useState<Choice | null>(
    me.rsvp_status === 'waitlist' ? me.waitlist_for
      : me.rsvp_status === 'pending' ? null : (me.rsvp_status as Choice))
  const [f, setF] = useState({
    full_name: me.full_name ?? '', institution: me.institution ?? '', role_title: me.role_title ?? '',
    dietary: me.dietary ?? '', accessibility: me.accessibility ?? '',
  })
  // Accepting without the account signed in: the answers wait here while
  // the person creates their account or signs in.
  const [needsAccount, setNeedsAccount] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  async function send(c: Choice) {
    setBusy(true); setMsg(null)
    const { data: r, error } = await supabase.rpc('conf_public_rsvp', {
      p_token: token, p_status: c,
      p_full_name: f.full_name, p_institution: f.institution, p_role_title: f.role_title,
      p_dietary: c === 'in_person' ? f.dietary : '', p_accessibility: c === 'declined' ? '' : f.accessibility,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'We couldn’t save your response. Please try again.') }); return }
    const res = r as { rsvp_status: RsvpStatus; waitlist_for: string | null }
    setMsg({
      tone: 'ok',
      text: res.rsvp_status === 'waitlist'
        ? `That option is full, so you’re on the waitlist. We’ll email you if a place opens.`
        : res.rsvp_status === 'declined' ? 'Thanks for letting us know.' : 'You’re registered. See you there!',
    })
    setNeedsAccount(false)
    setEditing(false)
    await onChanged()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!choice) { setMsg({ tone: 'bad', text: 'Choose how you’ll be joining, or that you can’t attend.' }); return }
    if (choice !== 'declined' && !f.full_name.trim()) { setMsg({ tone: 'bad', text: 'Please add your name as it should appear on your badge and letter.' }); return }
    if (choice !== 'declined' && !account.me) { setMsg(null); setNeedsAccount(true); return }
    await send(choice)
  }

  const status = (() => {
    switch (me.rsvp_status) {
      case 'in_person': return 'You’re registered to attend in person.'
      case 'virtual': return 'You’re registered to join online.'
      case 'declined': return 'You’ve let the organizers know you can’t attend.'
      case 'waitlist':
        return `You’re on the waitlist to attend ${me.waitlist_for === 'virtual' ? 'online' : 'in person'}`
          + (me.waitlist_position ? ` — number ${me.waitlist_position} in line.` : '.')
          + ' We’ll email you if a place opens.'
      default: return null
    }
  })()

  if (!ev.open) {
    return (
      <Panel title="Registration">
        <p className="text-sm">{status ?? 'Responses for this event are closed.'}</p>
        {status && <p className="mt-1 text-sm text-muted">Responses for this event are now closed.</p>}
      </Panel>
    )
  }

  if (needsAccount && choice) {
    return (
      <Panel title="One more step" tone="accent">
        <AccountStep token={token} data={data} name={f.full_name}
          intro={`To confirm your place ${choice === 'in_person' ? 'in person' : 'online'}, ${data.account.exists
            ? 'sign in to your account.'
            : 'create your account. It keeps your joining details, slides, feedback and participation letter in one place.'}`}
          onDone={() => send(choice)}
          onCancel={() => setNeedsAccount(false)} />
        {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      </Panel>
    )
  }

  if (!editing) {
    return (
      <Panel title="Your response" tone="accent">
        {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        <p className="text-sm">{status}</p>
        <button type="button" className={`${quietBtn} mt-3`} onClick={() => { setEditing(true); setMsg(null) }}>Change my response</button>
      </Panel>
    )
  }

  const option = (value: Choice, label: string, hint?: string) => (
    <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm ${choice === value ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
      <input type="radio" name="rsvp" className="mt-1" checked={choice === value} onChange={() => setChoice(value)} />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
  const fullHint = (full: boolean, mine: boolean) => (full && !mine ? 'Currently full — you’ll join the waitlist.' : undefined)

  return (
    <Panel title={me.rsvp_status === 'pending' ? 'Will you be joining?' : 'Change your response'} tone="accent">
      <form onSubmit={submit} className="space-y-4">
        {status && <p className="text-sm text-muted">{status}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          {offersInPerson && option('in_person', 'In person', fullHint(ev.in_person_full, me.rsvp_status === 'in_person'))}
          {ev.has_virtual && option('virtual', 'Online', fullHint(ev.virtual_full, me.rsvp_status === 'virtual'))}
          {option('declined', 'Can’t attend')}
        </div>

        {choice && choice !== 'declined' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name (for your badge and letter)">
              <input className={input} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} autoComplete="name" required />
            </Field>
            <Field label="Institution">
              <input className={input} value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} autoComplete="organization" />
            </Field>
            <Field label="Role or position">
              <input className={input} value={f.role_title} onChange={(e) => setF({ ...f, role_title: e.target.value })} placeholder="e.g. Neurology resident" />
            </Field>
            {choice === 'in_person' && (
              <Field label="Dietary needs">
                <input className={input} value={f.dietary} onChange={(e) => setF({ ...f, dietary: e.target.value })} placeholder="e.g. vegetarian, nut allergy" />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="Accessibility needs">
                <textarea className={input} rows={2} value={f.accessibility} onChange={(e) => setF({ ...f, accessibility: e.target.value })}
                  placeholder="Anything that would help you take part — seating, captions, access, etc." />
              </Field>
            </div>
          </div>
        )}

        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button className={primaryBtn} disabled={busy}>
            {busy ? 'Saving…' : choice && choice !== 'declined' && !account.me ? 'Continue' : 'Send my response'}
          </button>
          {me.rsvp_status !== 'pending' && (
            <button type="button" className={quietBtn} onClick={() => { setEditing(false); setMsg(null) }}>Cancel</button>
          )}
        </div>
      </form>
    </Panel>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

// =============================== accounts ==================================

/**
 * Create an account for this invitation, or sign in to the one it belongs to
 * (or the one its address already has), then hand back to the caller.
 */
function AccountStep({ token, data, name, intro, onDone, onCancel }: {
  token: string; data: Payload; name?: string; intro: string
  onDone: () => Promise<void> | void; onCancel?: () => void
}) {
  const { session, signOut } = useAuth()
  const inviteEmail = data.invitee.email
  const [mode, setMode] = useState<'create' | 'signin'>(!data.account.linked && !data.account.exists ? 'create' : 'signin')
  const creating = mode === 'create'
  const [email, setEmail] = useState(inviteEmail)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null)

  // Signed in already, as the wrong person for this invitation.
  const signedInElsewhere = !!session && !data.account.me
  const sameAddress = session?.user.email?.toLowerCase() === inviteEmail.toLowerCase()

  async function claimAndFinish() {
    if (!data.account.linked) {
      const { error } = await supabase.rpc('conf_claim', { p_token: token })
      if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'We couldn’t link this invitation to your account.') }); return false }
    }
    await onDone()
    return true
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setMsg({ tone: 'bad', text: 'Choose a password of at least 8 characters.' }); return }
    if (password !== confirm) { setMsg({ tone: 'bad', text: 'The two passwords don’t match.' }); return }
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/conf-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: PUBLIC_ANON_KEY },
        body: JSON.stringify({ token, password, full_name: name ?? data.invitee.full_name ?? '' }),
      })
      const body = await res.json().catch(() => ({}))
      if (body.exists) {
        setBusy(false)
        setPassword(''); setConfirm('')
        setMode('signin')
        setMsg({ tone: 'info', text: 'This address already has an account. Sign in with its password instead.' })
        return
      }
      if (!res.ok || !body.ok) { setBusy(false); setMsg({ tone: 'bad', text: body.error ?? 'We couldn’t create your account. Please try again.' }); return }
      const { error } = await supabase.auth.signInWithPassword({ email: inviteEmail, password })
      if (error) { setBusy(false); setMsg({ tone: 'bad', text: 'Your account was created, but signing in failed. Try signing in below.' }); return }
      await onDone()
    } catch {
      setMsg({ tone: 'bad', text: 'We couldn’t reach the server. Please try again.' })
    }
    setBusy(false)
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setBusy(false)
      setMsg({ tone: 'bad', text: /invalid/i.test(error.message) ? 'That email and password don’t match. Try again, or reset your password.' : error.message })
      return
    }
    await claimAndFinish()
    setBusy(false)
  }

  async function forgot() {
    const addr = email.trim()
    if (!addr.includes('@')) { setMsg({ tone: 'bad', text: 'Enter your email address first.' }); return }
    setBusy(true)
    await fetch(`${FUNCTIONS_URL}/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLIC_ANON_KEY },
      body: JSON.stringify({ email: addr }),
    }).catch(() => null)
    setBusy(false)
    setMsg({ tone: 'info', text: `If ${addr} has an account, a password reset link is on its way. After resetting, come back to this page.` })
  }

  if (signedInElsewhere) {
    return (
      <div className="space-y-3 text-sm">
        <p>{intro}</p>
        {sameAddress && !data.account.linked ? (
          <>
            <p>You’re signed in as <strong>{session!.user.email}</strong>, the address this invitation was sent to.</p>
            <button className={primaryBtn} disabled={busy} onClick={async () => { setBusy(true); await claimAndFinish(); setBusy(false) }}>
              Continue as {session!.user.email}
            </button>
          </>
        ) : (
          <p>
            You’re signed in as <strong>{session!.user.email}</strong>, but this invitation was sent to{' '}
            <strong>{inviteEmail}</strong>. Sign out, then sign in with that address.
          </p>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button className={quietBtn} onClick={() => signOut()}>Sign out</button>
          {onCancel && <button className={quietBtn} onClick={onCancel}>Back</button>}
        </div>
      </div>
    )
  }

  if (creating) {
    return (
      <form onSubmit={create} className="space-y-3 text-sm">
        <p>{intro}</p>
        <p className="text-sm">Your account email: <strong>{inviteEmail}</strong></p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Choose a password">
            <input className={input} type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Field label="Type it again">
            <input className={input} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
        </div>
        <p className="text-xs text-muted">At least 8 characters. You’ll sign in with this email and password at app.neuromuscular.ca.</p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button className={primaryBtn} disabled={busy}>{busy ? 'Creating your account…' : 'Create account and confirm'}</button>
          {onCancel && <button type="button" className={quietBtn} onClick={onCancel}>Back</button>}
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={signIn} className="space-y-3 text-sm">
      <p>{intro}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <input className={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <button className={primaryBtn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="text-sm font-medium text-accent hover:underline" disabled={busy} onClick={forgot}>Forgot your password?</button>
        {onCancel && <button type="button" className={quietBtn} onClick={onCancel}>Back</button>}
      </div>
    </form>
  )
}

function SignInToContinue({ token, data, onDone, why }: { token: string; data: Payload; onDone: () => Promise<void>; why: string }) {
  return (
    <Panel title="Sign in to continue" tone="accent">
      <AccountStep token={token} data={data} intro={why} onDone={onDone} />
    </Panel>
  )
}

// ================================ itinerary ================================

function Itinerary({ sessions, eventZoom }: { sessions: PubSession[]; eventZoom: string | null }) {
  const days = useMemo(() => {
    const m = new Map<string, PubSession[]>()
    for (const s of sessions) m.set(s.session_date, [...(m.get(s.session_date) ?? []), s])
    return [...m.entries()]
  }, [sessions])
  if (sessions.length === 0) {
    return <Panel title="Itinerary"><p className="text-sm text-muted">The program will be posted here soon.</p></Panel>
  }
  return (
    <Panel title="Itinerary">
      <div className="space-y-6">
        {days.map(([day, list]) => (
          <div key={day}>
            <h3 className="mb-2 text-sm font-semibold">{prettyDay(day)}</h3>
            <ol className="divide-y divide-line rounded-md border border-line">
              {list.map((s) => {
                const quiet = NON_TEACHING.includes(s.format)
                const sessionZoom = safeUrl(s.zoom_url)
                return (
                  <li key={s.id} className={`grid gap-1 px-3 py-3 text-sm sm:grid-cols-[7.5rem_1fr] ${quiet ? 'bg-paper' : ''}`}>
                    <div className="tabular-nums text-muted">{s.start_time}–{s.end_time}</div>
                    <div>
                      <p className={quiet ? 'text-muted' : 'font-medium'}>
                        {s.title}
                        {!quiet && s.format !== 'talk' && (
                          <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-ink">{FORMAT_LABEL[s.format]}</span>
                        )}
                      </p>
                      {s.room && <p className="text-xs text-muted">{s.room}</p>}
                      {s.description && <p className="mt-1 whitespace-pre-line text-muted">{s.description}</p>}
                      {s.speakers.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {s.speakers.map((p, i) => (
                            <li key={p.name + i}>
                              <span className="text-xs text-muted">{ROLE_LABEL[p.role]}: </span>
                              <span>{p.name}</span>
                              {p.affiliation && <span className="text-muted">, {p.affiliation}</span>}
                              {p.disclosure && (
                                <details className="mt-0.5 text-xs text-muted">
                                  <summary className="cursor-pointer">Disclosure</summary>
                                  <p className="mt-1 whitespace-pre-line">{p.disclosure}</p>
                                </details>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {sessionZoom && sessionZoom !== eventZoom && (
                        <p className="mt-1"><a className="text-xs font-medium text-accent hover:underline" href={sessionZoom} target="_blank" rel="noreferrer">Join this session online</a></p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ================================ feedback =================================

function Feedback({ token, data, onSaved }: { token: string; data: Payload; onSaved: () => Promise<void> }) {
  const { event: ev, invitee: me, account } = data
  const attended = me.rsvp_status === 'in_person' || me.rsvp_status === 'virtual' || me.checked_in
  if (!ev.feedback_enabled) return <Panel><p className="text-sm">Feedback isn’t being collected for this event.</p></Panel>
  if (!account.me) return <SignInToContinue token={token} data={data} onDone={onSaved} why="Sign in with your account to give feedback." />
  if (!attended) return <Panel><p className="text-sm">Feedback is for people who attended. If you did attend, please let the organizer know.</p></Panel>

  const rateable = data.sessions.filter((s) => !NON_TEACHING.includes(s.format))
  const given = new Set(data.feedback_given)
  return (
    <>
      <Panel>
        <p className="text-sm">
          Rate any sessions you attended — skip the ones you missed. Each saves on its own, and you can come back
          and change an answer. The summary the organizers see doesn’t show names.
        </p>
      </Panel>
      {rateable.map((s) => (
        <FeedbackItem key={s.id} token={token} sessionId={s.id} done={given.has(s.id)} onSaved={onSaved}
          title={s.title} sub={`${prettyDay(s.session_date)}, ${s.start_time}–${s.end_time}${s.speakers.length ? ' · ' + s.speakers.map((p) => p.name).join(', ') : ''}`} />
      ))}
      <FeedbackItem token={token} sessionId={null} done={given.has('event')} onSaved={onSaved}
        title="The event overall" sub="What worked, and what would you change next time?" />
    </>
  )
}

function FeedbackItem({ token, sessionId, title, sub, done, onSaved }: {
  token: string; sessionId: string | null; title: string; sub: string; done: boolean; onSaved: () => Promise<void>
}) {
  const [rating, setRating] = useState<number | null>(null)
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  async function save() {
    if (rating == null && !comments.trim()) { setMsg({ tone: 'bad', text: 'Choose a rating or write a comment.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('conf_public_feedback', {
      p_token: token, p_session: sessionId, p_rating: rating, p_comments: comments,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'We couldn’t save that. Please try again.') }); return }
    setMsg({ tone: 'ok', text: 'Thank you — saved.' })
    await onSaved()
  }

  return (
    <Panel title={title} sub={sub}>
      {done && !msg && <p className="mb-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">You’ve already rated this. Saving again replaces your earlier answer.</p>}
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Rating for ${title}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n}
            className={`h-9 w-9 rounded-md border text-sm font-semibold ${rating === n ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:border-accent'}`}
            onClick={() => setRating(rating === n ? null : n)}>{n}</button>
        ))}
        <span className="ml-2 text-xs text-muted">1 = poor · 5 = excellent</span>
      </div>
      <textarea className={`${input} mt-3`} rows={2} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comments (optional)" />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className={quietBtn} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </Panel>
  )
}

// ============================== presentations ==============================

interface PubFile { id: string; title: string; file_name: string; mime_type: string | null; size_bytes: number | null; session_id: string | null; url: string }

function Presentations({ token, data, onAuthed }: { token: string; data: Payload; onAuthed: () => Promise<void> }) {
  const { session } = useAuth()
  const [files, setFiles] = useState<PubFile[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { event: ev, invitee: me, account } = data
  const attending = me.rsvp_status === 'in_person' || me.rsvp_status === 'virtual' || me.checked_in
  const jwt = session?.access_token

  useEffect(() => {
    if (!ev.presentations_enabled || !attending || !account.me || !jwt) return
    (async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/conf-presentations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: PUBLIC_ANON_KEY, Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ token }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error ?? 'failed')
        setFiles(((body.files ?? []) as PubFile[]).filter((f) => !!safeUrl(f.url)))
      } catch {
        setErr('We couldn’t load the presentations. Please refresh the page.')
      }
    })()
  }, [token, ev.presentations_enabled, attending, account.me, jwt])

  if (!ev.presentations_enabled) return <Panel><p className="text-sm">Presentations aren’t being shared for this event.</p></Panel>
  if (!account.me) return <SignInToContinue token={token} data={data} onDone={onAuthed} why="Sign in with your account to see the presentations." />
  if (!attending) return <Panel><p className="text-sm">Presentations are available to registered attendees.</p></Panel>
  if (err) return <Notice tone="bad">{err}</Notice>
  if (!files) return <p className="text-sm text-muted">Loading…</p>
  if (files.length === 0) return <Panel><p className="text-sm">Nothing has been posted yet. Check back on the day.</p></Panel>

  const titleFor = new Map(data.sessions.map((s) => [s.id, s]))
  const groups = new Map<string, PubFile[]>()
  for (const f of files) {
    const k = f.session_id && titleFor.has(f.session_id) ? f.session_id : ''
    groups.set(k, [...(groups.get(k) ?? []), f])
  }
  const order = [...data.sessions.map((s) => s.id).filter((id) => groups.has(id)), ...(groups.has('') ? [''] : [])]

  return (
    <>
      <Panel><p className="text-sm">These links work for an hour. If one stops working, refresh this page. Please don’t redistribute the slides without the speaker’s permission.</p></Panel>
      {order.map((k) => {
        const s = titleFor.get(k)
        return (
          <Panel key={k || 'general'} title={s ? s.title : 'General materials'} sub={s ? `${prettyDay(s.session_date)}, ${s.start_time}` : undefined}>
            <ul className="space-y-2 text-sm">
              {groups.get(k)!.map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <a className="font-medium text-accent hover:underline" href={f.url} target="_blank" rel="noreferrer">{f.title}</a>
                  <span className="text-xs text-muted">{f.file_name}{f.size_bytes ? ` · ${(f.size_bytes / 1048576).toFixed(1)} MB` : ''}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )
      })}
    </>
  )
}

// ================================= letter ==================================

interface LetterData {
  full_name: string; institution: string | null; event_name: string; when: string; venue_name: string | null
  attended: string; credit_hours: number | string | null; credits_statement: string | null
  organizer_name: string | null; issued_on: string
}

function Letter({ token, data, onAuthed }: { token: string; data: Payload; onAuthed: () => Promise<void> }) {
  const { session } = useAuth()
  const [letter, setLetter] = useState<LetterData | null | undefined>(undefined)
  const uid = session?.user?.id ?? null
  useEffect(() => {
    supabase.rpc('conf_public_letter', { p_token: token }).then(({ data: d, error }) => setLetter(error ? null : (d as LetterData | null)))
  }, [token, uid])

  const frame = (body: React.ReactNode) => (
    <PublicFrame kicker="Participation letter" title={data.event.name} organizer={data.event.organizer_name} organizerEmail={data.event.organizer_email} logoUrl={data.event.logo_url}>
      {body}
    </PublicFrame>
  )

  if (letter === undefined) return frame(<p className="text-sm text-muted">Loading…</p>)
  if (!data.account.me) return frame(<SignInToContinue token={token} data={data} onDone={onAuthed} why="Sign in with your account to see your participation letter." />)
  if (letter === null) {
    return frame(
      <Panel>
        <p className="text-sm">
          {data.event.letters_enabled
            ? 'Your letter will be available here once the organizers have recorded your attendance. If you attended and still can’t see it after the event, please contact the organizer.'
            : 'Participation letters aren’t being issued for this event.'}
        </p>
        <p className="mt-3 text-sm"><Link className="text-accent hover:underline" to={`/e/${token}`}>Back to the event page</Link></p>
      </Panel>,
    )
  }

  const hours = letter.credit_hours == null ? null : Number(letter.credit_hours)
  return (
    <div className="min-h-screen bg-paper text-ink print:bg-white">
      <div className="mx-auto flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 px-4 py-4 print:hidden">
        <Link className="text-sm text-accent hover:underline" to={`/e/${token}`}>← Event page</Link>
        <button type="button" className={primaryBtn} onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <article className="mx-auto max-w-[8.5in] bg-white px-[0.9in] py-[0.9in] text-[#0F1B2D] shadow-sm print:shadow-none" style={{ fontFamily: 'Georgia, serif' }}>
        {data.event.logo_url && <img src={data.event.logo_url} alt="" className="mb-6 block max-h-16 max-w-[240px] object-contain" />}
        <p className="text-sm uppercase tracking-[0.14em] text-[#5B6677]">{letter.organizer_name}</p>
        <h1 className="mt-6 text-3xl">Letter of participation</h1>
        <p className="mt-8">{letter.issued_on}</p>
        <p className="mt-8 leading-relaxed">
          This letter confirms that <strong>{letter.full_name}</strong>
          {letter.institution ? <> of {letter.institution}</> : null} participated {letter.attended} in{' '}
          <strong>{letter.event_name}</strong>, held {letter.when}{letter.venue_name ? <> at {letter.venue_name}</> : null}.
        </p>
        {hours != null && hours > 0 && (
          <p className="mt-4 leading-relaxed">
            Hours of educational activity attended: <strong>{hours % 1 === 0 ? hours : hours.toFixed(2).replace(/0$/, '')}</strong>.
          </p>
        )}
        {letter.credits_statement && <p className="mt-4 whitespace-pre-line leading-relaxed">{letter.credits_statement}</p>}
        <p className="mt-14">{letter.organizer_name}</p>
        <p className="text-sm text-[#5B6677]">Organizer, {letter.event_name}</p>
      </article>
      <p className="mx-auto max-w-[8.5in] px-4 py-4 text-xs text-muted print:hidden">
        This letter records your attendance. Whether these hours count toward a credit or certification program is
        set out in the statement above, where the organizer has provided one; otherwise, please ask the organizer.
      </p>
    </div>
  )
}

// =============================== unsubscribe ===============================

function Unsubscribe({ token, data }: { token: string; data: Payload | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'bad'>(data?.invitee.unsubscribed ? 'done' : 'idle')
  useEffect(() => { if (data?.invitee.unsubscribed) setState('done') }, [data])

  // A button, not an automatic unsubscribe on load: hospital mail filters
  // open every link in a message to scan it, and would otherwise unsubscribe
  // people who never asked.
  async function go() {
    setState('busy')
    const { data: ok, error } = await supabase.rpc('conf_public_unsubscribe', { p_token: token })
    setState(error || !ok ? 'bad' : 'done')
  }

  const name = data?.event.name
  return (
    <PublicFrame kicker="Email preferences" title={name ?? 'Unsubscribe'} organizer={data?.event.organizer_name} organizerEmail={data?.event.organizer_email} logoUrl={data?.event.logo_url}>
      <Panel>
        {state === 'done' ? (
          <div className="space-y-2 text-sm">
            <Notice tone="ok">You’re unsubscribed. You won’t receive further invitations, reminders or updates about {name ?? 'this event'}.</Notice>
            <p className="text-muted">
              If you’re registered, your place is kept. You may still receive your participation letter, since it is
              a record of your own attendance.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>Stop receiving emails about {name ? <strong>{name}</strong> : 'this event'}?</p>
            {state === 'bad' && <Notice tone="bad">That didn’t work — the link may be incomplete. Please reply to the email instead.</Notice>}
            <button type="button" className={primaryBtn} disabled={state === 'busy'} onClick={go}>
              {state === 'busy' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
          </div>
        )}
      </Panel>
    </PublicFrame>
  )
}

// ================================ calendar =================================

/** Milliseconds a timezone is ahead of UTC at a given instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value])) as Record<string, string>
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs
}

/** A wall-clock time in the event's timezone, as a real instant. */
function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let zone = tz
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }) } catch { zone = 'America/Toronto' }
  const off = tzOffsetMs(guess, zone)
  let utc = guess - off
  const off2 = tzOffsetMs(utc, zone)
  if (off2 !== off) utc = guess - off2
  return new Date(utc)
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 73) { out.push(rest.slice(0, 73)); rest = ' ' + rest.slice(73) }
  out.push(rest)
  return out.join('\r\n')
}

/**
 * One calendar entry per conference day, first session to last, rather than
 * one per talk: attendees want the day blocked, and forty entries would bury
 * their own calendar. The description links back here for the detail.
 */
async function downloadIcs(token: string, data: Payload) {
  const { event: ev, invitee: me } = data
  const page = `${window.location.origin}/e/${token}`
  const zoom = me.rsvp_status === 'virtual' || me.rsvp_status === 'in_person' ? safeUrl(ev.zoom_url) : null
  const location = me.rsvp_status === 'virtual' && zoom
    ? zoom
    : [ev.venue_name, ev.venue_address].filter(Boolean).join(', ') || zoom || ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  const uidBase = [...new Uint8Array(digest)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('')

  const byDay = new Map<string, { start: string; end: string }>()
  for (const s of data.sessions) {
    const cur = byDay.get(s.session_date)
    byDay.set(s.session_date, {
      start: !cur || s.start_time < cur.start ? s.start_time : cur.start,
      end: !cur || s.end_time > cur.end ? s.end_time : cur.end,
    })
  }
  const desc = icsText(
    (ev.description ? ev.description + '\n\n' : '')
    + (zoom ? `Zoom: ${zoom}${ev.zoom_passcode ? ` (passcode ${ev.zoom_passcode})` : ''}\n` : '')
    + `Itinerary and details: ${page}`)
  const now = icsStamp(new Date())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Neuromuscular Fellowship//Conference//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']

  if (byDay.size === 0) {
    const [y, m, d] = ev.ends_on.split('-').map(Number)
    const after = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `UID:${uidBase}@neuromuscular.ca`, `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${ev.starts_on.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${after}`,
      `SUMMARY:${icsText(ev.name)}`, `LOCATION:${icsText(location)}`, `DESCRIPTION:${desc}`, `URL:${page}`, 'END:VEVENT')
  } else {
    for (const [day, t] of [...byDay.entries()].sort()) {
      lines.push('BEGIN:VEVENT', `UID:${uidBase}-${day}@neuromuscular.ca`, `DTSTAMP:${now}`,
        `DTSTART:${icsStamp(zonedToUtc(day, t.start, ev.timezone))}`, `DTEND:${icsStamp(zonedToUtc(day, t.end, ev.timezone))}`,
        `SUMMARY:${icsText(byDay.size > 1 ? `${ev.name} (${prettyDay(day)})` : ev.name)}`,
        `LOCATION:${icsText(location)}`, `DESCRIPTION:${desc}`, `URL:${page}`, 'END:VEVENT')
    }
  }
  lines.push('END:VCALENDAR')
  const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${ev.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
