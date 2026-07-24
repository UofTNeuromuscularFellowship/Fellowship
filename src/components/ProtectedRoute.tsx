import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: ReactNode
  allow?: ('fellow' | 'supervisor' | 'director' | 'admin' | 'assistant')[]
  skipPasswordGate?: boolean
}

export function ProtectedRoute({ children, allow, skipPasswordGate }: Props) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (!skipPasswordGate && profile?.must_change_password) {
    return <Navigate to="/change-password" replace />
  }

  if (allow && profile && !allow.includes(profile.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
