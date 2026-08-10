import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { roleLabel } from '../lib/format'
import { cohortYears } from '../lib/caseOptions'

interface UserRow {
  id: string; email: string; full_name: string; role: string; status: string; cohort_year: string | null
  assistant_emails: string[] | null
  teaching_only: boolean
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
      .select('id, email, full_name, role, status, cohort_year, assistant_emails, teaching_only')
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
    setEmailedCreate(!!data.welcome_emailed)
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
                <p className="font-semibold text-ink">Account created</p>
                <p className="mt-1 text-ink">
                  {emailedCreate
                    ? 'A welcome email with sign-in details was sent to them automatically. You can also share these directly:'
                    : 'The welcome email couldn’t be sent automatically — share these sign-in details directly:'}
                </p>
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
                  {emailedCreate ? 'Resend login details' : 'Email login details to user'}
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {canManage && <AssistantsSection users={users} onError={setMsg} />}

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
            {roleLabel(user.role)}{user.cohort_year ? ` · ${user.cohort_year}` : ''}
            {user.teaching_only ? ' · teaching only' : ''}{inactive ? ` · ${user.status}` : ''}
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

          {user.role === 'supervisor' && (
            <TeachingOnlyToggle user={user} onChanged={onChanged} onError={onError} />
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

function TeachingOnlyToggle({ user, onChanged, onError }: {
  user: { id: string; teaching_only: boolean }; onChanged: () => void; onError: (m: string) => void
}) {
  const [on, setOn] = useState(user.teaching_only)
  const [busy, setBusy] = useState(false)

  async function toggle(next: boolean) {
    setBusy(true); setOn(next); onError('')
    const { error } = await supabase.from('users')
      .update({ teaching_only: next, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    setBusy(false)
    if (error) { setOn(!next); onError(error.message); return }
    onChanged()
  }

  return (
    <div className="border-t border-line pt-3">
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-line text-accent"
        />
        <span>
          <span className="font-medium">Teaching only — runs no fellowship clinics</span>
          <span className="mt-0.5 block text-xs text-muted">
            They stay fully in the teaching schedule: assignable as a teacher, and they still receive the
            published teaching schedule, session reminders, Journal Club announcements and away-date requests.
            They are left off the clinic schedule email and the clinic view.
          </span>
        </span>
      </label>
    </div>
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

interface Link { provider_id: string; assistant_id: string }

function AssistantsSection({ users, onError }: { users: UserRow[]; onError: (m: string) => void }) {
  const [links, setLinks] = useState<Link[]>([])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('provider_assistants').select('provider_id, assistant_id')
    if (error) { onError(error.message); return }
    setLinks((data as Link[]) ?? [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const assistants = users.filter((u) => u.role === 'assistant' && u.status === 'active')
  const providers = users.filter((u) => (u.role === 'supervisor' || u.role === 'director') && u.status === 'active')
  const nameById = new Map(users.map((u) => [u.id, u.full_name]))

  async function addLink(assistantId: string, providerId: string) {
    if (!providerId) return
    setBusy(true)
    const { error } = await supabase.from('provider_assistants').insert({ provider_id: providerId, assistant_id: assistantId })
    setBusy(false)
    if (error) { onError(error.message); return }
    setChoice((c) => ({ ...c, [assistantId]: '' })); load()
  }
  async function removeLink(assistantId: string, providerId: string) {
    const { error } = await supabase.from('provider_assistants').delete()
      .eq('assistant_id', assistantId).eq('provider_id', providerId)
    if (error) { onError(error.message); return }
    load()
  }

  return (
    <Card>
      <CardHeader
        title="Administrative assistants"
        sub="Link each assistant to the provider(s) whose schedule they manage on their behalf. Providers can also add their own assistants from Settings."
      />
      {assistants.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          No assistant accounts yet. Add one above with the "Administrative assistant" role, then link it to a provider here.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {assistants.map((a) => {
            const linkedProviderIds = links.filter((l) => l.assistant_id === a.id).map((l) => l.provider_id)
            const available = providers.filter((p) => !linkedProviderIds.includes(p.id))
            return (
              <li key={a.id} className="px-5 py-4">
                <div className="mb-1.5">
                  <span className="font-medium text-ink">{a.full_name}</span>
                  <span className="ml-2 text-sm text-muted">{a.email}</span>
                </div>
                {linkedProviderIds.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {linkedProviderIds.map((pid) => (
                      <span key={pid} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink">
                        {nameById.get(pid) ?? 'Provider'}
                        <button onClick={() => removeLink(a.id, pid)} className="text-muted hover:text-ink" title="Unlink">×</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mb-2 text-xs text-muted">Not linked to any provider yet.</p>
                )}
                {available.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <select value={choice[a.id] ?? ''} onChange={(e) => setChoice((c) => ({ ...c, [a.id]: e.target.value }))}
                      className="min-w-0 max-w-xs flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink">
                      <option value="">Link to a provider…</option>
                      {available.map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}{p.role === 'director' ? ' (director)' : ''}</option>
                      ))}
                    </select>
                    <button onClick={() => addLink(a.id, choice[a.id] ?? '')} disabled={busy || !choice[a.id]}
                      className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-50">Link</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
