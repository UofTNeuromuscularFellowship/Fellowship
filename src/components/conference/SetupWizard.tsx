import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { friendly, money, primaryBtn, publishBlockers, quietBtn, type ConfEvent } from '../../lib/conference'
import { EventSettings } from './EventSettings'
import { Itinerary } from './Itinerary'
import { Speakers } from './Speakers'
import { InvitationEditor } from './InvitationEditor'
import { Attendees } from './Attendees'
import { Budget } from './money/Budget'
import { useMoney, budgetTotals } from './money/data'
import { DeleteEvent } from './DeleteEvent'

// ---------------------------------------------------------------------------
// Guided setup for a new event, one step at a time:
//
//   1 Details   name, dates, where, who it's from, what it needs
//   2 Program   sessions and speakers
//   3 Invite    who is invited, and the invitation email
//   4 Budget    what it should cost and bring in
//   5 Review    publish (and send the invitations), or finish as a draft
//
// Every step saves as it goes, and the step reached is remembered, so the
// coordinator can leave and pick up where they were. Steps 2-4 can be
// skipped. Once finished, the event opens on its dashboard instead.
// ---------------------------------------------------------------------------

const STEPS = ['Details', 'Program', 'Invite', 'Budget', 'Review'] as const

export function SetupWizard({ event, reload, portalUrl }: { event: ConfEvent; reload: () => void; portalUrl: string }) {
  const [step, setStep] = useState(Math.min(Math.max(event.setup_step ?? 0, 0), 4))

  async function goTo(n: number) {
    setStep(n)
    window.scrollTo({ top: 0 })
    if (n > (event.setup_step ?? 0)) {
      await supabase.from('conf_events').update({ setup_step: n }).eq('id', event.id)
      reload()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Setting up — step {step + 1} of {STEPS.length}. Everything saves as you go.</p>
        <span className="flex items-center gap-4">
          <Link to="/events" className="text-xs font-medium text-muted hover:text-ink">Save and finish later</Link>
          <DeleteEvent event={event} compact />
        </span>
      </div>

      <ol className="grid grid-cols-5 gap-1" aria-label="Setup steps">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button onClick={() => goTo(i)} aria-current={i === step ? 'step' : undefined}
              className="group flex w-full flex-col items-start gap-1 text-left">
              <span className={`h-1.5 w-full rounded-full ${i <= step ? 'bg-accent' : 'bg-line'}`} />
              <span className={`text-xs font-medium ${i === step ? 'text-ink' : 'text-muted group-hover:text-ink'}`}>
                <span className="hidden sm:inline">{i + 1}. </span>{label}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <EventSettings event={event} onSaved={reload} wizard onContinue={() => goTo(1)} />}

      {step === 1 && (
        <StepFrame title="Program" sub="Add sessions with their times and rooms, and who is speaking. You can come back to this at any time."
          onBack={() => goTo(0)} onNext={() => goTo(2)}>
          <Itinerary event={event} />
          <Speakers event={event} portalUrl={portalUrl} />
        </StepFrame>
      )}

      {step === 2 && (
        <StepFrame title="Invite" sub="Add the people you’re inviting — paste addresses or upload a spreadsheet — and check the invitation email. Nothing is sent until you publish at the last step."
          onBack={() => goTo(1)} onNext={() => goTo(3)}>
          <InvitationEditor event={event} onSaved={reload} />
          <Attendees event={event} portalUrl={portalUrl} />
        </StepFrame>
      )}

      {step === 3 && <BudgetStep event={event} onBack={() => goTo(2)} onNext={() => goTo(4)} />}

      {step === 4 && <Review event={event} reload={reload} onBack={() => goTo(3)} goTo={goTo} />}
    </div>
  )
}

function StepFrame({ title, sub, children, onBack, onNext, nextLabel = 'Continue →' }: {
  title: string; sub: string; children: React.ReactNode; onBack: () => void; onNext: () => void; nextLabel?: string
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button className={quietBtn} onClick={onBack}>← Back</button>
        <button className={primaryBtn} onClick={onNext}>{nextLabel}</button>
        <button className="text-xs font-medium text-muted hover:text-ink" onClick={onNext}>Skip for now</button>
      </div>
    </div>
  )
}

function BudgetStep({ event, onBack, onNext }: { event: ConfEvent; onBack: () => void; onNext: () => void }) {
  const { data, reload } = useMoney(event.id)
  return (
    <StepFrame title="Budget" sub="What you expect the event to cost and bring in. Later, as you record payments, it shows how you’re doing against it."
      onBack={onBack} onNext={onNext}>
      {data ? <Budget eventId={event.id} data={data} reload={reload} compact /> : <p className="text-sm text-muted">Loading…</p>}
    </StepFrame>
  )
}

function Review({ event, reload, onBack, goTo }: { event: ConfEvent; reload: () => void; onBack: () => void; goTo: (n: number) => void }) {
  const { data } = useMoney(event.id)
  const [c, setC] = useState<{ sessions: number; speakers: number; invitees: number } | null>(null)
  const [send, setSend] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const blockers = publishBlockers(event)

  useEffect(() => {
    (async () => {
      const [se, sp, inv] = await Promise.all([
        supabase.from('conf_sessions').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
        supabase.from('conf_speakers').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
        supabase.from('conf_invitees').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('invite_count', 0).is('unsubscribed_at', null),
      ])
      setC({ sessions: se.count ?? 0, speakers: sp.count ?? 0, invitees: inv.count ?? 0 })
    })()
  }, [event.id])

  async function finish(publishNow: boolean) {
    setBusy(true); setErr(null)
    const { error } = await supabase.from('conf_events')
      .update({ setup_done: true, setup_step: 4, ...(publishNow ? { status: 'published' } : {}) }).eq('id', event.id)
    if (error) { setBusy(false); setErr(friendly(error.message)); return }
    if (publishNow && send && c && c.invitees > 0) {
      const { error: e2 } = await supabase.rpc('conf_send_invitations', { p_event: event.id, p_invitee_ids: null, p_only_new: true })
      if (e2) { setBusy(false); setErr(`Published, but the invitations didn’t go: ${friendly(e2.message)}`); reload(); return }
    }
    setBusy(false)
    reload()
  }

  const t = data ? budgetTotals(data) : null
  const row = (ok: boolean, text: string, fix?: () => void, fixLabel = 'Change') => (
    <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs ${ok ? 'bg-emerald-600 text-white' : 'border border-line text-muted'}`}>{ok ? '✓' : ''}</span>
        {text}
      </span>
      {fix && <button className="text-xs font-medium text-accent hover:underline" onClick={fix}>{fixLabel}</button>}
    </li>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Review</h2>
        <p className="mt-1 text-sm text-muted">Check everything is in place, then publish — or finish now and publish later from the event’s overview.</p>
      </div>
      <Card>
        <CardHeader title={event.name} />
        {!c ? <p className="px-5 py-4 text-sm text-muted">Loading…</p> : (
          <ul className="divide-y divide-line">
            {row(blockers.length === 0, blockers.length ? `Still needed: ${blockers.join(', ')}` : 'Details, venue and organizer are complete', () => goTo(0))}
            {row(c.sessions > 0, c.sessions ? `${c.sessions} session${c.sessions === 1 ? '' : 's'}, ${c.speakers} speaker${c.speakers === 1 ? '' : 's'}` : 'No sessions yet (optional for now)', () => goTo(1))}
            {row(c.invitees > 0, c.invitees ? `${c.invitees} ${c.invitees === 1 ? 'person' : 'people'} ready to invite` : 'Nobody on the invitation list yet (optional for now)', () => goTo(2))}
            {row(!!data && data.lines.length > 0, t && data!.lines.length ? `Budget: ${money(t.costs.budgeted)} in costs, ${money(t.income.budgeted)} in income` : 'No budget yet (optional for now)', () => goTo(3))}
          </ul>
        )}
      </Card>

      {c && c.invitees > 0 && blockers.length === 0 && (
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input id="wiz-send" type="checkbox" className="mt-0.5 h-4 w-4" checked={send} onChange={(e) => setSend(e.target.checked)} />
          <span><span className="block font-medium text-ink">Send the invitations when I publish</span>
            <span className="block text-xs text-muted">{c.invitees} email{c.invitees === 1 ? '' : 's'}, out within 15 minutes.</span></span>
        </label>
      )}
      {err && <p className="text-sm text-rose-600">{err}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button className={quietBtn} onClick={onBack}>← Back</button>
        <button className={primaryBtn} disabled={busy || blockers.length > 0} onClick={() => finish(true)}>
          {busy ? 'Working…' : c && c.invitees > 0 && send ? 'Publish and send invitations' : 'Publish'}
        </button>
        <button className={quietBtn} disabled={busy} onClick={() => finish(false)}>Finish as a draft</button>
      </div>
    </div>
  )
}
