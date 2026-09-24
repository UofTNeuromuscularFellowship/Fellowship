import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { cohortYears } from '../lib/caseOptions'
import {
  StepBar, ChoiceCard, Notice, field, label, primary, quiet, textBtn, isoDay, niceDay,
} from '../components/ui/Wizard'

// ---------------------------------------------------------------------------
// Add people, one step at a time — fellows, supervisors, assistants, admins
// and directors, one person or a whole list at once.
//
//   1 Who          name and email (checked against existing accounts), or a
//                  pasted list; and their role
//   2 Their role   what that role needs: a fellow's cohort, fellowship dates
//                  and starting clinic pattern; whether a supervisor runs
//                  clinics, who their assistant is; which supervisors an
//                  assistant works for
//   3 Review       one button creates the accounts and sends sign-in details
//   Done           temporary passwords (shown once) and what to do next
//
// Everything is applied by admin-create-user in the same request, so nobody
// is left half set up on other screens.
// ---------------------------------------------------------------------------

type Role = 'fellow' | 'supervisor' | 'assistant' | 'admin' | 'director'
interface Person { full_name: string; email: string; problem?: string }
interface Member { id: string; full_name: string; email: string; role: string; status: string }
interface Result {
  email: string; full_name: string; status: 'created' | 'added' | 'error'; user_id?: string
  temp_password?: string; emailed?: boolean; error?: string; notes?: string[]
}
interface EmailStatus { valid: boolean; exists?: boolean; member_here?: boolean; active_here?: boolean; role_here?: string }

const ROLES: { key: Role; title: string; desc: string }[] = [
  { key: 'fellow', title: 'Fellow', desc: 'Sees their own clinic and teaching schedule, logs cases, requests vacation and rates teaching.' },
  { key: 'supervisor', title: 'Supervisor', desc: 'Runs clinics and/or teaches. Confirms their sessions, sets away dates and evaluates fellows.' },
  { key: 'assistant', title: 'Administrative assistant', desc: 'Manages schedules and away dates for the supervisors they work for.' },
  { key: 'admin', title: 'Admin', desc: 'Helps run the program day to day: people, competency targets and events.' },
  { key: 'director', title: 'Director', desc: 'Runs the program: schedules, approvals, people and settings.' },
]
const ROLE_TITLE = Object.fromEntries(ROLES.map((r) => [r.key, r.title])) as Record<Role, string>
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** "Jane Smith, jane@x.ca", "Jane Smith <jane@x.ca>" or tab-separated — one per line. A line with only
 *  an address is flagged "No name", since every account needs a name. */
function parseList(text: string): Person[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    let name = '', email = ''
    const angle = line.match(/^(.*?)\s*<\s*([^>]+)\s*>\s*$/)
    if (angle) { name = angle[1]; email = angle[2] }
    else {
      const parts = line.split(/\s*[,;\t]\s*/)
      const at = parts.findIndex((p) => p.includes('@'))
      if (at >= 0) { email = parts[at]; name = parts.filter((_, i) => i !== at).join(' ') }
      else name = line
    }
    name = name.replace(/^["']|["']$/g, '').trim()
    email = email.trim().toLowerCase()
    const problem = !EMAIL.test(email) ? 'No valid email address' : !name ? 'No name' : undefined
    return { full_name: name, email, problem }
  })
}

/** The next July 1 (today if it is July 1), the usual start of a fellowship year. */
function nextJuly1(): string {
  const now = new Date()
  const y = now.getMonth() > 6 || (now.getMonth() === 6 && now.getDate() > 1) ? now.getFullYear() + 1 : now.getFullYear()
  return `${y}-07-01`
}
function endFor(start: string, years: number): string {
  const [y, m, d] = start.split('-').map(Number)
  const end = new Date(y + years, m - 1, d)
  end.setDate(end.getDate() - 1)
  return isoDay(end)
}
function cohortFor(start: string): string {
  const [y, m] = start.split('-').map(Number)
  const first = m >= 7 ? y : y - 1
  return `${first}-${first + 1}`
}

export default function AddPeople() {
  const { site } = useAuth()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<'one' | 'many'>('one')
  const [one, setOne] = useState<Person>({ full_name: '', email: '' })
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null)
  const [pasted, setPasted] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // role details
  const defaultStart = nextJuly1()
  const [start, setStart] = useState(defaultStart)
  const [years, setYears] = useState<1 | 2 | 0>(1)
  const [end, setEnd] = useState(endFor(defaultStart, 1))
  const [cohort, setCohort] = useState(cohortFor(defaultStart))
  const [templateId, setTemplateId] = useState('')
  const [teachingOnly, setTeachingOnly] = useState(false)
  const [assistantId, setAssistantId] = useState('')
  const [ccText, setCcText] = useState('')
  const [supports, setSupports] = useState<string[]>([])
  const [sendWelcome, setSendWelcome] = useState(true)

  // what the program already has
  const [members, setMembers] = useState<Member[]>([])
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<Result[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('site_users').select('id, full_name, email, role, status').order('full_name'),
      supabase.from('fellow_templates').select('id, name').order('sort_order').order('created_at'),
    ]).then(([m, t]) => {
      setMembers((m.data as Member[]) ?? [])
      setTemplates((t.data as { id: string; name: string }[]) ?? [])
    })
  }, [])

  // Is this address already someone? Checked as they type, quietly.
  useEffect(() => {
    setEmailStatus(null)
    const e = one.email.trim().toLowerCase()
    if (!EMAIL.test(e)) return
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('people_email_status', { p_email: e })
      setEmailStatus((data as EmailStatus) ?? null)
    }, 400)
    return () => clearTimeout(t)
  }, [one.email])

  const list = useMemo(() => parseList(pasted), [pasted])
  const memberEmails = useMemo(() => new Set(members.filter((m) => m.status === 'active').map((m) => m.email.toLowerCase())), [members])
  const people: Person[] = mode === 'one'
    ? [{ full_name: one.full_name.trim(), email: one.email.trim().toLowerCase() }]
    : list.filter((p) => !p.problem && !memberEmails.has(p.email))
  const assistants = members.filter((m) => m.role === 'assistant' && m.status === 'active')
  const providers = members.filter((m) => (m.role === 'supervisor' || m.role === 'director') && m.status === 'active')
  const ccEmails = ccText.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  const badCc = ccEmails.filter((e) => !EMAIL.test(e))

  function setStartDate(v: string) {
    setStart(v)
    if (v && years) setEnd(endFor(v, years))
    if (v) setCohort(cohortFor(v))
  }
  function setLength(n: 1 | 2 | 0) {
    setYears(n)
    if (n && start) setEnd(endFor(start, n))
  }

  function nextFromWho() {
    setErr(null)
    if (mode === 'one') {
      if (!one.full_name.trim()) { setErr('Enter their name.'); return }
      if (!EMAIL.test(one.email.trim())) { setErr('Enter a valid email address.'); return }
      if (emailStatus?.active_here) { setErr('This person is already in your program. Find them in the list on the People page to change their role.'); return }
    } else if (people.length === 0) {
      setErr('Paste at least one line with a name and an email address.'); return
    }
    if (!role) { setErr('Choose their role.'); return }
    setStep(1)
  }

  function nextFromRole() {
    setErr(null)
    if (role === 'fellow') {
      if (!start || !end) { setErr('Enter when the fellowship starts and ends.'); return }
      if (end < start) { setErr('The fellowship ends before it starts.'); return }
    }
    if (badCc.length) { setErr(`${badCc[0]} isn't a valid email address.`); return }
    setStep(2)
  }

  async function create() {
    if (!role) return
    setBusy(true); setErr(null); setProgress(0)
    const out: Result[] = []
    for (const [i, p] of people.entries()) {
      const body: Record<string, unknown> = {
        full_name: p.full_name, email: p.email, role, send_welcome: sendWelcome,
      }
      if (role === 'fellow') Object.assign(body, {
        cohort_year: cohort || null, fellowship_start: start, fellowship_end: end, start_template_id: templateId || null,
      })
      if (role === 'supervisor') body.teaching_only = teachingOnly
      if (role === 'supervisor' || role === 'director') Object.assign(body, { assistant_id: assistantId || null, assistant_emails: ccEmails })
      if (role === 'assistant') body.supports = supports

      const { data, error } = await supabase.functions.invoke('admin-create-user', { body })
      let detail: string | null = data?.error ?? null
      if (error && !detail) {
        detail = error.message
        const ctx = (error as unknown as { context?: Response })?.context
        if (ctx && typeof ctx.text === 'function') {
          try { const b = JSON.parse(await ctx.text()); if (b?.error) detail = b.error } catch { /* keep generic */ }
        }
      }
      if (detail) out.push({ email: p.email, full_name: p.full_name, status: 'error', error: detail })
      else out.push({
        email: p.email, full_name: data.full_name ?? p.full_name, user_id: data.user_id,
        status: data.added_existing ? 'added' : 'created',
        temp_password: data.temp_password, emailed: !!data.welcome_emailed, notes: data.notes ?? [],
      })
      setProgress(i + 1)
    }
    setResults(out)
    setBusy(false)
    setStep(3)
  }

  const steps = ['Who', 'Their role', 'Review']
  const roleName = role ? ROLE_TITLE[role] : ''
  const whoLabel = mode === 'one' ? (one.full_name.trim() || 'this person') : `${people.length} ${people.length === 1 ? 'person' : 'people'}`

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/people" className="text-xs font-medium text-muted hover:text-ink">← User management</Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">Add people</h1>
          <p className="mt-1 text-sm text-muted">
            {step < 3 ? `Step ${step + 1} of 3 · Nothing is created until the last step.` : `Added to ${site?.name ?? 'your program'}.`}
          </p>
        </div>
      </div>
      {step < 3 && <StepBar steps={steps} current={step} onJump={(i) => { setErr(null); setStep(i) }} />}

      {/* ------------------------------------------------------------- 1 Who */}
      {step === 0 && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-ink">Who are you adding?</h2>
            <div className="inline-flex rounded-md border border-line bg-surface p-1" role="tablist" aria-label="How many">
              {(['one', 'many'] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(null) }}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}>
                  {m === 'one' ? 'One person' : 'Several people'}
                </button>
              ))}
            </div>

            {mode === 'one' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={label}>Full name</span>
                  <input id="ap-name" className={field} value={one.full_name} autoComplete="off"
                    onChange={(e) => setOne({ ...one, full_name: e.target.value })} /></label>
                <label className="block"><span className={label}>Email</span>
                  <input id="ap-email" type="email" className={field} value={one.email} autoComplete="off"
                    onChange={(e) => setOne({ ...one, email: e.target.value })} /></label>
                {emailStatus?.valid && (
                  <p className={`text-sm sm:col-span-2 ${emailStatus.active_here ? 'text-rose-600' : 'text-muted'}`} role="status">
                    {emailStatus.active_here
                      ? `Already in your program${emailStatus.role_here ? ` as ${ROLE_TITLE[emailStatus.role_here as Role]?.toLowerCase() ?? emailStatus.role_here}` : ''}.`
                      : emailStatus.exists
                        ? 'This address already has a portal login. They’ll be added to your program and keep their own password.'
                        : 'No login uses this address yet — a new account will be created.'}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block"><span className={label}>One person per line — “Name, email” or “Name &lt;email&gt;”</span>
                  <textarea id="ap-list" rows={6} className={`${field} font-mono`} value={pasted}
                    placeholder={'Jane Smith, jane.smith@hospital.ca\nSam Lee <sam.lee@hospital.ca>'}
                    onChange={(e) => setPasted(e.target.value)} /></label>
                {list.length > 0 && (
                  <ul className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
                    {list.map((p, i) => {
                      const already = !p.problem && memberEmails.has(p.email)
                      return (
                        <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0"><span className="font-medium text-ink">{p.full_name || '—'}</span>
                            <span className="ml-2 text-muted">{p.email || '—'}</span></span>
                          <span className={`text-xs font-medium ${p.problem || already ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                            {p.problem ?? (already ? 'Already in the program — skipped' : 'Ready')}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="text-xs text-muted">Everyone on the list gets the same role and details in the next step. Mixed roles? Add each group separately.</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-ink">{mode === 'one' ? 'What will they do?' : 'What will they do?'}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLES.map((r) => (
                <ChoiceCard key={r.key} name="ap-role" checked={role === r.key} onChange={() => setRole(r.key)} title={r.title}>{r.desc}</ChoiceCard>
              ))}
            </div>
          </section>

          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button className={primary} onClick={nextFromWho}>Continue →</button>
            <Link to="/people" className={textBtn}>Cancel</Link>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- 2 Their role */}
      {step === 1 && role && (
        <div className="space-y-6">
          <h2 className="font-display text-lg font-semibold text-ink">
            {role === 'fellow' ? `About ${mode === 'one' ? `${whoLabel}’s` : 'their'} fellowship`
              : role === 'assistant' ? `Who ${mode === 'one' ? whoLabel : 'they'} work${mode === 'one' ? 's' : ''} for`
                : `About ${mode === 'one' ? `${whoLabel}’s` : 'their'} role`}
          </h2>

          {role === 'fellow' && (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className={label}>Starts</span>
                  <input id="ap-start" type="date" className={field} value={start} onChange={(e) => setStartDate(e.target.value)} /></label>
                <div><span className={label}>Length</span>
                  <div className="flex gap-2">
                    {([1, 2, 0] as const).map((n) => (
                      <button key={n} type="button" onClick={() => setLength(n)}
                        className={`flex-1 rounded-md border px-3 py-2.5 text-sm font-medium ${years === n ? 'border-accent bg-accent-soft text-ink ring-1 ring-accent' : 'border-line bg-surface text-ink hover:border-accent'}`}>
                        {n === 0 ? 'Other' : `${n} year${n === 2 ? 's' : ''}`}
                      </button>
                    ))}
                  </div></div>
                <label className="block"><span className={label}>Ends</span>
                  <input id="ap-end" type="date" className={field} value={end} min={start}
                    onChange={(e) => { setEnd(e.target.value); setYears(0) }} /></label>
                <label className="block"><span className={label}>Cohort</span>
                  <select id="ap-cohort" className={field} value={cohort} onChange={(e) => setCohort(e.target.value)}>
                    <option value="">—</option>
                    {Array.from(new Set([...cohortYears(), cohort].filter(Boolean))).sort().map((y) => <option key={y} value={y}>{y}</option>)}
                  </select></label>
              </div>
              <p className="text-xs text-muted">The dates can be changed later — for an extension, a leave or an early finish — from the People page, and each change is recorded.</p>
              <label className="block"><span className={label}>Starting clinic pattern</span>
                <select id="ap-pattern" className={field} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Decide later</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="mt-1 block text-xs text-muted">
                  {templates.length === 0
                    ? 'No weekly clinic patterns are set up yet. Choose one later on the Clinic schedule page.'
                    : 'Their clinic rotation starts on this pattern and moves to the next one every three months.'}
                </span>
              </label>
            </div>
          )}

          {role === 'supervisor' && (
            <div className="space-y-2">
              <span className={label}>Do they run fellowship clinics?</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceCard name="ap-clin" checked={!teachingOnly} onChange={() => setTeachingOnly(false)} title="Yes — clinics and teaching">
                  They appear on the clinic schedule and get its emails.
                </ChoiceCard>
                <ChoiceCard name="ap-clin" checked={teachingOnly} onChange={() => setTeachingOnly(true)} title="Teaching only">
                  They teach, get teaching reminders and away-date requests, and are left off the clinic schedule.
                </ChoiceCard>
              </div>
            </div>
          )}

          {(role === 'supervisor' || role === 'director') && (
            <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
              <label className="block"><span className={label}>An assistant who manages their schedule</span>
                <select id="ap-asst" className={field} value={assistantId} onChange={(e) => setAssistantId(e.target.value)}>
                  <option value="">None</option>
                  {assistants.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
                <span className="mt-1 block text-xs text-muted">
                  {assistants.length === 0 ? 'No assistant accounts yet — add one with the “Administrative assistant” role.' : 'They can then act for this person on the Teaching, Clinic and Away dates pages.'}
                </span>
              </label>
              <label className="block"><span className={label}>Also copy their portal emails to (optional)</span>
                <input id="ap-cc" className={field} value={ccText} placeholder="office@hospital.ca" onChange={(e) => setCcText(e.target.value)} />
                <span className="mt-1 block text-xs text-muted">For an office address or an assistant without a login. Separate several with commas.</span>
              </label>
            </div>
          )}

          {role === 'director' && (
            <Notice>Directors can do everything in the program, including publishing schedules, approving vacation and managing people.</Notice>
          )}

          {role === 'assistant' && (
            <div className="rounded-lg border border-line bg-surface">
              {providers.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No supervisors yet. Add them first, or link this assistant later from the People page.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {providers.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-5 py-3 text-sm">
                        <input type="checkbox" checked={supports.includes(p.id)}
                          onChange={(e) => setSupports(e.target.checked ? [...supports, p.id] : supports.filter((x) => x !== p.id))} />
                        <span className="font-medium text-ink">{p.full_name}</span>
                        <span className="text-muted">{p.role === 'director' ? 'Director' : 'Supervisor'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {role === 'admin' && (
            <Notice>
              Admins manage people, competency targets and events, and can prepare the schedules.
              Publishing the clinic schedule and approving vacation stay with the director. There is nothing else to set.
            </Notice>
          )}

          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button className={quiet} onClick={() => { setErr(null); setStep(0) }}>← Back</button>
            <button className={primary} onClick={nextFromRole}>Continue →</button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- 3 Review */}
      {step === 2 && role && (
        <div className="space-y-6">
          <h2 className="font-display text-lg font-semibold text-ink">Check and create</h2>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <dl className="divide-y divide-line text-sm">
              <Row k={mode === 'one' ? 'Person' : 'People'}>
                {people.map((p) => <span key={p.email} className="block">{p.full_name} <span className="text-muted">· {p.email}</span></span>)}
              </Row>
              <Row k="Role">{roleName}{role === 'supervisor' ? (teachingOnly ? ' · teaching only' : ' · clinics and teaching') : ''}</Row>
              {role === 'fellow' && <>
                <Row k="Fellowship">{niceDay(start)} – {niceDay(end)}{cohort ? ` · ${cohort} cohort` : ''}</Row>
                <Row k="Clinic schedule">{templates.find((t) => t.id === templateId)?.name ?? 'Pattern chosen later'}</Row>
              </>}
              {(role === 'supervisor' || role === 'director') && <>
                <Row k="Assistant">{assistants.find((a) => a.id === assistantId)?.full_name ?? 'None'}</Row>
                {ccEmails.length > 0 && <Row k="Emails copied to">{ccEmails.join(', ')}</Row>}
              </>}
              {role === 'assistant' && (
                <Row k="Works for">{supports.length ? providers.filter((p) => supports.includes(p.id)).map((p) => p.full_name).join(', ') : 'Nobody yet'}</Row>
              )}
            </dl>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} />
            <span><span className="font-semibold text-ink">Email them their sign-in details now</span>
              <span className="block text-muted">A temporary password they change at first sign-in, when a short welcome walks them through the rest. You’ll also see it once on the next screen.</span></span>
          </label>
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button className={quiet} disabled={busy} onClick={() => setStep(1)}>← Back</button>
            <button className={primary} disabled={busy} onClick={create}>
              {busy ? `Creating… ${progress} of ${people.length}` : people.length === 1 ? 'Create account' : `Create ${people.length} accounts`}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- Done */}
      {step === 3 && (
        <div className="space-y-6">
          <ul className="space-y-3">
            {results.map((r) => <ResultCard key={r.email} r={r} />)}
          </ul>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">What next?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {role === 'fellow' && <NextLink to="/vacation">Add away dates you already know about</NextLink>}
              {role === 'fellow' && <NextLink to="/clinic">Update the clinic schedule to include them</NextLink>}
              {(role === 'supervisor' || role === 'director') && <NextLink to="/vacation">Add their away dates</NextLink>}
              <button type="button" onClick={() => window.location.assign('/people/new')}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm text-ink hover:border-accent">
                Add more people <span className="text-muted">→</span>
              </button>
              <NextLink to="/people">Back to User management</NextLink>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted">{k}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

function NextLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink hover:border-accent">
      {children} <span className="text-muted">→</span>
    </Link>
  )
}

function ResultCard({ r }: { r: Result }) {
  const [copied, setCopied] = useState(false)
  const [emailed, setEmailed] = useState(!!r.emailed)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)
  if (r.status === 'error') {
    return (
      <li className="rounded-lg border border-rose-300 bg-surface px-5 py-4 text-sm dark:border-rose-900">
        <p className="font-semibold text-ink">{r.full_name} <span className="font-normal text-muted">· {r.email}</span></p>
        <p className="mt-1 text-rose-700 dark:text-rose-300">Not added: {r.error}</p>
      </li>
    )
  }
  async function emailIt() {
    if (!r.temp_password || !r.user_id) return
    setSending(true); setSendErr(null)
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action: 'email_temp_password', user_id: r.user_id, temp_password: r.temp_password },
    })
    setSending(false)
    if (error || data?.error) { setSendErr(data?.error ?? error?.message ?? 'Could not send the email.'); return }
    setEmailed(true)
  }
  return (
    <li className="rounded-lg border border-line bg-surface px-5 py-4 text-sm">
      <p className="font-semibold text-ink">
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 align-[-3px] text-[11px] text-white" aria-hidden="true">✓</span>
        {r.full_name} <span className="font-normal text-muted">· {r.email}</span>
      </p>
      {r.status === 'added' ? (
        <p className="mt-1 text-muted">
          Already had a portal login, so they were added to your program and keep their own password.
          {emailed ? ' They’ve been emailed to let them know.' : ''}
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted">
            {emailed ? 'Their sign-in details were emailed to them.' : 'Their sign-in details were not emailed — share the password below, or send it now.'}
          </p>
          {r.temp_password && (
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-line bg-paper px-3 py-2">
              <span className="text-xs text-muted">Temporary password (shown once)</span>
              <code className="font-mono font-semibold text-ink">{r.temp_password}</code>
              <button type="button" className="ml-auto text-xs font-medium text-accent hover:underline"
                onClick={() => { navigator.clipboard?.writeText(r.temp_password!); setCopied(true) }}>{copied ? 'Copied' : 'Copy'}</button>
              {!emailed && (
                <button type="button" className="text-xs font-medium text-accent hover:underline" disabled={sending} onClick={emailIt}>
                  {sending ? 'Sending…' : 'Email it to them'}
                </button>
              )}
            </div>
          )}
          {sendErr && <p className="mt-1 text-rose-600">{sendErr}</p>}
        </>
      )}
      {r.notes && r.notes.length > 0 && <p className="mt-1 text-amber-700 dark:text-amber-300">{r.notes.join(' ')}</p>}
    </li>
  )
}
