import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { roleLabel } from '../lib/format'
import { Card, CardHeader } from './ui/Card'
import { Notice } from './ui/Wizard'

// ---------------------------------------------------------------------------
// Who, besides the program director and admin, may run rounds and who may run
// conferences. Each is a list of people in the program (rounds_managers,
// conf_managers). Only the director can change them — the database allows
// the director alone — and the admin can see them.
//
// The lists are offered in User management, on the Rounds page and on the
// Events page, so the director finds them wherever they look.
// ---------------------------------------------------------------------------

export type Permission = 'rounds' | 'conferences'

const TABLE: Record<Permission, string> = { rounds: 'rounds_managers', conferences: 'conf_managers' }

export const PERMISSION_TEXT: Record<Permission, { title: string; short: string; help: string }> = {
  rounds: {
    title: 'Can run rounds',
    short: 'runs rounds',
    help: 'Set up rounds, manage the mailing lists, and see RSVPs and feedback, under Events → Rounds.',
  },
  conferences: {
    title: 'Can run conferences',
    short: 'runs conferences',
    help: 'Create and manage courses and conferences — invitations, speakers, money and logistics — under Events → Conferences.',
  },
}

interface Person { id: string; full_name: string; email: string; role: string }

/** Who holds each permission, with a way to change it. */
export function usePermissions() {
  const [holders, setHolders] = useState<Record<Permission, Set<string>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      supabase.from('rounds_managers').select('user_id'),
      supabase.from('conf_managers').select('user_id'),
    ])
    const ids = (d: unknown) => new Set(((d as { user_id: string }[]) ?? []).map((x) => x.user_id))
    setHolders({ rounds: ids(r.data), conferences: ids(c.data) })
  }, [])
  useEffect(() => { load() }, [load])

  const set = useCallback(async (kind: Permission, userId: string, on: boolean): Promise<boolean> => {
    setError(null)
    // Show the change straight away; put it back if the database refuses.
    setHolders((h) => {
      if (!h) return h
      const n = new Set(h[kind]); if (on) n.add(userId); else n.delete(userId)
      return { ...h, [kind]: n }
    })
    const { error: e } = on
      ? await supabase.from(TABLE[kind]).insert({ user_id: userId })
      : await supabase.from(TABLE[kind]).delete().eq('user_id', userId)
    if (e) {
      setError(/row-level security|permission/i.test(e.message) ? 'Only the program director can change this.' : e.message)
      await load()
      return false
    }
    return true
  }, [load])

  return { holders, set, error, reload: load }
}

/** A checkbox for one person's row in User management. */
export function PermissionToggle({ kind, userId, holders, onSet, canEdit }: {
  kind: Permission; userId: string; holders: Record<Permission, Set<string>> | null
  onSet: (kind: Permission, id: string, on: boolean) => void; canEdit: boolean
}) {
  const t = PERMISSION_TEXT[kind]
  return (
    <label className="flex items-start gap-2.5 text-sm text-ink">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line text-accent"
        checked={!!holders?.[kind].has(userId)} disabled={!canEdit || !holders}
        onChange={(e) => onSet(kind, userId, e.target.checked)} />
      <span>
        <span className="font-medium">{t.title}</span>
        <span className="mt-0.5 block text-xs text-muted">{t.help}{!canEdit && ' Only the program director can change this.'}</span>
      </span>
    </label>
  )
}

/** Both permissions for one person, as a block in their "Manage" panel. */
export function PermissionsBlock(props: {
  userId: string; holders: Record<Permission, Set<string>> | null
  onSet: (kind: Permission, id: string, on: boolean) => void; canEdit: boolean
}) {
  return (
    <div className="space-y-2.5 border-t border-line pt-3">
      <PermissionToggle kind="rounds" {...props} />
      <PermissionToggle kind="conferences" {...props} />
    </div>
  )
}

/** Everyone in the program, with a column for each permission. */
export function WhoRunsEvents({ only }: { only?: Permission } = {}) {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'director'
  const { holders, set, error } = usePermissions()
  const [people, setPeople] = useState<Person[] | null>(null)
  const kinds: Permission[] = only ? [only] : ['rounds', 'conferences']

  useEffect(() => {
    // The director and admin already have both; everyone else can be given them.
    supabase.from('site_users').select('id, full_name, email, role')
      .in('role', ['supervisor', 'fellow', 'assistant']).eq('status', 'active').order('full_name')
      .then(({ data }) => {
        const order = ['supervisor', 'assistant', 'fellow']
        setPeople(((data as Person[]) ?? []).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.full_name.localeCompare(b.full_name)))
      })
  }, [])

  if (!people || !holders) return <p className="text-sm text-muted">Loading…</p>
  const count = (k: Permission) => people.filter((p) => holders[k].has(p.id)).length
  const title = only === 'rounds' ? 'Who can run rounds' : only === 'conferences' ? 'Who can run conferences' : 'Who can run rounds and conferences'
  return (
    <Card>
      <CardHeader
        title={title}
        sub={`The program director and admin always can. ${kinds.map((k) => `${count(k)} ${count(k) === 1 ? 'other person' : 'others'} ${k === 'rounds' ? 'run rounds' : 'run conferences'}`).join(' · ')}.`}
      />
      {error && <div className="px-5 pt-4"><Notice tone="bad">{error}</Notice></div>}
      {!canEdit && <p className="px-5 pt-4 text-xs text-muted">Only the program director can change these.</p>}
      {people.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          Nobody else in the program yet. <Link to="/people/new" className="font-medium text-accent hover:underline">Add people in User management</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
                <th className="px-5 py-2">Person</th>
                {kinds.map((k) => <th key={k} className="w-32 px-3 py-2 text-center">{k === 'rounds' ? 'Rounds' : 'Conferences'}</th>)}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-5 py-2.5">
                    <span className="block font-medium text-ink">{p.full_name}</span>
                    <span className="block text-xs text-muted">{roleLabel(p.role)} · {p.email}</span>
                  </td>
                  {kinds.map((k) => (
                    <td key={k} className="px-3 py-2.5 text-center">
                      <input type="checkbox" className="h-4 w-4" checked={holders[k].has(p.id)} disabled={!canEdit}
                        aria-label={`${p.full_name} ${PERMISSION_TEXT[k].title.toLowerCase()}`}
                        onChange={(e) => set(k, p.id, e.target.checked)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
