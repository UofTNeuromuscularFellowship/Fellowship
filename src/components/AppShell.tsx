import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { roleLabel } from '../lib/format'
import { Waveform } from './ui/Waveform'
import type { UserRole } from '../types/database'

interface NavItem { to: string; label: string; allow?: UserRole[] }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/teaching', label: 'Teaching schedule' },
  { to: '/clinic', label: 'Clinic rotations' },
  { to: '/cases', label: 'My cases', allow: ['fellow', 'supervisor', 'director'] },
  { to: '/competency', label: 'Competency', allow: ['fellow', 'director', 'admin'] },
  { to: '/handbook', label: 'Handbook' },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role

  const items = NAV.filter((i) => !i.allow || (role && i.allow.includes(role)))

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="border-b border-line px-5 py-5">
          <Waveform className="h-5 w-28 text-accent" />
          <p className="mt-3 font-display text-sm font-semibold leading-tight text-ink">
            Neuromuscular<br />Fellowship Portal
          </p>
          <p className="mt-1 text-xs text-muted">University of Toronto · Neurology</p>
        </div>
        <nav className="flex-1 px-3 py-4">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-paper hover:text-ink'
                }`
              }
            >
              {i.label}
            </NavLink>
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
        <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4 md:hidden">
          <span className="font-display text-sm font-semibold">Fellowship Portal</span>
          <button onClick={handleSignOut} className="text-xs font-medium text-accent">Sign out</button>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  )
}
