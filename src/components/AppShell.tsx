import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { roleLabel } from '../lib/format'
import { Waveform } from './ui/Waveform'
import type { UserRole } from '../types/database'

interface NavItem { to: string; label: string; allow?: UserRole[] }
interface NavSection { heading: string | null; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    heading: null,
    items: [{ to: '/dashboard', label: 'Dashboard' }],
  },
  {
    heading: 'Schedules',
    items: [
      { to: '/teaching', label: 'Teaching schedule' },
      { to: '/clinic', label: 'Clinic schedule' },
      { to: '/vacation', label: 'Vacation & away dates', allow: ['fellow', 'supervisor', 'director'] },
    ],
  },
  {
    heading: 'Case logging',
    items: [
      { to: '/cases', label: 'Case logger', allow: ['fellow', 'supervisor', 'director'] },
      { to: '/competency', label: 'Competency', allow: ['fellow', 'director', 'admin'] },
    ],
  },
  {
    heading: 'Teaching',
    items: [
      { to: '/my-teaching', label: 'Teaching Assignments', allow: ['supervisor', 'director'] },
      { to: '/rate-teaching', label: 'Rate Teaching', allow: ['fellow'] },
      { to: '/evaluations', label: 'Evaluations', allow: ['fellow', 'supervisor', 'director'] },
    ],
  },
  {
    heading: 'Program',
    items: [
      { to: '/handbook', label: 'Handbook' },
      { to: '/people', label: 'People', allow: ['director', 'admin'] },
      { to: '/settings', label: 'Settings', allow: ['director'] },
    ],
  },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const visibleSections = SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.allow || (role && i.allow.includes(role))),
  })).filter((s) => s.items.length > 0)

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-paper hover:text-ink'
    }`

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-5 py-5">
          <Waveform className="h-5 w-28 text-accent" />
          <p className="mt-3 font-display text-sm font-semibold leading-tight text-ink">
            Neuromuscular<br />Fellowship Portal
          </p>
          <p className="mt-1 text-xs text-muted">University of Toronto · Neurology</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleSections.map((section, idx) => (
            <div key={idx} className={idx > 0 ? 'mt-5' : ''}>
              {section.heading && (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {section.heading}
                </p>
              )}
              {section.items.map((i) => (
                <NavLink key={i.to} to={i.to} className={navClass}>
                  {i.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-line px-5 py-4">
          <p className="truncate text-sm font-medium text-ink">{profile?.full_name}</p>
          <p className="text-xs text-muted">{role ? roleLabel(role) : ''}</p>
          <button
            onClick={handleSignOut}
            className="mt-3 text-xs font-medium text-accent hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header with menu */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface md:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink"
            >
              <span aria-hidden="true" className="flex flex-col gap-[3px]">
                <span className="block h-[2px] w-4 rounded bg-ink" />
                <span className="block h-[2px] w-4 rounded bg-ink" />
                <span className="block h-[2px] w-4 rounded bg-ink" />
              </span>
              Menu
            </button>
            <span className="font-display text-sm font-semibold text-ink">Fellowship Portal</span>
            <button onClick={handleSignOut} className="text-xs font-medium text-accent">Sign out</button>
          </div>
          {menuOpen && (
            <nav className="max-h-[70vh] overflow-y-auto border-t border-line px-3 pb-4 pt-2">
              {visibleSections.map((section, idx) => (
                <div key={idx} className={idx > 0 ? 'mt-4' : ''}>
                  {section.heading && (
                    <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {section.heading}
                    </p>
                  )}
                  {section.items.map((i) => (
                    <NavLink key={i.to} to={i.to} className={navClass} onClick={() => setMenuOpen(false)}>
                      {i.label}
                    </NavLink>
                  ))}
                </div>
              ))}
              <div className="mt-4 border-t border-line px-3 pt-3">
                <p className="truncate text-sm font-medium text-ink">{profile?.full_name}</p>
                <p className="text-xs text-muted">{role ? roleLabel(role) : ''}</p>
              </div>
            </nav>
          )}
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
