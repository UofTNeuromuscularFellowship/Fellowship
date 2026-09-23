import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Waveform } from '../components/ui/Waveform'
import { StepBar, Notice, field, label, primary, textBtn, niceDay } from '../components/ui/Wizard'

// ---------------------------------------------------------------------------
// First sign-in, for everyone who belongs to a program. A few short steps,
// built for a phone because that's where the welcome email gets opened:
//
//   Password   swap the temporary password (only if they have one)
//   About you  the name schedules and emails use, and an optional mobile
//   Time away  anything already booked, so schedules are built around it —
//              fellows' requests go to the director; supervisors' and
//              directors' dates are recorded directly (skipped for admins
//              and assistants)
//   Finish     keep it on the home screen, and where things are for them
//
// Finishing sets users.welcomed_at (0036); until then every portal page
// brings them back here. People who had accounts before this existed were
// marked as welcomed, so they never see it.
// ---------------------------------------------------------------------------

type Step = 'password' | 'about' | 'away' | 'finish'

const WHERE: Record<string, [string, string][]> = {
  fellow: [
    ['Home', 'this week’s clinics and teaching'],
    ['Clinic schedule', 'your clinic days'],
    ['Teaching schedule', 'sessions and topics'],
    ['Case log', 'log studies as you go'],
    ['Vacation & away dates', 'request time off'],
  ],
  supervisor: [
    ['Home', 'this week at a glance'],
    ['Teaching assignments', 'confirm, swap or flag your sessions'],
    ['Clinic schedule', 'who is with you, and when'],
    ['Evaluations', 'assess the fellows'],
    ['Vacation & away dates', 'keep your away dates up to date'],
  ],
  director: [
    ['People', 'add everyone in the program'],
    ['Clinic schedule', 'set up and publish the rotation'],
    ['Teaching assignments', 'build and publish the teaching year'],
    ['Vacation & away dates', 'approve fellows’ requests'],
  ],
  admin: [
    ['People', 'add and manage accounts'],
    ['Competency', 'targets and progress'],
    ['Conferences', 'courses and events'],
    ['Feedback review', 'how teaching is landing'],
  ],
  assistant: [
    ['Teaching assignments', 'act for the supervisors you work for'],
    ['Clinic schedule', 'their clinics, and cancellations'],
    ['Vacation & away dates', 'their away dates'],
  ],
}

export default function Welcome() {
  const { profile, site, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role ?? 'fellow'
  // fixed at arrival, so the steps don't shift once the password is changed
  const [steps] = useState<Step[]>(() => [
    ...(profile?.must_change_password ? ['password' as const] : []),
    'about',
    ...(['fellow', 'supervisor', 'director'].includes(role) ? ['away' as const] : []),
    'finish',
  ])
  const [i, setI] = useState(0)
  const step = steps[i]
  const next = () => { setI((n) => Math.min(n + 1, steps.length - 1)); window.scrollTo({ top: 0 }) }

  const first = (profile?.full_name ?? '').split(' ')[0] || 'there'
  const titles: Record<Step, string> = { password: 'Password', about: 'About you', away: 'Time away', finish: 'Finish' }

  return (
    <div className="min-h-screen bg-paper px-5 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex items-center gap-3">
          <Waveform className="h-5 w-24 text-accent" />
          <span className="truncate text-xs font-medium text-muted">{site?.name}</span>
        </div>
        <StepBar steps={steps.map((s) => titles[s])} current={i} />
        {step === 'password' && <PasswordStep first={first} onDone={next} />}
        {step === 'about' && <AboutStep onDone={next} />}
        {step === 'away' && <AwayStep onDone={next} />}
        {step === 'finish' && (
          <FinishStep role={role} onDone={async () => {
            if (profile) {
              const now = new Date().toISOString()
              await supabase.from('users').update({ welcomed_at: now, onboarding_dismissed_at: now, updated_at: now }).eq('id', profile.id)
            }
            await refreshProfile()
            navigate('/dashboard', { replace: true })
          }} />
        )}
      </div>
    </div>
  )
}

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold leading-tight text-ink">{title}</h1>
      {children && <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>}
    </div>
  )
}

function PasswordStep({ first, onDone }: { first: string; onDone: () => void }) {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    if (pw1.length < 8) { setErr('Password must be at least 8 characters.'); return }
    if (pw1 !== pw2) { setErr('The two passwords don’t match.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    if (error) { setBusy(false); setErr(error.message); return }
    await supabase.rpc('clear_must_change_password')
    setBusy(false)
    onDone()
  }
  return (
    <form onSubmit={save} className="space-y-5">
      <Heading title={`Welcome, ${first}`}>You’re in. First, swap the temporary password for one of your own.</Heading>
      <label className="block"><span className={label}>New password</span>
        <input id="w-pw1" type="password" autoComplete="new-password" className={field} value={pw1} onChange={(e) => setPw1(e.target.value)} /></label>
      <label className="block"><span className={label}>Type it again</span>
        <input id="w-pw2" type="password" autoComplete="new-password" className={field} value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      <p className="text-xs text-muted">At least 8 characters.</p>
      {err && <Notice tone="bad">{err}</Notice>}
      <button className={`${primary} w-full`} disabled={busy || !pw1 || !pw2}>{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  )
}

function AboutStep({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [dates, setDates] = useState<{ fellowship_start: string | null; fellowship_end: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.role !== 'fellow') return
    supabase.from('site_users').select('fellowship_start, fellowship_end').eq('id', profile.id).maybeSingle()
      .then(({ data }) => setDates((data as typeof dates) ?? null))
  }, [profile?.id, profile?.role]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    if (!name.trim()) { setErr('Enter your name.'); return }
    if (!profile) return
    setBusy(true)
    const { error } = await supabase.from('users')
      .update({ full_name: name.trim(), phone: phone.trim() || null, updated_at: new Date().toISOString() }).eq('id', profile.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  const roleText: Record<string, string> = {
    fellow: 'Fellow', supervisor: 'Supervisor', director: 'Director', admin: 'Admin', assistant: 'Administrative assistant',
  }
  return (
    <form onSubmit={save} className="space-y-5">
      <Heading title="About you">This is how you appear on schedules and emails. Check it’s right.</Heading>
      <label className="block"><span className={label}>Your name as it should appear</span>
        <input id="w-name" className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="block"><span className={label}>Mobile number (optional)</span>
        <input id="w-phone" type="tel" autoComplete="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <span className="text-muted">You’ve been set up as</span>
        <span className="block font-semibold text-ink">
          {roleText[profile?.role ?? ''] ?? profile?.role}{profile?.cohort_year ? ` · ${profile.cohort_year} cohort` : ''}
        </span>
        {dates && (dates.fellowship_start || dates.fellowship_end) && (
          <span className="block text-muted">Fellowship: {niceDay(dates.fellowship_start) || '—'} – {niceDay(dates.fellowship_end) || '—'}</span>
        )}
        <span className="mt-1 block text-xs text-muted">Something wrong here? Let your program director know.</span>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <button className={`${primary} w-full`} disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
    </form>
  )
}

interface Added { from: string; to: string; note: string }

function AwayStep({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth()
  const fellow = profile?.role === 'fellow'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [added, setAdded] = useState<Added[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    setErr(null)
    if (!from || !profile) { setErr('Choose the first day.'); return }
    const last = to || from
    if (last < from) { setErr('The last day is before the first.'); return }
    setBusy(true)
    let error: { message: string } | null = null
    if (fellow) {
      ({ error } = await supabase.from('vacation_requests').insert({
        fellow_id: profile.id, start_date: from, end_date: last, note: note.trim() || null,
      }))
    } else {
      const days: string[] = []
      const d = new Date(`${from}T00:00:00`)
      const end = new Date(`${last}T00:00:00`)
      while (d <= end) {
        const p = (n: number) => String(n).padStart(2, '0')
        days.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
        d.setDate(d.getDate() + 1)
      }
      ({ error } = await supabase.from('provider_away_dates').upsert(
        days.map((away_date) => ({ provider_id: profile.id, away_date, reason: note.trim() || null, entered_by: profile.id })),
        { onConflict: 'provider_id,away_date' }))
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
    setAdded([...added, { from, to: last, note: note.trim() }])
    setFrom(''); setTo(''); setNote('')
  }

  return (
    <div className="space-y-5">
      <Heading title="Any time away already booked?">
        {fellow
          ? 'Your clinic schedule is built around it. Requests go to the director for approval.'
          : 'Clinic and teaching schedules are built around it, so fellows aren’t sent to a clinic you won’t be at.'}
      </Heading>
      {added.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          {added.map((a, k) => (
            <li key={k} className="text-ink">
              {niceDay(a.from)}{a.to !== a.from ? ` – ${niceDay(a.to)}` : ''}{a.note ? ` · ${a.note}` : ''}
              <span className="ml-2 text-xs text-muted">{fellow ? 'sent for approval' : 'saved'}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className={label}>First day</span>
            <input id="w-from" type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="block"><span className={label}>Last day</span>
            <input id="w-to" type="date" className={field} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label className="block"><span className={label}>Reason (optional)</span>
          <input id="w-note" className={field} value={note} placeholder="e.g. Conference" onChange={(e) => setNote(e.target.value)} /></label>
        <button type="button" className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-accent disabled:opacity-50"
          disabled={busy || !from} onClick={add}>{busy ? 'Adding…' : added.length ? 'Add another' : 'Add'}</button>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <button className={`${primary} w-full`} onClick={onDone}>Continue</button>
      {added.length === 0 && (
        <button className={`${textBtn} block w-full text-center`} onClick={onDone}>Nothing booked yet</button>
      )}
      <p className="text-center text-xs text-muted">You can add more any time under Vacation &amp; away dates.</p>
    </div>
  )
}

function FinishStep({ role, onDone }: { role: string; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const where = WHERE[role] ?? WHERE.fellow
  return (
    <div className="space-y-5">
      <Heading title="Keep it on your home screen">The portal works like an app on your phone: add it once and your schedule is a tap away.</Heading>
      <div className="space-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-relaxed">
        <p><span className="font-semibold text-ink">iPhone:</span> tap the Share button, then “Add to Home Screen”.</p>
        <p><span className="font-semibold text-ink">Android:</span> tap the ⋮ menu, then “Add to Home screen” or “Install app”.</p>
      </div>
      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <p className="mb-2 font-semibold text-ink">Where things are</p>
        <ul className="space-y-1">
          {where.map(([a, b]) => <li key={a}><span className="font-medium text-ink">{a}</span> <span className="text-muted">— {b}</span></li>)}
        </ul>
        {role !== 'assistant' && role !== 'admin' && (
          <p className="mt-2 text-xs text-muted">Your Home page also has a link to add your schedule to your own calendar app.</p>
        )}
      </div>
      <button className={`${primary} w-full`} disabled={busy} onClick={async () => { setBusy(true); await onDone() }}>
        {busy ? 'One moment…' : 'Go to my home page'}
      </button>
    </div>
  )
}
