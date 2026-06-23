import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import { UserForm } from '../components/UserForm'
import type { AppUser, UserRole, UserStatus } from '../types/database'

const ROLES: UserRole[] = ['fellow', 'supervisor', 'director', 'admin']
const STATUSES: UserStatus[] = ['active', 'alumni', 'inactive']

export default function People() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('users').select('*').order('full_name', { ascending: true })
    setUsers((data as AppUser[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function patch(id: string, fields: Partial<AppUser>) {
    setUsers((p) => p.map((u) => (u.id === id ? { ...u, ...fields } : u)))
    await supabase.from('users').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">People</h1>
          <p className="mt-1 text-sm text-muted">Manage fellows, faculty, and program staff</p>
        </div>
        <button onClick={() => setAdding(true)} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
          Add user
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 text-left font-medium">Name</th>
                  <th className="px-3 py-3 text-left font-medium">Role</th>
                  <th className="px-3 py-3 text-left font-medium">Status</th>
                  <th className="px-3 py-3 text-left font-medium">Cohort</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{u.full_name}</div>
                      <div className="text-xs text-muted">{u.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => patch(u.id, { role: e.target.value as UserRole })}
                        className="rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={u.status}
                        onChange={(e) => patch(u.id, { status: e.target.value as UserStatus })}
                        className="rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-muted nums">{u.cohort_year ?? '—'}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => setEditing(u)} className="text-sm font-medium text-accent hover:underline">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {adding && <UserForm onClose={() => setAdding(false)} onSaved={load} />}
      {editing && <UserForm existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}
