import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { AssistantEmailsCard } from '../components/AssistantEmails'

export default function Settings() {
  const { profile } = useAuth()
  const [msg, setMsg] = useState<string | null>(null)

  if (!profile) return null
  const isDirector = profile.role === 'director'
  const hasAssistants = profile.role === 'supervisor' || profile.role === 'director'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          {isDirector ? 'Your account, program configuration, and announcements' : 'Your account settings'}
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      <ChangePasswordCard />
      {hasAssistants && <ProviderAssistantLogins providerId={profile.id} onError={setMsg} />}
      {hasAssistants && <AssistantEmailsCard userId={profile.id} />}

      {isDirector && (
        <>
          <Broadcast onError={setMsg} />
          <RequestAwayDates onError={setMsg} />
          <ScheduleCcEmails onError={setMsg} />
          <PubmedTerms onError={setMsg} />
        </>
      )}
    </div>
  )
}

function ChangePasswordCard() {
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | string>('idle')

  async function save() {
    if (pw1.length < 8) { setStatus('Password must be at least 8 characters.'); return }
    if (pw1 !== pw2) { setStatus('Passwords do not match.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) { setStatus(error.message); return }
    setPw1(''); setPw2('')
    setStatus('saved'); setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <Card>
      <CardHeader title="Change password" sub="Choose a new password for your account (at least 8 characters)" />
      <div className="flex flex-wrap items-end gap-2 px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">New password</label>
          <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password"
            className="w-52 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Confirm new password</label>
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password"
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            className="w-52 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <button onClick={save} disabled={busy || !pw1 || !pw2}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save new password'}
        </button>
        {status !== 'idle' && status !== 'saved' && (
          <p className="w-full text-sm text-red-700">{status}</p>
        )}
      </div>
    </Card>
  )
}

function Broadcast({ onError }: { onError: (m: string) => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'fellow' | 'all'>('fellow')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function send() {
    if (!title.trim()) return
    setBusy(true)
    const { data, error } = await supabase.rpc('send_director_note', {
      p_title: title.trim(),
      p_body: body.trim() || null,
      p_audience: audience === 'fellow' ? 'fellow' : 'all',
      p_email: true,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    if ((data as number) === 0) { onError('No recipients found.'); return }
    setTitle(''); setBody(''); setSent(true); setTimeout(() => setSent(false), 2500)
  }

  return (
    <Card>
      <CardHeader
        title="Send a note"
        sub="Appears at the top of each recipient's dashboard until they acknowledge it"
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g., 'Journal Club moved to Friday')"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          <select value={audience} onChange={(e) => setAudience(e.target.value as 'fellow' | 'all')}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="fellow">Fellows only</option>
            <option value="all">Everyone</option>
          </select>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Details (optional)"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        <button onClick={send} disabled={busy || !title.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Sending…' : sent ? 'Sent ✓' : 'Send note'}
        </button>
      </div>
    </Card>
  )
}

function PubmedTerms({ onError }: { onError: (m: string) => void }) {
  const [terms, setTerms] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'pubmed_terms').maybeSingle()
      .then(({ data }) => setTerms(((data?.value as string[]) ?? [])))
  }, [])

  async function save(next: string[]) {
    setTerms(next)
    setBusy(true)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'pubmed_terms', value: next, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) { onError(error.message); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader
        title="Interesting reads — PubMed search terms"
        sub="The dashboard feed refreshes weekly with recent publications matching any of these terms"
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {terms.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink">
              {t}
              <button onClick={() => save(terms.filter((x) => x !== t))} className="text-muted hover:text-ink">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { save([...terms, draft.trim()]); setDraft('') } }}
            placeholder="Add a search term and press Enter"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <p className="text-xs text-muted">{busy ? 'Saving…' : saved ? 'Saved ✓' : ' '}</p>
      </div>
    </Card>
  )
}

function ScheduleCcEmails({ onError }: { onError: (m: string) => void }) {
  const [teaching, setTeaching] = useState<string[]>([])
  const [clinic, setClinic] = useState<string[]>([])
  const [draftT, setDraftT] = useState('')
  const [draftC, setDraftC] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved'>('idle')

  useEffect(() => {
    supabase.from('app_settings').select('key, value').in('key', ['teaching_cc_emails', 'clinic_cc_emails'])
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.key === 'teaching_cc_emails') setTeaching((row.value as string[]) ?? [])
          if (row.key === 'clinic_cc_emails') setClinic((row.value as string[]) ?? [])
        }
      })
  }, [])

  async function save(key: string, list: string[]) {
    const { error } = await supabase.from('app_settings')
      .upsert({ key, value: list, updated_at: new Date().toISOString() })
    if (error) { onError(error.message); return }
    setStatus('saved'); setTimeout(() => setStatus('idle'), 1500)
  }

  function isEmail(v: string) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) }

  function addTo(which: 'teaching' | 'clinic', value: string) {
    const v = value.trim().toLowerCase()
    if (!isEmail(v)) { onError('Please enter a valid email address.'); return }
    if (which === 'teaching') {
      if (teaching.includes(v)) return
      const next = [...teaching, v]; setTeaching(next); setDraftT(''); save('teaching_cc_emails', next)
    } else {
      if (clinic.includes(v)) return
      const next = [...clinic, v]; setClinic(next); setDraftC(''); save('clinic_cc_emails', next)
    }
  }

  function removeFrom(which: 'teaching' | 'clinic', value: string) {
    if (which === 'teaching') {
      const next = teaching.filter((x) => x !== value); setTeaching(next); save('teaching_cc_emails', next)
    } else {
      const next = clinic.filter((x) => x !== value); setClinic(next); save('clinic_cc_emails', next)
    }
  }

  function ListEditor({ which, list, draft, setDraft }: {
    which: 'teaching' | 'clinic'; list: string[]; draft: string; setDraft: (v: string) => void
  }) {
    return (
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          {which === 'teaching' ? 'Teaching schedule — copied on publish' : 'Clinic schedule — copied on publish'}
        </p>
        {list.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {list.map((e) => (
              <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink">
                {e}
                <button onClick={() => removeFrom(which, e)} className="text-muted hover:text-ink">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTo(which, draft) }}
            placeholder="name@example.com, then press Enter"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <button onClick={() => addTo(which, draft)}
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-accent hover:underline">
            Add
          </button>
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Schedule email CC list"
        sub="Extra addresses copied whenever a schedule is published — e.g. a program coordinator or admin assistant who isn't a portal user. These receive the same 'schedule updated' email."
      />
      <div className="space-y-5 px-5 py-4">
        <ListEditor which="teaching" list={teaching} draft={draftT} setDraft={setDraftT} />
        <ListEditor which="clinic" list={clinic} draft={draftC} setDraft={setDraftC} />
        <p className="text-xs text-muted">{status === 'saved' ? 'Saved ✓' : 'Changes save automatically.'}</p>
      </div>
    </Card>
  )
}

function RequestAwayDates({ onError }: { onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<number | null>(null)
  const [audience, setAudience] = useState<'everyone' | 'fellows' | 'supervisors'>('everyone')

  async function push() {
    setBusy(true); setResult(null)
    const { data, error } = await supabase.rpc('request_vacation_submissions', { p_audience: audience })
    setBusy(false)
    if (error) { onError(error.message); return }
    setResult(data as number)
  }

  return (
    <Card>
      <CardHeader
        title="Request away dates"
        sub="Emails the group you choose, asking them to submit vacation and away dates in the portal, so the next clinic and teaching schedules can be built around them."
      />
      <div className="space-y-3 px-5 py-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Who to email</p>
          <div className="flex flex-wrap gap-2">
            {([['everyone', 'Everyone'], ['fellows', 'All fellows'], ['supervisors', 'All supervisors']] as const).map(([val, label]) => (
              <button key={val} onClick={() => { setAudience(val); setResult(null) }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  audience === val ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={push} disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Sending…' : 'Send request'}
          </button>
          {result !== null && (
            <span className="text-sm text-muted">
              {result === 0 ? 'No one matched that group.' : `Emailed ${result} ${result === 1 ? 'person' : 'people'} ✓`}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

interface AsstOpt { id: string; full_name: string; email: string }

function ProviderAssistantLogins({ providerId, onError }: { providerId: string; onError: (m: string) => void }) {
  const [linked, setLinked] = useState<{ assistant_id: string; full_name: string; email: string }[]>([])
  const [all, setAll] = useState<AsstOpt[]>([])
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: l }, { data: a }] = await Promise.all([
      supabase.rpc('provider_assistant_names', { p_provider: providerId }),
      supabase.rpc('list_assistants'),
    ])
    setLinked((l as { assistant_id: string; full_name: string; email: string }[]) ?? [])
    setAll((a as AsstOpt[]) ?? [])
  }
  useEffect(() => { load() }, [providerId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!choice) return
    setBusy(true)
    const { error } = await supabase.from('provider_assistants').insert({ provider_id: providerId, assistant_id: choice })
    setBusy(false)
    if (error) { onError(error.message); return }
    setChoice(''); load()
  }
  async function remove(id: string) {
    const { error } = await supabase.from('provider_assistants').delete().eq('provider_id', providerId).eq('assistant_id', id)
    if (error) { onError(error.message); return }
    load()
  }

  const linkedIds = new Set(linked.map((x) => x.assistant_id))
  const available = all.filter((a) => !linkedIds.has(a.id))

  return (
    <Card>
      <CardHeader
        title="Assistant logins"
        sub="Assistants you link here can sign in with their own account and manage your away dates, teaching sessions, and clinic cancellations on your behalf. Their account is created by the fellowship director."
      />
      <div className="space-y-3 px-5 py-4">
        {linked.length > 0 && (
          <ul className="space-y-1">
            {linked.map((a) => (
              <li key={a.assistant_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-ink">{a.full_name} <span className="text-muted">· {a.email}</span></span>
                <button onClick={() => remove(a.assistant_id)} className="text-xs font-medium text-muted hover:text-ink">Remove</button>
              </li>
            ))}
          </ul>
        )}
        {all.length === 0 ? (
          <p className="text-sm text-muted">No assistant accounts exist yet. Ask the fellowship director to create one (People → Add a person → Administrative assistant), then link it here.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <select value={choice} onChange={(e) => setChoice(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="">Add an assistant…</option>
              {available.map((a) => <option key={a.id} value={a.id}>{a.full_name} · {a.email}</option>)}
            </select>
            <button onClick={add} disabled={busy || !choice}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Link assistant</button>
          </div>
        )}
      </div>
    </Card>
  )
}
