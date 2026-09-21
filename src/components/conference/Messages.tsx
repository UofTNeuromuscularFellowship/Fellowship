import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import {
  AUDIENCE_LABEL, friendly, input, primaryBtn, quietBtn,
  type Audience, type ConfEvent, type ConfMessage,
} from '../../lib/conference'
import { EmailPreview, PlaceholderHelp } from './EmailPreview'

// ---------------------------------------------------------------------------
// Messages to attendees: updates and reminders before (or after) the event.
//
// Send now, or schedule for a date and time; the schedule checks every 15
// minutes and the email run follows, so a scheduled message goes out within
// about 20 minutes of its time. People who unsubscribed are never emailed.
// A sent message is also shown on each recipient's event page (unless that
// is switched off), so someone who missed the email still sees it.
// ---------------------------------------------------------------------------

interface Draft {
  id: string | null
  subject: string
  body: string
  audience: Audience
  show_on_page: boolean
  when: 'now' | 'later'
  send_at: string   // datetime-local value, the coordinator's own time
}

const EMPTY: Draft = { id: null, subject: '', body: '', audience: 'going', show_on_page: true, when: 'now', send_at: '' }

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function stamp(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function Messages({ event }: { event: ConfEvent }) {
  const [list, setList] = useState<ConfMessage[]>([])
  const [d, setD] = useState<Draft | null>(null)
  const [preview, setPreview] = useState<{ subject: string; html: string; recipients: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('conf_messages').select('*')
      .eq('event_id', event.id).order('created_at', { ascending: false })
    if (error) setMsg({ tone: 'bad', text: friendly(error.message) })
    setList((data as ConfMessage[]) ?? [])
  }, [event.id])
  useEffect(() => { load() }, [load])

  // Live preview and recipient count while composing.
  useEffect(() => {
    if (!d) return
    let live = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('conf_preview', {
        p_event: event.id, p_kind: 'message', p_subject: d.subject, p_body: d.body, p_audience: d.audience,
      })
      if (live && !error) setPreview(data as { subject: string; html: string; recipients: number })
    }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [d, event.id])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => d && setD({ ...d, [k]: v })

  function edit(m: ConfMessage | null) {
    setMsg(null)
    setPreview(null)
    setD(m ? {
      id: m.id, subject: m.subject, body: m.body, audience: m.audience, show_on_page: m.show_on_page,
      when: m.status === 'scheduled' ? 'later' : 'now', send_at: toLocalInput(m.send_at),
    } : { ...EMPTY })
  }

  async function persist(status: 'draft' | 'scheduled'): Promise<string | null> {
    if (!d) return null
    if (!d.subject.trim() || !d.body.trim()) { setMsg({ tone: 'bad', text: 'Add a subject and a message.' }); return null }
    let sendAt: string | null = null
    if (status === 'scheduled') {
      if (!d.send_at) { setMsg({ tone: 'bad', text: 'Choose when the message should go out.' }); return null }
      const at = new Date(d.send_at)
      if (Number.isNaN(at.getTime())) { setMsg({ tone: 'bad', text: 'That date and time is not valid.' }); return null }
      if (at.getTime() < Date.now() - 60_000) { setMsg({ tone: 'bad', text: 'That time has passed. Choose a later time, or send it now.' }); return null }
      sendAt = at.toISOString()
    }
    const row = {
      subject: d.subject.trim(), body: d.body.trim(), audience: d.audience, show_on_page: d.show_on_page,
      status, send_at: sendAt,
    }
    const res = d.id
      ? await supabase.from('conf_messages').update(row).eq('id', d.id).select('id').single()
      : await supabase.from('conf_messages').insert({ ...row, event_id: event.id }).select('id').single()
    if (res.error) { setMsg({ tone: 'bad', text: friendly(res.error.message) }); return null }
    return (res.data as { id: string }).id
  }

  async function saveDraft() {
    setBusy(true)
    const id = await persist('draft')
    setBusy(false)
    if (!id) return
    setMsg({ tone: 'ok', text: 'Saved as a draft.' })
    setD(null); load()
  }

  async function schedule() {
    setBusy(true)
    const id = await persist('scheduled')
    setBusy(false)
    if (!id) return
    setMsg({ tone: 'ok', text: `Scheduled for ${stamp(new Date(d!.send_at).toISOString())}.` })
    setD(null); load()
  }

  async function sendNow(existing?: ConfMessage) {
    const n = existing ? null : preview?.recipients
    const who = existing ? AUDIENCE_LABEL[existing.audience].toLowerCase() : `${n ?? 'the selected'} ${n === 1 ? 'person' : 'people'}`
    if (!window.confirm(`Send this message now to ${who}?`)) return
    setBusy(true); setMsg(null)
    const id = existing ? existing.id : await persist('draft')
    if (!id) { setBusy(false); return }
    const { data, error } = await supabase.rpc('conf_send_message', { p_message: id })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); load(); return }
    const sent = data as number
    setMsg({ tone: 'ok', text: sent === 0 ? 'Sent, but nobody matched that audience.' : `On its way to ${sent} ${sent === 1 ? 'person' : 'people'} — delivered within about 15 minutes.` })
    setD(null); load()
  }

  async function cancel(m: ConfMessage) {
    if (!window.confirm('Cancel this scheduled message? It will be kept as a draft.')) return
    const { error } = await supabase.from('conf_messages').update({ status: 'draft', send_at: null }).eq('id', m.id)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    load()
  }

  async function remove(m: ConfMessage) {
    if (!window.confirm('Delete this draft?')) return
    const { error } = await supabase.from('conf_messages').delete().eq('id', m.id)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    load()
  }

  async function test() {
    if (!d) return
    setBusy(true)
    const { data, error } = await supabase.rpc('conf_send_test', {
      p_event: event.id, p_kind: 'message', p_subject: d.subject || '(no subject)', p_body: d.body,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: `A test copy is on its way to ${data as string}.` })
  }

  const canSend = event.status !== 'draft'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Messages to attendees"
          sub="Updates and reminders by email — now or at a time you choose. People who unsubscribed are never emailed."
          action={!d ? <button className={primaryBtn} onClick={() => edit(null)}>New message</button> : undefined}
        />
        {!canSend && <p className="px-5 py-3 text-sm text-muted">Publish the event (in Settings) to send messages. You can write drafts now.</p>}
        {msg && !d && <p className={`px-5 py-3 text-sm ${msg.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}`}>{msg.text}</p>}

        {d && (
          <div className="grid gap-5 border-t border-line px-5 py-4 lg:grid-cols-2">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">To</span>
                <select id="msg-audience" className={input} value={d.audience} onChange={(e) => set('audience', e.target.value as Audience)}>
                  {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                </select>
                {preview && (
                  <span className="mt-1 block text-xs text-muted">
                    {preview.recipients} {preview.recipients === 1 ? 'person' : 'people'} right now. A scheduled message goes to whoever matches when it is sent.
                  </span>
                )}
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Subject</span>
                <input id="msg-subject" className={input} value={d.subject} onChange={(e) => set('subject', e.target.value)}
                  placeholder="e.g. Parking and room change for {event_name}" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">Message</span>
                <textarea id="msg-body" rows={10} className={input} value={d.body} onChange={(e) => set('body', e.target.value)}
                  placeholder={'Hi {first_name},\n\n…'} />
              </label>
              <PlaceholderHelp />
              <label className="flex items-start gap-2 text-sm">
                <input id="msg-show" type="checkbox" className="mt-0.5 h-4 w-4" checked={d.show_on_page} onChange={(e) => set('show_on_page', e.target.checked)} />
                <span>Also show it under “Updates” on each recipient’s event page</span>
              </label>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-xs font-medium text-muted">When</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="msg-when" checked={d.when === 'now'} onChange={() => set('when', 'now')} /> Send now
                </label>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="radio" name="msg-when" checked={d.when === 'later'} onChange={() => set('when', 'later')} /> Schedule for
                  <input id="msg-at" type="datetime-local" className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                    value={d.send_at} onChange={(e) => setD({ ...d, send_at: e.target.value, when: 'later' })} />
                  <span className="text-xs text-muted">your time</span>
                </label>
              </fieldset>
              {msg && <p className={`text-sm ${msg.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}`}>{msg.text}</p>}
              <div className="flex flex-wrap gap-2">
                {d.when === 'now'
                  ? <button className={primaryBtn} disabled={busy || !canSend} onClick={() => sendNow()}>Send now</button>
                  : <button className={primaryBtn} disabled={busy} onClick={schedule}>Schedule</button>}
                <button className={quietBtn} disabled={busy} onClick={saveDraft}>Save draft</button>
                <button className={quietBtn} disabled={busy || !d.body.trim()} onClick={test}>Send me a test</button>
                <button className={quietBtn} disabled={busy} onClick={() => { setD(null); setMsg(null) }}>Close</button>
              </div>
            </div>
            <div>
              {preview
                ? <EmailPreview subject={preview.subject} html={preview.html} note="as Alex would see it" />
                : <p className="text-sm text-muted">Start typing to see the preview.</p>}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Sent and scheduled" />
        {list.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No messages yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{m.subject}</p>
                  <p className="text-xs text-muted">
                    {AUDIENCE_LABEL[m.audience]}
                    {m.status === 'sent' && ` · sent ${stamp(m.sent_at)} to ${m.recipients ?? 0}`}
                    {m.status === 'scheduled' && ` · goes out ${stamp(m.send_at)}`}
                    {m.status === 'draft' && ' · draft'}
                    {!m.show_on_page && ' · email only'}
                  </p>
                </div>
                <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  m.status === 'sent' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : m.status === 'scheduled' ? 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                      : 'bg-paper text-muted'}`}>
                  {m.status === 'sent' ? 'Sent' : m.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                </span>
                {m.status !== 'sent' && (
                  <span className="flex-none text-xs">
                    <button className="font-medium text-accent hover:underline" onClick={() => edit(m)}>Edit</button>
                    {m.status === 'scheduled' && <button className="ml-3 font-medium text-muted hover:text-ink" onClick={() => cancel(m)}>Cancel</button>}
                    {m.status === 'draft' && <>
                      <button className="ml-3 font-medium text-accent hover:underline" disabled={busy || !canSend} onClick={() => sendNow(m)}>Send now</button>
                      <button className="ml-3 font-medium text-muted hover:text-rose-600" onClick={() => remove(m)}>Delete</button>
                    </>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
