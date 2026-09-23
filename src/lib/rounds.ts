// ---------------------------------------------------------------------------
// Rounds: types, time zone arithmetic, and turning a repeat rule into dates.
//
// A session's time is stored as a UTC instant plus the time zone it was set
// in, so "12:00 in Vancouver" stays 12:00 in Vancouver across a daylight
// saving change, and everyone's email shows it in that zone.
// ---------------------------------------------------------------------------

export type RoundsFormat = 'in_person' | 'virtual' | 'hybrid'
export type Recurrence = 'once' | 'weekly' | 'monthly' | 'interval'

export interface RoundsSeries {
  id: string
  title: string
  description: string | null
  format: RoundsFormat
  location: string | null
  video_url: string | null
  video_passcode: string | null
  timezone: string
  duration_min: number
  recurrence: Recurrence
  recurrence_rule: RepeatRule | Record<string, never>
  credit_hours: number | null
  credits_statement: string | null
  organizer_name: string | null
  organizer_email: string | null
  logo_url: string | null
  invite_program: boolean
  /** null: invitations go out as soon as a session has a topic; otherwise this many days before */
  invite_lead_days: number | null
  reminder_enabled: boolean
  feedback_enabled: boolean
  status: 'active' | 'archived'
  created_at: string
}

export interface RoundsSession {
  id: string
  series_id: string
  starts_at: string
  ends_at: string
  timezone: string
  topic: string | null
  speaker: string | null
  details: string | null
  format: RoundsFormat | null
  location: string | null
  video_url: string | null
  status: 'scheduled' | 'cancelled'
  cancel_reason: string | null
  invite_sent_at: string | null
  reminder_sent_at: string | null
  feedback_sent_at: string | null
}

export interface RoundsList { id: string; name: string; created_at: string }
export interface RoundsMember { id: string; list_id: string; email: string; full_name: string | null }

export interface RoundsInvite {
  id: string
  session_id: string
  email: string
  full_name: string | null
  response: 'in_person' | 'virtual' | 'declined' | null
  responded_at: string | null
  attended: boolean | null
  rating: number | null
  comments: string | null
  feedback_at: string | null
  invited_at: string | null
}

export const FORMAT_LABEL: Record<RoundsFormat, string> = {
  in_person: 'In person',
  virtual: 'Online (Zoom or other video)',
  hybrid: 'Hybrid — in person and online',
}
export const FORMAT_SHORT: Record<RoundsFormat, string> = { in_person: 'In person', virtual: 'Online', hybrid: 'Hybrid' }

export const ZONES = [
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Regina',
  'America/Halifax', 'America/St_Johns', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Jerusalem', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
]

/** The zones to offer: the list above, plus the viewer's own and any already in use. */
export function zoneOptions(...extra: (string | null | undefined)[]): string[] {
  const mine = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } })()
  return Array.from(new Set([...ZONES, mine, ...extra].filter(Boolean) as string[]))
}
export function zoneLabel(z: string): string {
  return z.replace(/^[A-Za-z]+\//, '').replace(/_/g, ' ') + (z.includes('/') ? ` (${z.split('/')[0]})` : '')
}

// ------------------------------------------------------------ time zones

function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o
}

/** How far a zone is ahead of UTC at an instant, in ms. */
function offsetMs(d: Date, tz: string): number {
  const p = parts(d, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second)
  return asUtc - Math.floor(d.getTime() / 1000) * 1000
}

/** The instant a wall-clock date and time in a zone falls on. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let t = guess - offsetMs(new Date(guess), tz)
  // once more, for times near a daylight saving change
  t = guess - offsetMs(new Date(t), tz)
  return new Date(t)
}

/** The wall-clock date and time of an instant in a zone. */
export function utcToZoned(iso: string, tz: string): { date: string; time: string } {
  const p = parts(new Date(iso), tz)
  const z = (n: number) => String(n).padStart(2, '0')
  return { date: `${p.year}-${z(p.month)}-${z(p.day)}`, time: `${z(p.hour % 24)}:${z(p.minute)}` }
}

/** "Thu, Oct 15, 2026 · 12:00–13:00 EDT" in the session's zone. */
export function sessionWhen(startIso: string, endIso: string, tz: string): string {
  const s = new Date(startIso), e = new Date(endIso)
  const day = s.toLocaleDateString('en-CA', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
  const abbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(s).find((p) => p.type === 'timeZoneName')?.value ?? tz
  return `${day} · ${t(s)}–${t(e)} ${abbr}`
}

/** The same session in the viewer's own zone, when that differs. */
export function inMyZone(startIso: string, tz: string): string | null {
  let mine: string
  try { mine = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return null }
  if (!mine || mine === tz) return null
  const a = utcToZoned(startIso, tz), b = utcToZoned(startIso, mine)
  if (a.date === b.date && a.time === b.time) return null
  const s = new Date(startIso)
  return `${s.toLocaleDateString('en-CA', { timeZone: mine, weekday: 'short', month: 'short', day: 'numeric' })} ${s.toLocaleTimeString('en-GB', { timeZone: mine, hour: '2-digit', minute: '2-digit' })} your time`
}

// --------------------------------------------------------------- repeats

export interface RepeatRule {
  start: string              // first date, YYYY-MM-DD
  time: string               // HH:MM
  /** weekly and interval: ISO weekdays, 1 = Monday */
  weekdays?: number[]
  /** interval: every N weeks */
  every?: number
  /** monthly: 'nth' (e.g. the 2nd Tuesday) or 'day' (e.g. the 15th) */
  monthly?: 'nth' | 'day'
  /** monthly nth: 1–4, or -1 for the last */
  nth?: number
  weekday?: number
  day?: number
  end: 'until' | 'count'
  until?: string
  count?: number
}

export const MAX_SESSIONS = 60
const DAY = 86400000

function isoToDate(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
function dateToIso(d: Date) { return d.toISOString().slice(0, 10) }
function isoDow(d: Date) { return ((d.getUTCDay() + 6) % 7) + 1 }

/** The dates a rule produces, in order, at most MAX_SESSIONS. */
export function expandRule(kind: Recurrence, r: RepeatRule): string[] {
  if (!r.start) return []
  if (kind === 'once') return [r.start]
  const start = isoToDate(r.start)
  const limit = r.end === 'count' ? Math.min(Math.max(1, r.count ?? 1), MAX_SESSIONS) : MAX_SESSIONS
  const until = r.end === 'until' && r.until ? isoToDate(r.until) : new Date(start.getTime() + 366 * DAY)
  const out: string[] = []

  if (kind === 'weekly' || kind === 'interval') {
    const days = (r.weekdays?.length ? r.weekdays : [isoDow(start)]).slice().sort()
    const every = kind === 'interval' ? Math.max(1, r.every ?? 2) : 1
    // weeks counted from the Monday of the first date's week
    const monday = new Date(start.getTime() - (isoDow(start) - 1) * DAY)
    for (let w = 0; out.length < limit; w += every) {
      const weekStart = monday.getTime() + w * 7 * DAY
      if (weekStart > until.getTime()) break
      for (const dow of days) {
        const d = new Date(weekStart + (dow - 1) * DAY)
        if (d < start || d > until) continue
        out.push(dateToIso(d))
        if (out.length >= limit) break
      }
    }
    return out
  }

  // monthly
  for (let i = 0; out.length < limit && i < 120; i++) {
    const y = start.getUTCFullYear(), m = start.getUTCMonth() + i
    let d: Date | null = null
    if (r.monthly === 'day') {
      const want = Math.min(Math.max(1, r.day ?? start.getUTCDate()), 31)
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      d = new Date(Date.UTC(y, m, Math.min(want, last)))
    } else {
      const wd = r.weekday ?? isoDow(start)
      const nth = r.nth ?? Math.ceil(start.getUTCDate() / 7)
      if (nth === -1) {
        const last = new Date(Date.UTC(y, m + 1, 0))
        d = new Date(last.getTime() - ((isoDow(last) - wd + 7) % 7) * DAY)
      } else {
        const first = new Date(Date.UTC(y, m, 1))
        d = new Date(first.getTime() + (((wd - isoDow(first) + 7) % 7) + (nth - 1) * 7) * DAY)
        if (d.getUTCMonth() !== ((m % 12) + 12) % 12) d = null // no 5th Tuesday this month
      }
    }
    if (!d) continue
    if (d > until) break
    if (d >= start) out.push(dateToIso(d))
  }
  return out
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const NTH = [{ v: 1, l: 'first' }, { v: 2, l: 'second' }, { v: 3, l: 'third' }, { v: 4, l: 'fourth' }, { v: -1, l: 'last' }]

/** "Every other week on Tuesday", for lists and summaries. */
export function describeRule(kind: Recurrence, r: RepeatRule | Record<string, never>): string {
  const rr = r as RepeatRule
  if (kind === 'once') return 'One date'
  const days = (rr.weekdays ?? []).map((d) => WEEKDAYS[d - 1]).join(' and ')
  if (kind === 'weekly') return days ? `Weekly on ${days}` : 'Weekly'
  if (kind === 'interval') return `Every ${rr.every === 2 ? 'other' : `${rr.every ?? 2}`} week${rr.every === 2 ? '' : 's'}${days ? ` on ${days}` : ''}`
  if (rr.monthly === 'day') return `Monthly on day ${rr.day ?? ''}`.trim()
  const n = NTH.find((x) => x.v === rr.nth)?.l
  return n && rr.weekday ? `Monthly on the ${n} ${WEEKDAYS[rr.weekday - 1]}` : 'Monthly'
}

/** Split a pasted block into people: one per line, "Name <email>", "email, Name" or just an email. */
export function parsePeople(text: string): { email: string; full_name: string | null }[] {
  const out: { email: string; full_name: string | null }[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/[\n;]+/)) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/)
    if (!m) continue
    const email = m[0].toLowerCase()
    if (seen.has(email)) continue
    seen.add(email)
    const name = line.replace(m[0], '').replace(/[<>"(),\t]/g, ' ').replace(/\s+/g, ' ').trim()
    out.push({ email, full_name: name || null })
  }
  return out
}

export function rsvpLabel(r: RoundsInvite['response']): string {
  return r === 'in_person' ? 'Coming in person' : r === 'virtual' ? 'Joining online' : r === 'declined' ? 'Can’t come' : 'No reply'
}

/**
 * When a session's invitation is due — the same rule as rounds_invite_due()
 * in the database: one week after the previous (not cancelled) session in the
 * series ends; one day after, if a week would land on or after this session's
 * day; right after it, if sessions are a day apart. The first session is due
 * straight away (null here). It still needs a topic before it goes.
 */
export function inviteDue(
  s: Pick<RoundsSession, 'id' | 'starts_at' | 'timezone'>,
  all: Pick<RoundsSession, 'id' | 'starts_at' | 'ends_at' | 'status'>[],
): Date | null {
  const prev = all
    .filter((p) => p.id !== s.id && p.status === 'scheduled' && p.starts_at < s.starts_at)
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0]
  if (!prev) return null
  const end = new Date(prev.ends_at).getTime()
  const start = new Date(s.starts_at).getTime()
  let due = end + 7 * 86400000
  if (utcToZoned(new Date(due).toISOString(), s.timezone).date >= utcToZoned(s.starts_at, s.timezone).date) due = end + 86400000
  if (due >= start) due = end
  return new Date(due)
}
