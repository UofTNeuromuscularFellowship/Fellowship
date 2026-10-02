import { googleCalUrl, outlookCalUrl, type CalEntry } from '../lib/calendarLinks'

const btn = 'inline-flex items-center rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:border-accent'

/** Google, Outlook and an .ics download for Apple Calendar and the rest. */
export function AddToCalendar({ entry, onDownload }: { entry: CalEntry; onDownload: () => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Add to your calendar">
      <a className={btn} href={googleCalUrl(entry)} target="_blank" rel="noreferrer">Google Calendar</a>
      <a className={btn} href={outlookCalUrl(entry)} target="_blank" rel="noreferrer">Outlook</a>
      <button type="button" className={btn} onClick={onDownload}>Apple Calendar or other (.ics)</button>
    </div>
  )
}
