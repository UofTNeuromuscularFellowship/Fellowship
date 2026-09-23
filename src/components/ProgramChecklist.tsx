import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localToday } from '../lib/format'

// ---------------------------------------------------------------------------
// "Get your program running": the director's checklist on Home. Each item is
// worked out from what's actually in the portal, opens the step-by-step setup
// for it, and ticks itself off. The card goes away once everything is done,
// or when the director hides it on this device.
// ---------------------------------------------------------------------------

interface Item { key: string; title: string; detail: string; to: string; action: string; done: boolean }
const HIDE_KEY = 'program-checklist-hidden'

export default function ProgramChecklist() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    if (hidden) return
    const today = localToday()
    ;(async () => {
      const [people, clinics, patterns, published, teaching, handbook] = await Promise.all([
        supabase.from('site_users').select('id, role, status, fellowship_start, fellowship_end').eq('status', 'active'),
        supabase.from('clinic_template').select('id', { count: 'exact', head: true }),
        supabase.from('fellow_templates').select('id', { count: 'exact', head: true }),
        supabase.from('clinic_rotations').select('id', { count: 'exact', head: true }).eq('is_draft', false).gte('rotation_date', today),
        supabase.from('teaching_sessions').select('id', { count: 'exact', head: true }).eq('is_break', false).gte('session_date', today),
        supabase.from('handbook_pages').select('id', { count: 'exact', head: true }),
      ])
      const list = (people.data as { role: string; fellowship_start: string | null; fellowship_end: string | null }[]) ?? []
      const fellows = list.filter((p) => p.role === 'fellow')
      const faculty = list.filter((p) => p.role === 'supervisor' || p.role === 'director')
      const noDates = fellows.filter((f) => !f.fellowship_start || !f.fellowship_end).length
      setItems([
        {
          key: 'people', title: 'Add your fellows and supervisors', to: '/people/new', action: 'Add people',
          detail: `${fellows.length} fellow${fellows.length === 1 ? '' : 's'} · ${faculty.length} supervisor${faculty.length === 1 ? '' : 's'} or director${faculty.length === 1 ? '' : 's'}`,
          done: fellows.length > 0 && list.some((p) => p.role === 'supervisor'),
        },
        {
          key: 'dates', title: 'Give each fellow their fellowship dates', to: '/people', action: 'Open People',
          detail: fellows.length === 0 ? 'No fellows yet' : noDates ? `${noDates} fellow${noDates === 1 ? '' : 's'} without start and end dates — schedules use them` : 'Every fellow has dates',
          done: fellows.length > 0 && noDates === 0,
        },
        {
          key: 'clinic', title: 'Set up the clinic schedule', to: '/clinic/setup', action: 'Set up clinics',
          detail: (clinics.count ?? 0) === 0 ? 'No clinics yet' : (published.count ?? 0) === 0
            ? `${clinics.count} clinic${clinics.count === 1 ? '' : 's'} · ${patterns.count ?? 0} weekly pattern${patterns.count === 1 ? '' : 's'} · nothing published ahead yet`
            : 'Published',
          done: (clinics.count ?? 0) > 0 && (published.count ?? 0) > 0,
        },
        {
          key: 'teaching', title: 'Set up the teaching year', to: '/my-teaching/setup', action: 'Set up teaching',
          detail: (teaching.count ?? 0) === 0 ? 'No upcoming sessions' : `${teaching.count} upcoming session${teaching.count === 1 ? '' : 's'}`,
          done: (teaching.count ?? 0) > 0,
        },
        {
          key: 'handbook', title: 'Write the program handbook', to: '/handbook', action: 'Open the handbook',
          detail: (handbook.count ?? 0) === 0 ? 'No pages yet' : `${handbook.count} page${handbook.count === 1 ? '' : 's'}`,
          done: (handbook.count ?? 0) > 0,
        },
      ])
    })()
  }, [hidden])

  if (hidden || !items || items.every((i) => i.done)) return null
  const doneCount = items.filter((i) => i.done).length

  function hide() {
    try { localStorage.setItem(HIDE_KEY, '1') } catch { /* this device only */ }
    setHidden(true)
  }

  return (
    <section className="rounded-lg border border-line bg-surface" aria-labelledby="checklist-title">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <h2 id="checklist-title" className="font-display text-base font-semibold text-ink">Get your program running</h2>
          <p className="mt-0.5 text-sm text-muted">{doneCount} of {items.length} done · each step opens its own step-by-step setup</p>
        </div>
        <button type="button" onClick={hide} className="text-xs font-medium text-muted hover:text-ink">Hide</button>
      </div>
      <ol className="divide-y divide-line">
        {items.map((it, i) => (
          <li key={it.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${it.done ? 'bg-emerald-600 text-white' : 'border border-line text-muted'}`}>
                {it.done ? '✓' : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-medium ${it.done ? 'text-muted' : 'text-ink'}`}>{it.title}<span className="sr-only">{it.done ? ' (done)' : ''}</span></p>
                <p className="text-xs text-muted">{it.detail}</p>
              </div>
            </div>
            {!it.done && <Link to={it.to} className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:border-accent">{it.action}</Link>}
          </li>
        ))}
      </ol>
    </section>
  )
}
