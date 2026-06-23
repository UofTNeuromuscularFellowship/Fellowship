import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { TargetEditor } from '../components/TargetEditor'
import { mergeTargets } from '../lib/competency'
import type { CompetencyTarget, AppUser } from '../types/database'

type DoneMap = Record<string, number>

async function fetchProgress(fellowId: string): Promise<DoneMap> {
  const { data, error } = await supabase.rpc('fellow_competency_progress', { p_fellow: fellowId })
  if (error) return {}
  const map: DoneMap = {}
  for (const r of (data as { metric_key: string; done: number }[]) ?? []) {
    map[r.metric_key.toLowerCase()] = Number(r.done)
  }
  return map
}

export default function Competency() {
  const { profile, session } = useAuth()
  const role = profile?.role

  if (role === 'admin') {
    return (
      <Wrap>
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            Competency progress is derived from clinical case data, which isn't accessible to
            the admin role. Target configuration is managed by directors.
          </p>
        </Card>
      </Wrap>
    )
  }

  if (role === 'director') return <DirectorView />
  return <FellowView fellowId={session!.user.id} cohortYear={profile?.cohort_year ?? null} />
}

function Wrap({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Competency</h1>
        <p className="mt-1 text-sm text-muted">Progress against program targets</p>
      </div>
      {children}
    </div>
  )
}

function ProgressBars({ targets, done, fellowId }: { targets: CompetencyTarget[]; done: DoneMap; fellowId: string }) {
  const merged = useMemo(() => mergeTargets(targets, fellowId), [targets, fellowId])
  if (merged.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted">No targets configured for this cohort yet.</p>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader title="Progress" sub="Counts across all logged cases" />
      <ul className="divide-y divide-line">
        {merged.map((t) => {
          const n = done[t.metric_key.toLowerCase()] ?? 0
          const pct = t.target_value > 0 ? Math.min(100, Math.round((n / t.target_value) * 100)) : 0
          const met = t.target_value > 0 && n >= t.target_value
          return (
            <li key={t.id} className="px-5 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink">{t.metric_label}</span>
                <span className="text-sm text-muted nums">{n} / {t.target_value}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-paper">
                <div className={`h-full rounded-full ${met ? 'bg-accent' : 'bg-signal'}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function FellowView({ fellowId, cohortYear }: { fellowId: string; cohortYear: string | null }) {
  const [done, setDone] = useState<DoneMap>({})
  const [targets, setTargets] = useState<CompetencyTarget[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const d = await fetchProgress(fellowId)
      let tq = supabase.from('competency_targets').select('*')
      if (cohortYear) tq = tq.eq('cohort_year', cohortYear)
      const ts = await tq
      setDone(d)
      setTargets((ts.data as CompetencyTarget[]) ?? [])
      setLoading(false)
    })()
  }, [fellowId, cohortYear])

  return (
    <Wrap>
      {!cohortYear && (
        <p className="rounded-md border border-line bg-accent-soft/40 px-4 py-3 text-xs text-muted">
          Your cohort year isn't set yet, so cohort targets may not apply. Ask a director to set it on your profile.
        </p>
      )}
      {loading ? <p className="text-sm text-muted">Loading…</p> : <ProgressBars targets={targets} done={done} fellowId={fellowId} />}
    </Wrap>
  )
}

function DirectorView() {
  const [fellows, setFellows] = useState<AppUser[]>([])
  const [selected, setSelected] = useState<AppUser | null>(null)
  const [cohortYear, setCohortYear] = useState('2026-27')
  const [done, setDone] = useState<DoneMap>({})
  const [targets, setTargets] = useState<CompetencyTarget[]>([])

  useEffect(() => {
    supabase.from('users').select('*').eq('role', 'fellow').eq('status', 'active')
      .then(({ data }) => setFellows((data as AppUser[]) ?? []))
  }, [])

  useEffect(() => {
    if (!selected) { setDone({}); setTargets([]); return }
    (async () => {
      const d = await fetchProgress(selected.id)
      const ts = await supabase.from('competency_targets').select('*')
        .eq('cohort_year', selected.cohort_year ?? cohortYear)
      setDone(d)
      setTargets((ts.data as CompetencyTarget[]) ?? [])
    })()
  }, [selected, cohortYear])

  return (
    <Wrap>
      <Card className="p-5">
        <label className="block">
          <span className="text-sm font-medium text-ink">Cohort year</span>
          <input
            value={cohortYear}
            onChange={(e) => setCohortYear(e.target.value)}
            className="mt-1 w-40 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
            placeholder="2026-27"
          />
        </label>
      </Card>

      <TargetEditor cohortYear={cohortYear} />

      <Card className="p-5">
        <p className="text-sm font-medium text-ink">View a fellow's progress</p>
        {fellows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No active fellow accounts yet. Once fellows sign up and are assigned the fellow role, they appear here.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {fellows.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelected(f)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${selected?.id === f.id ? 'bg-accent text-white' : 'bg-paper text-ink hover:bg-line'}`}
              >
                {f.full_name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected && <ProgressBars targets={targets} done={done} fellowId={selected.id} />}
    </Wrap>
  )
}
