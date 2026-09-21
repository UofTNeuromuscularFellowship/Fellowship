import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import {
  friendly, input, primaryBtn, quietBtn, DISCLOSURE_LABEL,
  type ConfEvent, type ConfSpeaker, type DisclosureStatus,
} from '../../lib/conference'

const TONE: Record<DisclosureStatus, string> = {
  not_requested: 'bg-paper text-muted',
  requested: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  received: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  nothing_to_declare: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
}

type Draft = Pick<ConfSpeaker, 'full_name' | 'email' | 'affiliation' | 'bio' | 'notes'> & { id?: string }

export function Speakers({ event, portalUrl }: { event: ConfEvent; portalUrl: string }) {
  const [speakers, setSpeakers] = useState<ConfSpeaker[]>([])
  const [sessionsOf, setSessionsOf] = useState<Record<string, string[]>>({})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [recording, setRecording] = useState<ConfSpeaker | null>(null)
  const [recText, setRecText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  async function load() {
    const [sp, ss, se] = await Promise.all([
      supabase.from('conf_speakers').select('*').eq('event_id', event.id).order('full_name'),
      supabase.from('conf_session_speakers').select('session_id, speaker_id'),
      supabase.from('conf_sessions').select('id, title').eq('event_id', event.id),
    ])
    setSpeakers((sp.data as ConfSpeaker[]) ?? [])
    const title = new Map(((se.data as { id: string; title: string }[]) ?? []).map((s) => [s.id, s.title]))
    const map: Record<string, string[]> = {}
    for (const l of (ss.data as { session_id: string; speaker_id: string }[]) ?? []) {
      const t = title.get(l.session_id)
      if (t) (map[l.speaker_id] ??= []).push(t)
    }
    setSessionsOf(map)
  }
  useEffect(() => { load() }, [event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const outstanding = speakers.filter((s) => s.email && (s.disclosure_status === 'not_requested' || s.disclosure_status === 'requested'))

  async function save() {
    if (!draft?.full_name.trim()) { setMsg({ tone: 'bad', text: 'A speaker needs a name.' }); return }
    setBusy(true)
    const row = {
      full_name: draft.full_name.trim(), email: draft.email?.trim() || null,
      affiliation: draft.affiliation?.trim() || null, bio: draft.bio?.trim() || null, notes: draft.notes?.trim() || null,
    }
    const res = draft.id
      ? await supabase.from('conf_speakers').update(row).eq('id', draft.id)
      : await supabase.from('conf_speakers').insert({ ...row, event_id: event.id })
    setBusy(false)
    if (res.error) { setMsg({ tone: 'bad', text: friendly(res.error.message) }); return }
    setDraft(null)
    load()
  }

  async function requestAll() {
    if (!window.confirm(`Email a disclosure form to ${outstanding.length} speaker${outstanding.length === 1 ? '' : 's'}?`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('conf_request_disclosures', { p_event: event.id, p_speaker_ids: null })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: `${data} request${data === 1 ? '' : 's'} queued. They go out within 15 minutes.` })
    load()
  }

  // for a disclosure that arrived on paper or by email
  async function record(s: ConfSpeaker, nothing: boolean) {
    const text = recText.trim()
    if (!nothing && !text) { setMsg({ tone: 'bad', text: 'Enter what they disclosed, or mark nothing to declare.' }); return }
    await supabase.from('conf_speakers').update({
      disclosure_status: nothing ? 'nothing_to_declare' : 'received',
      disclosure_text: nothing ? null : text, disclosure_received_at: new Date().toISOString(),
    }).eq('id', s.id)
    setRecording(null); setRecText('')
    load()
  }

  async function remove(s: ConfSpeaker) {
    if (!window.confirm(`Remove ${s.full_name}? They will also come off any sessions.`)) return
    await supabase.from('conf_speakers').delete().eq('id', s.id)
    load()
  }

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`rounded-md border px-4 py-3 text-sm ${msg.tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200'}`}>
          {msg.text} <button className="ml-2 font-medium underline" onClick={() => setMsg(null)}>Dismiss</button>
        </p>
      )}

      <Card>
        <CardHeader
          title="Speakers, moderators and panelists"
          sub="Accredited CME generally requires each speaker's financial relationships to be collected and shown to attendees. Their answer appears on the itinerary."
          action={draft ? undefined : (
            <div className="flex flex-wrap gap-2">
              <button className={quietBtn} disabled={busy || outstanding.length === 0} onClick={requestAll}>
                Request {outstanding.length} disclosure{outstanding.length === 1 ? '' : 's'}
              </button>
              <button className={quietBtn} onClick={() => setDraft({ full_name: '', email: '', affiliation: '', bio: '', notes: '' })}>+ Add speaker</button>
            </div>
          )}
        />

        {draft && (
          <div className="border-b border-line bg-paper px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Name *</span>
                <input id="sp-name" className={input} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Email</span>
                <input id="sp-email" type="email" className={input} value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted">Affiliation</span>
                <input id="sp-aff" className={input} value={draft.affiliation ?? ''} onChange={(e) => setDraft({ ...draft, affiliation: e.target.value })} /></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted">Short bio</span>
                <textarea id="sp-bio" rows={2} className={input} value={draft.bio ?? ''} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} /></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted">Notes (travel, honorarium, AV needs)</span>
                <textarea id="sp-notes" rows={2} className={input} value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              <button className={quietBtn} onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </div>
        )}

        {speakers.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No speakers yet. Add them here, or straight from a session in the itinerary.</p>
        ) : (
          <ul className="divide-y divide-line">
            {speakers.map((s) => (
              <li key={s.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{s.full_name}
                      {s.affiliation && <span className="ml-2 text-xs font-normal text-muted">{s.affiliation}</span>}</p>
                    <p className="text-xs text-muted">
                      {s.email || 'No email — disclosure has to be recorded by hand'}
                      {sessionsOf[s.id]?.length ? ` · ${sessionsOf[s.id].join(', ')}` : ' · not on any session yet'}
                    </p>
                    {(s.disclosure_status === 'received' && s.disclosure_text) && (
                      <p className="mt-1 whitespace-pre-line text-xs text-ink">{s.disclosure_text}</p>
                    )}
                  </div>
                  <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[s.disclosure_status]}`}>
                    {DISCLOSURE_LABEL[s.disclosure_status]}
                  </span>
                  <span className="flex-none text-xs">
                    <button className="font-medium text-accent hover:underline" onClick={() => setDraft(s)}>Edit</button>
                    <button className="ml-3 font-medium text-accent hover:underline" onClick={() => { setRecording(s); setRecText(s.disclosure_text ?? '') }}>Record disclosure</button>
                    <button className="ml-3 font-medium text-accent hover:underline" onClick={() => {
                      navigator.clipboard?.writeText(`${portalUrl}/speaker/${s.token}`)
                      setMsg({ tone: 'ok', text: `Copied ${s.full_name}'s private disclosure link.` })
                    }}>Copy link</button>
                    <button className="ml-3 font-medium text-muted hover:text-rose-600" onClick={() => remove(s)}>Remove</button>
                  </span>
                </div>
                {recording?.id === s.id && (
                  <div className="mt-3 space-y-2 rounded-md border border-line bg-paper p-3">
                    <textarea id={`sp-rec-${s.id}`} rows={3} className={input} value={recText} onChange={(e) => setRecText(e.target.value)}
                      placeholder="The relationships they disclosed, as they should appear to attendees" />
                    <div className="flex flex-wrap gap-2">
                      <button className={primaryBtn} onClick={() => record(s, false)}>Save disclosure</button>
                      <button className={quietBtn} onClick={() => record(s, true)}>Nothing to declare</button>
                      <button className={quietBtn} onClick={() => setRecording(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
