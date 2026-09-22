import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Card, CardHeader } from '../../ui/Card'
import {
  cents, fmtHst, friendly, input, localIsoDate, money, normalHst, primaryBtn, quietBtn, CLAIM_CATEGORY_LABEL, PAY_METHOD_LABEL,
  type ConfEvent, type ConfHonorarium, type ConfSpeaker, type PayMethod,
} from '../../../lib/conference'
import { openReceipt, stageOf, STAGE_LABEL, STAGE_TONE, type MoneyData } from './data'

// ---------------------------------------------------------------------------
// Speaker pay: one row per speaker, left to right the way it happens.
//
//   set the amount → email the speaker → they confirm it and say who to pay
//   (cheque or e-Transfer), attach an invoice and claim expenses → approve the
//   expenses → record the payment
//
// Recording the payment adds it to Costs & income against the budget line
// chosen, so the budget and the report pick it up. It can be undone.
// ---------------------------------------------------------------------------

type Panel = 'setup' | 'details' | 'pay' | null

export function SpeakerPay({ event, data, reload, portalUrl }: {
  event: ConfEvent; data: MoneyData; reload: () => Promise<void>; portalUrl: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const hFor = (s: ConfSpeaker) => data.honoraria.find((h) => h.speaker_id === s.id)

  const notAsked = data.speakers.filter((s) => {
    const h = hFor(s)
    return s.email && h && !h.paid_at && !h.requested_at && ((h.amount ?? 0) > 0 || h.claims_allowed)
  })
  const agreed = cents(data.honoraria.reduce((a, h) => a + (h.amount ?? 0), 0))
  const paid = cents(data.honoraria.filter((h) => h.paid_at).reduce((a, h) => a + (h.amount ?? 0), 0))
  const toReview = data.claims.filter((c) => c.status === 'submitted').length

  async function request(ids: string[]) {
    if (!event.organizer_email || !event.organizer_name) {
      setMsg({ tone: 'bad', text: 'Add the organizer name and email in Settings first — the email comes from them.' }); return
    }
    if (!window.confirm(`Email ${ids.length === 1 ? 'this speaker' : `${ids.length} speakers`} a link to confirm their amount and payment details?`)) return
    setBusy(true)
    const { data: n, error } = await supabase.rpc('conf_request_payment_details', { p_event: event.id, p_speaker_ids: ids })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    setMsg({ tone: 'ok', text: `${n} email${n === 1 ? '' : 's'} queued. They go out within 15 minutes.` })
    await reload()
  }

  function toggle(id: string, p: Panel) {
    if (openId === id && panel === p) { setOpenId(null); setPanel(null) } else { setOpenId(id); setPanel(p) }
    setMsg(null)
  }

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`rounded-md border px-4 py-2 text-sm ${msg.tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200'}`}>
          {msg.text} <button className="ml-2 font-medium underline" onClick={() => setMsg(null)}>Dismiss</button>
        </p>
      )}
      <Card>
        <CardHeader title="Speaker pay"
          sub="Set each speaker’s honorarium, then email them a private link to confirm it and tell you who to pay and how."
          action={notAsked.length > 0 ? (
            <button className={primaryBtn} disabled={busy} onClick={() => request(notAsked.map((s) => s.id))}>
              Email {notAsked.length} speaker{notAsked.length === 1 ? '' : 's'}
            </button>
          ) : undefined} />
        {data.speakers.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-5 py-3 text-sm">
            <span><span className="text-muted">Agreed</span> <strong className="tabular-nums">{money(agreed)}</strong></span>
            <span><span className="text-muted">Paid</span> <strong className="tabular-nums">{money(paid)}</strong></span>
            {toReview > 0 && <span className="font-medium text-amber-700 dark:text-amber-300">{toReview} expense{toReview === 1 ? '' : 's'} to review</span>}
          </div>
        )}
        {data.speakers.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No speakers yet. Add them under Program.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.speakers.map((s) => {
              const h = hFor(s)
              const stage = stageOf(h)
              const claims = h ? data.claims.filter((c) => c.honorarium_id === h.id) : []
              const pending = claims.filter((c) => c.status === 'submitted').length
              const isOpen = openId === s.id
              return (
                <li key={s.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-sm font-medium text-ink">{s.full_name}</p>
                      <p className="text-xs text-muted">{s.email || 'No email — copy their link and send it yourself'}</p>
                    </div>
                    <div className="w-32 text-right text-sm">
                      {h?.amount != null ? <span className="font-semibold tabular-nums">{money(h.amount)}</span> : <span className="text-muted">—</span>}
                      {h?.confirmed_at && <span className="block text-xs text-emerald-700 dark:text-emerald-300">confirmed</span>}
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_TONE[stage]}`}>{STAGE_LABEL[stage]}</span>
                    {pending > 0 && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{pending} expense{pending === 1 ? '' : 's'} to review</span>}
                    <span className="flex flex-wrap gap-3 text-xs">
                      {stage === 'none' && <button className="font-medium text-accent hover:underline" onClick={() => toggle(s.id, 'setup')}>Set up payment</button>}
                      {h && stage !== 'paid' && <button className="font-medium text-accent hover:underline" onClick={() => toggle(s.id, 'setup')}>Edit amount</button>}
                      {h && <button className="font-medium text-accent hover:underline" onClick={() => toggle(s.id, 'details')}>
                        Details{claims.length ? ` & expenses (${claims.length})` : ''}</button>}
                      {h && s.email && (stage === 'ready' || stage === 'requested') && (
                        <button className="font-medium text-accent hover:underline" disabled={busy} onClick={() => request([s.id])}>
                          {stage === 'ready' ? 'Email request' : 'Send again'}</button>
                      )}
                      {h && stage !== 'paid' && <button className="font-medium text-accent hover:underline" onClick={() => toggle(s.id, 'pay')}>Mark paid</button>}
                      {h && stage === 'paid' && (
                        <button className="font-medium text-muted hover:text-rose-600" disabled={busy} onClick={async () => {
                          if (!window.confirm(`Undo ${s.full_name}’s payment? It comes off Costs & income, and their approved expenses go back to waiting for payment.`)) return
                          const e = await undoPayment(h)
                          if (e) { setMsg({ tone: 'bad', text: e }); return }
                          setMsg({ tone: 'ok', text: 'Payment undone.' })
                          await reload()
                        }}>Undo payment</button>
                      )}
                      {h && (
                        <button className="font-medium text-muted hover:text-ink" onClick={() => {
                          navigator.clipboard?.writeText(`${portalUrl}/speaker/${s.token}`)
                          setMsg({ tone: 'ok', text: `Copied ${s.full_name}’s private link.` })
                        }}>Copy link</button>
                      )}
                    </span>
                  </div>
                  {isOpen && panel === 'setup' && (
                    <Setup event={event} s={s} h={h} data={data} onDone={async (t) => { setPanel(null); setOpenId(null); if (t) setMsg({ tone: 'ok', text: t }); await reload() }}
                      onError={(t) => setMsg({ tone: 'bad', text: t })} />
                  )}
                  {isOpen && panel === 'details' && h && <Details event={event} h={h} data={data} reload={reload} onMsg={setMsg} />}
                  {isOpen && panel === 'pay' && h && (
                    <Pay event={event} s={s} h={h} data={data}
                      onDone={async (t) => { setPanel(null); setOpenId(null); setMsg({ tone: 'ok', text: t }); await reload() }}
                      onError={(t) => setMsg({ tone: 'bad', text: t })} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 space-y-3 rounded-md border border-line bg-paper p-4 text-sm">{children}</div>
}

function Field({ label, children, help, wide }: { label: string; children: React.ReactNode; help?: string; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  )
}

// The amount, whether expenses are covered, and which budget line it comes from.
function Setup({ event, s, h, data, onDone, onError }: {
  event: ConfEvent; s: ConfSpeaker; h: ConfHonorarium | undefined; data: MoneyData
  onDone: (msg?: string) => Promise<void>; onError: (m: string) => void
}) {
  const costLines = data.lines.filter((l) => l.kind === 'expense')
  const guess = costLines.find((l) => /honorari|speaker/i.test(l.category))?.id ?? ''
  const [f, setF] = useState({
    amount: h?.amount != null ? String(h.amount) : '',
    claims_allowed: h?.claims_allowed ?? false,
    claims_note: h?.claims_note ?? '',
    budget_id: h ? (h.budget_id ?? '') : guess,
    notes: h?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    const amount = f.amount.trim() === '' ? null : cents(Number(f.amount))
    if (amount != null && !(amount >= 0)) { onError('Enter an amount of zero or more.'); return }
    if (amount == null && !f.claims_allowed) { onError('Enter an honorarium, or allow expense claims.'); return }
    const row = {
      amount, claims_allowed: f.claims_allowed, claims_note: f.claims_note.trim() || null,
      budget_id: f.budget_id || null, notes: f.notes.trim() || null,
    }
    setBusy(true)
    const res = h
      ? await supabase.from('conf_honoraria').update(row).eq('id', h.id)
      : await supabase.from('conf_honoraria').insert({ ...row, event_id: event.id, speaker_id: s.id })
    setBusy(false)
    if (res.error) { onError(friendly(res.error.message)); return }
    const reconfirm = h?.confirmed_at && h.amount !== amount
    await onDone(reconfirm ? `Saved. ${s.full_name} had confirmed the old amount, so they’ll be asked to confirm again.` : 'Saved.')
  }

  async function remove() {
    if (!h) return
    if (!window.confirm(`Remove ${s.full_name}’s payment set-up? Their payment details and expense claims are deleted too.`)) return
    const files = data.receipts.filter((r) => r.honorarium_id === h.id
      || (r.claim_id && data.claims.some((c) => c.id === r.claim_id && c.honorarium_id === h.id)))
    if (files.length) await supabase.storage.from('conference').remove(files.map((r) => r.storage_path))
    const { error } = await supabase.from('conf_honoraria').delete().eq('id', h.id)
    if (error) { onError(friendly(error.message)); return }
    await onDone('Removed.')
  }

  return (
    <Box>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Honorarium ($)" help={`Before ${event.tax_label}. Leave blank if you are only covering expenses.`}>
          <input id="hon-amount" className={input} type="number" min="0" step="0.01" inputMode="decimal" value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })} />
        </Field>
        <Field label="Comes out of">
          <select id="hon-line" className={input} value={f.budget_id} onChange={(e) => setF({ ...f, budget_id: e.target.value })}>
            <option value="">Not in the budget</option>
            {costLines.map((l) => <option key={l.id} value={l.id}>{l.category}</option>)}
          </select>
        </Field>
        <label className="flex cursor-pointer items-start gap-2 sm:col-span-2">
          <input id="hon-claims" type="checkbox" className="mt-0.5 h-4 w-4" checked={f.claims_allowed}
            onChange={(e) => setF({ ...f, claims_allowed: e.target.checked })} />
          <span>
            <span className="block font-medium text-ink">Let them claim expenses</span>
            <span className="block text-xs text-muted">They can list travel and other costs with receipts; you approve each one before it’s paid.</span>
          </span>
        </label>
        {f.claims_allowed && (
          <Field label="What you’ll cover (shown to the speaker)" wide>
            <input id="hon-claims-note" className={input} value={f.claims_note} placeholder="e.g. Economy travel and one night’s hotel, up to $600"
              onChange={(e) => setF({ ...f, claims_note: e.target.value })} />
          </Field>
        )}
        <Field label="Private notes" wide>
          <input id="hon-notes" className={input} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button className={quietBtn} onClick={() => onDone()}>Cancel</button>
        {h && !h.paid_at && <button className="ml-auto text-xs font-medium text-muted hover:text-rose-600" onClick={remove}>Remove payment set-up</button>}
      </div>
    </Box>
  )
}

// Who to pay, their invoice, and their expense claims.
function Details({ event, h, data, reload, onMsg }: {
  event: ConfEvent; h: ConfHonorarium; data: MoneyData; reload: () => Promise<void>
  onMsg: (m: { tone: 'ok' | 'bad'; text: string } | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const claims = data.claims.filter((c) => c.honorarium_id === h.id)
  const invoices = data.receipts.filter((r) => r.honorarium_id === h.id)

  async function decide(id: string, status: 'approved' | 'declined' | 'submitted') {
    let note: string | null = null
    if (status === 'declined') {
      note = window.prompt('Why isn’t this being covered? The speaker sees this note.') ?? null
      if (note === null) return
    }
    const { error } = await supabase.from('conf_claims').update({
      status, decision_note: note?.trim() || null, decided_at: status === 'submitted' ? null : new Date().toISOString(),
    }).eq('id', id)
    if (error) { onMsg({ tone: 'bad', text: friendly(error.message) }); return }
    await reload()
  }

  return (
    <Box>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Who to pay</p>
        {editing ? <PayeeForm event={event} h={h} onDone={async () => { setEditing(false); await reload() }} onError={(t) => onMsg({ tone: 'bad', text: t })} />
          : h.details_at ? (
            <dl className="grid gap-1 sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted">Paid to</dt><dd>{h.legal_name} {h.payee_type === 'corporation' ? '(corporation)' : '(personally)'}</dd>
              <dt className="text-muted">{event.tax_label} number</dt><dd>{h.hst_number ? fmtHst(h.hst_number) : 'None given'}</dd>
              <dt className="text-muted">By</dt><dd>{h.pay_method === 'cheque' ? 'Cheque' : `e-Transfer to ${h.etransfer_email}`}</dd>
              {h.address && <><dt className="text-muted">Mailing address</dt><dd className="whitespace-pre-line">{h.address}</dd></>}
              <dt className="text-muted">Amount</dt><dd>{h.amount != null ? money(h.amount) : '—'} {h.confirmed_at ? '· confirmed by the speaker' : '· not yet confirmed'}</dd>
            </dl>
          ) : <p className="text-muted">Not given yet.</p>}
        {!editing && !h.paid_at && (
          <button className="mt-2 text-xs font-medium text-accent hover:underline" onClick={() => setEditing(true)}>
            {h.details_at ? 'Edit' : 'Enter them yourself'}
          </button>
        )}
      </div>

      {invoices.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Invoice</p>
          {invoices.map((r) => (
            <button key={r.id} className="mr-3 font-medium text-accent hover:underline" onClick={() => openReceipt(r)}>{r.file_name}</button>
          ))}
        </div>
      )}

      {(h.claims_allowed || claims.length > 0) && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Expenses</p>
          {claims.length === 0 ? <p className="text-muted">None claimed yet.</p> : (
            <ul className="divide-y divide-line rounded-md border border-line bg-surface">
              {claims.map((c) => {
                const recs = data.receipts.filter((r) => r.claim_id === c.id)
                return (
                  <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-3 py-2">
                    <div className="min-w-[12rem] flex-1">
                      <p className="font-medium">{c.description}</p>
                      <p className="text-xs text-muted">
                        {CLAIM_CATEGORY_LABEL[c.category]}{c.incurred_on ? ` · ${c.incurred_on}` : ''}
                        {c.tax > 0 ? ` · incl. ${money(c.tax)} tax` : ''}
                        {c.decision_note ? ` · “${c.decision_note}”` : ''}
                      </p>
                      <p className="text-xs">
                        {recs.length === 0 ? <span className="text-amber-700 dark:text-amber-300">No receipt attached</span>
                          : recs.map((r) => <button key={r.id} className="mr-3 font-medium text-accent hover:underline" onClick={() => openReceipt(r)}>{r.file_name}</button>)}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{money(c.amount)}</span>
                    <span className="flex gap-3 text-xs">
                      {c.status === 'submitted' && <>
                        <button className="font-medium text-emerald-700 hover:underline dark:text-emerald-300" onClick={() => decide(c.id, 'approved')}>Approve</button>
                        <button className="font-medium text-rose-600 hover:underline" onClick={() => decide(c.id, 'declined')}>Decline</button>
                      </>}
                      {(c.status === 'approved' || c.status === 'declined') && <>
                        <span className={c.status === 'approved' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}>
                          {c.status === 'approved' ? 'Approved' : 'Declined'}</span>
                        <button className="text-muted hover:text-ink" onClick={() => decide(c.id, 'submitted')}>Undo</button>
                      </>}
                      {c.status === 'paid' && <span className="text-emerald-700 dark:text-emerald-300">Paid</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Box>
  )
}

// For details that arrive by email or on paper.
function PayeeForm({ event, h, onDone, onError }: {
  event: ConfEvent; h: ConfHonorarium; onDone: () => Promise<void>; onError: (m: string) => void
}) {
  const [f, setF] = useState({
    payee_type: h.payee_type ?? 'individual', legal_name: h.legal_name ?? '', hst_number: fmtHst(h.hst_number),
    pay_method: h.pay_method ?? 'cheque', etransfer_email: h.etransfer_email ?? '', address: h.address ?? '',
  })
  async function save() {
    if (!f.legal_name.trim()) { onError('Enter the name the payment is made out to.'); return }
    const hst = f.hst_number.trim() ? normalHst(f.hst_number) : null
    if (f.hst_number.trim() && !hst) { onError(`That doesn’t look like an ${event.tax_label} number — nine digits, RT, then four digits.`); return }
    if (f.pay_method === 'cheque' && !f.address.trim()) { onError('A cheque needs a mailing address.'); return }
    if (f.pay_method === 'etransfer' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.etransfer_email.trim())) { onError('Enter the e-Transfer email address.'); return }
    const { error } = await supabase.from('conf_honoraria').update({
      payee_type: f.payee_type, legal_name: f.legal_name.trim(), hst_number: hst, pay_method: f.pay_method,
      etransfer_email: f.pay_method === 'etransfer' ? f.etransfer_email.trim().toLowerCase() : null,
      address: f.address.trim() || null, details_at: h.details_at ?? new Date().toISOString(),
    }).eq('id', h.id)
    if (error) { onError(friendly(error.message)); return }
    await onDone()
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Paid to">
        <select className={input} value={f.payee_type} onChange={(e) => setF({ ...f, payee_type: e.target.value as 'individual' | 'corporation' })}>
          <option value="individual">The speaker personally</option>
          <option value="corporation">Their corporation</option>
        </select>
      </Field>
      <Field label="Legal name"><input className={input} value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} /></Field>
      <Field label={`${event.tax_label} number (if they charge it)`}><input className={input} value={f.hst_number} onChange={(e) => setF({ ...f, hst_number: e.target.value })} /></Field>
      <Field label="Pay by">
        <select className={input} value={f.pay_method} onChange={(e) => setF({ ...f, pay_method: e.target.value as 'cheque' | 'etransfer' })}>
          <option value="cheque">Cheque</option><option value="etransfer">e-Transfer</option>
        </select>
      </Field>
      {f.pay_method === 'etransfer' && <Field label="e-Transfer email"><input className={input} type="email" value={f.etransfer_email} onChange={(e) => setF({ ...f, etransfer_email: e.target.value })} /></Field>}
      <Field label="Mailing address" wide><textarea className={input} rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      <div className="flex gap-2 sm:col-span-2">
        <button className={primaryBtn} onClick={save}>Save</button>
        <button className={quietBtn} onClick={() => onDone()}>Cancel</button>
      </div>
    </div>
  )
}

// Record the payment: the honorarium (plus tax if they charge it) and the approved expenses.
function Pay({ event, s, h, data, onDone, onError }: {
  event: ConfEvent; s: ConfSpeaker; h: ConfHonorarium; data: MoneyData
  onDone: (msg: string) => Promise<void>; onError: (m: string) => void
}) {
  const claims = data.claims.filter((c) => c.honorarium_id === h.id)
  const undecided = claims.filter((c) => c.status === 'submitted').length
  const approved = cents(claims.filter((c) => c.status === 'approved').reduce((a, c) => a + c.amount, 0))
  const fee = h.amount ?? 0
  const costLines = data.lines.filter((l) => l.kind === 'expense')
  const travelGuess = costLines.find((l) => /travel|accommodation|expense/i.test(l.category))?.id ?? ''
  const [f, setF] = useState({
    paid_on: localIsoDate(),
    method: (h.pay_method ?? 'cheque') as PayMethod,
    reference: '',
    tax: h.hst_number && fee > 0 ? String(cents(fee * Number(event.tax_rate) / 100)) : '0',
    budget_id: h.budget_id ?? '',
    claims_budget: travelGuess,
  })
  const [busy, setBusy] = useState(false)
  const tax = cents(Number(f.tax) || 0)
  const total = cents(fee + tax + approved)

  async function pay() {
    setBusy(true)
    const { error } = await supabase.rpc('conf_pay_speaker', {
      p_honorarium: h.id, p_paid_on: f.paid_on, p_method: f.method, p_reference: f.reference || null,
      p_tax: tax, p_budget: f.budget_id || null, p_claims_budget: f.claims_budget || null,
    })
    setBusy(false)
    if (error) { onError(friendly(error.message)); return }
    await onDone(`Recorded ${money(total)} paid to ${h.legal_name || s.full_name}. It’s in Costs & income, where you can attach the cheque or transfer confirmation.`)
  }

  if (undecided > 0) {
    return <Box><p>Approve or decline {undecided === 1 ? 'the expense' : `the ${undecided} expenses`} waiting for a decision first — open <strong>Details & expenses</strong>.</p></Box>
  }
  return (
    <Box>
      {!h.details_at && <p className="text-amber-700 dark:text-amber-300">The speaker hasn’t said who to pay yet. You can still record a payment you’ve made.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Paid on"><input id="pay-date" className={input} type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></Field>
        <Field label="How">
          <select id="pay-method" className={input} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>
            {Object.entries(PAY_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Cheque or confirmation no."><input id="pay-ref" className={input} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        {fee > 0 && <>
          <Field label={`${event.tax_label} on the honorarium ($)`} help={h.hst_number ? `They gave an ${event.tax_label} number, so ${Number(event.tax_rate)}% is filled in.` : `No ${event.tax_label} number given.`}>
            <input id="pay-tax" className={input} type="number" min="0" step="0.01" value={f.tax} onChange={(e) => setF({ ...f, tax: e.target.value })} />
          </Field>
          <Field label="Honorarium comes out of">
            <select id="pay-line" className={input} value={f.budget_id} onChange={(e) => setF({ ...f, budget_id: e.target.value })}>
              <option value="">Not in the budget</option>
              {costLines.map((l) => <option key={l.id} value={l.id}>{l.category}</option>)}
            </select>
          </Field>
        </>}
        {approved > 0 && (
          <Field label="Expenses come out of">
            <select id="pay-claims-line" className={input} value={f.claims_budget} onChange={(e) => setF({ ...f, claims_budget: e.target.value })}>
              <option value="">Not in the budget</option>
              {costLines.map((l) => <option key={l.id} value={l.id}>{l.category}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="rounded-md border border-line bg-surface px-3 py-2 tabular-nums">
        {fee > 0 && <div className="flex justify-between"><span>Honorarium</span><span>{money(fee)}</span></div>}
        {tax > 0 && <div className="flex justify-between"><span>{event.tax_label}</span><span>{money(tax)}</span></div>}
        {approved > 0 && <div className="flex justify-between"><span>Approved expenses</span><span>{money(approved)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total paid</span><span>{money(total)}</span></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={primaryBtn} disabled={busy || total <= 0} onClick={pay}>{busy ? 'Recording…' : 'Record payment'}</button>
      </div>
    </Box>
  )
}

/** For a paid speaker: take the payment back off the books (e.g. a cheque recorded by mistake). */
export async function undoPayment(h: ConfHonorarium): Promise<string | null> {
  const { error } = await supabase.rpc('conf_unpay_speaker', { p_honorarium: h.id })
  return error ? friendly(error.message) : null
}
