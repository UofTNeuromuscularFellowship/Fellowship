import { supabase } from './supabase'
import { dayLabel } from './schedule'

// ---------------------------------------------------------------------------
// Shared pieces for the teaching setup steps and the teaching changes.
// ---------------------------------------------------------------------------

export interface Session {
  id: string
  session_date: string
  start_time: string
  end_time: string
  topic: string | null
  provider_id: string | null
  provider_name: string | null
  is_break: boolean
  break_label: string | null
  status: 'confirmed' | 'pending_confirmation' | 'rescheduled' | 'cancelled'
  assignment_draft: boolean
  provider_confirmed: boolean
}
export interface Teacher { id: string; full_name: string; role: string }
export interface TopicDefault { topic: string; default_provider_id: string | null; default_provider_name: string | null }

export const SESSION_COLUMNS = 'id, session_date, start_time, end_time, topic, provider_id, provider_name, is_break, break_label, status, assignment_draft, provider_confirmed'

export interface TeachingWorld {
  sessions: Session[]
  teachers: Teacher[]
  defaults: TopicDefault[]
  away: Set<string>   // `${personId}|${date}`
}

export async function loadTeachingWorld(from: string, to: string): Promise<TeachingWorld> {
  const [s, t, d, pa, fa] = await Promise.all([
    supabase.from('teaching_sessions').select(SESSION_COLUMNS).gte('session_date', from).lte('session_date', to).order('session_date').order('start_time'),
    supabase.rpc('list_teachers'),
    supabase.from('topic_provider_defaults').select('topic, default_provider_id, default_provider_name'),
    supabase.from('provider_away_dates').select('provider_id, away_date').gte('away_date', from).lte('away_date', to),
    supabase.from('fellow_away_dates').select('fellow_id, away_date').gte('away_date', from).lte('away_date', to),
  ])
  if (s.error) throw new Error(s.error.message)
  const away = new Set<string>()
  for (const a of (pa.data as { provider_id: string; away_date: string }[]) ?? []) away.add(`${a.provider_id}|${a.away_date}`)
  for (const a of (fa.data as { fellow_id: string; away_date: string }[]) ?? []) away.add(`${a.fellow_id}|${a.away_date}`)
  return {
    sessions: (s.data as Session[]) ?? [],
    teachers: (t.data as Teacher[]) ?? [],
    defaults: (d.data as TopicDefault[]) ?? [],
    away,
  }
}

export function time5(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5)
}
export function sessionLabel(s: Pick<Session, 'session_date' | 'start_time' | 'topic'>): string {
  return `${dayLabel(s.session_date)}, ${time5(s.start_time)} · ${s.topic ?? 'Topic to be confirmed'}`
}
export function teacherLabel(s: Pick<Session, 'provider_name'>): string {
  return s.provider_name ?? 'No teacher yet'
}

export type Availability = 'usual' | 'free' | 'busy' | 'away'

/** Who could teach a session on a date, best first: the topic's usual teacher, then free people. */
export function rankTeachers(w: TeachingWorld, date: string, topic: string | null, ignoreSession?: string): { t: Teacher; a: Availability; note: string }[] {
  const usual = w.defaults.find((d) => d.topic === topic)
  const out = w.teachers.map((t) => {
    const away = w.away.has(`${t.id}|${date}`)
    const busy = w.sessions.some((s) => s.id !== ignoreSession && s.session_date === date && s.provider_id === t.id && s.status !== 'cancelled' && !s.is_break)
    const isUsual = !!usual && (usual.default_provider_id === t.id || (!usual.default_provider_id && usual.default_provider_name === t.full_name))
    const a: Availability = away ? 'away' : busy ? 'busy' : isUsual ? 'usual' : 'free'
    const note = away ? 'Away that day' : busy ? 'Teaching another session that day' : isUsual ? `Usually teaches ${topic}` : 'Free that day'
    return { t, a, note }
  })
  const order: Record<Availability, number> = { usual: 0, free: 1, busy: 2, away: 3 }
  return out.sort((x, y) => order[x.a] - order[y.a] || (x.t.role === 'fellow' ? 1 : 0) - (y.t.role === 'fellow' ? 1 : 0) || x.t.full_name.localeCompare(y.t.full_name))
}

/** The regular day and time of a set of sessions: the most common weekday and start–end. */
export function regularPattern(sessions: Session[]): { weekday: number; start: string; end: string; count: number } | null {
  const live = sessions.filter((s) => !s.is_break && s.status !== 'cancelled')
  if (live.length === 0) return null
  const tally = new Map<string, number>()
  for (const s of live) {
    const g = new Date(s.session_date + 'T00:00:00').getDay()
    const key = `${g === 0 ? 7 : g}|${time5(s.start_time)}|${time5(s.end_time)}`
    tally.set(key, (tally.get(key) ?? 0) + 1)
  }
  const [key, count] = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0]
  const [wd, start, end] = key.split('|')
  return { weekday: Number(wd), start, end, count }
}
