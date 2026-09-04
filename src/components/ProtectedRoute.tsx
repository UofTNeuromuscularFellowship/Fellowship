import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: ReactNode
  allow?: ('fellow' | 'supervisor' | 'director' | 'admin' | 'assistant')[]
  skipPasswordGate?: boolean
}

export function ProtectedRoute({ children, allow, skipPasswordGate }: Props) {
  const { session, profile, loading } = useAuth()
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

  if (allow && profile && !allow.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
