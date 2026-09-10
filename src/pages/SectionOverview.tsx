import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NavIcon } from '../components/nav/NavIcon'
import { navFor } from '../lib/navigation'

// ---------------------------------------------------------------------------
// What an area contains.
//
// One page serving all seven, driven by lib/navigation.ts. A new tool gets its
// card by being added to that file — there is nothing to write here, and no way
// for the overview to fall behind the menu.
//
// It earns its place for the reader who does not yet know what is in an area.
// A rail of icons tells you there are six places; it does not tell you that the
// diagnostic test directory has the requisitions in it.
// ---------------------------------------------------------------------------

export default function SectionOverview() {
  const { groupId } = useParams()
  const { profile, tools, isPlatformAdmin } = useAuth()
  if (!profile) return null

  const hideClinic = profile.role === 'supervisor' && profile.teaching_only === true
  const groups = navFor(profile.role, { hideClinic, tools, platformAdmin: isPlatformAdmin })
  const group = groups.find((g) => g.id === groupId)

  // An unknown or forbidden area is not an error page — it is someone following
  // an old link, so send them somewhere useful.
  if (!group) return <Navigate to="/dashboard" replace />

  // An area holding one tool has no overview worth showing: /s/home goes to the
  // dashboard, /s/clinic to the clinic schedule. Kept here as well as in the
  // rail so a bookmarked or typed overview URL behaves the same way.
  if (group.items.length === 1) return <Navigate to={group.items[0].to} replace />

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-line bg-accent-soft/50 px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <NavIcon name={group.icon} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">{group.label}</h1>
            <p className="mt-1 text-sm text-muted">{group.tagline}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {group.items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="group flex flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent"
          >
            <h2 className="font-display text-base font-semibold text-ink">{i.label}</h2>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">{i.blurb}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              Open
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
