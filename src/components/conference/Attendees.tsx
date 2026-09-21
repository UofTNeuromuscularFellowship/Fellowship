import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import {
  friendly, input, primaryBtn, quietBtn, RSVP_LABEL, RSVP_TONE, rowsFromCsv, rowsFromText, toCsv, downloadText,
  type ConfEvent, type ConfInvitee, type RsvpStatus, type ImportRow,
} from '../../lib/conference'

const FILTERS: { key: RsvpStatus | 'all' | 'checked' | 'unsub'; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'in_person', label: 'In person' },
  { key: 'virtual', label: 'Online' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'pending', label: 'No reply' },
  { key: 'declined', label: 'Declined' },
  { key: 'checked', label: 'Checked in' },
  { key: 'unsub', label: 'Unsubscribed' },
]

export function Attendees({ event, portalUrl }: { event: ConfEvent; portalUrl: string }) {
  const [people, setPeople] = useState<ConfInvitee[]>([])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'csv' | 'type' | null>(null)
  const [pasted, setPasted] = useState('')
  const [pending, setPending] = useState<ImportRow[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  async function load() {
    const { data } = await supabase.from('conf_invitees').select('*').eq('event_id', event.id).order('created_at')
    setPeople((data as ConfInvitee[]) ?? [])
  }
  useEffect(() => { load() }, [event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const count = (s: RsvpStatus) => people.filter((p) => p.rsvp_status === s).length
  const notYetInvited = people.filter((p) => p.invite_count === 0 && !p.unsubscribed_at).length
  const noReplyInvited = people.filter((p) => p.rsvp_status === 'pending' && p.invite_count > 0 && !p.unsubscribed_at)
  const checkedIn = people.filter((p) => p.checked_in_at).length
  const lettersDue = people.filter((p) => p.checked_in_at && !p.letter_sent_at).length

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return people.filter((p) => {
      if (filter === 'checked' && !p.checked_in_at) return false
      if (filter === 'unsub' && !p.unsubscribed_at) return false
      if (filter !== 'all' && filter !== 'checked' && filter !== 'unsub' && p.rsvp_status !== filter) return false
      if (!needle) return true
      return [p.full_name, p.email, p.institution].some((v) => v?.toLowerCase().includes(needle))
    })
  }, [people, filter, q])

  async function readFile(f: File) {
    const text = await f.text()
    setPending(rowsFromCsv(text))
  }

  async function doImport(rows: ImportRow[], source: 'csv' | 'manual') {
    if (rows.length === 0) return
    setBusy(true)
    const { data, error } = await supabase.rpc('conf_import_invitees', { p_event: event.id, p_rows: rows, p_source: source })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    const r = data as { added: number; duplicates: number; invalid: number; invalid_examples: string[] }
    const parts = [`${r.added} added`]
    if (r.duplicates) parts.push(`${r.duplicates} already on the list`)
    if (r.invalid) parts.push(`${r.invalid} not valid email addresses (${r.invalid_examples.slice(0, 3).join(', ')}${r.invalid > 3 ? '…' : ''})`)
    setMsg({ tone: r.invalid ? 'bad' : 'ok', text: parts.join(' · ') + '.' })
    setMode(null); setPending([]); setPasted('')
    load()
  }

  async function send(ids: string[] | null, onlyNew: boolean, label: string) {
    if (!window.confirm(`${label}?`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('conf_send_invitations', {
      p_event: event.id, p_invitee_ids: ids, p_only_new: onlyNew,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: `${data} invitation${data === 1 ? '' : 's'} queued. They go out within 15 minutes.` })
    load()
  }

  async function sendLetters() {
    if (!window.confirm(`Email participation letters to ${lettersDue} checked-in attendee${lettersDue === 1 ? '' : 's'}?`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('conf_send_letters', { p_event: event.id })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: `${data} letter${data === 1 ? '' : 's'} queued.` })
    load()
  }

  async function fillWaitlist() {
    const { data, error } = await supabase.rpc('conf_fill_from_waitlist', { p_event: event.id })
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: data ? `${data} moved up from the waitlist and told.` : 'No free places to fill.' })
    load()
  }

  async function checkIn(p: ConfInvitee, on: boolean) {
    await supabase.from('conf_invitees').update({ checked_in_at: on ? new Date().toISOString() : null }).eq('id', p.id)
    setPeople(people.map((x) => x.id === p.id ? { ...x, checked_in_at: on ? new Date().toISOString() : null } : x))
  }

  async function setStatus(p: ConfInvitee, s: RsvpStatus) {
    const patch: Partial<ConfInvitee> = { rsvp_status: s, waitlist_for: null, waitlisted_at: null, rsvp_at: new Date().toISOString() }
    const { error } = await supabase.from('conf_invitees').update(patch).eq('id', p.id)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    load()
  }

  async function remove(p: ConfInvitee) {
    if (!window.confirm(`Remove ${p.full_name || p.email} from this event?`)) return
    await supabase.from('conf_invitees').delete().eq('id', p.id)
    load()
  }

  function copyLink(p: ConfInvitee) {
    navigator.clipboard?.writeText(`${portalUrl}/e/${p.token}`)
    setMsg({ tone: 'ok', text: `Copied ${p.full_name || p.email}'s private RSVP link. Anyone with it can answer for them, so send it only to them.` })
  }

  function exportCsv() {
    downloadText(`${event.name.replace(/[^\w]+/g, '-')}-attendees.csv`, toCsv([
      ['Name', 'Email', 'Institution', 'Role', 'RSVP', 'Waitlist for', 'Dietary', 'Accessibility', 'Checked in', 'Invited'],
      ...people.map((p) => [
        p.full_name, p.email, p.institution, p.role_title, RSVP_LABEL[p.rsvp_status], p.waitlist_for,
        p.dietary, p.accessibility, p.checked_in_at ? 'Yes' : '', p.invite_count ? 'Yes' : '',
      ]),
    ]))
  }

  const capText = (n: number, cap: number | null) => (cap == null ? `${n}` : `${n} / ${cap}`)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['In person', capText(count('in_person'), event.capacity_in_person)],
          ['Online', capText(count('virtual'), event.capacity_virtual)],
          ['Waitlist', `${count('waitlist')}`],
          ['No reply', `${count('pending')}`],
          ['Declined', `${count('declined')}`],
          ['Checked in', `${checkedIn}`],
          ['Invited', `${people.filter((p) => p.invite_count > 0).length} of ${people.length}`],
          ['Unsubscribed', `${people.filter((p) => p.unsubscribed_at).length}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-surface px-4 py-3">
            <p className="text-xs text-muted">{k}</p>
            <p className="mt-0.5 font-display text-xl font-semibold tabular-nums text-ink">{v}</p>
          </div>
        ))}
      </div>

      {msg && (
        <p className={`rounded-md border px-4 py-3 text-sm ${msg.tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200'}`}>
          {msg.text} <button className="ml-2 font-medium underline" onClick={() => setMsg(null)}>Dismiss</button>
        </p>
      )}

      <Card>
        <CardHeader title="Add people" sub="Import a spreadsheet or type addresses. Duplicates and bad addresses are caught." />
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button className={mode === 'csv' ? primaryBtn : quietBtn} onClick={() => { setMode('csv'); setPending([]) }}>Upload a CSV</button>
            <button className={mode === 'type' ? primaryBtn : quietBtn} onClick={() => setMode('type')}>Type or paste emails</button>
          </div>
          {mode === 'csv' && (
            <div className="space-y-2">
              <input id="att-csv" type="file" accept=".csv,text/csv,.txt" className="block text-sm text-ink"
                onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
              <p className="text-xs text-muted">
                Needs an email column. Name, first/last name, institution and role columns are picked up if present,
                in any order. Excel: File → Save As → CSV.
              </p>
              {pending.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-ink">{pending.length} row{pending.length === 1 ? '' : 's'} read — e.g. {pending.slice(0, 2).map((r) => r.full_name ? `${r.full_name} <${r.email}>` : r.email).join(', ')}</span>
                  <button className={primaryBtn} disabled={busy} onClick={() => doImport(pending, 'csv')}>Import {pending.length}</button>
                </div>
              )}
            </div>
          )}
          {mode === 'type' && (
            <div className="space-y-2">
              <textarea id="att-paste" rows={4} className={input} value={pasted} onChange={(e) => setPasted(e.target.value)}
                placeholder={'one per line, or separated by commas\nJane Doe <jane@hospital.ca>\nsomeone@university.ca'} />
              <button className={primaryBtn} disabled={busy || !pasted.trim()}
                onClick={() => doImport(rowsFromText(pasted), 'manual')}>Add {rowsFromText(pasted).length || ''}</button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Invitations"
          sub={event.status === 'published' ? 'Each person gets a private RSVP link. Accepting asks them to set a password, or to sign in if they already have a portal account. Unsubscribed people are never emailed.' : 'Publish the event (in Settings) to send invitations.'}
        />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          <button className={primaryBtn} disabled={busy || event.status !== 'published' || notYetInvited === 0}
            onClick={() => send(null, true, `Send invitations to ${notYetInvited} ${notYetInvited === 1 ? 'person' : 'people'} not yet invited`)}>
            Invite {notYetInvited} new
          </button>
          <button className={quietBtn} disabled={busy || event.status !== 'published' || noReplyInvited.length === 0}
            onClick={() => send(noReplyInvited.map((p) => p.id), false, `Send a reminder invitation to ${noReplyInvited.length} ${noReplyInvited.length === 1 ? 'person' : 'people'} who have not replied`)}>
            Nudge {noReplyInvited.length} who haven't replied
          </button>
          <button className={quietBtn} disabled={busy} onClick={fillWaitlist}>Fill free places from the waitlist</button>
          {event.letters_enabled && (
            <button className={quietBtn} disabled={busy || lettersDue === 0} onClick={sendLetters}>
              Send {lettersDue} participation letter{lettersDue === 1 ? '' : 's'}
            </button>
          )}
          <button className={quietBtn} disabled={people.length === 0} onClick={exportCsv}>Export CSV</button>
          <a className={quietBtn} href={`/events/${event.id}/badges`} target="_blank" rel="noreferrer">Print name badges</a>
        </div>
      </Card>

      <Card>
        <CardHeader title="Attendees" sub="Check people in on the day — only checked-in attendees can download a participation letter." />
        <div className="space-y-3 border-b border-line px-5 py-3">
          <input id="att-search" className={input} placeholder="Search by name, email or institution" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.key ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:text-ink'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">{people.length === 0 ? 'Nobody added yet.' : 'Nobody matches.'}</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <label className="flex flex-none items-center" title="Checked in">
                  <input id={`att-in-${p.id}`} type="checkbox" className="h-5 w-5" checked={!!p.checked_in_at}
                    onChange={(e) => checkIn(p, e.target.checked)} aria-label={`Check in ${p.full_name || p.email}`} />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {p.full_name || <span className="text-muted">{p.email}</span>}
                    {p.unsubscribed_at && <span className="ml-2 text-xs font-normal text-muted">unsubscribed</span>}
                    {p.user_id && <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] font-normal text-muted" title="Signed up with a portal account">account</span>}
                    {p.source === 'public' && <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] font-normal text-muted" title="Registered through the public link">self-registered</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {[p.full_name ? p.email : null, p.institution, p.role_title].filter(Boolean).join(' · ')}
                  </p>
                  {(p.dietary || p.accessibility) && (
                    <p className="mt-0.5 text-xs text-ink">
                      {p.dietary && <span className="mr-3">Diet: {p.dietary}</span>}
                      {p.accessibility && <span>Access: {p.accessibility}</span>}
                    </p>
                  )}
                </div>
                <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-medium ${RSVP_TONE[p.rsvp_status]}`}>
                  {RSVP_LABEL[p.rsvp_status]}{p.rsvp_status === 'waitlist' && p.waitlist_for ? ` · ${p.waitlist_for === 'in_person' ? 'in person' : 'online'}` : ''}
                </span>
                <select id={`att-st-${p.id}`} className="flex-none rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                  value="" onChange={(e) => e.target.value && setStatus(p, e.target.value as RsvpStatus)} aria-label="Change RSVP">
                  <option value="">Change…</option>
                  <option value="in_person">In person</option>
                  {event.zoom_url && <option value="virtual">Online</option>}
                  <option value="declined">Declined</option>
                  <option value="pending">No reply</option>
                </select>
                <span className="flex-none">
                  <button className="text-xs font-medium text-accent hover:underline" onClick={() => copyLink(p)}>Copy link</button>
                  <button className="ml-3 text-xs font-medium text-muted hover:text-rose-600" onClick={() => remove(p)}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
