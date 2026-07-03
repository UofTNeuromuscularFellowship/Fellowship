import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { roleLabel } from '../lib/format'
import { cohortYears } from '../lib/caseOptions'

interface UserRow {
  id: string; email: string; full_name: string; role: string; status: string; cohort_year: string | null
}

export default function People() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const [users, setUsers] = useState<UserRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'fellow' | 'supervisor' | 'director' | 'admin'>('fellow')
  const [cohort, setCohort] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdCred, setCreatedCred] = useState<{ email: string; password: string } | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, status, cohort_year')
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
    if (error || data?.error) { setMsg(data?.error ?? error?.message ?? 'Could not create the account.'); return }
    setCreatedCred({ email: data.email, password: data.temp_password })
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

      {isDirector && (
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
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="All accounts" sub={`${users.length} people`} />
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
              <div>
                <span className="font-medium text-ink">{u.full_name}</span>
                <span className="ml-2 text-muted">{u.email}</span>
              </div>
              <span className="text-muted">
                {roleLabel(u.role)}{u.cohort_year ? ` · ${u.cohort_year}` : ''}{u.status !== 'active' ? ` · ${u.status}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
