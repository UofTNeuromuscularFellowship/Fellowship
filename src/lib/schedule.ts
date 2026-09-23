import { supabase } from './supabase'
import { localToday } from './format'

// ---------------------------------------------------------------------------
// Shared pieces for the clinic and teaching setup steps and the "Make a
// change" flows: dates, the clinic data those screens load, and the checks
// the database makes too (who is in their fellowship, which clinics run and
// have room on a day).
// ---------------------------------------------------------------------------

export const WEEKDAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const WEEKDAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n: number) => String(n).padStart(2, '0')

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(iso: string, n: number): string {
  const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d)
}
/** 1 = Monday … 7 = Sunday, like Postgres isodow. */
export function isoWeekday(iso: string): number {
  const g = fromIso(iso).getDay()
  return g === 0 ? 7 : g
}
export function mondayOf(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso))
}
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
export function weekdaysBetween(from: string, to: string): string[] {
  return daysBetween(from, to).filter((d) => isoWeekday(d) <= 5)
}
/** "Mon Feb 7" */
export function dayLabel(iso: string): string {
  return fromIso(iso).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}
/** "Feb 7, 2028" */
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  return fromIso(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}
export function rangeLabel(from: string | null | undefined, to: string | null | undefined): string {
  if (!from && !to) return 'No dates on file'
  if (from && to) return from === to ? dateLabel(from) : `${dateLabel(from)} – ${dateLabel(to)}`
  return from ? `From ${dateLabel(from)}` : `Until ${dateLabel(to)}`
}
/** The academic year (July 1 – June 30) a date falls in. */
export function academicYear(iso: string = localToday()): { start: string; end: string; label: string } {
  const d = fromIso(iso)
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
  return { start: `${y}-07-01`, end: `${y + 1}-06-30`, label: `${y}–${String(y + 1).slice(2)}` }
}
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

// ------------------------------------------------------------------ clinics

export interface Clinic {
  id: string
  provider_name: string | null
  provider_id: string | null
  weekday: number
  site_code: string
  fellow_capacity: number
  recurrence: 'weekly' | 'dates'
  specific_dates: string[] | null
  active_from: string | null
  active_until: string | null
  paused_dates: string[] | null
}
export interface Rotation {
  id: string
  fellow_id: string | null
  fellow_label: string | null
  rotation_date: string
  site_code: string | null
  provider_name: string | null
  supervisor_id: string | null
  status: 'confirmed' | 'pending' | 'cancelled'
  is_draft: boolean
  is_protected: boolean | null
  has_conflict: boolean
  is_away: boolean
  notes: string | null
}
export interface Fellow { id: string; full_name: string; fellowship_start: string | null; fellowship_end: string | null }
export interface Pattern { id: string; name: string; sort_order: number }
export interface Slot {
  id: string; template_id: string; weekday: number; slot_type: 'clinic' | 'protected'
  clinic_template_id: string | null; monthly_cap: number | null; fallback_clinic_template_id: string | null
}
export interface Person { id: string; full_name: string; role?: string }

export const CLINIC_COLUMNS = 'id, provider_name, provider_id, weekday, site_code, fellow_capacity, recurrence, specific_dates, active_from, active_until, paused_dates'
export const ROTATION_COLUMNS = 'id, fellow_id, fellow_label, rotation_date, site_code, provider_name, supervisor_id, status, is_draft, is_protected, has_conflict, is_away, notes'

export function inFellowship(f: Pick<Fellow, 'fellowship_start' | 'fellowship_end'> | undefined, d: string): boolean {
  if (!f) return false
  return (!f.fellowship_start || f.fellowship_start <= d) && (!f.fellowship_end || f.fellowship_end >= d)
}

export function clinicName(c: Pick<Clinic, 'provider_name' | 'site_code'> | undefined): string {
  if (!c) return 'Unknown clinic'
  return `${c.provider_name ? `${c.provider_name} · ` : ''}${c.site_code}`
}
export function clinicWhen(c: Clinic): string {
  if (c.recurrence === 'dates') return plural((c.specific_dates ?? []).length, 'specific date')
  return `Every ${WEEKDAY_NAMES[c.weekday]}`
}

export function cellLabel(r: Rotation | undefined): string {
  if (!r) return 'Free'
  if (r.is_away) return 'Away'
  if (r.is_protected) return 'Protected'
  if (r.status === 'cancelled') return 'Cancelled clinic'
  if (!r.site_code) return 'Free'
  return `${r.site_code}${r.provider_name ? ` · ${r.provider_name}` : ''}`
}
/** Is this row a fellow sitting in someone's clinic (as opposed to away, protected, cancelled)? */
export function isClinicRow(r: Rotation): boolean {
  return !r.is_away && !r.is_protected && r.status !== 'cancelled' && !!r.site_code
}
/** Does a row belong to this clinic? Rows keep the clinic's site and provider, not its id. */
export function rowIsClinic(r: Rotation, c: Clinic): boolean {
  if (!isClinicRow(r)) return false
  if (r.site_code !== c.site_code) return false
  if (c.provider_id) return r.supervisor_id === c.provider_id
  return !r.supervisor_id && (r.provider_name ?? '') === (c.provider_name ?? '')
}

/** Everything the clinic screens need for a period, loaded in one go. */
export interface ClinicWorld {
  from: string
  to: string
  clinics: Clinic[]
  rotations: Rotation[]
  fellows: Fellow[]
  providers: Person[]
  patterns: Pattern[]
  slots: Slot[]
  starts: Record<string, string>
  providerAway: Set<string>      // `${providerId}|${date}`
  fellowAway: Set<string>        // `${fellowId}|${date}`
}

/** Clinic rows for a period, a page at a time — a year of them is more than one request returns. */
export async function loadRotations(from: string, to: string): Promise<{ data: Rotation[]; error: { message: string } | null }> {
  const all: Rotation[] = []
  const size = 1000
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase.from('clinic_rotations').select(ROTATION_COLUMNS)
      .gte('rotation_date', from).lte('rotation_date', to)
      .order('rotation_date').order('id')
      .range(page * size, page * size + size - 1)
    if (error) return { data: all, error }
    const rows = (data as Rotation[]) ?? []
    all.push(...rows)
    if (rows.length < size) break
  }
  return { data: all, error: null }
}

export async function loadClinicWorld(from: string, to: string): Promise<ClinicWorld> {
  const [cat, rot, fl, pr, tp, sl, fr, pa, fa] = await Promise.all([
    supabase.from('clinic_template').select(CLINIC_COLUMNS).order('weekday').order('provider_name'),
    loadRotations(from, to),
    supabase.rpc('list_fellows', { p_from: from, p_to: to }),
    supabase.rpc('list_providers'),
    supabase.from('fellow_templates').select('id, name, sort_order').order('sort_order').order('created_at'),
    supabase.from('fellow_template_slots').select('id, template_id, weekday, slot_type, clinic_template_id, monthly_cap, fallback_clinic_template_id'),
    supabase.from('fellow_rotation').select('fellow_id, start_template_id'),
    supabase.from('provider_away_dates').select('provider_id, away_date').gte('away_date', from).lte('away_date', to),
    supabase.from('fellow_away_dates').select('fellow_id, away_date').gte('away_date', from).lte('away_date', to),
  ])
  const firstError = [cat, rot, fl, tp, sl].find((r) => r.error)?.error
  if (firstError) throw new Error(firstError.message)
  const starts: Record<string, string> = {}
  for (const r of (fr.data as { fellow_id: string; start_template_id: string | null }[]) ?? []) {
    if (r.start_template_id) starts[r.fellow_id] = r.start_template_id
  }
  return {
    from, to,
    clinics: (cat.data as Clinic[]) ?? [],
    rotations: (rot.data as Rotation[]) ?? [],
    fellows: (fl.data as Fellow[]) ?? [],
    providers: (pr.data as Person[]) ?? [],
    patterns: (tp.data as Pattern[]) ?? [],
    slots: (sl.data as Slot[]) ?? [],
    starts,
    providerAway: new Set(((pa.data as { provider_id: string; away_date: string }[]) ?? []).map((a) => `${a.provider_id}|${a.away_date}`)),
    fellowAway: new Set(((fa.data as { fellow_id: string; away_date: string }[]) ?? []).map((a) => `${a.fellow_id}|${a.away_date}`)),
  }
}

/** Is the clinic offered on that date at all (its weekday, or one of its dates)? */
export function clinicOffersDay(c: Clinic, d: string): boolean {
  return c.recurrence === 'dates' ? (c.specific_dates ?? []).includes(d) : c.weekday === isoWeekday(d)
}
/** Why a clinic isn't running on a day it would normally run, or null. */
export function clinicClosedReason(c: Clinic, d: string, world: Pick<ClinicWorld, 'providerAway'>): string | null {
  if (c.active_from && d < c.active_from) return `starts ${dateLabel(c.active_from)}`
  if (c.active_until && d > c.active_until) return `ended ${dateLabel(c.active_until)}`
  if ((c.paused_dates ?? []).includes(d)) return 'paused'
  if (c.provider_id && world.providerAway.has(`${c.provider_id}|${d}`)) return `${c.provider_name ?? 'provider'} away`
  return null
}
export function clinicRunsOn(c: Clinic, d: string, world: Pick<ClinicWorld, 'providerAway'>): boolean {
  return clinicOffersDay(c, d) && clinicClosedReason(c, d, world) === null
}

/** Fellows booked into a clinic on a day, from the loaded rows. */
export function clinicCount(world: Pick<ClinicWorld, 'rotations'>, c: Clinic, d: string, ignoreFellows: Set<string> = new Set()): number {
  return world.rotations.filter((r) => r.rotation_date === d && rowIsClinic(r, c) && !(r.fellow_id && ignoreFellows.has(r.fellow_id))).length
}

export function rowFor(world: Pick<ClinicWorld, 'rotations'>, fellowId: string, d: string): Rotation | undefined {
  const rows = world.rotations.filter((r) => r.fellow_id === fellowId && r.rotation_date === d)
  return rows.find((r) => r.status !== 'cancelled') ?? rows[0]
}

// -------------------------------------------------------- a change, per day

export type DayMode = 'clinic' | 'protected' | 'free' | 'away'
export interface DayOp { fellow_id: string; date: string; mode: DayMode; clinic_id?: string | null; note?: string }

/** The choice for one day, as held by a select: 'protected', 'free', 'away', 'keep' or a clinic id. */
export type DayChoice = string

export function choiceToOp(fellowId: string, date: string, choice: DayChoice): DayOp | null {
  if (choice === 'keep') return null
  if (choice === 'protected' || choice === 'free' || choice === 'away') return { fellow_id: fellowId, date, mode: choice }
  return { fellow_id: fellowId, date, mode: 'clinic', clinic_id: choice }
}
export function choiceLabel(choice: DayChoice, clinics: Clinic[]): string {
  if (choice === 'keep') return 'Leave as it is'
  if (choice === 'protected') return 'Protected day'
  if (choice === 'free') return 'Nothing scheduled'
  if (choice === 'away') return 'Away'
  if (choice === 'new') return 'The new clinic'
  return clinicName(clinics.find((c) => c.id === choice))
}

/**
 * Clinics a fellow could go to instead on a day: running that day, with room
 * once the changes already chosen are counted. Best first (most room).
 * `taken` counts places already given out by this change: clinicId|date -> n.
 */
export function clinicsWithRoom(world: ClinicWorld, d: string, opts: {
  exclude?: Set<string>; ignoreFellows?: Set<string>; taken?: Map<string, number>
} = {}): { clinic: Clinic; room: number }[] {
  const out: { clinic: Clinic; room: number }[] = []
  for (const c of world.clinics) {
    if (opts.exclude?.has(c.id)) continue
    if (!clinicRunsOn(c, d, world)) continue
    const used = clinicCount(world, c, d, opts.ignoreFellows) + (opts.taken?.get(`${c.id}|${d}`) ?? 0)
    const room = c.fellow_capacity - used
    if (room > 0) out.push({ clinic: c, room })
  }
  return out.sort((a, b) => b.room - a.room || clinicName(a.clinic).localeCompare(clinicName(b.clinic)))
}

/** Who a set of day changes will email (published days only), for the "Who is told" list. */
export function whoIsTold(world: ClinicWorld, ops: DayOp[], extraProviderIds: string[] = []): string[] {
  const fellows = new Set<string>()
  const sups = new Set<string>(extraProviderIds)
  for (const op of ops) {
    const cur = rowFor(world, op.fellow_id, op.date)
    if (cur?.is_draft) continue
    fellows.add(op.fellow_id)
    if (cur && isClinicRow(cur) && cur.supervisor_id) sups.add(cur.supervisor_id)
    if (op.mode === 'clinic') {
      const c = world.clinics.find((x) => x.id === op.clinic_id)
      if (c?.provider_id) sups.add(c.provider_id)
    }
  }
  const names: string[] = []
  for (const id of sups) names.push(world.providers.find((p) => p.id === id)?.full_name ?? 'A supervisor')
  for (const id of fellows) names.push(world.fellows.find((f) => f.id === id)?.full_name ?? 'A fellow')
  return Array.from(new Set(names))
}

/** The last day that has any clinic row — how far the schedule has been generated. */
export async function scheduleHorizon(): Promise<string | null> {
  const { data } = await supabase.from('clinic_rotations').select('rotation_date').order('rotation_date', { ascending: false }).limit(1)
  return (data as { rotation_date: string }[] | null)?.[0]?.rotation_date ?? null
}

export interface ScheduleChange {
  id: string; area: 'clinic' | 'teaching'; kind: string; summary: string
  days_changed: number; people_told: number; changed_by: string | null; changed_at: string
}

/**
 * Warnings for day choices that would put a clinic over its places, counting
 * what is already booked plus the other choices in the same change. Keys are
 * `${fellowId}|${date}`; choices are clinic ids or 'protected' / 'free' / … .
 */
export function capacityWarnings(
  world: ClinicWorld,
  rows: { key: string; date: string; choice: string; include: boolean; blocked?: string | null }[],
): Map<string, string> {
  const live = rows.filter((r) => r.include && !r.blocked)
  const byDay = new Map<string, typeof live>()
  for (const r of live) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r])
  const out = new Map<string, string>()
  for (const [d, list] of byDay) {
    const moving = new Set(list.map((r) => r.key.split('|')[0]))
    const chosen = new Map<string, string[]>()
    for (const r of list) if (world.clinics.some((c) => c.id === r.choice)) chosen.set(r.choice, [...(chosen.get(r.choice) ?? []), r.key])
    for (const [cid, keys] of chosen) {
      const c = world.clinics.find((x) => x.id === cid)!
      const total = clinicCount(world, c, d, moving) + keys.length
      if (total > c.fellow_capacity) {
        for (const k of keys) out.set(k, `Over its ${plural(c.fellow_capacity, 'place')} that day`)
      }
      const closed = clinicClosedReason(c, d, world)
      if (closed || !clinicOffersDay(c, d)) {
        for (const k of keys) out.set(k, closed ? `Not running that day (${closed})` : 'Doesn’t run on that day')
      }
    }
  }
  return out
}
