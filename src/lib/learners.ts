import { addDays, isoWeekday } from './schedule'

// ---------------------------------------------------------------------------
// Learners: residents and medical students on a clinic rotation. They are not
// portal members; the director keeps their details, and their clinic days are
// drafted into places the fellows haven't filled.
// ---------------------------------------------------------------------------

export type LearnerType = 'resident' | 'medical_student' | 'other'
export type OffKind = 'away' | 'teaching'

export interface OffRule { weekday: number; kind: OffKind; reason: string | null }

export interface Learner {
  id: string
  full_name: string
  email: string
  phone: string | null
  school: string | null
  learner_type: LearnerType
  level: string | null
  specialty: string | null
  rotation_start: string
  rotation_end: string
  off_rules: OffRule[]
  notes: string | null
  status: 'active' | 'archived'
  created_at: string
}

export interface OffDate { id: string; learner_id: string; off_date: string; kind: OffKind; reason: string | null; recurring: boolean }

export interface LearnerDay {
  id: string
  learner_id: string
  rotation_date: string
  clinic_template_id: string | null
  site_code: string
  provider_name: string | null
  supervisor_id: string | null
  is_draft: boolean
  status: 'confirmed' | 'cancelled'
  feedback_requested_at: string | null
}

export interface LearnerFeedbackRow {
  id: string
  learner_rotation_id: string
  learner_id: string
  supervisor_id: string | null
  supervisor_name: string | null
  meets_level: 'below' | 'meets' | 'above'
  did_well: string | null
  improve: string | null
  submitted_at: string
}

export const LEARNER_COLUMNS = 'id, full_name, email, phone, school, learner_type, level, specialty, rotation_start, rotation_end, off_rules, notes, status, created_at'

export const TYPE_LABEL: Record<LearnerType, string> = { resident: 'Resident', medical_student: 'Medical student', other: 'Other learner' }

/** Suggestions for the level field; anything can be typed. */
export const LEVELS: Record<LearnerType, string[]> = {
  resident: ['PGY-1', 'PGY-2', 'PGY-3', 'PGY-4', 'PGY-5', 'PGY-6'],
  medical_student: ['Clerk (year 3)', 'Clerk (year 4)', 'Pre-clerkship', 'Visiting elective'],
  other: [],
}

export const MEETS_LABEL: Record<LearnerFeedbackRow['meets_level'], string> = {
  below: 'Below the level expected',
  meets: 'Meets the level expected',
  above: 'Above the level expected',
}
export const MEETS_TONE: Record<LearnerFeedbackRow['meets_level'], string> = {
  below: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100',
  meets: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  above: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100',
}

export function learnerSummary(l: Pick<Learner, 'learner_type' | 'level' | 'school'>): string {
  return [l.level || TYPE_LABEL[l.learner_type], l.school].filter(Boolean).join(' · ')
}

/** The dates a set of weekly rules takes out of a rotation. */
export function expandOffRules(rules: OffRule[], start: string, end: string): { off_date: string; kind: OffKind; reason: string | null }[] {
  const out: { off_date: string; kind: OffKind; reason: string | null }[] = []
  if (!start || !end || end < start || !rules.length) return out
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const r = rules.find((x) => x.weekday === isoWeekday(d))
    if (r) out.push({ off_date: d, kind: r.kind, reason: r.reason })
  }
  return out
}
