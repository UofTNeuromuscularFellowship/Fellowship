// ---------------------------------------------------------------------------
// Conference management — shared types, labels and parsing.
//
// Everything a coordinator edits lives in the conf_* tables (0030), readable
// only by the program's director or admin. Invitees and speakers never see
// those tables: they reach their own record through a private token and the
// conf_public_* functions (0031), called with publicClient.
// ---------------------------------------------------------------------------

export type EventStatus = 'draft' | 'published' | 'archived'
export type RsvpStatus = 'pending' | 'in_person' | 'virtual' | 'declined' | 'waitlist'
export type SessionFormat = 'talk' | 'keynote' | 'panel' | 'workshop' | 'break' | 'meal' | 'other'
export type SpeakerRole = 'speaker' | 'moderator' | 'panelist'
export type DisclosureStatus = 'not_requested' | 'requested' | 'received' | 'nothing_to_declare'

export interface ConfEvent {
  id: string
  name: string
  description: string | null
  starts_on: string
  ends_on: string
  timezone: string
  venue_name: string | null
  venue_address: string | null
  zoom_url: string | null
  zoom_passcode: string | null
  capacity_in_person: number | null
  capacity_virtual: number | null
  status: EventStatus
  feedback_enabled: boolean
  letters_enabled: boolean
  presentations_enabled: boolean
  accommodations_enabled: boolean
  catering_enabled: boolean
  payment_enabled: boolean
  payment_url: string | null
  payment_label: string | null
  payment_note: string | null
  credits_statement: string | null
  organizer_name: string | null
  organizer_email: string | null
  organizer_address: string | null
  reminder_sent_at: string | null
  feedback_sent_at: string | null
  /** Custom invitation email; null means the standard wording. */
  invite_subject: string | null
  invite_message: string | null
  /** Anyone with the public link can register (still subject to capacity). */
  public_registration: boolean
  public_token: string
  created_at: string
}

export type Audience = 'going' | 'in_person' | 'virtual' | 'waitlist' | 'pending' | 'all'
export type MessageStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled'

export interface ConfMessage {
  id: string
  event_id: string
  subject: string
  body: string
  audience: Audience
  status: MessageStatus
  send_at: string | null
  sent_at: string | null
  recipients: number | null
  show_on_page: boolean
  created_at: string
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  going: 'Everyone attending (in person and online)',
  in_person: 'Attending in person',
  virtual: 'Attending online',
  waitlist: 'On the waitlist',
  pending: 'Invited, no reply yet',
  all: 'Everyone except those who declined',
}

/** One row of conf_my_courses(): something the signed-in person is invited to. */
export interface MyCourse {
  token: string
  event_id: string
  event_name: string
  starts_on: string
  ends_on: string
  venue_name: string | null
  online: boolean
  rsvp_status: RsvpStatus
  waitlist_for: 'in_person' | 'virtual' | null
  program: string
  organizer_name: string | null
  event_status: EventStatus
  checked_in: boolean
}

export interface ConfRoom { id: string; event_id: string; name: string; capacity: number | null; notes: string | null; sort: number }

export interface ConfSession {
  id: string
  event_id: string
  room_id: string | null
  title: string
  description: string | null
  session_date: string
  start_time: string
  end_time: string
  format: SessionFormat
  zoom_url: string | null
  credit_hours: number
  sort: number
}

export interface ConfSpeaker {
  id: string
  event_id: string
  full_name: string
  email: string | null
  affiliation: string | null
  bio: string | null
  token: string
  disclosure_status: DisclosureStatus
  disclosure_text: string | null
  disclosure_requested_at: string | null
  disclosure_received_at: string | null
  notes: string | null
}

export interface ConfSessionSpeaker { session_id: string; speaker_id: string; role: SpeakerRole }

export interface ConfInvitee {
  id: string
  event_id: string
  email: string
  full_name: string | null
  institution: string | null
  role_title: string | null
  token: string
  invited_at: string | null
  invite_count: number
  rsvp_status: RsvpStatus
  waitlist_for: 'in_person' | 'virtual' | null
  rsvp_at: string | null
  waitlisted_at: string | null
  dietary: string | null
  accessibility: string | null
  checked_in_at: string | null
  credit_hours_override: number | null
  letter_sent_at: string | null
  unsubscribed_at: string | null
  /** The portal account this invitation belongs to, once there is one. */
  user_id: string | null
  source: 'manual' | 'csv' | 'public'
  notes: string | null
  created_at: string
}

export interface ConfPresentation {
  id: string
  event_id: string
  session_id: string | null
  title: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export interface ConfFeedback {
  id: string
  session_id: string | null
  invitee_id: string
  rating: number | null
  comments: string | null
  created_at: string
}

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  pending: 'No reply',
  in_person: 'In person',
  virtual: 'Online',
  declined: 'Declined',
  waitlist: 'Waitlist',
}

export const RSVP_TONE: Record<RsvpStatus, string> = {
  pending: 'bg-paper text-muted',
  in_person: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  virtual: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  declined: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200',
  waitlist: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
}

export const FORMAT_LABEL: Record<SessionFormat, string> = {
  talk: 'Talk', keynote: 'Keynote', panel: 'Moderated panel', workshop: 'Workshop',
  break: 'Break', meal: 'Meal', other: 'Other',
}

export const DISCLOSURE_LABEL: Record<DisclosureStatus, string> = {
  not_requested: 'Not requested',
  requested: 'Requested',
  received: 'Received',
  nothing_to_declare: 'Nothing to declare',
}

/** Classes shared by every conference form control, matching the portal's own. */
export const input = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink'
export const primaryBtn =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50'
export const quietBtn =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-accent disabled:opacity-50'

// ------------------------------- dates ------------------------------------

/** "Friday, October 16" — dates are calendar dates, so never shift by timezone. */
export function prettyDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function eventWhen(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }
  const [ys, ms, ds] = start.split('-').map(Number)
  const [ye, me, de] = end.split('-').map(Number)
  const a = new Date(ys, ms - 1, ds)
  const b = new Date(ye, me - 1, de)
  if (start === end) return a.toLocaleDateString('en-CA', { weekday: 'long', ...opts })
  if (ys === ye && ms === me) {
    return `${a.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} – ${de}, ${ye}`
  }
  return `${a.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} – ${b.toLocaleDateString('en-CA', opts)}`
}

export const hhmm = (t: string) => t.slice(0, 5)

/** Today as YYYY-MM-DD on the viewer's own calendar (not UTC). */
export function localIsoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ------------------------------ importing ---------------------------------

export interface ImportRow { email: string; full_name?: string; institution?: string; role_title?: string }

/** RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',' || c === ';' || c === '\t') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

const HEADERS: Record<string, keyof ImportRow | 'first' | 'last'> = {
  email: 'email', 'e-mail': 'email', 'email address': 'email', 'e-mail address': 'email', mail: 'email',
  name: 'full_name', 'full name': 'full_name', full_name: 'full_name', attendee: 'full_name',
  'first name': 'first', first: 'first', firstname: 'first', 'given name': 'first',
  'last name': 'last', last: 'last', lastname: 'last', surname: 'last', 'family name': 'last',
  institution: 'institution', organization: 'institution', organisation: 'institution',
  affiliation: 'institution', hospital: 'institution', university: 'institution', company: 'institution',
  role: 'role_title', position: 'role_title', title: 'role_title', 'job title': 'role_title', role_title: 'role_title',
}

/**
 * Turn a spreadsheet export into rows. Reads a header row when there is one
 * (any recognised column name, in any order); otherwise assumes the columns
 * are email, name, institution, role.
 */
export function rowsFromCsv(text: string): ImportRow[] {
  const grid = parseCsv(text)
  if (grid.length === 0) return []
  const head = grid[0].map((h) => h.trim().toLowerCase())
  const mapped = head.map((h) => HEADERS[h])
  const hasHeader = mapped.includes('email') && !grid[0].some((c) => c.includes('@'))
  const body = hasHeader ? grid.slice(1) : grid
  return body.map((cells) => {
    if (!hasHeader) {
      return { email: (cells[0] ?? '').trim(), full_name: cells[1]?.trim(), institution: cells[2]?.trim(), role_title: cells[3]?.trim() }
    }
    const r: ImportRow = { email: '' }
    let first = '', last = ''
    mapped.forEach((k, i) => {
      const v = (cells[i] ?? '').trim()
      if (!k || !v) return
      if (k === 'first') first = v
      else if (k === 'last') last = v
      else r[k] = v
    })
    if (!r.full_name && (first || last)) r.full_name = `${first} ${last}`.trim()
    return r
  }).filter((r) => r.email)
}

/**
 * Typed or pasted addresses: one per line, or separated by commas or
 * semicolons, each optionally as `Name <email>`.
 */
export function rowsFromText(text: string): ImportRow[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*<\s*([^>]+)\s*>$/)
      if (m) return { email: m[2].trim(), full_name: m[1].replace(/^["']|["']$/g, '').trim() || undefined }
      return { email: s }
    })
}

// ------------------------------ exporting ---------------------------------

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((v) => {
      const s = v == null ? '' : String(v)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\r\n')
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function money(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
}

// ------------------------------- safety -----------------------------------

/**
 * A coordinator-entered link, only if it is a web link. The database already
 * refuses anything else (0032); this is the second lock, so a stray
 * "javascript:" value can never become a clickable link on a page served
 * from the portal's origin.
 */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null
  const s = u.trim()
  return /^https?:\/\/[^\s<>"]+$/i.test(s) ? s : null
}

/** Database refusals, reworded for the person who caused them. */
export function friendly(message: string): string {
  if (/_url_web/.test(message)) return 'Links must be full web addresses starting with https:// (or http://).'
  if (/conf_invitees_event_email|duplicate key.*conf_invitees/i.test(message)) return 'That email address is already on the list for this event.'
  if (/violates row-level security|permission denied/i.test(message)) return 'Only the fellowship director or a program admin can change this.'
  if (/conf_messages_scheduled_has_time/.test(message)) return 'Choose when the message should go out.'
  return message
}
