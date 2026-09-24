import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import { Notice, primary, quiet, field } from '../components/ui/Wizard'
import { plural } from '../lib/schedule'
import { useAuth } from '../context/AuthContext'
import { WhoRunsRounds } from '../components/RoundsManagers'
import {
  describeRule, FORMAT_SHORT, parsePeople, sessionWhen,
  type RoundsList, type RoundsMember, type RoundsSeries, type RoundsSession,
} from '../lib/rounds'

// ---------------------------------------------------------------------------
// Rounds: the series this program runs, the mailing lists they go to, and
// (for the director) which supervisors may run rounds. The series themselves
// are made with the step-by-step setup at /rounds/new and run from
// /rounds/:id.
// ---------------------------------------------------------------------------

export interface RoundsAccess { can_manage: boolean; is_director: boolean }

export function useRoundsAccess(): RoundsAccess | null {
  const [a, setA] = useState<RoundsAccess | null>(null)
  useEffect(() => {
    supabase.rpc('rounds_my_access').then(({ data }) => setA((data as RoundsAccess) ?? { can_manage: false, is_director: false }))
  }, [])
  return a
}

export function NotAllowed() {
  return (
    <div className="mx-auto max-w-2xl">
      <Notice>
        Rounds are run by the fellowship director and the supervisors they choose. If you’d like to run rounds,
        please ask the fellowship director to add you.
      </Notice>
    </div>
  )
}

type Tab = 'series' | 'lists' | 'who'

export default function Rounds() {
  const access = useRoundsAccess()
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('tab') === 'who' ? 'who' : 'series'))
  const seesWho = !!access?.is_director || profile?.role === 'admin'
  if (!access) return <p className="text-sm text-muted">Loading…</p>
  if (!access.can_manage) return <NotAllowed />
  const tabs: [Tab, string][] = [['series', 'Rounds'], ['lists', 'Mailing lists'], ...(seesWho ? [['who', 'Who can run rounds'] as [Tab, string]] : [])]
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Rounds</h1>
          <p className="mt-1 text-sm text-muted">Invitations, RSVPs, reminders, feedback and attendance certificates for your rounds.</p>
        </div>
        <Link to="/rounds/new" className={primary}>Set up rounds</Link>
      </div>
      <div role="tablist" className="flex gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{l}</button>
        ))}
      </div>
      {tab === 'series' && <SeriesList />}
      {tab === 'lists' && <MailingLists />}
      {tab === 'who' && seesWho && <WhoRunsRounds />}
    </div>
  )
}

// ------------------------------------------------------------------ series

function SeriesList() {
  const [series, setSeries] = useState<RoundsSeries[] | null>(null)
  const [sessions, setSessions] = useState<RoundsSession[]>([])
  const [showArchived, setShowArchived] = useState(false)
  useEffect(() => {
    ;(async () => {
      const [s, ss] = await Promise.all([
        supabase.from('rounds_series').select('*').order('created_at', { ascending: false }),
        supabase.from('rounds_sessions').select('id, series_id, starts_at, ends_at, timezone, topic, status, invite_sent_at')
          .gte('ends_at', new Date().toISOString()).order('starts_at'),
      ])
      setSeries((s.data as RoundsSeries[]) ?? [])
      setSessions((ss.data as RoundsSession[]) ?? [])
    })()
  }, [])
  if (!series) return <p className="text-sm text-muted">Loading…</p>
  const shown = series.filter((s) => showArchived || s.status === 'active')
  if (series.length === 0) {
    return (
      <Card>
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-ink">No rounds yet.</p>
          <p className="mt-1 text-sm text-muted">The setup takes you through the dates, where it happens, who’s invited, and credit.</p>
          <Link to="/rounds/new" className={`${primary} mt-4`}>Set up rounds</Link>
        </div>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      {shown.map((s) => {
        const upcoming = sessions.filter((x) => x.series_id === s.id && x.status === 'scheduled')
        const next = upcoming[0]
        const noTopic = upcoming.filter((x) => !x.topic?.trim()).length
        return (
          <Link key={s.id} to={`/rounds/${s.id}`} className="block rounded-lg border border-line bg-surface px-5 py-4 hover:border-accent">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                {s.logo_url && <img src={s.logo_url} alt="" className="h-8 max-w-[5rem] object-contain" />}
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{s.title}</p>
                  <p className="text-xs text-muted">{describeRule(s.recurrence, s.recurrence_rule)} · {FORMAT_SHORT[s.format]}{s.status === 'archived' ? ' · Archived' : ''}</p>
                </div>
              </div>
              <span className="text-xs text-muted">{plural(upcoming.length, 'upcoming session')}</span>
            </div>
            {next && (
              <p className="mt-2 text-sm text-ink">
                Next: {sessionWhen(next.starts_at, next.ends_at, next.timezone)}
                {next.topic ? <> — <span className="text-muted">{next.topic}</span></> : <span className="text-amber-700 dark:text-amber-300"> — no topic yet</span>}
              </p>
            )}
            {noTopic > 0 && <p className="mt-1 text-xs text-muted">{plural(noTopic, 'session')} still need a topic — invitations go out once one is added.</p>}
          </Link>
        )
      })}
      {series.some((s) => s.status === 'archived') && (
        <button className="text-sm font-medium text-accent hover:underline" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Hide archived rounds' : 'Show archived rounds'}
        </button>
      )}
    </div>
  )
}

// ----------------------------------------------------------- mailing lists

export function MailingLists() {
  const [lists, setLists] = useState<RoundsList[] | null>(null)
  const [members, setMembers] = useState<RoundsMember[]>([])
  const [unsub, setUnsub] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [l, m, u] = await Promise.all([
      supabase.from('rounds_lists').select('id, name, created_at').order('name'),
      supabase.from('rounds_list_members').select('id, list_id, email, full_name').order('full_name', { nullsFirst: false }),
      supabase.from('rounds_unsubscribes').select('email'),
    ])
    setLists((l.data as RoundsList[]) ?? [])
    setMembers((m.data as RoundsMember[]) ?? [])
    setUnsub(new Set(((u.data as { email: string }[]) ?? []).map((x) => x.email.toLowerCase())))
  }, [])
  useEffect(() => { load() }, [load])

  async function create() {
    if (!newName.trim()) return
    const { data, error } = await supabase.from('rounds_lists').insert({ name: newName.trim() }).select('id').single()
    if (error) { setMsg({ tone: 'bad', text: error.message }); return }
    setNewName(''); setOpen((data as { id: string }).id); setMsg(null); load()
  }

  if (!lists) return <p className="text-sm text-muted">Loading…</p>
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        A mailing list is a group of people to invite — for example residents, a partner hospital, or community neurologists.
        Anyone can be on a list; they don’t need a portal account.
      </p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {lists.map((l) => (
        <ListCard key={l.id} list={l} members={members.filter((m) => m.list_id === l.id)} unsub={unsub}
          open={open === l.id} onToggle={() => setOpen(open === l.id ? null : l.id)} onChanged={load} />
      ))}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line px-4 py-3">
        <label className="min-w-[14rem] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">New mailing list</span>
          <input className={field} placeholder="e.g. Neurology residents" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }} />
        </label>
        <button className={quiet} onClick={create} disabled={!newName.trim()}>Create list</button>
      </div>
    </div>
  )
}

function ListCard({ list, members, unsub, open, onToggle, onChanged }: {
  list: RoundsList; members: RoundsMember[]; unsub: Set<string>; open: boolean; onToggle: () => void; onChanged: () => void
}) {
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [name, setName] = useState(list.name)
  const people = useMemo(() => parsePeople(paste), [paste])
  const have = new Set(members.map((m) => m.email.toLowerCase()))
  const fresh = people.filter((p) => !have.has(p.email))

  async function add() {
    if (!fresh.length) return
    setBusy(true)
    const { error } = await supabase.from('rounds_list_members').insert(fresh.map((p) => ({ list_id: list.id, email: p.email, full_name: p.full_name })))
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: error.message }); return }
    setMsg({ tone: 'ok', text: `${plural(fresh.length, 'person', 'people')} added.` }); setPaste(''); onChanged()
  }
  async function remove(id: string) {
    await supabase.from('rounds_list_members').delete().eq('id', id); onChanged()
  }
  async function rename() {
    if (!name.trim() || name.trim() === list.name) return
    await supabase.from('rounds_lists').update({ name: name.trim() }).eq('id', list.id); onChanged()
  }
  async function del() {
    if (!window.confirm(`Delete the list “${list.name}”? Rounds that use it stop inviting these people. People already invited keep their invitations.`)) return
    await supabase.from('rounds_lists').delete().eq('id', list.id); onChanged()
  }

  return (
    <Card>
      <button className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left" onClick={onToggle} aria-expanded={open}>
        <span>
          <span className="block font-semibold text-ink">{list.name}</span>
          <span className="block text-xs text-muted">{plural(members.length, 'person', 'people')}</span>
        </span>
        <span className="text-sm text-accent">{open ? 'Close' : 'Open'}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-muted">List name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} />
            </label>
            <button className="px-2 py-2 text-sm font-medium text-rose-700 hover:underline dark:text-rose-300" onClick={del}>Delete list</button>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Add people — paste one per line</span>
            <textarea rows={4} className={field} value={paste} onChange={(e) => setPaste(e.target.value)}
              placeholder={'Jane Doe <jane.doe@example.org>\nsam.lee@example.org, Sam Lee'} />
            <span className="mt-1 block text-xs text-muted">
              {people.length === 0 ? 'Names are optional. Copying a column from a spreadsheet works too.'
                : `${plural(fresh.length, 'new person', 'new people')}${people.length > fresh.length ? ` · ${people.length - fresh.length} already on the list` : ''}`}
            </span>
          </label>
          <div className="flex items-center gap-3">
            <button className={quiet} disabled={busy || fresh.length === 0} onClick={add}>{busy ? 'Adding…' : 'Add to list'}</button>
            {msg && <span className={`text-sm ${msg.tone === 'bad' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{msg.text}</span>}
          </div>
          {members.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{m.full_name || m.email}</span>
                    {m.full_name && <span className="block truncate text-xs text-muted">{m.email}</span>}
                    {unsub.has(m.email.toLowerCase()) && <span className="block text-xs text-amber-700 dark:text-amber-300">Asked not to get rounds emails</span>}
                  </span>
                  <button className="text-xs font-medium text-muted hover:text-ink" onClick={() => remove(m.id)} aria-label={`Remove ${m.email}`}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
