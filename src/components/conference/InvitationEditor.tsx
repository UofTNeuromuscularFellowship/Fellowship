import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { friendly, input, primaryBtn, quietBtn, type ConfEvent } from '../../lib/conference'
import { EmailPreview, PlaceholderHelp } from './EmailPreview'

// ---------------------------------------------------------------------------
// The invitation email, in the coordinator's own words.
//
// Subject and message are free text. The builder always adds, under the
// message: when and where, the RSVP button, and the sender footer with the
// unsubscribe link - the parts that must be right, and that the law requires,
// are not the coordinator's to delete by accident.
// ---------------------------------------------------------------------------

interface Preview { subject: string; html: string; default_subject: string; default_message: string }

export function InvitationEditor({ event, onSaved }: { event: ConfEvent; onSaved: () => void }) {
  const [subject, setSubject] = useState(event.invite_subject ?? '')
  const [body, setBody] = useState(event.invite_message ?? '')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const loaded = useRef(false)

  // The standard wording, so the editor starts from real text rather than blank.
  useEffect(() => {
    if (!open) return
    let live = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('conf_preview', {
        p_event: event.id, p_kind: 'invitation', p_subject: subject || null, p_body: body || null,
      })
      if (!live) return
      if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
      const p = data as Preview
      setPreview(p)
      if (!loaded.current) {
        loaded.current = true
        if (!subject) setSubject(p.default_subject)
        if (!body) setBody(p.default_message)
      }
    }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [open, subject, body, event.id])

  const custom = !!(event.invite_subject || event.invite_message)
  const savedSubject = event.invite_subject ?? preview?.default_subject ?? ''
  const savedBody = event.invite_message ?? preview?.default_message ?? ''
  const dirty = subject !== savedSubject || body !== savedBody

  async function save(reset = false) {
    setBusy(true); setMsg(null)
    const isDefault = !!preview && subject.trim() === preview.default_subject && body.trim() === preview.default_message.trim()
    const next = reset || isDefault
      ? { invite_subject: null, invite_message: null }
      : { invite_subject: subject.trim() || null, invite_message: body.trim() || null }
    const { error } = await supabase.from('conf_events').update(next).eq('id', event.id)
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    if (reset && preview) { setSubject(preview.default_subject); setBody(preview.default_message) }
    setMsg({ tone: 'ok', text: reset ? 'Back to the standard wording.' : 'Saved. New invitations and nudges will use this wording.' })
    onSaved()
  }

  async function test() {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('conf_send_test', {
      p_event: event.id, p_kind: 'invitation', p_subject: subject || null, p_body: body || null,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: `A test copy is on its way to ${data as string} — it goes out with the next email run, within about 15 minutes.` })
  }

  return (
    <Card>
      <CardHeader
        title="Invitation email"
        sub={custom ? 'Using your wording.' : 'Using the standard wording. Edit it to write your own.'}
        action={<button className={quietBtn} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit wording'}</button>}
      />
      {open && (
        <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Subject</span>
              <input id="inv-subject" className={input} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Message</span>
              <textarea id="inv-body" rows={12} className={input} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <PlaceholderHelp />
            <p className="text-xs text-muted">
              When and where, the RSVP button and the sender details with an unsubscribe link are always added
              below your message.
            </p>
            {msg && <p className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}`}>{msg.text}</p>}
            <div className="flex flex-wrap gap-2">
              <button className={primaryBtn} disabled={busy || !dirty} onClick={() => save()}>Save wording</button>
              <button className={quietBtn} disabled={busy} onClick={test}>Send me a test</button>
              {custom && <button className={quietBtn} disabled={busy} onClick={() => save(true)}>Use standard wording</button>}
            </div>
          </div>
          <div>
            {preview
              ? <EmailPreview subject={preview.subject} html={preview.html} note="as Alex would see it" />
              : <p className="text-sm text-muted">Loading preview…</p>}
          </div>
        </div>
      )}
    </Card>
  )
}
