import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { friendly, input, primaryBtn, quietBtn, type ConfEvent, type ConfPresentation, type ConfSession } from '../../lib/conference'

const BUCKET = 'conference'

function size(n: number | null) {
  if (!n) return ''
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function Presentations({ event }: { event: ConfEvent }) {
  const [files, setFiles] = useState<ConfPresentation[]>([])
  const [sessions, setSessions] = useState<ConfSession[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const [f, s] = await Promise.all([
      supabase.from('conf_presentations').select('*').eq('event_id', event.id).order('created_at'),
      supabase.from('conf_sessions').select('*').eq('event_id', event.id).order('session_date').order('start_time'),
    ])
    setFiles((f.data as ConfPresentation[]) ?? [])
    setSessions((s.data as ConfSession[]) ?? [])
  }
  useEffect(() => { load() }, [event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload() {
    if (!file) return
    setBusy(true); setMsg(null)
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `${event.id}/${crypto.randomUUID()}-${safe}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (up.error) { setBusy(false); setMsg(`Upload failed: ${up.error.message}`); return }
    const { error } = await supabase.from('conf_presentations').insert({
      event_id: event.id, session_id: sessionId || null, title: title.trim() || file.name,
      storage_path: path, file_name: file.name, mime_type: file.type || null, size_bytes: file.size,
    })
    setBusy(false)
    if (error) {
      await supabase.storage.from(BUCKET).remove([path])
      setMsg(friendly(error.message)); return
    }
    setFile(null); setTitle(''); setSessionId('')
    const el = document.getElementById('pres-file') as HTMLInputElement | null
    if (el) el.value = ''
    load()
  }

  async function open(p: ConfPresentation) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(p.storage_path, 600)
    if (error || !data) { setMsg(error?.message ?? 'Could not open the file.'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove(p: ConfPresentation) {
    if (!window.confirm(`Delete “${p.title}”? Attendees lose access immediately.`)) return
    await supabase.storage.from(BUCKET).remove([p.storage_path])
    await supabase.from('conf_presentations').delete().eq('id', p.id)
    load()
  }

  const sessionTitle = (id: string | null) => sessions.find((s) => s.id === id)?.title

  return (
    <Card>
      <CardHeader
        title="Presentations"
        sub={event.presentations_enabled
          ? 'Confirmed attendees can open these from their event page, through links that expire after an hour.'
          : 'Presentations are switched off in Settings, so attendees cannot see these yet. You can still upload ahead of time.'}
      />
      {msg && <p className="border-b border-line px-5 py-2 text-sm text-rose-600">{msg}</p>}
      <div className="grid gap-3 border-b border-line px-5 py-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">File (slides, PDF, handout)</span>
          <input id="pres-file" type="file" className="block text-sm text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Title</span>
          <input id="pres-title" className={input} placeholder="Defaults to the file name" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Session</span>
          <select id="pres-session" className={input} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">Whole event</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <div><button className={primaryBtn} disabled={!file || busy} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</button></div>
      </div>
      {files.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Nothing uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {files.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                <p className="truncate text-xs text-muted">{[sessionTitle(p.session_id) ?? 'Whole event', p.file_name, size(p.size_bytes)].filter(Boolean).join(' · ')}</p>
              </div>
              <button className={quietBtn} onClick={() => open(p)}>Open</button>
              <button className="text-xs font-medium text-muted hover:text-rose-600" onClick={() => remove(p)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
