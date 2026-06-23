import type { CaseRow, CompetencyTarget } from '../types/database'
import { PROCEDURE_METRICS } from './nm'

const PROC_COLUMN: Record<string, keyof CaseRow> = {
  ncs: 'ncs_count', emg: 'emg_count', rns: 'rns_count', sfemg: 'sfemg_count',
}

// Cohort default (fellow_id null) is overridden by a per-fellow row with the
// same metric_key. Returns one effective target per metric_key.
export function mergeTargets(targets: CompetencyTarget[], fellowId: string): CompetencyTarget[] {
  const byKey = new Map<string, CompetencyTarget>()
  for (const t of targets) {
    const existing = byKey.get(t.metric_key)
    if (!existing) { byKey.set(t.metric_key, t); continue }
    // prefer the per-fellow override
    const incomingIsOverride = t.fellow_id === fellowId
    const existingIsOverride = existing.fellow_id === fellowId
    if (incomingIsOverride && !existingIsOverride) byKey.set(t.metric_key, t)
  }
  return Array.from(byKey.values()).sort((a, b) => a.sort_order - b.sort_order)
}

export function progressFor(target: CompetencyTarget, cases: CaseRow[]): number {
  if (target.metric_kind === 'procedural') {
    const col = PROC_COLUMN[target.metric_key]
    if (!col) return 0
    return cases.reduce((sum, c) => sum + (Number(c[col]) || 0), 0)
  }
  // disease: count cases tagged with this diagnosis (case-insensitive)
  const key = target.metric_key.toLowerCase()
  return cases.filter((c) => (c.diagnoses ?? []).some((d) => d.toLowerCase() === key)).length
}

export function isProcedureKey(k: string): boolean {
  return PROCEDURE_METRICS.some((m) => m.key === k)
}
