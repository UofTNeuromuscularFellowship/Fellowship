import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { CaseForm } from '../components/CaseForm'
import { CaseDetail } from '../components/CaseDetail'
import { formatDate } from '../lib/format'
import { PROCEDURE_METRICS } from '../lib/nm'
import type { CaseRow } from '../types/database'

export default function Cases() {
  const { profile } = useAuth()
  const isFellow = profile?.role === 'fellow'

  const [rows, setRows] = useState<CaseRow[]>([])
  const [fellowNames, setFellowNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CaseRow | null>(null)
  const [viewing, setViewing] = useState<CaseRow | null>(null)

  async function load() {
    setLoading(true)
    // RLS scopes this automatically: fellows get their own rows; supervisors and
    // directors get shared rows only.
    const { data } = await supabase
      .from('cases')
      .select('*')
      .order('case_date', { ascending: false })
    const list = (data as CaseRow[]) ?? []
    setRows(list)

    // For faculty, label each shared case with the fellow's name.
    if (!isFellow && list.length) {
      const ids = [...new Set(list.map((c) => c.fellow_id))]
      const { data: profs } = await supabase.rpc('profile_names', { ids })
      const map: Record<string, string> = {}
      for (const p of (profs as { id: string; full_name: string }[]) ?? []) map[p.id] = p.full_name
      setFellowNames(map)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function procSummary(c: CaseRow) {
    return PROCEDURE_METRICS
      .map((m) => ({ k: m.key, n: (c as any)[m.column] as number }))
      .filter((x) => x.n > 0)
      .map((x) => `${x.n} ${x.k.toUpperCase()}`)
      .join(' · ')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {isFellow ? 'My cases' : 'Shared cases'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isFellow ? 'EMG / NCS case log' : 'Cases shared by fellows for feedback'}
          </p>
        </div>
        {isFellow && (
          <button onClick={() => setCreating(true)} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
            New case
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            {isFellow ? 'No cases logged yet. Add your first case to start tracking competency.' : 'No shared cases to review yet.'}
          </p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <button onClick={() => setViewing(c)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-paper">
                  <span className="w-24 shrink-0 text-xs text-muted nums">{formatDate(c.case_date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{c.title}</span>
                    {!isFellow && fellowNames[c.fellow_id] && (
                      <span className="block text-xs text-accent">{fellowNames[c.fellow_id]}</span>
                    )}
                    {procSummary(c) && <span className="block text-xs text-muted nums">{procSummary(c)}</span>}
                  </span>
                  {c.visibility === 'shared' && (
                    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Shared</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {creating && <CaseForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
      {editing && <CaseForm existing={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {viewing && (
        <CaseDetail
          row={viewing}
          onClose={() => setViewing(null)}
          onChanged={load}
          onEdit={isFellow ? () => { setEditing(viewing); setViewing(null) } : undefined}
        />
      )}
    </div>
  )
}
