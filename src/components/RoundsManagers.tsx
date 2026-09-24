import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from './ui/Card'
import { Notice } from './ui/Wizard'

// ---------------------------------------------------------------------------
// Who, besides the program director, may run rounds: set up a series, manage
// mailing lists, and see RSVPs and feedback. Only the director can change it
// (the rounds_managers policy allows the director alone); the admin can see it.
//
// The same list is offered in three places — User management, Rounds and the
// Events page — so the director finds it wherever they look for it.
// ---------------------------------------------------------------------------

interface Person { id: string; full_name: string; email: string; role: string }

/** The supervisors allowed to run rounds, with a way to change the list. */
export function useRoundsManagers() {
  const [managers, setManagers] = useState<Set<string> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('rounds_managers').select('user_id')
    if (e) setError(e.message)
    setManagers(new Set(((data as { user_id: string }[]) ?? []).map((x) => x.user_id)))
  }, [])
  useEffect(() => { load() }, [load])

  const set = useCallback(async (userId: string, on: boolean): Promise<boolean> => {
    setError(null)
    // Show the change straight away; put it back if the database refuses.
    setManagers((m) => { const n = new Set(m ?? []); if (on) n.add(userId); else n.delete(userId); return n })
    const { error: e } = on
      ? await supabase.from('rounds_managers').insert({ user_id: userId })
      : await supabase.from('rounds_managers').delete().eq('user_id', userId)
    if (e) {
      setError(/row-level security|permission/i.test(e.message) ? 'Only the program director can change who runs rounds.' : e.message)
      await load()
      return false
    }
    return true
  }, [load])

  return { managers, set, error, reload: load }
}

/** One checkbox, for a supervisor's own row in User management. */
export function RoundsToggle({ userId, managers, onSet, canEdit }: {
  userId: string; managers: Set<string> | null; onSet: (id: string, on: boolean) => void; canEdit: boolean
}) {
  return (
    <div className="border-t border-line pt-3">
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line text-accent"
          checked={!!managers?.has(userId)} disabled={!canEdit || !managers}
          onChange={(e) => onSet(userId, e.target.checked)} />
        <span>
          <span className="font-medium">Can run rounds</span>
          <span className="mt-0.5 block text-xs text-muted">
            Lets them set up rounds, manage the mailing lists, and see RSVPs and feedback, under Events → Rounds.
            {!canEdit && ' Only the program director can change this.'}
          </span>
        </span>
      </label>
    </div>
  )
}

/** The whole list, as a card. */
export function WhoRunsRounds() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'director'
  const { managers, set, error } = useRoundsManagers()
  const [people, setPeople] = useState<Person[] | null>(null)

  useEffect(() => {
    supabase.from('site_users').select('id, full_name, email, role').in('role', ['supervisor']).eq('status', 'active').order('full_name')
      .then(({ data }) => setPeople((data as Person[]) ?? []))
  }, [])

  if (!people || !managers) return <p className="text-sm text-muted">Loading…</p>
  const count = people.filter((p) => managers.has(p.id)).length
  return (
    <Card>
      <CardHeader
        title="Who can run rounds"
        sub={`The program director always can. ${count ? `${count} supervisor${count === 1 ? '' : 's'} can too.` : 'Tick a supervisor to let them.'} They can set up rounds, manage mailing lists, and see RSVPs and feedback.`}
      />
      {error && <div className="px-5 pt-4"><Notice tone="bad">{error}</Notice></div>}
      {!canEdit && <p className="px-5 pt-4 text-xs text-muted">Only the program director can change this list.</p>}
      {people.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          No active supervisors yet. <Link to="/people/new" className="font-medium text-accent hover:underline">Add them in User management</Link>.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.id}>
              <label className={`flex items-center gap-3 px-5 py-3 text-sm ${canEdit ? 'cursor-pointer' : ''}`}>
                <input type="checkbox" checked={managers.has(p.id)} disabled={!canEdit}
                  aria-label={`${p.full_name} can run rounds`}
                  onChange={(e) => set(p.id, e.target.checked)} />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{p.full_name}</span>
                  <span className="block truncate text-xs text-muted">{p.email}</span>
                </span>
                {managers.has(p.id) && <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-ink">Runs rounds</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
