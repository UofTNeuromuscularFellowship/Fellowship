import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { eventWhen, type ConfEvent } from '../lib/conference'
import { EventSettings } from '../components/conference/EventSettings'
import { Itinerary } from '../components/conference/Itinerary'
import { Speakers } from '../components/conference/Speakers'
import { Attendees } from '../components/conference/Attendees'
import { Presentations } from '../components/conference/Presentations'
import { FeedbackResults } from '../components/conference/FeedbackResults'
import { RecordTable } from '../components/conference/RecordTable'
import { InvitationEditor } from '../components/conference/InvitationEditor'
import { Messages } from '../components/conference/Messages'
import { Segmented } from '../components/conference/Segmented'
import { SetupWizard } from '../components/conference/SetupWizard'
import { EventOverview } from '../components/conference/EventOverview'
import { Money } from '../components/conference/money/Money'

// ---------------------------------------------------------------------------
// One event. A new event opens in the guided setup (SetupWizard); once that
// is finished it opens on five sections, each with a few pages inside:
//
//   Overview    where things stand and what to do next
//   Program     schedule, speakers, presentations
//   People      invitations and replies, messages, feedback
//   Money       budget, costs & income, speaker pay, report
//   Logistics   hotels, catering, materials, sponsors, to-do
//
// Settings (and deleting the event) sit behind the button in the header.
// Features switched off for the event don't appear at all.
// ---------------------------------------------------------------------------

const SECTIONS = [
  ['overview', 'Overview'],
  ['program', 'Program'],
  ['people', 'People'],
  ['money', 'Money'],
  ['logistics', 'Logistics'],
] as const
type Section = (typeof SECTIONS)[number][0] | 'settings'

export default function ConferenceEvent() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const section = (params.get('section') as Section) || 'overview'
  const view = params.get('view') ?? ''
  const [event, setEvent] = useState<ConfEvent | null>(null)
  const [missing, setMissing] = useState(false)
  const portalUrl = window.location.origin

  const load = useCallback(async () => {
    const { data } = await supabase.from('conf_events').select('*').eq('id', id).maybeSingle()
    if (!data) setMissing(true)
    setEvent(data as ConfEvent | null)
  }, [id])
  useEffect(() => { load() }, [load])

  const go = useCallback((s: string, v?: string) => {
    setParams(v ? { section: s, view: v } : { section: s })
    window.scrollTo({ top: 0 })
  }, [setParams])
  const setView = (v: string) => setParams({ section, view: v }, { replace: true })

  if (missing) return (
    <div className="space-y-2">
      <p className="text-sm text-muted">That event does not exist, or belongs to another program.</p>
      <Link to="/events" className="text-sm font-medium text-accent hover:underline">Back to events</Link>
    </div>
  )
  if (!event) return <p className="text-sm text-muted">Loading…</p>

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link to="/events" className="text-xs font-medium text-muted hover:text-ink">← Events</Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">{event.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {eventWhen(event.starts_on, event.ends_on)}{event.venue_name ? ` · ${event.venue_name}` : ''}
          {event.zoom_url ? ' · online' : ''}
          <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-medium capitalize">{event.status}</span>
        </p>
      </div>
      {event.setup_done && (
        <button onClick={() => go(section === 'settings' ? 'overview' : 'settings')}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${section === 'settings' ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
          {section === 'settings' ? 'Close settings' : 'Settings'}
        </button>
      )}
    </div>
  )

  if (!event.setup_done) {
    return <div className="space-y-6">{header}<SetupWizard event={event} reload={load} portalUrl={portalUrl} /></div>
  }

  return (
    <div className="space-y-6">
      {header}

      {section !== 'settings' && (
        <nav aria-label="Event sections">
          <div className="flex gap-x-1 overflow-x-auto border-b border-line">
            {SECTIONS.map(([key, label]) => (
              <button key={key} onClick={() => go(key)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${section === key
                  ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}

      {section === 'overview' && <EventOverview event={event} go={go} onChanged={load} />}
      {section === 'settings' && <EventSettings event={event} onSaved={load} />}
      {section === 'program' && <Program event={event} view={view} setView={setView} portalUrl={portalUrl} />}
      {section === 'people' && <People event={event} view={view} setView={setView} portalUrl={portalUrl} reload={load} />}
      {section === 'money' && <Money event={event} portalUrl={portalUrl} />}
      {section === 'logistics' && <Logistics event={event} view={view} setView={setView} />}
    </div>
  )
}

function Program({ event, view, setView, portalUrl }: { event: ConfEvent; view: string; setView: (v: string) => void; portalUrl: string }) {
  const opts: [string, string][] = [['schedule', 'Schedule'], ['speakers', 'Speakers']]
  if (event.presentations_enabled) opts.push(['presentations', 'Presentations'])
  const v = opts.some(([k]) => k === view) ? view : 'schedule'
  return (
    <div className="space-y-5">
      <Segmented label="Program" value={v} options={opts} onChange={setView} />
      {v === 'schedule' && <Itinerary event={event} />}
      {v === 'speakers' && <Speakers event={event} portalUrl={portalUrl} />}
      {v === 'presentations' && <Presentations event={event} />}
    </div>
  )
}

function People({ event, view, setView, portalUrl, reload }: {
  event: ConfEvent; view: string; setView: (v: string) => void; portalUrl: string; reload: () => void
}) {
  const opts: [string, string][] = [['invitations', 'Invitations & replies'], ['messages', 'Messages']]
  if (event.feedback_enabled) opts.push(['feedback', 'Feedback'])
  const v = opts.some(([k]) => k === view) ? view : 'invitations'
  return (
    <div className="space-y-5">
      <Segmented label="People" value={v} options={opts} onChange={setView} />
      {v === 'invitations' && (
        <div className="space-y-6">
          <InvitationEditor event={event} onSaved={reload} />
          <Attendees event={event} portalUrl={portalUrl} />
        </div>
      )}
      {v === 'messages' && <Messages event={event} />}
      {v === 'feedback' && <FeedbackResults event={event} />}
    </div>
  )
}

function Logistics({ event, view, setView }: { event: ConfEvent; view: string; setView: (v: string) => void }) {
  const opts: [string, string][] = []
  if (event.accommodations_enabled) opts.push(['hotels', 'Hotels'])
  if (event.catering_enabled) opts.push(['catering', 'Catering'])
  opts.push(['materials', 'Materials'], ['sponsors', 'Sponsors'], ['todo', 'To-do'])
  const v = opts.some(([k]) => k === view) ? view : opts[0][0]
  return (
    <div className="space-y-5">
      <Segmented label="Logistics" value={v} options={opts} onChange={setView} />

      {v === 'hotels' && (
        <RecordTable table="conf_accommodations" eventId={event.id} orderBy="sort"
          title="Hotels" sub="Room blocks. Those marked visible appear on attendees' event pages with the booking link and group code."
          empty="No room blocks yet." addLabel="+ Add hotel"
          defaults={{ show_attendees: true }}
          columns={[
            { key: 'hotel_name', label: 'Hotel', required: true },
            { key: 'cutoff_date', label: 'Book by', type: 'date' },
            { key: 'rooms_blocked', label: 'Rooms held', type: 'number' },
            { key: 'nightly_rate', label: 'Rate', placeholder: 'e.g. $219 / night' },
            { key: 'group_code', label: 'Group code' },
            { key: 'contact_name', label: 'Contact', formOnly: true },
            { key: 'contact_email', label: 'Contact email', type: 'email', formOnly: true },
            { key: 'contact_phone', label: 'Contact phone', formOnly: true },
            { key: 'address', label: 'Address', formOnly: true },
            { key: 'booking_url', label: 'Booking link', type: 'url' },
            { key: 'show_attendees', label: 'Show attendees', type: 'checkbox' },
            { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
          ]} />
      )}

      {v === 'catering' && (
        <RecordTable table="conf_vendors" eventId={event.id} orderBy="name"
          title="Catering" sub="Vendors and orders. Dietary needs from RSVPs are in the attendee export. Record what you pay under Money → Costs & income."
          empty="No caterers yet." addLabel="+ Add vendor"
          defaults={{ status: 'considering' }}
          columns={[
            { key: 'name', label: 'Vendor', required: true },
            { key: 'service', label: 'For', placeholder: 'e.g. Day 1 lunch, 80 people' },
            { key: 'status', label: 'Status', type: 'select', options: [
              { value: 'considering', label: 'Considering' }, { value: 'booked', label: 'Booked' },
              { value: 'confirmed', label: 'Confirmed' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }] },
            { key: 'cost', label: 'Quote', type: 'money' },
            { key: 'contact_name', label: 'Contact' },
            { key: 'contact_email', label: 'Email', type: 'email', formOnly: true },
            { key: 'contact_phone', label: 'Phone', formOnly: true },
            { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
          ]} />
      )}

      {v === 'materials' && (
        <div className="space-y-3">
          <RecordTable table="conf_materials" eventId={event.id} orderBy="due_on"
            title="Materials" sub="Printing, name badges, signage and AV."
            empty="Nothing on the list yet." addLabel="+ Add item"
            defaults={{ kind: 'printed', status: 'todo' }}
            columns={[
              { key: 'item', label: 'Item', required: true, placeholder: 'e.g. Syllabus booklet' },
              { key: 'kind', label: 'Kind', type: 'select', options: [
                { value: 'printed', label: 'Printed' }, { value: 'badges', label: 'Name badges' }, { value: 'signage', label: 'Signage' },
                { value: 'swag', label: 'Giveaways' }, { value: 'av', label: 'AV' }, { value: 'other', label: 'Other' }] },
              { key: 'quantity', label: 'Qty', type: 'number' },
              { key: 'status', label: 'Status', type: 'select', options: [
                { value: 'todo', label: 'To do' }, { value: 'ordered', label: 'Ordered' },
                { value: 'received', label: 'Received' }, { value: 'done', label: 'Done' }] },
              { key: 'due_on', label: 'Needed by', type: 'date' },
              { key: 'supplier', label: 'Supplier' },
              { key: 'cost', label: 'Quote', type: 'money' },
              { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
            ]} />
          <p className="text-sm">
            <a href={`/events/${event.id}/badges`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
              Print name badges for everyone attending in person →
            </a>
          </p>
        </div>
      )}

      {v === 'sponsors' && (
        <RecordTable table="conf_sponsors" eventId={event.id} orderBy="name"
          title="Sponsors and exhibitors" sub="Those marked acknowledged are listed on attendees' event pages. Record what they pay under Money → Costs & income."
          empty="No sponsors or exhibitors yet." addLabel="+ Add"
          defaults={{ kind: 'sponsor', acknowledged: false }}
          columns={[
            { key: 'name', label: 'Name', required: true },
            { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'sponsor', label: 'Sponsor' }, { value: 'exhibitor', label: 'Exhibitor' }] },
            { key: 'tier', label: 'Tier', placeholder: 'e.g. Gold' },
            { key: 'amount', label: 'Pledged', type: 'money' },
            { key: 'table_no', label: 'Table' },
            { key: 'acknowledged', label: 'Acknowledged', type: 'checkbox' },
            { key: 'contact_name', label: 'Contact' },
            { key: 'contact_email', label: 'Email', type: 'email', formOnly: true },
            { key: 'contact_phone', label: 'Phone', formOnly: true },
            { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
          ]} />
      )}

      {v === 'todo' && (
        <RecordTable table="conf_tasks" eventId={event.id} orderBy="due_on"
          title="To-do" sub="Everything still to be done."
          empty="Nothing to do yet." addLabel="+ Add task"
          defaults={{ area: 'general' }}
          columns={[
            { key: 'title', label: 'Task', required: true },
            { key: 'area', label: 'Area', type: 'select', options: [
              { value: 'general', label: 'General' }, { value: 'catering', label: 'Catering' },
              { value: 'accommodations', label: 'Hotels' }, { value: 'materials', label: 'Materials' },
              { value: 'sponsors', label: 'Sponsors' }, { value: 'speakers', label: 'Speakers' }] },
            { key: 'due_on', label: 'Due', type: 'date' },
            { key: 'assignee', label: 'Who' },
            { key: 'done_at', label: 'Done on', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
          ]} />
      )}
    </div>
  )
}
