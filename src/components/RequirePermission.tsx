import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * Shows its children only to someone allowed to run conferences: the
 * director, the admin, or someone the director has added. Anyone else who
 * follows a link here is told who to ask, rather than shown empty pages the
 * database would refuse to fill.
 */
export function RequireConferences({ children }: { children: ReactNode }) {
  const { runsConferences, profile } = useAuth()
  if (runsConferences || profile?.role === 'director' || profile?.role === 'admin') return <>{children}</>
  return (
    <div className="mx-auto max-w-2xl rounded-md border border-line bg-paper px-4 py-3 text-sm text-ink" role="status">
      Conferences are run by the program director and the people they choose. If you’d like to run one, please ask the
      program director to add you under User management → Permissions.
    </div>
  )
}
