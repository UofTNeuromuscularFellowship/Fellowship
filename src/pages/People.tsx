import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { roleLabel } from '../lib/format'
import { cohortYears } from '../lib/caseOptions'

interface UserRow {
  id: string; email: string; full_name: string; role: string; status: string; cohort_year: string | null
  assistant_emails: string[] | null
}

export default function People() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'director' || profile?.role === 'admin'
  const [users, setUsers] = useState<UserRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'fellow' | 'supervisor' | 'director' | 'admin' | 'assistant'>('fellow')
  const [cohort, setCohort] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdCred, setCreatedCred] = useState<{ user_id: string; email: string; password: string } | null>(null)
  const [emailedCreate, setEmailedCreate] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, status, cohort_year, assistant_emails')
      .order('full_name')
    if (error) setMsg(error.message)
    setUsers((data as UserRow[]) ?? [])
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function createUser() {
    if (!fullName.trim() || !email.trim()) { setMsg('Name and email are required.'); return }
    setBusy(true); setMsg(null); setCreatedCred(null)
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        cohort_year: role === 'fellow' ? (cohort || null) : null,
      },
    })
    setBusy(false)
    if (error || data?.error) {
      let detail = data?.error ?? error?.message ?? 'Could not create the account.'
      // supabase.functions.invoke hides the response body on non-2xx; read it out
      const ctx = (error as unknown as { context?: Response })?.context
      if (ctx && typeof ctx.text === 'function') {
        try {
          const body = await ctx.text()
          const parsed = JSON.parse(body)
          if (parsed?.error) detail = parsed.error
        } catch { /* keep the generic message */ }
      }
      setMsg(detail)
      return
    }
    setCreatedCred({ user_id: data.user_id, email: data.email, password: data.temp_password })
    setEmailedCreate(false)
    setFullName(''); setEmail('')
    load()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">People</h1>
        <p className="mt-1 text-sm text-muted">Fellows, supervisors, and program accounts</p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {canManage && (
        <Card>
          <CardHeader
            title="Add a person"
            sub="A temporary password is generated for them; they'll be required to set their own at first sign-in"
          />
          <div className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-muted">Full name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
              </div>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-muted">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
                  <option value="fellow">Fellow</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="director">Director</option>
                  <option value="admin">Admin</option>
                  <option value="assistant">Administrative assistant</option>
                </select>
              </div>
              {role === 'fellow' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Cohort</label>
                  <select value={cohort} onChange={(e) => setCohort(e.target.value)}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
                    <option value="">—</option>
                    {cohortYears().map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
              <button onClick={createUser} disabled={busy}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? 'Creating…' : 'Create account'}
              </button>
            </div>

            {createdCred && (
              <div className="rounded-md border border-accent bg-accent-soft px-4 py-3 text-sm">
                <p className="font-semibold text-ink">Account created — share these sign-in details now</p>
                <p className="mt-1 text-ink">
                  Email: <span className="font-mono">{createdCred.email}</span><br />
                  Temporary password: <span className="font-mono font-semibold">{createdCred.password}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  This password is shown only once. They'll be prompted to choose their own the first time they sign in.
                </p>
                <button
                  onClick={async () => {
                    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
                      body: { action: 'email_temp_password', user_id: createdCred.user_id, temp_password: createdCred.password },
                    })
                    if (error || data?.error) { setMsg(data?.error ?? error?.message ?? 'Could not send the email.'); return }
                    setEmailedCreate(true)
                  }}
                  className="mt-2 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft">
                  {emailedCreate ? 'Emailed ✓' : 'Email login details to user'}
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="All accounts" sub={`${users.length} people`} />
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <UserItem key={u.id} user={u} canManage={canManage} onChanged={load} onError={setMsg} />
          ))}
        </ul>
      </Card>
    </div>
  )
}

function UserItem({ user, canManage, onChanged, onError }: {
  user: UserRow; canManage: boolean; onChanged: () => void; onError: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState(user.role)
  const [busy, setBusy] = useState<string | null>(null)
  const [resetCred, setResetCred] = useState<string | null>(null)
  const [emailedReset, setEmailedReset] = useState(false)

  async function call(action: string, body: Record<string, unknown>) {
    setBusy(action); onError('')
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action, user_id: user.id, ...body },
    })
    setBusy(null)
    if (error || data?.error) { onError(data?.error ?? error?.message ?? 'Action failed.'); return null }
    return data
  }

  async function saveRole() {
    if (role === user.role) { setOpen(false); return }
    const r = await call('set_role', { role })
    if (r) onChanged()
  }

  async function toggleStatus() {
    const next = user.status === 'active' ? 'inactive' : 'active'
    const r = await call('set_status', { status: next })
    if (r) onChanged()
  }

  async function resetPassword() {
    const r = await call('reset_password', {})
    if (r?.temp_password) { setResetCred(r.temp_password); setEmailedReset(false) }
  }

  const inactive = user.status !== 'active'

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <div className={inactive ? 'opacity-60' : ''}>
          <span className="font-medium text-ink">{user.full_name}</span>
          <span className="ml-2 text-muted">{user.email}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted">
            {roleLabel(user.role)}{user.cohort_year ? ` · ${user.cohort_year}` : ''}{inactive ? ` · ${user.status}` : ''}
          </span>
          {canManage && (
            <button onClick={() => setOpen(!open)} className="text-xs font-medium text-accent hover:underline">
              {open ? 'Close' : 'Manage'}
            </button>
          )}
        </div>
      </div>

      {open && canManage && (
        <div className="mt-3 space-y-3 rounded-md border border-line p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink">
                <option value="fellow">Fellow</option>
                <option value="supervisor">Supervisor</option>
                <option value="director">Director</option>
                <option value="admin">Admin</option>
                <option value="assistant">Administrative assistant</option>
              </select>
            </div>
            <button onClick={saveRole} disabled={busy !== null || role === user.role}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-40">
              {busy === 'set_role' ? 'Saving…' : 'Save role'}
            </button>
          </div>

          {(user.role === 'supervisor' || user.role === 'director') && (
            <AssistantLinksEditor providerId={user.id} onError={onError} />
          )}

          {user.role !== 'fellow' && user.role !== 'assistant' && (
            <AssistantEmailsEditor user={user} onChanged={onChanged} onError={onError} />
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <button onClick={toggleStatus} disabled={busy !== null}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper disabled:opacity-40">
              {busy === 'set_status' ? 'Working…' : inactive ? 'Reactivate account' : 'Deactivate account'}
            </button>
            <button onClick={resetPassword} disabled={busy !== null}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper disabled:opacity-40">
              {busy === 'reset_password' ? 'Resetting…' : 'Reset password'}
            </button>
          </div>

          {inactive && (
            <p className="text-xs text-muted">
              Deactivated accounts can't sign in and are skipped by schedule generation and emails.
            </p>
          )}

          {resetCred && (
            <div className="rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm">
              <p className="font-semibold text-ink">New temporary password — share it now</p>
              <p className="mt-1 font-mono font-semibold text-ink">{resetCred}</p>
              <p className="mt-1 text-xs text-muted">Shown once. They'll set their own at next sign-in.</p>
              <button
                onClick={async () => {
                  const r = await call('email_temp_password', { temp_password: resetCred })
                  if (r) setEmailedReset(true)
                }}
                className="mt-2 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft">
                {emailedReset ? 'Emailed ✓' : 'Email new password to user'}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function AssistantEmailsEditor({ user, onChanged, onError }: {
  user: { id: string; assistant_emails: string[] | null }; onChanged: () => void; onError: (m: string) => void
}) {
  const [emails, setEmails] = useState<string[]>(user.assistant_emails ?? [])
  const [draft, setDraft] = useState('')

  async function save(next: string[]) {
    setEmails(next)
    const { error } = await supabase.from('users')
      .update({ assistant_emails: next, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) { onError(error.message); return }
    onChanged()
  }

  function add() {
    const v = draft.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { onError('Please enter a valid email address.'); return }
    if (emails.includes(v)) { setDraft(''); return }
    save([...emails, v]); setDraft('')
  }

  return (
    <div className="border-t border-line pt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Admin assistant emails — copied on every email the portal sends this person
      </p>
      {emails.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {emails.map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink">
              {e}
              <button onClick={() => save(emails.filter((x) => x !== e))} className="text-muted hover:text-ink">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="assistant@hospital.ca, then press Enter"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink"
        />
        <button onClick={add}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline">
          Add
        </button>
      </div>
    </div>
  )
}

interface AssistantOpt { id: string; full_name: string; email: string }

function AssistantLinksEditor({ providerId, onError }: { providerId: string; onError: (m: string) => void }) {
  const [linked, setLinked] = useState<{ assistant_id: string; full_name: string; email: string }[]>([])
  const [all, setAll] = useState<AssistantOpt[]>([])
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [{ data: l }, { data: a }] = await Promise.all([
      supabase.rpc('provider_assistant_names', { p_provider: providerId }),
      supabase.rpc('list_assistants'),
    ])
    setLinked((l as { assistant_id: string; full_name: string; email: string }[]) ?? [])
    setAll((a as AssistantOpt[]) ?? [])
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

  async function remove(assistantId: string) {
    const { error } = await supabase.from('provider_assistants').delete()
      .eq('provider_id', providerId).eq('assistant_id', assistantId)
    if (error) { onError(error.message); return }
    load()
  }

  const linkedIds = new Set(linked.map((x) => x.assistant_id))
  const available = all.filter((a) => !linkedIds.has(a.id))

  return (
    <div className="border-t border-line pt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Administrative assistants — can log in and manage this provider's schedule
      </p>
      {linked.length > 0 && (
        <ul className="mb-2 space-y-1">
          {linked.map((a) => (
            <li key={a.assistant_id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink">{a.full_name} <span className="text-muted">· {a.email}</span></span>
              <button onClick={() => remove(a.assistant_id)} className="text-xs font-medium text-muted hover:text-ink">Remove</button>
            </li>
          ))}
        </ul>
      )}
      {all.length === 0 ? (
        <p className="text-xs text-muted">No assistant accounts yet. Create one above with the "Administrative assistant" role, then link it here.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select value={choice} onChange={(e) => setChoice(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink">
            <option value="">Add an assistant…</option>
            {available.map((a) => <option key={a.id} value={a.id}>{a.full_name} · {a.email}</option>)}
          </select>
          <button onClick={add} disabled={busy || !choice}
            className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50">Link</button>
        </div>
      )}
    </div>
  )
}
