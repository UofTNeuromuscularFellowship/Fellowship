import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { eventWhen, friendly, input, primaryBtn, quietBtn, type ConfEvent } from '../lib/conference'

const STATUS_TONE = {
  draft: 'bg-paper text-muted',
  published: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  archived: 'bg-paper text-muted',
} as const

export default function Conferences() {
  const { site } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<(ConfEvent & { going: number })[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: evs } = await supabase.from('conf_events').select('*').order('starts_on', { ascending: false })
      const { data: inv } = await supabase.from('conf_invitees').select('event_id, rsvp_status')
      const going = new Map<string, number>()
      for (const i of (inv as { event_id: string; rsvp_status: string }[]) ?? []) {
        if (i.rsvp_status === 'in_person' || i.rsvp_status === 'virtual') going.set(i.event_id, (going.get(i.event_id) ?? 0) + 1)
      }
      setEvents(((evs as ConfEvent[]) ?? []).map((e) => ({ ...e, going: going.get(e.id) ?? 0 })))
    })()
  }, [])

  async function create() {
    if (!name.trim() || !start) { setMsg('Give the event a name and a start date.'); return }
    setBusy(true)
    const { data, error } = await supabase.from('conf_events').insert({
      name: name.trim(), starts_on: start, ends_on: end && end >= start ? end : start,
      organizer_name: site?.name ?? null,
    }).select('id').single()
    setBusy(false)
    if (error) { setMsg(friendly(error.message)); return }
    navigate(`/events/${(data as { id: string }).id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Events</h1>
          <p className="mt-1 text-sm text-muted">Courses, symposia and conferences — itinerary, invitations, RSVPs and the logistics behind them.</p>
        </div>
        {!creating && <button className={primaryBtn} onClick={() => setCreating(true)}>+ New event</button>}
      </div>

      {creating && (
        <Card>
          <CardHeader title="New event" sub="You can fill in everything else once it exists. It stays a private draft until you publish it." />
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="mb-1 block text-xs font-medium text-muted">Name</span>
              <input id="new-ev-name" className={input} placeholder="e.g. Neuromuscular Ultrasound Course 2027" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Starts</span>
              <input id="new-ev-start" type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Ends (if more than one day)</span>
              <input id="new-ev-end" type="date" className={input} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <div className="flex items-end gap-2">
              <button className={primaryBtn} disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create'}</button>
              <button className={quietBtn} onClick={() => { setCreating(false); setMsg(null) }}>Cancel</button>
            </div>
          </div>
          {msg && <p className="px-5 pb-4 text-sm text-rose-600">{msg}</p>}
        </Card>
      )}

      <Card>
        <CardHeader title="Your events" />
        {events.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No events yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id}>
                <Link to={`/events/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{e.name}</p>
                    <p className="text-sm text-muted">{eventWhen(e.starts_on, e.ends_on)}{e.venue_name ? ` · ${e.venue_name}` : ''}</p>
                  </div>
                  <span className="text-sm tabular-nums text-muted">{e.going} attending</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[e.status]}`}>{e.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
