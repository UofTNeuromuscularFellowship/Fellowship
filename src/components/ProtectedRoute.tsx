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
  const { session, profile, loading, tools, isPlatformAdmin, site } = useAuth()
  const location = useLocation()

  if (loading) {
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
