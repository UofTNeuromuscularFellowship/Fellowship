import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { toolForPath } from '../lib/navigation'

interface Props {
  children: ReactNode
  allow?: ('fellow' | 'supervisor' | 'director' | 'admin' | 'assistant')[]
  skipPasswordGate?: boolean
  /** Platform admins only — the page is not part of any program. */
  platformOnly?: boolean
}

export function ProtectedRoute({ children, allow, skipPasswordGate, platformOnly }: Props) {
  const { session, profile, loading, profileReady, tools, isPlatformAdmin, site, sites } = useAuth()
  const location = useLocation()

  // After a sign-in the session arrives a moment before the programs do; the
  // "belongs to no program" rule below must not fire in that gap.
  if (loading || (session && !profileReady)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    )
  }

  // Carry the destination to the login page. Without this, opening the
  // home-screen app straight at /waveforms — or following any deep link with an
  // expired session — signs you in and then drops you on the dashboard, which
  // reads as the link having been ignored. search is kept too, because
  // /waveforms?add=1 is what the "Add a teaching image" shortcut opens.
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  if (!skipPasswordGate && profile?.must_change_password) {
    return <Navigate to="/change-password" replace />
  }

  if (platformOnly) {
    if (!isPlatformAdmin) return <Navigate to="/dashboard" replace />
    return <>{children}</>
  }

  // A platform admin with no program of their own has nowhere else to go.
  if (!site && isPlatformAdmin && location.pathname !== '/platform') {
    return <Navigate to="/platform" replace />
  }

  // Someone who belongs to no program - a conference attendee, or a former
  // member - has only their courses. (Their account can read no program's
  // data anyway; this keeps them off empty pages.)
  if (sites.length === 0 && !isPlatformAdmin) {
    return <Navigate to="/courses" replace />
  }

  if (allow && profile && !allow.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  // A toolkit item this program has not been granted. The menu already hides
  // it; this stops a bookmark or a typed URL opening it.
  const tool = toolForPath(location.pathname)
  if (tool && !tools.has(tool)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
