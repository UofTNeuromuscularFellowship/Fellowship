import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'
import { shortDate } from '../lib/format'
import type { ClinicRotation } from '../types/database'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDay() // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

export default function ClinicRotations() {
  const [rows, setRows] = useState<ClinicRotation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('clinic_rotations')
      .select('*')
      .order('rotation_date', { ascending: true })
      .then(({ data }) => {
        setRows((data as ClinicRotation[]) ?? [])
        setLoading(false)
      })
  }, [])

  // group by fellow_label, then by week
  const fellows = useMemo(() => {
    const byFellow = new Map<string, ClinicRotation[]>()
    for (const r of rows) {
      const key = r.fellow_label ?? 'Unassigned'
      if (!byFellow.has(key)) byFellow.set(key, [])
      byFellow.get(key)!.push(r)
    }
    return Array.from(byFellow.entries())
  }, [rows])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Clinic rotations</h1>
        <p className="mt-1 text-sm text-muted">July – August 2026</p>
      </div>

      <p className="rounded-md border border-line bg-accent-soft/40 px-4 py-3 text-xs text-muted">
        Site codes are shown exactly as they appear on the program calendar. The legend
        (which physician and site each code maps to) is configured by a director under
        site settings.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        fellows.map(([fellow, list]) => {
          const weeks = new Map<string, Map<string, ClinicRotation>>()
          for (const r of list) {
            const wk = mondayOf(r.rotation_date)
            if (!weeks.has(wk)) weeks.set(wk, new Map())
            const dow = new Date(r.rotation_date + 'T00:00:00').getDay()
            weeks.get(wk)!.set(String(dow), r)
          }
          return (
            <Card key={fellow}>
              <CardHeader title={fellow} sub={`${list.length} scheduled days`} />
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-2 text-left font-medium">Week of</th>
                      {WEEKDAYS.map((d) => (
                        <th key={d} className="px-3 py-2 text-left font-medium">{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {Array.from(weeks.entries()).map(([wk, days]) => (
                      <tr key={wk}>
                        <td className="px-4 py-2 text-xs text-muted nums">{shortDate(wk)}</td>
                        {[1, 2, 3, 4, 5].map((dow) => {
                          const cell = days.get(String(dow))
                          if (!cell) return <td key={dow} className="px-3 py-2 text-line">·</td>
                          return (
                            <td key={dow} className="px-3 py-2">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                                  cell.is_protected
                                    ? 'bg-paper text-muted'
                                    : 'bg-accent-soft text-accent'
                                }`}
                              >
                                {cell.site_code ?? 'TBC'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
