import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'

// ---------------------------------------------------------------------------
// Platform admin: the programs using this portal.
//
// Deliberately narrow. The platform admin creates a program, appoints its
// first director and decides which EMG Toolkit items it may use. Everything
// inside a program — its people, cases, feedback, schedules — is the program's
// own, and this page has no access to any of it. That is enforced in the
// database (a platform admin is a member of no site); the page just doesn't
// pretend otherwise.
// ---------------------------------------------------------------------------

const FIELD = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink'
const BTN = 'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50'
const BTN2 = 'rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50'

/** The toolkit, in the order it appears in the EMG Toolkit menu. */
const TOOLS: { key: string; label: string; blurb: string }[] = [
  { key: 'test-directory', label: 'Diagnostic test directory', blurb: 'Where to send genetic and antibody testing, with requisitions.' },
  { key: 'atlas-3d', label: '3D atlas', blurb: 'Muscles, nerves and needle insertion points in three dimensions.' },
  { key: 'waveforms', label: 'Waveforms & images library', blurb: 'Teaching traces, ultrasound, MRI and biopsy, annotated.' },
  { key: 'library', label: 'Literature library', blurb: 'Reference texts, guidelines and the PubMed reading list.' },
  { key: 'calculators', label: 'EMG/NCS calculators', blurb: 'Reference values and the calculations you repeat.' },
  { key: 'study', label: 'Anatomy self-test', blurb: 'Self-testing on muscles, nerves and root levels.' },
  { key: 'ultrasound', label: 'Ultrasound primer', blurb: 'Currently withdrawn from menus everywhere; kept for when it returns.' },
]

interface SiteRow { id: string; slug: string; name: string; short_name: string | null; institution: string | null; status: string; created_at: string }
interface ToolRow { site_id: string; tool_key: string; enabled: boolean }
interface DirectorRow { site_id: string; user_id: string; full_name: string; email: string; status: string }
interface CountRow { site_id: string; members: number; fellows: number }

export default function Platform() {
  const { isPlatformAdmin } = useAuth()
  const [sites, setSites] = useState<SiteRow[]>([])
  const [tools, setTools] = useState<ToolRow[]>([])
  const [directors, setDirectors] = useState<DirectorRow[]>([])
  const [counts, setCounts] = useState<CountRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const [s, t, d, c] = await Promise.all([
      supabase.from('sites').select('*').neq('slug', 'platform').order('created_at'),
      supabase.from('site_tools').select('*'),
      supabase.rpc('platform_site_directors'),
      supabase.rpc('platform_site_counts'),
    ])
    if (s.error) setMsg(s.error.message)
    setSites((s.data as SiteRow[]) ?? [])
    setTools((t.data as ToolRow[]) ?? [])
    setDirectors((d.data as DirectorRow[]) ?? [])
    setCounts((c.data as CountRow[]) ?? [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isPlatformAdmin) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Programs</h1>
        <p className="mt-1 text-sm text-muted">
          Fellowship programs using this portal. Each program's people, cases, feedback and schedules
          belong to that program alone; this page can create a program, appoint its director and choose
          its toolkit, and nothing more.
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      <NewSiteForm onCreated={load} onError={setMsg} />

      {sites.map((site) => (
        <SiteCard
          key={site.id}
          site={site}
          tools={tools.filter((t) => t.site_id === site.id)}
          directors={directors.filter((d) => d.site_id === site.id)}
          counts={counts.find((c) => c.site_id === site.id)}
          onChanged={load}
          onError={setMsg}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

function NewSiteForm({ onCreated, onError }: { onCreated: () => void; onError: (m: string) => void }) {
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [institution, setInstitution] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const effectiveSlug = slug || slugify(shortName || name)

  async function create() {
    if (!name.trim()) { onError('The program needs a name.'); return }
    if (!/^[a-z0-9-]{2,40}$/.test(effectiveSlug)) { onError('The short id must be 2–40 lower-case letters, digits or hyphens.'); return }
    setBusy(true); onError('')
    const { data, error } = await supabase.from('sites')
      .insert({ name: name.trim(), short_name: shortName.trim() || null, institution: institution.trim() || null, slug: effectiveSlug })
      .select('id').single()
    if (error || !data) { setBusy(false); onError(error?.message ?? 'Could not create the program.'); return }
    // Every toolkit item on by default except the withdrawn ultrasound primer.
    await supabase.from('site_tools').insert(TOOLS.map((t) => ({ site_id: data.id, tool_key: t.key, enabled: t.key !== 'ultrasound' })))
    setBusy(false)
    setName(''); setShortName(''); setInstitution(''); setSlug('')
    onCreated()
  }

  return (
    <Card>
      <CardHeader title="Add a program" sub="Creates the program with an empty roster. Appoint its director from the card that appears below." />
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted">Program name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neuromuscular Fellowship, University of …" className={FIELD} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Short name (shown in the menu)</label>
          <input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="e.g. Calgary" className={FIELD} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Institution</label>
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Short id</label>
          <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder={effectiveSlug || 'auto'} className={FIELD} />
        </div>
        <div className="flex items-end">
          <button onClick={create} disabled={busy || !name.trim()} className={BTN}>{busy ? 'Creating…' : 'Create program'}</button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function SiteCard({ site, tools, directors, counts, onChanged, onError }: {
  site: SiteRow
  tools: ToolRow[]
  directors: DirectorRow[]
  counts?: CountRow
  onChanged: () => void
  onError: (m: string) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const enabled = useMemo(() => new Set(tools.filter((t) => t.enabled).map((t) => t.tool_key)), [tools])
  const suspended = site.status !== 'active'

  async function toggleTool(key: string, on: boolean) {
    setBusy(key); onError('')
    const { error } = await supabase.from('site_tools').upsert({ site_id: site.id, tool_key: key, enabled: on })
    setBusy(null)
    if (error) { onError(error.message); return }
    onChanged()
  }

  async function setStatus(status: 'active' | 'suspended') {
    if (status === 'suspended' && !confirm(`Suspend ${site.name}? Nobody will be able to open it until it is reactivated. Nothing is deleted.`)) return
    setBusy('status'); onError('')
    const { error } = await supabase.from('sites').update({ status }).eq('id', site.id)
    setBusy(null)
    if (error) { onError(error.message); return }
    onChanged()
  }

  return (
    <Card className={suspended ? 'opacity-70' : ''}>
      <CardHeader
        title={site.name}
        sub={[site.institution, site.short_name && `menu: ${site.short_name}`, `id: ${site.slug}`, suspended && 'SUSPENDED'].filter(Boolean).join(' · ')}
        action={
          <div className="flex items-center gap-3 text-xs text-muted">
            {counts && <span>{counts.members} member{counts.members === 1 ? '' : 's'} · {counts.fellows} active fellow{counts.fellows === 1 ? '' : 's'}</span>}
            <button onClick={() => setStatus(suspended ? 'active' : 'suspended')} disabled={busy === 'status'} className={BTN2}>
              {suspended ? 'Reactivate' : 'Suspend'}
            </button>
          </div>
        }
      />

      <div className="grid gap-6 px-5 py-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Directors</p>
          {directors.length === 0 ? (
            <p className="text-sm text-muted">No director yet. Appoint one below — they add everyone else.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink">
              {directors.map((d) => (
                <li key={d.user_id}>
                  {d.full_name} <span className="text-muted">· {d.email}{d.status !== 'active' ? ` · ${d.status}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <AppointDirector site={site} onDone={onChanged} onError={onError} />
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">EMG Toolkit</p>
          <ul className="space-y-2">
            {TOOLS.map((t) => (
              <li key={t.key}>
                <label className="flex items-start gap-2.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={enabled.has(t.key)}
                    disabled={busy === t.key}
                    onChange={(e) => toggleTool(t.key, e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line text-accent"
                  />
                  <span>
                    <span className="font-medium">{t.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{t.blurb}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function AppointDirector({ site, onDone, onError }: { site: SiteRow; onDone: () => void; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ email: string; password?: string; emailed: boolean; existing: boolean } | null>(null)

  async function appoint() {
    if (!fullName.trim() || !email.trim()) { onError('Name and email are required.'); return }
    setBusy(true); onError(''); setResult(null)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { site_id: site.id, full_name: fullName.trim(), email: email.trim().toLowerCase(), role: 'director' },
    })
    setBusy(false)
    if (error || data?.error) {
      let detail = data?.error ?? error?.message ?? 'Could not appoint the director.'
      const ctx = (error as unknown as { context?: Response })?.context
      if (ctx && typeof ctx.text === 'function') {
        try { const parsed = JSON.parse(await ctx.text()); if (parsed?.error) detail = parsed.error } catch { /* keep */ }
      }
      onError(detail); return
    }
    setResult({ email: data.email, password: data.temp_password, emailed: !!data.welcome_emailed, existing: !!data.added_existing })
    setFullName(''); setEmail('')
    onDone()
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className={`mt-3 ${BTN2}`}>Appoint a director</button>
  }
  return (
    <div className="mt-3 space-y-2 rounded-md border border-line bg-paper p-3">
      <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className={FIELD} />
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={FIELD} />
      <p className="text-xs text-muted">
        If this email already has a portal account (at another program), that account is added to {site.short_name ?? site.name} as
        director — no second login is created.
      </p>
      <div className="flex gap-2">
        <button onClick={appoint} disabled={busy} className={BTN}>{busy ? 'Appointing…' : 'Appoint'}</button>
        <button onClick={() => setOpen(false)} className={BTN2}>Cancel</button>
      </div>
      {result && (
        <div className="rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm text-ink">
          {result.existing ? (
            <p>{result.email} already had an account; it is now a director of this program{result.emailed ? ' and has been emailed' : ''}.</p>
          ) : (
            <>
              <p className="font-semibold">Director account created</p>
              <p className="mt-1">
                {result.emailed ? 'A welcome email with sign-in details was sent. ' : 'The welcome email could not be sent — pass these on directly. '}
                Email: <span className="font-mono">{result.email}</span>
                {result.password && <> · Temporary password: <span className="font-mono">{result.password}</span></>}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
