// ---------------------------------------------------------------------------
// "Add to calendar" for rounds and courses: links that open a prefilled
// event in Google Calendar or Outlook, and an .ics file for Apple Calendar
// and everything else. The emails carry the same links (cal_links_html).
// ---------------------------------------------------------------------------

export interface CalEntry {
  title: string
  /** A timed entry… */
  start?: Date
  end?: Date
  /** …or whole days, YYYY-MM-DD, both inclusive. */
  fromDate?: string
  toDate?: string
  location: string
  details: string
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}/, '')
// %20 rather than URLSearchParams' "+": Outlook shows a "+" literally.
const query = (o: [string, string][]) => o.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
function dayAfter(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export function googleCalUrl(e: CalEntry): string {
  const dates = e.start && e.end
    ? `${stamp(e.start)}/${stamp(e.end)}`
    : `${e.fromDate!.replace(/-/g, '')}/${dayAfter(e.toDate ?? e.fromDate!).replace(/-/g, '')}`
  return `https://calendar.google.com/calendar/render?${query([['action', 'TEMPLATE'], ['text', e.title], ['dates', dates], ['details', e.details], ['location', e.location]])}`
}

export function outlookCalUrl(e: CalEntry): string {
  const when: [string, string][] = e.start && e.end
    ? [['startdt', iso(e.start)], ['enddt', iso(e.end)]]
    : [['allday', 'true'], ['startdt', e.fromDate!], ['enddt', dayAfter(e.toDate ?? e.fromDate!)]]
  return `https://outlook.office.com/calendar/0/deeplink/compose?${query([
    ['path', '/calendar/action/compose'], ['rru', 'addevent'], ['subject', e.title], ...when, ['body', e.details], ['location', e.location]])}`
}

export const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
export const icsStamp = stamp
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 73) { out.push(rest.slice(0, 73)); rest = ' ' + rest.slice(73) }
  out.push(rest)
  return out.join('\r\n')
}

/** A one-entry .ics, downloaded under the given name. */
export function downloadIcsEntry(e: CalEntry & { uid: string; url?: string }, fileName: string) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Neuromuscular Fellowship//Rounds//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(new Date())}`,
    ...(e.start && e.end
      ? [`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`]
      : [`DTSTART;VALUE=DATE:${e.fromDate!.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${dayAfter(e.toDate ?? e.fromDate!).replace(/-/g, '')}`]),
    `SUMMARY:${icsText(e.title)}`, `LOCATION:${icsText(e.location)}`, `DESCRIPTION:${icsText(e.details)}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, 'TRIGGER:-PT30M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR']
  saveIcs(lines, fileName)
}

export function saveIcs(lines: string[], fileName: string) {
  const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${fileName.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
