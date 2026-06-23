import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/database'

export function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactNode
  allow?: UserRole[]
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return <div className="grid h-screen place-items-center text-sm text-muted">Loading…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (allow && profile && !allow.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
