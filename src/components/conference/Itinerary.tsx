import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { RecordTable } from './RecordTable'
import {
  friendly, input, primaryBtn, quietBtn, FORMAT_LABEL, prettyDay, hhmm,
  type ConfEvent, type ConfRoom, type ConfSession, type ConfSpeaker, type ConfSessionSpeaker,
  type SessionFormat, type SpeakerRole,
} from '../../lib/conference'

interface Assign { speaker_id: string; role: SpeakerRole }
interface Draft {
  id?: string
  title: string
  description: string
  session_date: string
  start_time: string
  end_time: string
  format: SessionFormat
  room_id: string
  credit_hours: string
  zoom_url: string
  speakers: Assign[]
}

function eventDays(start: string, end: string): string[] {
  const out: string[] = []
  const [y, m, d] = start.split('-').map(Number)
  const cur = new Date(Date.UTC(y, m - 1, d))
  while (cur.toISOString().slice(0, 10) <= end && out.length < 60) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

export function Itinerary({ event }: { event: ConfEvent }) {
  const [rooms, setRooms] = useState<ConfRoom[]>([])
  const [sessions, setSessions] = useState<ConfSession[]>([])
  const [speakers, setSpeakers] = useState<ConfSpeaker[]>([])
  const [links, setLinks] = useState<ConfSessionSpeaker[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [newSpeaker, setNewSpeaker] = useState({ full_name: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const days = useMemo(() => eventDays(event.starts_on, event.ends_on), [event.starts_on, event.ends_on])

  async function load() {
    const [r, s, sp, l] = await Promise.all([
      supabase.from('conf_rooms').select('*').eq('event_id', event.id).order('sort').order('name'),
      supabase.from('conf_sessions').select('*').eq('event_id', event.id).order('session_date').order('start_time').order('sort'),
      supabase.from('conf_speakers').select('*').eq('event_id', event.id).order('full_name'),
      supabase.from('conf_session_speakers').select('session_id, speaker_id, role'),
    ])
    setRooms((r.data as ConfRoom[]) ?? [])
    setSessions((s.data as ConfSession[]) ?? [])
    setSpeakers((sp.data as ConfSpeaker[]) ?? [])
    const ids = new Set(((s.data as ConfSession[]) ?? []).map((x) => x.id))
    setLinks(((l.data as ConfSessionSpeaker[]) ?? []).filter((x) => ids.has(x.session_id)))
  }
  useEffect(() => { load() }, [event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name
  const speakerName = (id: string) => speakers.find((s) => s.id === id)?.full_name ?? '—'
  const totalHours = sessions.reduce((a, s) => a + Number(s.credit_hours || 0), 0)

  function openNew() {
    setDraft({
      title: '', description: '', session_date: days[0] ?? event.starts_on, start_time: '09:00', end_time: '10:00',
      format: 'talk', room_id: '', credit_hours: '1', zoom_url: '', speakers: [],
    })
    setMsg(null)
  }
  function openEdit(s: ConfSession) {
    setDraft({
      id: s.id, title: s.title, description: s.description ?? '', session_date: s.session_date,
      start_time: hhmm(s.start_time), end_time: hhmm(s.end_time), format: s.format, room_id: s.room_id ?? '',
      credit_hours: String(s.credit_hours ?? 0), zoom_url: s.zoom_url ?? '',
      speakers: links.filter((l) => l.session_id === s.id).map((l) => ({ speaker_id: l.speaker_id, role: l.role })),
    })
    setMsg(null)
  }

  async function addSpeakerInline() {
    if (!draft || !newSpeaker.full_name.trim()) return
    const { data, error } = await supabase.from('conf_speakers')
      .insert({ event_id: event.id, full_name: newSpeaker.full_name.trim(), email: newSpeaker.email.trim() || null })
      .select('*').single()
    if (error) { setMsg(friendly(error.message)); return }
    setSpeakers([...speakers, data as ConfSpeaker].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setDraft({ ...draft, speakers: [...draft.speakers, { speaker_id: (data as ConfSpeaker).id, role: draft.format === 'panel' ? 'panelist' : 'speaker' }] })
    setNewSpeaker({ full_name: '', email: '' })
  }

  async function save() {
    if (!draft) return
    if (!draft.title.trim()) { setMsg('Give the session a title.'); return }
    if (draft.end_time <= draft.start_time) { setMsg('The session ends before it starts.'); return }
    setBusy(true)
    const row = {
      title: draft.title.trim(), description: draft.description.trim() || null,
      session_date: draft.session_date, start_time: draft.start_time, end_time: draft.end_time,
      format: draft.format, room_id: draft.room_id || null,
      credit_hours: Number(draft.credit_hours || 0), zoom_url: draft.zoom_url.trim() || null,
    }
    let id = draft.id
    if (id) {
      const { error } = await supabase.from('conf_sessions').update(row).eq('id', id)
      if (error) { setBusy(false); setMsg(friendly(error.message)); return }
    } else {
      const { data, error } = await supabase.from('conf_sessions').insert({ ...row, event_id: event.id }).select('id').single()
      if (error) { setBusy(false); setMsg(friendly(error.message)); return }
      id = (data as { id: string }).id
    }
    // replace the speaker list wholesale — simpler and exact
    await supabase.from('conf_session_speakers').delete().eq('session_id', id)
    const uniq = Array.from(new Map(draft.speakers.filter((a) => a.speaker_id).map((a) => [a.speaker_id, a])).values())
    if (uniq.length) {
      const { error } = await supabase.from('conf_session_speakers')
        .insert(uniq.map((a) => ({ session_id: id, speaker_id: a.speaker_id, role: a.role })))
      if (error) { setBusy(false); setMsg(friendly(error.message)); return }
    }
    setBusy(false)
    setDraft(null)
    load()
  }

  async function remove(s: ConfSession) {
    if (!window.confirm(`Delete “${s.title}”?`)) return
    await supabase.from('conf_sessions').delete().eq('id', s.id)
    load()
  }

  const byDay = days.map((day) => ({ day, items: sessions.filter((s) => s.session_date === day) }))
  const stray = sessions.filter((s) => !days.includes(s.session_date))

  return (
    <div className="space-y-6">
      <RecordTable
        table="conf_rooms" eventId={event.id} orderBy="sort" title="Rooms"
        sub="Where sessions happen. Capacity here is for your planning; the RSVP limit is set on the event."
        empty="No rooms yet — add one, or leave sessions unassigned for a single-room event."
        addLabel="+ Add room" onChange={load}
        columns={[
          { key: 'name', label: 'Room', required: true, placeholder: 'e.g. Great Hall' },
          { key: 'capacity', label: 'Seats', type: 'number' },
          { key: 'notes', label: 'Notes', placeholder: 'AV, access, layout' },
        ]}
      />

      <Card>
        <CardHeader
          title="Sessions"
          sub={`${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${totalHours} credit hour${totalHours === 1 ? '' : 's'} in total`}
          action={draft ? undefined : <button className={quietBtn} onClick={openNew}>+ Add session</button>}
        />
        {msg && <p className="border-b border-line px-5 py-2 text-sm text-rose-600">{msg}</p>}

        {draft && (
          <div className="border-b border-line bg-paper px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-muted">Title *</span>
                <input id="ses-title" className={input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Day</span>
                <select id="ses-day" className={input} value={draft.session_date} onChange={(e) => setDraft({ ...draft, session_date: e.target.value })}>
                  {days.map((dd) => <option key={dd} value={dd}>{prettyDay(dd)}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Starts</span>
                  <input id="ses-start" type="time" className={input} value={draft.start_time} onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Ends</span>
                  <input id="ses-end" type="time" className={input} value={draft.end_time} onChange={(e) => setDraft({ ...draft, end_time: e.target.value })} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Format</span>
                <select id="ses-format" className={input} value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value as SessionFormat })}>
                  {(Object.keys(FORMAT_LABEL) as SessionFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Room</span>
                <select id="ses-room" className={input} value={draft.room_id} onChange={(e) => setDraft({ ...draft, room_id: e.target.value })}>
                  <option value="">—</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Credit hours</span>
                <input id="ses-hours" type="number" step="0.25" min={0} className={input} value={draft.credit_hours}
                  onChange={(e) => setDraft({ ...draft, credit_hours: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Zoom link for this session</span>
                <input id="ses-zoom" type="url" className={input} placeholder="Leave blank to use the event's" value={draft.zoom_url}
                  onChange={(e) => setDraft({ ...draft, zoom_url: e.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-muted">Description</span>
                <textarea id="ses-desc" rows={2} className={input} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted">
                {draft.format === 'panel' ? 'Moderator and panelists' : 'Speakers'}
              </p>
              <div className="space-y-2">
                {draft.speakers.map((a, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <select id={`ses-sp-${i}`} className={`${input} min-w-0 flex-1`} value={a.speaker_id}
                      onChange={(e) => setDraft({ ...draft, speakers: draft.speakers.map((x, j) => j === i ? { ...x, speaker_id: e.target.value } : x) })}>
                      <option value="">Choose…</option>
                      {speakers.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.affiliation ? ` — ${s.affiliation}` : ''}</option>)}
                    </select>
                    <select id={`ses-sp-role-${i}`} className={`${input} w-36`} value={a.role}
                      onChange={(e) => setDraft({ ...draft, speakers: draft.speakers.map((x, j) => j === i ? { ...x, role: e.target.value as SpeakerRole } : x) })}>
                      <option value="speaker">Speaker</option>
                      <option value="moderator">Moderator</option>
                      <option value="panelist">Panelist</option>
                    </select>
                    <button className="text-sm text-muted hover:text-rose-600"
                      onClick={() => setDraft({ ...draft, speakers: draft.speakers.filter((_, j) => j !== i) })}>Remove</button>
                  </div>
                ))}
                {speakers.length > 0 && (
                  <button className="text-xs font-medium text-accent hover:underline"
                    onClick={() => setDraft({ ...draft, speakers: [...draft.speakers, { speaker_id: '', role: draft.format === 'panel' ? (draft.speakers.length ? 'panelist' : 'moderator') : 'speaker' }] })}>
                    + Add from your speakers
                  </button>
                )}
                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <input id="ses-new-sp" className={`${input} min-w-0 flex-1`} placeholder="New speaker's name" value={newSpeaker.full_name}
                    onChange={(e) => setNewSpeaker({ ...newSpeaker, full_name: e.target.value })} />
                  <input id="ses-new-sp-email" type="email" className={`${input} min-w-0 flex-1`} placeholder="Their email (for the disclosure form)"
                    value={newSpeaker.email} onChange={(e) => setNewSpeaker({ ...newSpeaker, email: e.target.value })} />
                  <button className={quietBtn} onClick={addSpeakerInline} disabled={!newSpeaker.full_name.trim()}>Add</button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save session'}</button>
              <button className={quietBtn} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        )}

        {sessions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No sessions yet. Add the first one to start building the itinerary.</p>
        ) : (
          <div className="divide-y divide-line">
            {[...byDay, ...(stray.length ? [{ day: 'Outside the event dates', items: stray }] : [])]
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.day} className="px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    {g.day.includes('-') ? prettyDay(g.day) : g.day}
                  </p>
                  <ul className="space-y-2">
                    {g.items.map((s) => {
                      const who = links.filter((l) => l.session_id === s.id)
                      return (
                        <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-1">
                          <span className="w-24 flex-none text-sm tabular-nums text-muted">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">
                              {s.title}
                              <span className="ml-2 text-xs font-normal text-muted">{FORMAT_LABEL[s.format]}{roomName(s.room_id) ? ` · ${roomName(s.room_id)}` : ''}{Number(s.credit_hours) ? ` · ${s.credit_hours} h` : ''}</span>
                            </p>
                            {who.length > 0 && (
                              <p className="text-xs text-muted">
                                {who.map((w) => `${speakerName(w.speaker_id)}${w.role !== 'speaker' ? ` (${w.role})` : ''}`).join(', ')}
                              </p>
                            )}
                          </div>
                          <span className="flex-none">
                            <button className="text-xs font-medium text-accent hover:underline" onClick={() => openEdit(s)}>Edit</button>
                            <button className="ml-3 text-xs font-medium text-muted hover:text-rose-600" onClick={() => remove(s)}>Delete</button>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  )
}
