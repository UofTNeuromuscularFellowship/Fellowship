import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { friendly, input, primaryBtn, quietBtn, publishBlockers, type ConfEvent, type EventStatus } from '../../lib/conference'
import { DeleteEvent } from './DeleteEvent'

const ZONES = [
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Regina',
  'America/Halifax', 'America/St_Johns', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'Europe/London',
]

type Draft = Omit<ConfEvent, 'id' | 'created_at' | 'reminder_sent_at' | 'feedback_sent_at' | 'public_token' | 'setup_done' | 'setup_step'>

const TOGGLES: { key: keyof Draft; label: string; help: string }[] = [
  { key: 'feedback_enabled', label: 'Feedback requests', help: 'Once the last session ends, attendees are emailed a link to rate each session.' },
  { key: 'letters_enabled', label: 'Participation letters', help: 'People you check in can download a signed letter with their credit hours.' },
  { key: 'presentations_enabled', label: 'Presentations', help: 'Attendees can open the slides and handouts you upload, from their event page.' },
  { key: 'accommodations_enabled', label: 'Accommodations', help: 'Room blocks are listed for attendees, and you get a place to track them.' },
  { key: 'catering_enabled', label: 'Catering', help: 'Track vendors, orders and to-dos; RSVPs collect dietary needs either way.' },
  { key: 'payment_enabled', label: 'Registration payment', help: 'Attendees see a button to pay at the link you provide.' },
  { key: 'public_registration', label: 'Public registration link', help: 'Anyone with the link can register — to post on a website or share by email. Your invite list still works alongside it, and capacity and the waitlist apply to both.' },
]

/**
 * The event's details. In the guided setup (wizard) it is the first step and
 * ends in "Save and continue"; afterwards it is the Settings page, with
 * publishing, archiving, money settings and deletion.
 */
export function EventSettings({ event, onSaved, wizard = false, onContinue }: {
  event: ConfEvent; onSaved: () => void; wizard?: boolean; onContinue?: () => void
}) {
  const [d, setD] = useState<Draft>(event)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  useEffect(() => { setD(event) }, [event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v })
  const publicLink = `${window.location.origin}/r/${event.public_token}`
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))))

  // What stands between this event and sending invitations.
  const blockers = publishBlockers(d)

  async function save(nextStatus?: EventStatus): Promise<boolean> {
    if (!d.name.trim()) { setMsg({ tone: 'bad', text: 'The event needs a name.' }); return false }
    if (!d.starts_on || !d.ends_on) { setMsg({ tone: 'bad', text: 'Give the event its dates.' }); return false }
    if (d.ends_on < d.starts_on) { setMsg({ tone: 'bad', text: 'The event ends before it starts.' }); return false }
    if (nextStatus === 'published' && blockers.length) {
      setMsg({ tone: 'bad', text: `Before publishing, add ${blockers.join(', ')}.` })
      return false
    }
    const rate = Number(d.tax_rate)
    if (!(rate >= 0 && rate <= 30)) { setMsg({ tone: 'bad', text: 'The tax rate should be between 0 and 30%.' }); return false }
    setBusy(true)
    const clean = (v: string | null) => (v && v.trim() !== '' ? v.trim() : null)
    const { error } = await supabase.from('conf_events').update({
      name: d.name.trim(), description: clean(d.description),
      starts_on: d.starts_on, ends_on: d.ends_on, timezone: d.timezone,
      venue_name: clean(d.venue_name), venue_address: clean(d.venue_address),
      zoom_url: clean(d.zoom_url), zoom_passcode: clean(d.zoom_passcode),
      capacity_in_person: d.capacity_in_person, capacity_virtual: d.capacity_virtual,
      feedback_enabled: d.feedback_enabled, letters_enabled: d.letters_enabled,
      presentations_enabled: d.presentations_enabled, accommodations_enabled: d.accommodations_enabled,
      catering_enabled: d.catering_enabled, payment_enabled: d.payment_enabled,
      payment_url: clean(d.payment_url), payment_label: clean(d.payment_label), payment_note: clean(d.payment_note),
      credits_statement: clean(d.credits_statement),
      public_registration: d.public_registration,
      organizer_name: clean(d.organizer_name), organizer_email: clean(d.organizer_email),
      organizer_address: clean(d.organizer_address),
      tax_rate: rate, tax_label: (d.tax_label ?? '').trim().slice(0, 12) || 'HST',
      ...(nextStatus ? { status: nextStatus } : {}),
    }).eq('id', event.id)
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return false }
    setMsg(wizard ? null : { tone: 'ok', text: nextStatus === 'published' ? 'Published. You can now send invitations.' : 'Saved.' })
    onSaved()
    return true
  }

  const field = (label: string, el: React.ReactNode, help?: string, wide = false) => (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {el}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="The event" sub="What invitees see on their invitation and their event page" />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {field('Event name', <input id="ev-name" className={input} value={d.name} onChange={(e) => set('name', e.target.value)} />, undefined, true)}
          {field('Description', <textarea id="ev-desc" rows={3} className={input} value={d.description ?? ''}
            onChange={(e) => set('description', e.target.value)} />, 'Appears in the invitation email.', true)}
          {field('Starts', <input id="ev-start" type="date" className={input} value={d.starts_on} onChange={(e) => set('starts_on', e.target.value)} />)}
          {field('Ends', <input id="ev-end" type="date" className={input} value={d.ends_on} onChange={(e) => set('ends_on', e.target.value)} />)}
          {field('Time zone', <select id="ev-tz" className={input} value={d.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {ZONES.map((z) => <option key={z} value={z}>{z.replace('America/', '').replace('_', ' ')}</option>)}
          </select>, 'Reminders and feedback requests are timed in this zone.')}
        </div>
      </Card>

      <Card>
        <CardHeader title="Where" sub="In person, online, or both" />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {field('Venue', <input id="ev-venue" className={input} value={d.venue_name ?? ''} onChange={(e) => set('venue_name', e.target.value)} />)}
          {field('Venue address', <input id="ev-addr" className={input} value={d.venue_address ?? ''} onChange={(e) => set('venue_address', e.target.value)} />)}
          {field('Zoom link', <input id="ev-zoom" type="url" className={input} placeholder="https://zoom.us/j/…" value={d.zoom_url ?? ''}
            onChange={(e) => set('zoom_url', e.target.value)} />, 'Only shown to people who have confirmed they are attending, so a forwarded invitation does not hand out the room.')}
          {d.zoom_url?.trim()
            ? field('Zoom passcode', <input id="ev-pass" className={input} value={d.zoom_passcode ?? ''} onChange={(e) => set('zoom_passcode', e.target.value)} />)
            : <div className="hidden sm:block" />}
          <details className="sm:col-span-2" open={d.capacity_in_person != null || d.capacity_virtual != null}>
            <summary className="cursor-pointer text-sm font-medium text-accent">Limit the number of places</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {field('In-person places', <input id="ev-cap-in" type="number" min={0} className={input} value={d.capacity_in_person ?? ''}
                onChange={(e) => set('capacity_in_person', num(e.target.value))} />, 'Leave blank for no limit. Once full, new RSVPs join a waitlist and move up automatically when someone cancels.')}
              {field('Online places', <input id="ev-cap-virt" type="number" min={0} className={input} value={d.capacity_virtual ?? ''}
                onChange={(e) => set('capacity_virtual', num(e.target.value))} />, 'Leave blank for no limit, or match your Zoom licence.')}
            </div>
          </details>
        </div>
      </Card>

      <Card>
        <CardHeader title="Who it's from" sub="Every invitation must identify its sender — Canada's anti-spam law requires it" />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {field('Organizer name', <input id="ev-org" className={input} placeholder="e.g. City Wide Neuromuscular Fellowship" value={d.organizer_name ?? ''}
            onChange={(e) => set('organizer_name', e.target.value)} />, 'Also signs the participation letters.')}
          {field('Organizer email', <input id="ev-org-email" type="email" className={input} value={d.organizer_email ?? ''}
            onChange={(e) => set('organizer_email', e.target.value)} />, 'Where replies and questions should go.')}
          {field('Mailing address', <input id="ev-org-addr" className={input} value={d.organizer_address ?? ''}
            onChange={(e) => set('organizer_address', e.target.value)} />, 'Shown in the footer of every email.', true)}
        </div>
      </Card>

      <Card>
        <CardHeader title="Features" sub="Turn on only what this event needs" />
        <div className="grid sm:grid-cols-2">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-start gap-3 border-b border-line px-5 py-3 sm:odd:border-r">
              <input id={`ev-${t.key}`} type="checkbox" className="mt-0.5 h-4 w-4 flex-none"
                checked={Boolean(d[t.key])} onChange={(e) => set(t.key, e.target.checked as never)} />
              <span>
                <span className="block text-sm font-medium text-ink">{t.label}</span>
                <span className="block text-xs text-muted">{t.help}</span>
              </span>
            </label>
          ))}
        </div>
        {event.public_registration && d.public_registration && (
          <div className="border-t border-line px-5 py-4">
            <span className="mb-1 block text-xs font-medium text-muted">Public registration link</span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border border-line bg-paper px-3 py-2 text-xs text-ink">{publicLink}</code>
              <button type="button" className={quietBtn} onClick={() => {
                navigator.clipboard?.writeText(publicLink)
                setMsg({ tone: 'ok', text: 'Registration link copied.' })
              }}>Copy</button>
            </div>
            <span className="mt-1 block text-xs text-muted">
              {event.status === 'published' ? 'Open now. People who register get an email to confirm their place and set up their account.'
                : 'Opens once the event is published.'}
            </span>
          </div>
        )}
        {(d.payment_enabled || d.letters_enabled) && (
          <div className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-2">
            {d.payment_enabled && <>
              {field('Payment link', <input id="ev-pay-url" type="url" className={input} placeholder="https://…" value={d.payment_url ?? ''}
                onChange={(e) => set('payment_url', e.target.value)} />, 'Your checkout page — a Stripe Payment Link, your university\'s approved checkout, or similar. No card details ever pass through this portal.')}
              {field('Button label', <input id="ev-pay-label" className={input} placeholder="Pay registration" value={d.payment_label ?? ''}
                onChange={(e) => set('payment_label', e.target.value)} />)}
              {field('Fees', <input id="ev-pay-note" className={input} placeholder="e.g. $150 staff, $75 trainees" value={d.payment_note ?? ''}
                onChange={(e) => set('payment_note', e.target.value)} />, undefined, true)}
            </>}
            {d.letters_enabled && field('Credit statement', <textarea id="ev-credits" rows={3} className={input}
              placeholder="The accreditation wording your CME provider approved for this event."
              value={d.credits_statement ?? ''} onChange={(e) => set('credits_statement', e.target.value)} />,
              'Printed on every letter. Use the exact wording from your accreditation — the portal records attendance and hours, it does not grant credit.', true)}
          </div>
        )}
      </Card>

      {!wizard && (
        <Card>
          <CardHeader title="Money" sub="Used by the budget, speaker pay and the financial report" />
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            {field('Sales tax rate (%)', <input id="ev-tax-rate" type="number" min={0} max={30} step="0.001" className={input}
              value={d.tax_rate ?? ''} onChange={(e) => set('tax_rate', e.target.value as unknown as number)} />,
              'Ontario HST is 13%. Used to work out the tax on honoraria for speakers who charge it, and the tax included in a receipt.')}
            {field('Tax name', <input id="ev-tax-label" className={input} maxLength={12} value={d.tax_label ?? ''}
              onChange={(e) => set('tax_label', e.target.value)} />, 'e.g. HST, or GST outside the HST provinces.')}
          </div>
        </Card>
      )}

      {msg && (
        <p className={`rounded-md border px-4 py-3 text-sm ${msg.tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200'}`}>{msg.text}</p>
      )}

      {wizard ? (
        <div className="flex flex-wrap items-center gap-2">
          <button className={primaryBtn} disabled={busy} onClick={async () => { if (await save()) onContinue?.() }}>
            {busy ? 'Saving…' : 'Save and continue →'}
          </button>
          <span className="text-xs text-muted">You can change any of this later.</span>
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-2">
        <button className={primaryBtn} disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save changes'}</button>
        {event.status === 'draft' && (
          <button className={quietBtn} disabled={busy} onClick={() => save('published')}>Save and publish</button>
        )}
        {event.status === 'published' && (
          <button className={quietBtn} disabled={busy} onClick={() => {
            if (window.confirm('Archive this event? RSVPs close, but attendees keep their itinerary, feedback and letters.')) save('archived')
          }}>Archive</button>
        )}
        {event.status === 'archived' && (
          <button className={quietBtn} disabled={busy} onClick={() => save('published')}>Reopen</button>
        )}
        {event.status === 'draft' && blockers.length > 0 && (
          <span className="text-xs text-muted">To publish, add {blockers.join(', ')}.</span>
        )}
      </div>
      )}

      {!wizard && <DeleteEvent event={event} />}
    </div>
  )
}
