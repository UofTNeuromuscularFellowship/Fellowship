import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * "My away dates" — a shortcut to Vacation & away dates, for everyone who
 * can book time away (the same roles the /vacation route allows).
 */
export function AwayDatesButton({ className = '' }: { className?: string }) {
  const { profile } = useAuth()
  if (!profile || !['fellow', 'supervisor', 'director', 'assistant'].includes(profile.role)) return null
  return (
    <Link
      to="/vacation"
      className={`inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-accent ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3.5v4M16 3.5v4M9 15l2 2 4-4" />
      </svg>
      My away dates
    </Link>
  )
}
