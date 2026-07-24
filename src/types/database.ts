// Minimal hand-written types for Phase 1.
// Regenerate the full set from your schema with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type UserRole = 'fellow' | 'supervisor' | 'director' | 'admin' | 'assistant'
export type UserStatus = 'active' | 'alumni' | 'inactive'

export interface AppUser {
  id: string
  email: string
  full_name: string
  role: UserRole
  status: UserStatus
  cohort_year: string | null
  duration_years: number | null
  start_date: string | null
  end_date: string | null
  phone: string | null
  assistant_emails?: string[] | null
}

export interface TeachingSession {
  id: string
  session_date: string
  start_time: string
  end_time: string
  topic: string | null
  provider_name: string | null
  status: 'confirmed' | 'pending_confirmation' | 'rescheduled' | 'cancelled'
  is_break: boolean
  break_label: string | null
  zoom_link: string | null
  provider_confirmed?: boolean
  conflict_flagged?: boolean
  conflict_reason?: string | null
}

export interface ClinicRotation {
  id: string
  fellow_id: string | null
  fellow_label: string | null
  rotation_date: string
  site_code: string | null
  status: 'confirmed' | 'pending' | 'cancelled'
  is_protected: boolean
}

// Loose Database shape so the typed client compiles without the full gen.
export type Database = any

// ---- Phase 2 ----
export interface CaseRow {
  id: string
  fellow_id: string
  rotation_id: string | null
  case_date: string
  title: string
  age: number | null
  sex: string | null
  presentation: string | null
  nerves_tested: string[]
  muscles_tested: string[]
  diagnoses: string[]
  ncs_count: number
  emg_count: number
  rns_count: number
  sfemg_count: number
  summary: string | null
  teaching_points: string | null
  visibility: 'private' | 'shared'
  created_at: string
  updated_at: string
}

export interface CaseFeedbackRow {
  id: string
  case_id: string
  author_id: string
  body: string
  created_at: string
  author?: { full_name: string; role: UserRole } | null
}

export interface CompetencyTarget {
  id: string
  cohort_year: string
  fellow_id: string | null
  metric_key: string
  metric_label: string
  metric_kind: 'procedural' | 'disease'
  target_value: number
  sort_order: number
}
