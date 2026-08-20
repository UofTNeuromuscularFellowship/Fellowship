export function formatDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function shortDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

/** Today's date in the viewer's own timezone, as YYYY-MM-DD.
 *
 * Not `toISOString().slice(0, 10)` — that is the UTC date, which in Toronto
 * rolls over to tomorrow at 20:00 local. */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

/** Has a session finished?
 *
 * A session on today's date is only "past" once its end_time has gone by, which
 * is what lets the attendance and session-report controls appear the same
 * morning rather than the next day. This mirrors the end_time guard in
 * enqueue_teaching_reminders(), so the portal and the 9:00 AM email agree on
 * which sessions are finished.
 *
 * Times are zero-padded HH:MM:SS, so string comparison is safe. */
export function sessionHasEnded(
  sessionDate: string,
  endTime: string | null | undefined,
  now: Date = new Date()
): boolean {
  const today = localToday(now)
  if (sessionDate < today) return true
  if (sessionDate > today) return false
  if (!endTime) return false
  const p = (n: number) => String(n).padStart(2, '0')
  const clock = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  return endTime.slice(0, 8) <= clock
}
