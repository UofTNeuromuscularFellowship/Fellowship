import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// "Make a change": say what happened, and the portal works out which days,
// fellows and teachers it touches, shows them before anything changes, and
// tells the right people. /change is the menu; /change/:flow is one flow.
// ---------------------------------------------------------------------------

const ProviderAway = lazy(() => import('./change/ProviderAway'))
const ClinicChange = lazy(() => import('./change/ClinicChange'))
const FellowDays = lazy(() => import('./change/FellowDays'))
const SwapDays = lazy(() => import('./change/SwapDays'))
const FellowshipChange = lazy(() => import('./change/FellowshipChange'))
const SessionChange = lazy(() => import('./change/SessionChange'))
const CancelOrAdd = lazy(() => import('./change/CancelOrAdd'))
const RegularTime = lazy(() => import('./change/RegularTime'))

const FLOWS: Record<string, React.LazyExoticComponent<() => JSX.Element>> = {
  'provider-away': ProviderAway,
  clinic: ClinicChange,
  'fellow-days': FellowDays,
  swap: SwapDays,
  fellowship: FellowshipChange,
  session: SessionChange,
  'cancel-add': CancelOrAdd,
  'regular-time': RegularTime,
}

interface Item { to: string; title: string; desc: string; directorOnly?: boolean }
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Clinics',
    items: [
      { to: '/change/clinic', title: 'A clinic is starting, moving or ending', desc: 'A new clinic, a new day or location, a pause, or one that stops', directorOnly: true },
      { to: '/change/provider-away', title: 'A provider is away', desc: 'Their clinic days are covered or freed up' },
      { to: '/change/clinic?type=capacity', title: 'A clinic takes more or fewer fellows', desc: 'Change its places from now on', directorOnly: true },
    ],
  },
  {
    title: 'Fellows',
    items: [
      { to: '/change/fellow-days', title: 'Change one fellow’s days', desc: 'A single day, or a run of days' },
      { to: '/change/swap', title: 'Two fellows swap days', desc: 'Both calendars updated at once' },
      { to: '/change/fellowship', title: 'A fellowship is extended or ends early', desc: 'New dates; the schedules follow' },
    ],
  },
  {
    title: 'Teaching',
    items: [
      { to: '/change/session', title: 'Move or reassign a session', desc: 'Different teacher, date, time or topic' },
      { to: '/change/cancel-add', title: 'Cancel or add a session', desc: 'Including one-off sessions' },
      { to: '/change/regular-time', title: 'Change the regular day or time', desc: 'From a date onward' },
    ],
  },
]

export default function MakeChange() {
  const { flow } = useParams()
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'

  if (flow) {
    const Flow = FLOWS[flow]
    if (!Flow) {
      return <p className="text-sm text-muted">That change isn’t available. <Link to="/change" className="text-accent hover:underline">See the list</Link>.</p>
    }
    return (
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Flow />
      </Suspense>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Make a change</h1>
        <p className="mt-1 text-sm text-muted">
          Say what happened. You’ll see which days, fellows and teachers it touches before anything changes, and
          each person is told only about their own days.
        </p>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.items.map((it) => {
              const locked = it.directorOnly && !isDirector
              return locked ? (
                <div key={it.to} className="rounded-lg border border-line bg-paper px-4 py-3 opacity-70">
                  <p className="text-sm font-semibold text-ink">{it.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{it.desc} · the fellowship director makes this change</p>
                </div>
              ) : (
                <Link key={it.to} to={it.to}
                  className="group rounded-lg border border-line bg-surface px-4 py-3 hover:border-accent">
                  <p className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                    {it.title}<span className="text-muted group-hover:text-accent">→</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{it.desc}</p>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted">
        Changing a single day directly on the clinic schedule still works as before.
      </p>
    </div>
  )
}
