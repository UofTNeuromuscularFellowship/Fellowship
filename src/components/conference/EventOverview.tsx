import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { friendly, localIsoDate, money, primaryBtn, publishBlockers, quietBtn, type ConfEvent, type RsvpStatus } from '../../lib/conference'
import { budgetTotals, loadMoney, receiptsFor, type MoneyData } from './money/data'

// ---------------------------------------------------------------------------
// The event at a glance: where it stands, the numbers that matter, and the
// next few things to do - each a link to the place where it's done.
// ---------------------------------------------------------------------------

type Go = (section: string, view?: string) => void

interface Counts {
  sessions: number
  speakers: number
  disclosuresOut: number
  invitees: { rsvp_status: RsvpStatus; invite_count: number; checked_in_at: string | null; unsubscribed_at: string | null }[]
}

export function EventOverview({ event, go, onChanged }: { event: ConfEvent; go: Go; onChanged: () => void }) {
  const [c, setC] = useState<Counts | null>(null)
  const [money$, setMoney] = useState<MoneyData | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  useEffect(() => {
    (async () => {
      const [se, sp, inv, m] = await Promise.all([
        supabase.from('conf_sessions').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
        supabase.from('conf_speakers').select('email, disclosure_status').eq('event_id', event.id),
        supabase.from('conf_invitees').select('rsvp_status, invite_count, checked_in_at, unsubscribed_at').eq('event_id', event.id),
        loadMoney(event.id),
      ])
      const speakers = (sp.data as { email: string | null; disclosure_status: string }[]) ?? []
      setC({
        sessions: se.count ?? 0,
        speakers: speakers.length,
        disclosuresOut: speakers.filter((s) => s.disclosure_status === 'not_requested' || s.disclosure_status === 'requested').length,
        invitees: (inv.data as Counts['invitees']) ?? [],
      })
      setMoney(m)
    })()
  }, [event.id, event.status])

  if (!c || !money$) return <p className="text-sm text-muted">Loading…</p>

  const n = (s: RsvpStatus) => c.invitees.filter((i) => i.rsvp_status === s).length
  const notInvited = c.invitees.filter((i) => i.invite_count === 0 && !i.unsubscribed_at).length
  const t = budgetTotals(money$)
  const blockers = publishBlockers(event)
  const payOut = money$.honoraria.filter((h) => !h.paid_at).length
  const claimsToReview = money$.claims.filter((x) => x.status === 'submitted').length
  const noReceipt = money$.txns.filter((x) => x.kind === 'expense' && x.status === 'paid' && receiptsFor(money$, x).length === 0).length
  const over = event.ends_on < localIsoDate()

  async function publish() {
    setBusy(true)
    const { error } = await supabase.from('conf_events').update({ status: 'published' }).eq('id', event.id)
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: 'Published. You can now send invitations.' })
    onChanged()
  }

  // The next things to do, in the order they usually happen. Done items drop off.
  const steps: { text: string; section: string; view?: string; action: string }[] = []
  if (event.status === 'draft' && blockers.length) steps.push({ text: `Add ${blockers.join(', ')}`, section: 'settings', action: 'Open settings' })
  if (c.sessions === 0) steps.push({ text: 'Build the program: sessions, rooms and times', section: 'program', view: 'schedule', action: 'Add sessions' })
  if (c.speakers > 0 && c.disclosuresOut > 0) steps.push({ text: `${c.disclosuresOut} speaker disclosure${c.disclosuresOut === 1 ? '' : 's'} still to come in`, section: 'program', view: 'speakers', action: 'Speakers' })
  if (c.invitees.length === 0) steps.push({ text: 'Add the people you’re inviting', section: 'people', view: 'invitations', action: 'Add people' })
  if (event.status === 'published' && notInvited > 0) steps.push({ text: `${notInvited} ${notInvited === 1 ? 'person hasn’t' : 'people haven’t'} been sent an invitation`, section: 'people', view: 'invitations', action: 'Send invitations' })
  if (money$.lines.length === 0) steps.push({ text: 'Set a budget', section: 'money', view: 'budget', action: 'Budget' })
  if (claimsToReview > 0) steps.push({ text: `${claimsToReview} speaker expense${claimsToReview === 1 ? '' : 's'} to review`, section: 'money', view: 'speakers', action: 'Review' })
  if (payOut > 0 && over) steps.push({ text: `${payOut} speaker${payOut === 1 ? '' : 's'} still to be paid`, section: 'money', view: 'speakers', action: 'Speaker pay' })
  if (noReceipt > 0) steps.push({ text: `${noReceipt} paid cost${noReceipt === 1 ? ' has' : 's have'} no receipt`, section: 'money', view: 'costs', action: 'Attach' })
  if (over && money$.txns.length > 0) steps.push({ text: 'Download the financial report', section: 'money', view: 'report', action: 'Report' })

  const stat = (label: string, value: string, sub?: string, onClick?: () => void) => (
    <button onClick={onClick} className="rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-accent">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </button>
  )

  return (
    <div className="space-y-6">
      {msg && (
        <p className={`rounded-md border px-4 py-2 text-sm ${msg.tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200'}`}>{msg.text}</p>
      )}

      {event.status === 'draft' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 dark:border-amber-800 dark:bg-amber-950">
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-100">This event is a draft</p>
            <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
              {blockers.length ? `Before publishing, add ${blockers.join(', ')}.` : 'Publish it when you’re ready to send invitations.'}
            </p>
          </div>
          {blockers.length === 0
            ? <button className={primaryBtn} disabled={busy} onClick={publish}>Publish</button>
            : <button className={quietBtn} onClick={() => go('settings')}>Open settings</button>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stat('Attending', String(n('in_person') + n('virtual')), `${n('in_person')} in person · ${n('virtual')} online`, () => go('people', 'invitations'))}
        {stat('Waiting to hear', String(n('pending')), `${n('waitlist')} on the waitlist · ${n('declined')} declined`, () => go('people', 'invitations'))}
        {stat('Costs paid', money(t.costs.done), `of ${money(t.costs.budgeted)} budgeted`, () => go('money', 'budget'))}
        {stat('Net so far', money(t.netActual), `${money(t.netBudgeted)} as budgeted`, () => go('money', 'budget'))}
      </div>

      <Card>
        <CardHeader title="Next steps" sub={steps.length ? undefined : 'Nothing needs your attention right now.'} />
        {steps.length > 0 && (
          <ul className="divide-y divide-line">
            {steps.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="flex items-center gap-3 text-sm text-ink">
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-line text-xs text-muted">{i + 1}</span>
                  {s.text}
                </span>
                <button className={quietBtn} onClick={() => go(s.section, s.view)}>{s.action} →</button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <button className="rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-accent" onClick={() => go('program')}>
          <p className="font-medium text-ink">Program</p>
          <p className="text-xs text-muted">{c.sessions} session{c.sessions === 1 ? '' : 's'} · {c.speakers} speaker{c.speakers === 1 ? '' : 's'}</p>
        </button>
        <button className="rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-accent" onClick={() => go('people')}>
          <p className="font-medium text-ink">People</p>
          <p className="text-xs text-muted">{c.invitees.length} on the list · {c.invitees.filter((i) => i.checked_in_at).length} checked in</p>
        </button>
        <button className="rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-accent" onClick={() => go('money')}>
          <p className="font-medium text-ink">Money</p>
          <p className="text-xs text-muted">{money$.txns.length} transaction{money$.txns.length === 1 ? '' : 's'} · {payOut} speaker{payOut === 1 ? '' : 's'} to pay</p>
        </button>
      </div>
    </div>
  )
}
