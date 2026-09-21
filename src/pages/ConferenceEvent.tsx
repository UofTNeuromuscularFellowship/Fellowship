import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { eventWhen, money, type ConfEvent } from '../lib/conference'
import { EventSettings } from '../components/conference/EventSettings'
import { Itinerary } from '../components/conference/Itinerary'
import { Speakers } from '../components/conference/Speakers'
import { Attendees } from '../components/conference/Attendees'
import { Presentations } from '../components/conference/Presentations'
import { FeedbackResults } from '../components/conference/FeedbackResults'
import { RecordTable } from '../components/conference/RecordTable'
import { InvitationEditor } from '../components/conference/InvitationEditor'
import { Messages } from '../components/conference/Messages'

const TABS = [
  ['settings', 'Settings'],
  ['itinerary', 'Itinerary'],
  ['speakers', 'Speakers'],
  ['attendees', 'Invitations'],
  ['messages', 'Messages'],
  ['presentations', 'Presentations'],
  ['logistics', 'Logistics'],
  ['sponsors', 'Sponsors'],
  ['budget', 'Budget'],
  ['tasks', 'To-do'],
  ['feedback', 'Feedback'],
] as const
type Tab = (typeof TABS)[number][0]

export default function ConferenceEvent() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'settings'
  const [event, setEvent] = useState<ConfEvent | null>(null)
  const [missing, setMissing] = useState(false)
  const portalUrl = window.location.origin

  const load = useCallback(async () => {
    const { data } = await supabase.from('conf_events').select('*').eq('id', id).maybeSingle()
    if (!data) setMissing(true)
    setEvent(data as ConfEvent | null)
  }, [id])
  useEffect(() => { load() }, [load])

  if (missing) return (
    <div className="space-y-2">
      <p className="text-sm text-muted">That event does not exist, or belongs to another program.</p>
      <Link to="/events" className="text-sm font-medium text-accent hover:underline">Back to events</Link>
    </div>
  )
  if (!event) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/events" className="text-xs font-medium text-muted hover:text-ink">← Events</Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">{event.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {eventWhen(event.starts_on, event.ends_on)}{event.venue_name ? ` · ${event.venue_name}` : ''}
          {event.zoom_url ? ' · online' : ''}
          <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-xs font-medium capitalize">{event.status}</span>
        </p>
      </div>

      <nav aria-label="Event sections">
        <div className="flex flex-wrap gap-x-1 border-b border-line">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setParams({ tab: key })}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === key
                ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'settings' && <EventSettings event={event} onSaved={load} />}
      {tab === 'itinerary' && <Itinerary event={event} />}
      {tab === 'speakers' && <Speakers event={event} portalUrl={portalUrl} />}
      {tab === 'attendees' && (
        <div className="space-y-6">
          <InvitationEditor event={event} onSaved={load} />
          <Attendees event={event} portalUrl={portalUrl} />
        </div>
      )}
      {tab === 'messages' && <Messages event={event} />}
      {tab === 'presentations' && <Presentations event={event} />}
      {tab === 'feedback' && <FeedbackResults event={event} />}

      {tab === 'logistics' && (
        <div className="space-y-6">
          {event.accommodations_enabled ? (
            <RecordTable table="conf_accommodations" eventId={event.id} orderBy="sort"
              title="Accommodations" sub="Hotel room blocks. Those marked visible appear on attendees' event pages with the booking link and group code."
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
          ) : <Off what="Accommodations" onOpen={() => setParams({ tab: 'settings' })} />}

          {event.catering_enabled ? (
            <RecordTable table="conf_vendors" eventId={event.id} orderBy="name"
              title="Catering" sub="Vendors and orders. Dietary needs from RSVPs are in the attendee export."
              empty="No caterers yet." addLabel="+ Add vendor"
              defaults={{ status: 'considering' }}
              columns={[
                { key: 'name', label: 'Vendor', required: true },
                { key: 'service', label: 'For', placeholder: 'e.g. Day 1 lunch, 80 people' },
                { key: 'status', label: 'Status', type: 'select', options: [
                  { value: 'considering', label: 'Considering' }, { value: 'booked', label: 'Booked' },
                  { value: 'confirmed', label: 'Confirmed' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }] },
                { key: 'cost', label: 'Cost', type: 'money' },
                { key: 'contact_name', label: 'Contact' },
                { key: 'contact_email', label: 'Email', type: 'email', formOnly: true },
                { key: 'contact_phone', label: 'Phone', formOnly: true },
                { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
              ]} />
          ) : <Off what="Catering" onOpen={() => setParams({ tab: 'settings' })} />}

          <RecordTable table="conf_materials" eventId={event.id} orderBy="due_on"
            title="Course materials" sub="Printing, name badges, signage and AV. Badges print straight from the attendee list."
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
              { key: 'cost', label: 'Cost', type: 'money' },
              { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
            ]} />
          <p className="text-sm">
            <a href={`/events/${event.id}/badges`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
              Print name badges for everyone attending in person →
            </a>
          </p>
        </div>
      )}

      {tab === 'sponsors' && (
        <RecordTable table="conf_sponsors" eventId={event.id} orderBy="name"
          title="Sponsors and exhibitors" sub="Those marked acknowledged are listed on attendees' event pages."
          empty="No sponsors or exhibitors yet." addLabel="+ Add"
          defaults={{ kind: 'sponsor', acknowledged: false }}
          columns={[
            { key: 'name', label: 'Name', required: true },
            { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'sponsor', label: 'Sponsor' }, { value: 'exhibitor', label: 'Exhibitor' }] },
            { key: 'tier', label: 'Tier', placeholder: 'e.g. Gold' },
            { key: 'amount', label: 'Amount', type: 'money' },
            { key: 'table_no', label: 'Table' },
            { key: 'acknowledged', label: 'Acknowledged', type: 'checkbox' },
            { key: 'contact_name', label: 'Contact' },
            { key: 'contact_email', label: 'Email', type: 'email', formOnly: true },
            { key: 'contact_phone', label: 'Phone', formOnly: true },
            { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
          ]} />
      )}

      {tab === 'budget' && (
        <RecordTable table="conf_budget" eventId={event.id} orderBy="kind"
          title="Budget" sub="Estimated against actual, for costs and for income such as registration fees and sponsorship."
          empty="No budget lines yet." addLabel="+ Add line"
          defaults={{ kind: 'expense' }}
          columns={[
            { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'expense', label: 'Cost' }, { value: 'income', label: 'Income' }] },
            { key: 'category', label: 'Category', required: true, placeholder: 'e.g. Venue, Catering, Registration' },
            { key: 'description', label: 'Detail' },
            { key: 'estimated', label: 'Estimated', type: 'money' },
            { key: 'actual', label: 'Actual', type: 'money' },
            { key: 'notes', label: 'Notes', type: 'textarea', formOnly: true },
          ]}
          footer={(rows) => {
            const sum = (kind: string, k: 'estimated' | 'actual') =>
              rows.filter((r) => r.kind === kind).reduce((a, r) => a + Number(r[k] ?? 0), 0)
            const line = (label: string, est: number, act: number, strong = false) => (
              <div className={`flex justify-between gap-4 text-sm tabular-nums ${strong ? 'font-semibold text-ink' : 'text-muted'}`}>
                <span>{label}</span><span>{money(est)} estimated · {money(act)} actual</span>
              </div>
            )
            return (
              <div className="space-y-1">
                {line('Costs', sum('expense', 'estimated'), sum('expense', 'actual'))}
                {line('Income', sum('income', 'estimated'), sum('income', 'actual'))}
                {line('Net', sum('income', 'estimated') - sum('expense', 'estimated'), sum('income', 'actual') - sum('expense', 'actual'), true)}
              </div>
            )
          }} />
      )}

      {tab === 'tasks' && (
        <RecordTable table="conf_tasks" eventId={event.id} orderBy="due_on"
          title="To-do" sub="Everything still to be done, across catering, accommodations, materials, sponsors and speakers."
          empty="Nothing to do yet." addLabel="+ Add task"
          defaults={{ area: 'general' }}
          columns={[
            { key: 'title', label: 'Task', required: true },
            { key: 'area', label: 'Area', type: 'select', options: [
              { value: 'general', label: 'General' }, { value: 'catering', label: 'Catering' },
              { value: 'accommodations', label: 'Accommodations' }, { value: 'materials', label: 'Materials' },
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

function Off({ what, onOpen }: { what: string; onOpen: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-4 text-sm text-muted">
      {what} is switched off for this event.{' '}
      <button className="font-medium text-accent hover:underline" onClick={onOpen}>Turn it on in Settings</button>
    </div>
  )
}
