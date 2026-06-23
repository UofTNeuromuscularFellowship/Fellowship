import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AppUser, UserRole } from '../types/database'

const FIELD = 'mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft'
const ROLES: UserRole[] = ['fellow', 'supervisor', 'director', 'admin']

export function UserForm({
  existing, onClose, onSaved,
}: {
  existing?: AppUser | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!existing
  const [email, setEmail] = useState(existing?.email ?? '')
  const [fullName, setFullName] = useState(existing?.full_name ?? '')
  const [role, setRole] = useState<UserRole>(existing?.role ?? 'fellow')
  const [cohortYear, setCohortYear] = useState(existing?.cohort_year ?? '')
  const [duration, setDuration] = useState<string>(existing?.duration_years?.toString() ?? '')
  const [startDate, setStartDate] = useState(existing?.start_date ?? '')
  const [endDate, setEndDate] = useState(existing?.end_date ?? '')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ email: string; emailed: boolean; link?: string } | null>(null)

  const isFellow = role === 'fellow'

  async function save() {
    setError(null)
    if (!fullName.trim() || (!isEdit && !email.trim())) {
      setError('Name and email are required.')
      return
    }
    setBusy(true)

    const fields = {
      full_name: fullName.trim(),
      role,
      cohort_year: isFellow ? (cohortYear || null) : null,
      duration_years: isFellow && duration ? Number(duration) : null,
      start_date: isFellow ? (startDate || null) : null,
      end_date: isFellow ? (endDate || null) : null,
    }

    if (isEdit) {
      const { error } = await supabase.from('users')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', existing!.id)
      setBusy(false)
      if (error) { setError(error.message); return }
      onSaved()
    } else {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email: email.trim(), ...fields },
      })
      setBusy(false)
      if (error) {
        let msg = error.message
        try {
          const ctx = (error as { context?: Response }).context
          if (ctx && typeof ctx.json === 'function') {
            const j = await ctx.json()
            if (j?.error) msg = j.error
          }
        } catch { /* keep generic message */ }
        setError(msg); return
      }
      if (data?.error) { setError(data.error); return }
      setInvite({ email: email.trim(), emailed: !!data?.email_sent, link: data?.action_link })
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="my-8 w-full max-w-lg rounded-lg bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{isEdit ? 'Edit user' : 'Add user'}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">×</button>
        </div>

        {invite ? (
          <div className="space-y-4 px-5 py-6">
            {invite.emailed ? (
              <p className="text-sm text-ink">
                Invitation emailed to <span className="font-medium">{invite.email}</span>. They'll
                set their own password from the link and can then sign in.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink">
                  Account created for <span className="font-medium">{invite.email}</span>, but the
                  invite email couldn't be sent. Share this one-time setup link with them directly:
                </p>
                <div className="rounded-md bg-paper px-3 py-2 break-all font-mono text-xs text-ink select-all">{invite.link}</div>
              </>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-sm font-medium text-ink">Full name</span>
                <input className={FIELD} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Email</span>
                <input className={FIELD} value={email} disabled={isEdit} onChange={(e) => setEmail(e.target.value)} placeholder="name@hospital.ca" />
                {isEdit && <span className="mt-1 block text-xs text-muted">Email can't be changed here.</span>}
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Role</span>
                <select className={FIELD} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </label>

              {isFellow && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm font-medium text-ink">Cohort year</span>
                    <input className={FIELD} value={cohortYear} onChange={(e) => setCohortYear(e.target.value)} placeholder="2026-27" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-ink">Duration (years)</span>
                    <select className={FIELD} value={duration} onChange={(e) => setDuration(e.target.value)}>
                      <option value="">—</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-ink">Start date</span>
                    <input type="date" className={FIELD} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-ink">End date</span>
                    <input type="date" className={FIELD} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </label>
                </div>
              )}

              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:text-ink">Cancel</button>
              <button onClick={save} disabled={busy} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50">
                {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
