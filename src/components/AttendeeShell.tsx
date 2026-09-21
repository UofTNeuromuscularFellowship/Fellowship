import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AppShell } from './AppShell'

// ---------------------------------------------------------------------------
// The frame for My courses.
//
// A fellowship member gets the ordinary portal around it. An attendee account
// - one that belongs to no program - gets this small frame instead: their
// courses, their account, sign out. They have no program, so the portal's
// menus would all be empty, and the database would show them nothing there
// anyway.
// ---------------------------------------------------------------------------

export function CoursesFrame({ children }: { children: ReactNode }) {
  const { sites, isPlatformAdmin } = useAuth()
  if (sites.length > 0 || isPlatformAdmin) return <AppShell>{children}</AppShell>
  return <AttendeeShell>{children}</AttendeeShell>
}

function AttendeeShell({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/courses" className="flex items-center gap-2.5 text-ink no-underline">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M5.8 12.6h2.1l1.2-4 1.9 7.4 1.6-8.6 1.7 6.2 1-1h3.1" />
            </svg>
            <span className="font-display text-base font-semibold">My courses</span>
          </Link>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>{session?.user.email}</span>
            <Link to="/change-password" className="font-medium text-accent hover:underline">Change password</Link>
            <button className="font-medium text-muted hover:text-ink" onClick={async () => { await signOut(); navigate('/login') }}>
              Sign out
            </button>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  )
}
