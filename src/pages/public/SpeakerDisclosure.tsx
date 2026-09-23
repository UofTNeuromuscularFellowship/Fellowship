import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicClient, FUNCTIONS_URL, PUBLIC_ANON_KEY } from '../../lib/publicClient'
import {
  input, primaryBtn, quietBtn, prettyDay, money, fmtHst, DISCLOSURE_LABEL, CLAIM_CATEGORY_LABEL,
  type DisclosureStatus, type SpeakerRole, type ClaimCategory, type ClaimStatus,
} from '../../lib/conference'
import { PublicFrame, Panel, Notice, Invalid, rpcMessage } from './PublicFrame'

// ---------------------------------------------------------------------------
// A speaker's own page, at /speaker/<token>.
//
// Reached from the disclosure email and the "Arranging your payment" email.
// Two jobs, each only when the organizer has asked for it:
//
//   Disclosure   relevant financial relationships, shown to attendees beside
//                the speaker's name. What period and detail is required is for
//                the organizer's accrediting body to say, so this page does
//                not state a rule of its own.
//   Payment      confirm the agreed honorarium, say who to pay and how
//                (cheque or e-Transfer), upload an invoice, and claim
//                expenses with receipts.
//
// Nothing here asks for bank account numbers or a SIN.
// ---------------------------------------------------------------------------

interface FileRef { id: string; file_name: string; mine: boolean }
interface Claim {
  id: string; category: ClaimCategory; description: string; incurred_on: string | null
  amount: number; tax: number; status: ClaimStatus; decision_note: string | null; receipts: FileRef[]
}
interface Honorarium {
  amount: number | null; confirmed: boolean; claims_allowed: boolean; claims_note: string | null
  payee_type: 'individual' | 'corporation' | null; legal_name: string | null; hst_number: string | null
  address: string | null; pay_method: 'cheque' | 'etransfer' | null; etransfer_email: string | null
  details_given: boolean; paid: boolean; invoices: FileRef[]; claims: Claim[]
}
interface Portal {
  speaker_name: string; event_name: string; when: string
  organizer_name: string | null; organizer_email: string | null; tax_label: string
  logo_url?: string | null
  disclosure_status: DisclosureStatus; disclosure_text: string | null
  sessions: { title: string; role: SpeakerRole; session_date: string; start_time: string }[]
  honorarium: Honorarium | null
}

const ROLE: Record<SpeakerRole, string> = { speaker: 'Speaker', moderator: 'Moderator', panelist: 'Panelist' }

// "Dr Jane Smith" is greeted in full, not as "Hi Dr" (same rule as the emails, 0035).
function greetingName(name: string): string {
  const n = name.trim()
  const first = n.split(/\s+/)[0] ?? ''
  if (!n) return 'there'
  return /^(dr|prof|professor|mr|mrs|ms|mx|miss|sir|dame)\.?$/i.test(first) ? n : first
}
const CLAIM_STATUS: Record<ClaimStatus, string> = {
  submitted: 'Waiting for review', approved: 'Approved', declined: 'Not approved', paid: 'Paid',
}

async function callFiles(body: FormData | Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const isForm = body instanceof FormData
  const res = await fetch(`${FUNCTIONS_URL}/conf-speaker-files`, {
    method: 'POST',
    headers: isForm ? { apikey: PUBLIC_ANON_KEY } : { apikey: PUBLIC_ANON_KEY, 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
  }).catch(() => null)
  if (!res) return { ok: false, data: { error: 'We couldn’t reach the server. Check your connection and try again.' } }
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

export default function SpeakerDisclosure() {
  const { token = '' } = useParams<{ token: string }>()
  const [d, setD] = useState<Portal | null | undefined>(undefined)

  const load = useCallback(async () => {
    const { data, error } = await publicClient.rpc('conf_speaker_portal', { p_token: token })
    setD(error ? null : ((data as Portal | null) ?? null))
  }, [token])
  useEffect(() => { load() }, [load])

  if (d === undefined) return <PublicFrame><p className="text-sm text-muted">Loading…</p></PublicFrame>
  if (d === null) return <Invalid what="speaker page" />

  const h = d.honorarium
  return (
    <PublicFrame kicker="Speaker page" title={d.event_name} organizer={d.organizer_name} organizerEmail={d.organizer_email} logoUrl={d.logo_url}>
      <Panel>
        <p className="text-sm">Hi {greetingName(d.speaker_name)}, thank you for speaking at <strong>{d.event_name}</strong>, {d.when}.</p>
        {d.sessions.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {d.sessions.map((s, i) => (
              <li key={i}>
                <span className="text-muted">{ROLE[s.role]} · {prettyDay(s.session_date)}, {s.start_time} · </span>
                {s.title}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {h && <Payment token={token} h={h} taxLabel={d.tax_label} reload={load} />}
      <Disclosure token={token} d={d} reload={load} />
    </PublicFrame>
  )
}

// ------------------------------- disclosure --------------------------------

function Disclosure({ token, d, reload }: { token: string; d: Portal; reload: () => Promise<void> }) {
  const submitted = d.disclosure_status === 'received' || d.disclosure_status === 'nothing_to_declare'
  const [open, setOpen] = useState(!submitted)
  const [mode, setMode] = useState<'none' | 'some' | null>(
    d.disclosure_status === 'nothing_to_declare' ? 'none' : d.disclosure_status === 'received' ? 'some' : null)
  const [text, setText] = useState(d.disclosure_text ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!mode) { setMsg({ tone: 'bad', text: 'Choose one of the two options.' }); return }
    if (mode === 'some' && !text.trim()) { setMsg({ tone: 'bad', text: 'Describe the relationships you are disclosing.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await publicClient.rpc('conf_public_disclosure_submit', {
      p_token: token, p_nothing_to_declare: mode === 'none', p_text: mode === 'some' ? text : null,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'We couldn’t save your disclosure. Please try again.') }); return }
    setMsg({ tone: 'ok', text: 'Thank you — your disclosure is saved.' })
    setOpen(false)
    await reload()
  }

  return (
    <Panel title="Your disclosure">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted">Status: <strong className="text-ink">{DISCLOSURE_LABEL[d.disclosure_status]}</strong></p>
          {submitted && !open && <button className={quietBtn} onClick={() => setOpen(true)}>Update</button>}
        </div>
        {submitted && !open && d.disclosure_status === 'received' && d.disclosure_text && (
          <p className="whitespace-pre-line rounded-md border border-line bg-paper px-3 py-2">{d.disclosure_text}</p>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {open && (
          <form onSubmit={submit} className="space-y-4">
            <p>
              Please disclose any financial relationships relevant to the content of your presentation — for example
              consulting or advisory roles, speaking fees, research funding, or equity — or confirm that you have none.
              If you’re unsure what period or level of detail applies, please ask the organizer.
            </p>
            <p className="text-muted">What you submit is shown to attendees beside your name in the event itinerary.</p>
            <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 ${mode === 'none' ? 'border-accent bg-accent-soft' : 'border-line'}`}>
              <input type="radio" name="disc" className="mt-1" checked={mode === 'none'} onChange={() => setMode('none')} />
              <span>I have no relevant financial relationships to disclose.</span>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 ${mode === 'some' ? 'border-accent bg-accent-soft' : 'border-line'}`}>
              <input type="radio" name="disc" className="mt-1" checked={mode === 'some'} onChange={() => setMode('some')} />
              <span>I have relationships to disclose.</span>
            </label>
            {mode === 'some' && (
              <textarea className={input} rows={5} value={text} onChange={(e) => setText(e.target.value)}
                aria-label="Relationships to disclose" placeholder="Company or organization, and the nature of the relationship" />
            )}
            <button className={primaryBtn} disabled={busy}>{busy ? 'Saving…' : submitted ? 'Update disclosure' : 'Submit disclosure'}</button>
          </form>
        )}
      </div>
    </Panel>
  )
}

// -------------------------------- payment ----------------------------------

function Payment({ token, h, taxLabel, reload }: { token: string; h: Honorarium; taxLabel: string; reload: () => Promise<void> }) {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const hasFee = (h.amount ?? 0) > 0

  async function confirm() {
    setBusy(true); setMsg(null)
    const { error } = await publicClient.rpc('conf_speaker_confirm', { p_token: token, p_amount: h.amount })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'We couldn’t record that. Please try again.') }); await reload(); return }
    await reload()
  }

  if (h.paid) {
    return (
      <Panel title="Your payment" tone="accent">
        <p className="text-sm">
          Your payment has been sent{hasFee ? <> — honorarium of <strong>{money(h.amount)}</strong></> : null}. Thank you.
          If something doesn’t look right, please contact the organizer.
        </p>
        {h.claims.length > 0 && <ClaimList token={token} h={h} reload={reload} readOnly />}
      </Panel>
    )
  }

  return (
    <>
      {hasFee && (
        <Panel title="Your honorarium">
          <div className="space-y-3 text-sm">
            <p className="text-2xl font-semibold tabular-nums">{money(h.amount)}</p>
            {h.confirmed ? (
              <p className="font-medium text-emerald-700 dark:text-emerald-300">✓ You confirmed this amount.</p>
            ) : (
              <>
                <p className="text-muted">If this is the amount you agreed with the organizer, please confirm it. If it isn’t, contact them before confirming.</p>
                <button className={primaryBtn} disabled={busy} onClick={confirm}>{busy ? 'Saving…' : 'I confirm this amount'}</button>
              </>
            )}
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          </div>
        </Panel>
      )}
      <Payee token={token} h={h} taxLabel={taxLabel} reload={reload} />
      <Panel title="Invoice" sub="Optional. If you invoice for your honorarium — for example through your corporation — attach it here.">
        <Files token={token} kind="invoice" files={h.invoices.filter((f) => f.mine)} reload={reload} />
      </Panel>
      {h.claims_allowed && (
        <Panel title="Expenses" sub="Travel and other costs the organizer has agreed to cover. Add each expense, then attach its receipt.">
          {h.claims_note && <p className="mb-3 rounded-md border border-line bg-paper px-3 py-2 text-sm">{h.claims_note}</p>}
          <ClaimList token={token} h={h} reload={reload} />
          <AddClaim token={token} reload={reload} />
        </Panel>
      )}
    </>
  )
}

function Payee({ token, h, taxLabel, reload }: { token: string; h: Honorarium; taxLabel: string; reload: () => Promise<void> }) {
  const [f, setF] = useState({
    payee_type: h.payee_type ?? '', legal_name: h.legal_name ?? '', hst_number: fmtHst(h.hst_number),
    address: h.address ?? '', pay_method: h.pay_method ?? '', etransfer_email: h.etransfer_email ?? '',
  })
  const [editing, setEditing] = useState(!h.details_given)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const corp = f.payee_type === 'corporation'

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!f.payee_type) { setMsg({ tone: 'bad', text: 'Choose who the payment is made out to.' }); return }
    if (!f.pay_method) { setMsg({ tone: 'bad', text: 'Choose cheque or e-Transfer.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await publicClient.rpc('conf_speaker_payee', {
      p_token: token, p_payee_type: f.payee_type, p_legal_name: f.legal_name, p_hst_number: f.hst_number,
      p_address: f.address, p_pay_method: f.pay_method, p_etransfer_email: f.etransfer_email,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'bad', text: rpcMessage(error, 'We couldn’t save your details. Please try again.') }); return }
    setMsg({ tone: 'ok', text: 'Saved. Thank you — the organizer will be in touch if anything else is needed.' })
    setEditing(false)
    await reload()
  }

  const field = (label: string, el: React.ReactNode, help?: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {el}
      {help && <span className="mt-1 block text-xs text-muted">{help}</span>}
    </label>
  )
  const choice = (name: string, value: string, current: string, label: string, onPick: () => void) => (
    <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${current === value ? 'border-accent bg-accent-soft' : 'border-line'}`}>
      <input type="radio" name={name} checked={current === value} onChange={onPick} />{label}
    </label>
  )

  if (!editing) {
    return (
      <Panel title="How you’ll be paid">
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">Paid to</dt><dd>{h.legal_name} {h.payee_type === 'corporation' ? '(corporation)' : ''}</dd>
          {h.hst_number && <><dt className="text-muted">{taxLabel} number</dt><dd>{fmtHst(h.hst_number)}</dd></>}
          <dt className="text-muted">By</dt><dd>{h.pay_method === 'cheque' ? 'Cheque by mail' : `e-Transfer to ${h.etransfer_email}`}</dd>
          {h.address && <><dt className="text-muted">Mailing address</dt><dd className="whitespace-pre-line">{h.address}</dd></>}
        </dl>
        {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
        <button className={`${quietBtn} mt-4`} onClick={() => { setEditing(true); setMsg(null) }}>Change</button>
      </Panel>
    )
  }

  return (
    <Panel title="How you’d like to be paid">
      <form onSubmit={save} className="space-y-4">
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">The payment is made out to</span>
          <div className="flex flex-wrap gap-2">
            {choice('payee', 'individual', f.payee_type, 'Me personally', () => setF({ ...f, payee_type: 'individual' }))}
            {choice('payee', 'corporation', f.payee_type, 'My corporation', () => setF({ ...f, payee_type: 'corporation' }))}
          </div>
        </div>
        {field(corp ? 'Corporation’s legal name' : 'Your full legal name',
          <input className={input} value={f.legal_name} autoComplete={corp ? 'organization' : 'name'}
            onChange={(e) => setF({ ...f, legal_name: e.target.value })} />,
          'Exactly as it should appear on the cheque or payment.')}
        {field(`${taxLabel} registration number (optional)`,
          <input className={input} value={f.hst_number} placeholder="123456789 RT0001"
            onChange={(e) => setF({ ...f, hst_number: e.target.value })} />,
          `Only if you are registered and will charge ${taxLabel} on your honorarium.`)}
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">How would you like to be paid?</span>
          <div className="flex flex-wrap gap-2">
            {choice('method', 'cheque', f.pay_method, 'Cheque by mail', () => setF({ ...f, pay_method: 'cheque' }))}
            {choice('method', 'etransfer', f.pay_method, 'e-Transfer', () => setF({ ...f, pay_method: 'etransfer' }))}
          </div>
        </div>
        {f.pay_method === 'etransfer' && field('Email for the e-Transfer',
          <input className={input} type="email" value={f.etransfer_email} autoComplete="email"
            onChange={(e) => setF({ ...f, etransfer_email: e.target.value })} />,
          'The address you receive e-Transfers at.')}
        {f.pay_method && field(f.pay_method === 'cheque' ? 'Mailing address for the cheque' : 'Mailing address (optional)',
          <textarea className={input} rows={3} value={f.address} autoComplete="street-address"
            onChange={(e) => setF({ ...f, address: e.target.value })} />)}
        <p className="text-xs text-muted">This page never asks for bank account numbers or your SIN.</p>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button className={primaryBtn} disabled={busy}>{busy ? 'Saving…' : 'Save payment details'}</button>
          {h.details_given && <button type="button" className={quietBtn} onClick={() => setEditing(false)}>Cancel</button>}
        </div>
      </form>
    </Panel>
  )
}

// A list of the speaker's own files with a way to add one.
function Files({ token, kind, claimId, files, reload, readOnly }: {
  token: string; kind: 'invoice' | 'claim'; claimId?: string; files: FileRef[]; reload: () => Promise<void>; readOnly?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function upload(file: File) {
    setErr(null)
    if (file.size > 10 * 1024 * 1024) { setErr('That file is larger than 10 MB. Please send a smaller scan or photo.'); return }
    const fd = new FormData()
    fd.append('token', token); fd.append('kind', kind)
    if (claimId) fd.append('claim_id', claimId)
    fd.append('file', file)
    setBusy(true)
    const r = await callFiles(fd)
    setBusy(false)
    if (ref.current) ref.current.value = ''
    if (!r.ok) { setErr(String(r.data.error ?? 'The upload failed. Please try again.')); return }
    await reload()
  }
  async function open(id: string) {
    const r = await callFiles({ token, action: 'open', file_id: id })
    if (r.ok && typeof r.data.url === 'string') window.open(r.data.url, '_blank', 'noopener')
    else setErr(String(r.data.error ?? 'That file could not be opened.'))
  }
  async function remove(id: string) {
    if (!window.confirm('Remove this file?')) return
    const r = await callFiles({ token, action: 'delete_file', file_id: id })
    if (!r.ok) { setErr(String(r.data.error ?? 'That file could not be removed.')); return }
    await reload()
  }

  return (
    <div className="space-y-2 text-sm">
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => open(f.id)}>{f.file_name}</button>
              {!readOnly && <button type="button" className="text-xs text-muted hover:text-rose-600" onClick={() => remove(f.id)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && files.length < 5 && (
        <div>
          <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only"
            aria-label={kind === 'invoice' ? 'Upload invoice' : 'Upload receipt'}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file) }} />
          <button type="button" className={quietBtn} disabled={busy} onClick={() => ref.current?.click()}>
            {busy ? 'Uploading…' : kind === 'invoice' ? (files.length ? 'Add another file' : 'Upload invoice') : (files.length ? 'Add another receipt' : 'Attach receipt')}
          </button>
          <span className="ml-2 text-xs text-muted">PDF, JPEG or PNG, up to 10 MB</span>
        </div>
      )}
      {err && <Notice tone="bad">{err}</Notice>}
    </div>
  )
}

function ClaimList({ token, h, reload, readOnly }: { token: string; h: Honorarium; reload: () => Promise<void>; readOnly?: boolean }) {
  const [err, setErr] = useState<string | null>(null)
  if (h.claims.length === 0) return null
  const total = h.claims.filter((c) => c.status !== 'declined').reduce((a, c) => a + Number(c.amount), 0)

  async function remove(c: Claim) {
    if (!window.confirm(`Remove “${c.description}”?`)) return
    const r = await callFiles({ token, action: 'delete_claim', claim_id: c.id })
    if (!r.ok) { setErr(String(r.data.error ?? 'That expense could not be removed.')); return }
    await reload()
  }

  return (
    <div className="mt-3 space-y-3">
      <ul className="divide-y divide-line rounded-md border border-line">
        {h.claims.map((c) => {
          const editable = !readOnly && c.status === 'submitted'
          return (
            <li key={c.id} className="space-y-2 px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">{c.description}</p>
                  <p className="text-xs text-muted">
                    {CLAIM_CATEGORY_LABEL[c.category]}{c.incurred_on ? ` · ${prettyDay(c.incurred_on)}` : ''}
                    {Number(c.tax) > 0 ? ` · includes ${money(Number(c.tax))} tax` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{money(Number(c.amount))}</p>
                  <p className="text-xs text-muted">{CLAIM_STATUS[c.status]}</p>
                </div>
              </div>
              {c.decision_note && <p className="text-xs text-muted">Note from the organizer: {c.decision_note}</p>}
              <Files token={token} kind="claim" claimId={c.id} files={c.receipts.filter((r) => r.mine)} reload={reload} readOnly={!editable} />
              {c.status === 'submitted' && c.receipts.length === 0 && !readOnly && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Attach the receipt so this can be reviewed.</p>
              )}
              {!readOnly && (c.status === 'submitted' || c.status === 'declined') && (
                <button type="button" className="text-xs text-muted hover:text-rose-600" onClick={() => remove(c)}>Remove this expense</button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-right text-sm">Total claimed: <strong className="tabular-nums">{money(total)}</strong></p>
      {err && <Notice tone="bad">{err}</Notice>}
    </div>
  )
}

function AddClaim({ token, reload }: { token: string; reload: () => Promise<void> }) {
  const blank = { category: 'travel' as ClaimCategory, description: '', incurred_on: '', amount: '', tax: '' }
  const [f, setF] = useState(blank)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const amount = Number(f.amount)
    if (!f.description.trim()) { setErr('Say what the expense was for.'); return }
    if (!(amount > 0)) { setErr('Enter the amount you paid.'); return }
    setBusy(true)
    const { error } = await publicClient.rpc('conf_speaker_claim', {
      p_token: token, p_category: f.category, p_description: f.description,
      p_incurred_on: f.incurred_on || null, p_amount: amount, p_tax: f.tax ? Number(f.tax) : 0,
    })
    setBusy(false)
    if (error) { setErr(rpcMessage(error, 'We couldn’t add that expense. Please try again.')); return }
    setF(blank); setOpen(false)
    await reload()
  }

  if (!open) return <button type="button" className={`${quietBtn} mt-3`} onClick={() => setOpen(true)}>+ Add an expense</button>
  return (
    <form onSubmit={add} className="mt-3 space-y-3 rounded-md border border-line bg-paper p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Kind</span>
          <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ClaimCategory })}>
            {Object.entries(CLAIM_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Date</span>
          <input type="date" className={input} value={f.incurred_on} onChange={(e) => setF({ ...f, incurred_on: e.target.value })} /></label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-muted">What was it for?</span>
          <input className={input} value={f.description} placeholder="e.g. Return train, Ottawa – Toronto"
            onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Amount paid, including tax ($)</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" className={input} value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-muted">Of which tax (optional)</span>
          <input type="number" min="0" step="0.01" inputMode="decimal" className={input} value={f.tax}
            onChange={(e) => setF({ ...f, tax: e.target.value })} /></label>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button className={primaryBtn} disabled={busy}>{busy ? 'Adding…' : 'Add expense'}</button>
        <button type="button" className={quietBtn} onClick={() => { setOpen(false); setErr(null) }}>Cancel</button>
      </div>
      <p className="text-xs text-muted">You can attach the receipt once the expense is added.</p>
    </form>
  )
}
