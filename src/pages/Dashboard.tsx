import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { formatDate } from '../lib/format'
import type { TeachingSession } from '../types/database'

export default function Dashboard() {
  const { profile } = useAuth()
  const [next, setNext] = useState<TeachingSession | null>(null)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('teaching_sessions')
      .select('*')
      .gte('session_date', today)
      .eq('is_break', false)
      .not('topic', 'is', null)
      .order('session_date', { ascending: true })
      .limit(1)
      .then(({ data }) => setNext((data?.[0] as TeachingSession) ?? null))
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] ?? ''

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{greeting}</p>
        <h1 className="font-display text-2xl font-bold text-ink">{firstName}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Next teaching session</p>
          {next ? (
            <>
              <p className="mt-2 font-display text-lg font-semibold text-ink">{next.topic}</p>
              <p className="mt-1 text-sm text-muted nums">
                {formatDate(next.session_date)} · {next.start_time.slice(0, 5)}–{next.end_time.slice(0, 5)}
                {next.provider_name ? ` · ${next.provider_name}` : ''}
              </p>
              <Link to="/teaching" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                View full schedule →
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No upcoming session found.</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Quick links</p>
          <div className="mt-3 grid gap-2 text-sm">
            <Link to="/clinic" className="text-accent hover:underline">Clinic rotations</Link>
            <Link to="/cases" className="text-accent hover:underline">Log a case</Link>
            <Link to="/competency" className="text-accent hover:underline">Competency progress</Link>
            <Link to="/handbook" className="text-accent hover:underline">Program handbook</Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
