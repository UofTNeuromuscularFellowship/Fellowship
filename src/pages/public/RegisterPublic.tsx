import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { eventWhen, input, primaryBtn } from '../../lib/conference'
import { PublicFrame, Panel, Notice, Invalid, rpcMessage } from './PublicFrame'

// ---------------------------------------------------------------------------
// Public registration, at /r/<event's public token>.
//
// Anyone with the link can put their name down. What they get back is an
// email to the address they typed, carrying their own private link; that
// email is what proves the address is theirs, so choosing in person or
// online and creating the account happen from there, exactly as for someone
// invited. The page answers the same way whether or not the address was
// already on the list, so it cannot be used to find out who is invited.
// ---------------------------------------------------------------------------

interface Info {
  name: string; description: string | null; starts_on: string; ends_on: string
  venue_name: string | null; venue_address: string | null; has_virtual: boolean; open: boolean
  organizer_name: string | null; organizer_email: string | null
  logo_url?: string | null
}

export default function RegisterPublic() {
  const { token = '' } = useParams<{ token: string }>()
  const { session, profile } = useAuth()
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [f, setF] = useState({ full_name: '', email: '', institution: '', role_title: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('conf_public_registration_info', { p_token: token })
      .then(({ data, error }) => setInfo(error ? null : ((data as Info | null) ?? null)))
  }, [token])

  // Signed in already: start from what the portal knows.
  useEffect(() => {
    if (!session?.user.email) return
    setF((cur) => ({ ...cur, email: cur.email || session.user.email!, full_name: cur.full_name || profile?.full_name || '' }))
  }, [session?.user.email, profile?.full_name])

  if (info === undefined) return <PublicFrame><p className="text-sm text-muted">Loading…</p></PublicFrame>
  if (info === null) return <Invalid what="registration page" />

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    // A field people never see; forms filled in by bots tend to complete it.
    if (f.website) { setDone(f.email); return }
    if (!f.full_name.trim()) { setErr('Enter your name.'); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setErr('Enter a valid email address.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('conf_public_register', {
      p_token: token, p_email: f.email.trim(), p_full_name: f.full_name.trim(),
      p_institution: f.institution.trim(), p_role_title: f.role_title.trim(),
    })
    setBusy(false)
    if (error) { setErr(rpcMessage(error, 'We couldn’t register you. Please try again.')); return }
    setDone(f.email.trim())
  }

  const field = (label: string, el: React.ReactNode) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {el}
    </label>
  )

  return (
    <PublicFrame kicker={eventWhen(info.starts_on, info.ends_on)} title={info.name}
      organizer={info.organizer_name} organizerEmail={info.organizer_email} logoUrl={info.logo_url}>
      <Panel>
        <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="font-medium text-muted">When</dt>
          <dd>{eventWhen(info.starts_on, info.ends_on)}</dd>
          {(info.venue_name || info.venue_address) && <>
            <dt className="font-medium text-muted">Where</dt>
            <dd>{info.venue_name}{info.venue_address && <span className="block text-muted">{info.venue_address}</span>}</dd>
          </>}
          {info.has_virtual && <><dt className="font-medium text-muted">Online</dt><dd>Also available on Zoom.</dd></>}
        </dl>
        {info.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{info.description}</p>}
      </Panel>

      {!info.open ? (
        <Panel title="Registration"><p className="text-sm">Registration for this event is closed.</p></Panel>
      ) : done ? (
        <Panel title="Check your email" tone="accent">
          <p className="text-sm">
            We’ve sent a link to <strong>{done}</strong>. Open it to choose how you’ll attend and to set up your
            account. It can take a few minutes to arrive — check your junk folder if you don’t see it.
          </p>
        </Panel>
      ) : (
        <Panel title="Register" tone="accent">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {field('Your name', <input className={input} autoComplete="name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />)}
              {field('Email', <input className={input} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />)}
              {field('Institution', <input className={input} autoComplete="organization" value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} />)}
              {field('Role or position', <input className={input} value={f.role_title} placeholder="e.g. Neurology resident" onChange={(e) => setF({ ...f, role_title: e.target.value })} />)}
            </div>
            <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
              <label>Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></label>
            </div>
            <p className="text-xs text-muted">We’ll email you a private link to finish registering. The organizers see the details you give here.</p>
            {err && <Notice tone="bad">{err}</Notice>}
            <button className={primaryBtn} disabled={busy}>{busy ? 'Sending…' : 'Register'}</button>
          </form>
        </Panel>
      )}
    </PublicFrame>
  )
}
