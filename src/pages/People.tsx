import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { roleLabel, localToday } from '../lib/format'
import { niceDay } from '../components/ui/Wizard'
import { RoundsToggle, useRoundsManagers, WhoRunsRounds } from '../components/RoundsManagers'

interface UserRow {
  id: string; email: string; full_name: string; role: string; status: string; cohort_year: string | null
  assistant_emails: string[] | null
  teaching_only: boolean
  fellowship_start: string | null
  fellowship_end: string | null
}

export default function People() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'director' || profile?.role === 'admin'
  const isDirector = profile?.role === 'director'
  const [users, setUsers] = useState<UserRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [tab, setTab] = useState<'accounts' | 'permissions'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'permissions' ? 'permissions' : 'accounts')
  const rounds = useRoundsManagers()

  async function load() {
    // site_users: the people of THIS program, with the role they hold here
    // (someone can be a supervisor here and a fellow at another program).
    const { data, error } = await supabase
      .from('site_users')
      .select('id, email, full_name, role, status, cohort_year, assistant_emails, teaching_only, fellowship_start, fellowship_end')
      .order('full_name')
    if (error) setMsg(error.message)
    setUsers((data as UserRow[]) ?? [])
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">User management</h1>
          <p className="mt-1 text-sm text-muted">Fellows, supervisors and program accounts, and what each of them can do</p>
        </div>
        {canManage && (
          <Link to="/people/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            + Add people
          </Link>
        )}
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {canManage && (
        <div role="tablist" className="flex gap-1 border-b border-line">
          {([['accounts', 'Accounts'], ['permissions', 'Permissions']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      )}

      {canManage && tab === 'permissions' ? (
        <div className="space-y-6">
          <WhoRunsRounds />
          <AssistantsSection users={users} onError={setMsg} />
        </div>
      ) : (
        <Card>
          <CardHeader title="All accounts" sub={`${users.length} people`} />
          {rounds.error && <p className="px-5 pt-3 text-sm text-rose-700 dark:text-rose-300">{rounds.error}</p>}
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <UserItem key={u.id} user={u} canManage={canManage} onChanged={load} onError={setMsg}
                runsRounds={!!rounds.managers?.has(u.id)}
                roundsSlot={u.role === 'supervisor' && canManage
                  ? <RoundsToggle userId={u.id} managers={rounds.managers} canEdit={isDirector} onSet={(id, on) => { void rounds.set(id, on) }} />
                  : null} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function UserItem({ user, canManage, onChanged, onError, runsRounds = false, roundsSlot = null }: {
  user: UserRow; canManage: boolean; onChanged: () => void; onError: (m: string) => void
  /** Allowed to run rounds (shown beside the role). */
  runsRounds?: boolean
  /** The "Can run rounds" checkbox, for supervisors. */
  roundsSlot?: React.ReactNode
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
            {user.role === 'fellow' && (user.fellowship_start || user.fellowship_end)
              ? ` · ${niceDay(user.fellowship_start) || '?'} – ${niceDay(user.fellowship_end) || '?'}` : ''}
            {user.teaching_only ? ' · teaching only' : ''}{runsRounds ? ' · runs rounds' : ''}{inactive ? ` · ${user.status}` : ''}
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

          {user.role === 'fellow' && (
            <FellowshipDates user={user} onChanged={onChanged} onError={onError} />
          )}

          {user.role === 'supervisor' && (
            <TeachingOnlyToggle user={user} onChanged={onChanged} onError={onError} />
          )}

          {roundsSlot}

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

const REASONS: [string, string][] = [
  ['initial', 'Setting the dates'],
  ['extension', 'Extension'],
  ['leave', 'Leave of absence'],
  ['early_finish', 'Finishing early'],
  ['correction', 'Correcting a mistake'],
]
const REASON_LABEL = Object.fromEntries(REASONS)

interface DateChange {
  id: string; old_start: string | null; old_end: string | null; new_start: string | null; new_end: string | null
  reason: string; note: string | null; changed_by: string | null; changed_at: string
}

/**
 * A fellow's start and end dates, and every change to them. Changes go
 * through set_fellowship_dates(), which records who made them and why.
 */
function FellowshipDates({ user, onChanged, onError }: {
  user: UserRow; onChanged: () => void; onError: (m: string) => void
}) {
  const hasDates = !!(user.fellowship_start || user.fellowship_end)
  const [start, setStart] = useState(user.fellowship_start ?? '')
  const [end, setEnd] = useState(user.fellowship_end ?? '')
  const [reason, setReason] = useState(hasDates ? 'extension' : 'initial')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [history, setHistory] = useState<DateChange[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  // clinic days left outside the dates after a save, offered for removal
  const [outside, setOutside] = useState<string[]>([])
  const [trimmed, setTrimmed] = useState<string | null>(null)

  async function loadHistory() {
    const { data } = await supabase.from('fellowship_changes')
      .select('id, old_start, old_end, new_start, new_end, reason, note, changed_by, changed_at')
      .eq('user_id', user.id).order('changed_at', { ascending: false })
    const rows = (data as DateChange[]) ?? []
    setHistory(rows)
    const ids = Array.from(new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x)))
    if (ids.length) {
      const { data: n } = await supabase.rpc('profile_names', { ids })
      setNames(Object.fromEntries(((n as { id: string; full_name: string }[]) ?? []).map((x) => [x.id, x.full_name])))
    }
  }
  useEffect(() => { loadHistory() }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const changed = start !== (user.fellowship_start ?? '') || end !== (user.fellowship_end ?? '')

  async function save() {
    if (start && end && end < start) { onError('The fellowship ends before it starts.'); return }
    setBusy(true); onError('')
    const { error } = await supabase.rpc('set_fellowship_dates', {
      p_user: user.id, p_start: start || null, p_end: end || null, p_reason: reason, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    setNote(''); setSaved(true); setTimeout(() => setSaved(false), 2000)
    await loadHistory()
    // the clinic schedule only runs inside the fellowship: anything left outside?
    const today = localToday()
    const { data: rows } = await supabase.from('clinic_rotations').select('rotation_date')
      .eq('fellow_id', user.id).gte('rotation_date', today)
    setOutside(((rows as { rotation_date: string }[]) ?? []).map((r) => r.rotation_date)
      .filter((d) => (start && d < start) || (end && d > end)).sort())
    setTrimmed(null)
    onChanged()
  }

  async function trim() {
    setBusy(true)
    const { data, error } = await supabase.rpc('apply_clinic_changes', {
      p_kind: 'fellowship',
      p_summary: `${user.full_name}: clinic days outside the fellowship (${span(start || null, end || null)}) removed`,
      p_ops: outside.map((d) => ({ fellow_id: user.id, date: d, mode: 'free' })),
      p_setup: {}, p_notify: true,
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    const r = data as { changed: number; told: number }
    setOutside([])
    setTrimmed(`Removed ${r.changed} clinic day${r.changed === 1 ? '' : 's'}${r.told ? ` and emailed ${r.told} ${r.told === 1 ? 'person' : 'people'}` : ''}.`)
  }

  const span = (a: string | null, b: string | null) => `${niceDay(a) || '—'} – ${niceDay(b) || '—'}`

  return (
    <div className="border-t border-line pt-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Fellowship dates</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`fs-${user.id}`}>Starts</label>
          <input id={`fs-${user.id}`} type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`fe-${user.id}`}>Ends</label>
          <input id={`fe-${user.id}`} type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
        </div>
        {changed && <>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`fr-${user.id}`}>Why</label>
            <select id={`fr-${user.id}`} value={reason} onChange={(e) => setReason(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink">
              {REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor={`fn-${user.id}`}>Note (optional)</label>
            <input id={`fn-${user.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. extended for research block"
              className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink" />
          </div>
        </>}
        <button onClick={save} disabled={busy || !changed}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:underline disabled:opacity-40">
          {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save dates'}
        </button>
      </div>
      {outside.length > 0 && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {outside.length} clinic day{outside.length === 1 ? ' is' : 's are'} on the schedule outside these dates ({outside.slice(0, 3).map((d) => niceDay(d)).join(', ')}{outside.length > 3 ? '…' : ''}).{' '}
          <button type="button" onClick={trim} disabled={busy} className="font-semibold underline">Remove {outside.length === 1 ? 'it' : 'them'} and tell the people affected</button>
        </div>
      )}
      {trimmed && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{trimmed}</p>}
      <Link to={`/change/fellowship?fellow=${user.id}`} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">
        Extended or finishing early? Make the change step by step →
      </Link>
      {history.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {history.map((h) => (
            <li key={h.id}>
              {niceDay(h.changed_at.slice(0, 10))} · {REASON_LABEL[h.reason] ?? h.reason}:{' '}
              {h.old_start || h.old_end ? `${span(h.old_start, h.old_end)} → ` : ''}{span(h.new_start, h.new_end)}
              {h.changed_by && names[h.changed_by] ? ` · ${names[h.changed_by]}` : ''}
              {h.note ? ` · “${h.note}”` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
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
          No assistant accounts yet. Use “Add people” with the “Administrative assistant” role — you can choose who they work for as you add them.
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
