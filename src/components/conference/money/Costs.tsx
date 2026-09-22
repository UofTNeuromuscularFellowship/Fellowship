import { useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Card, CardHeader } from '../../ui/Card'
import {
  cents, friendly, input, localIsoDate, money, primaryBtn, quietBtn, PAY_METHOD_LABEL,
  type ConfEvent, type ConfTransaction, type MoneyKind, type PayMethod,
} from '../../../lib/conference'
import { attachReceipt, openReceipt, receiptsFor, removeReceipts, type MoneyData } from './data'

// ---------------------------------------------------------------------------
// Costs & income: every payment made or received for the event, with its
// receipts. This is the ledger the budget's "paid" column and the financial
// report are built from.
//
// Speaker payments appear here too, recorded from Speaker pay; they are
// changed or undone there, so the speaker's record and the ledger agree.
// ---------------------------------------------------------------------------

type Filter = 'all' | 'expense' | 'income' | 'owing' | 'noreceipt'
const FILTERS: [Filter, string][] = [
  ['all', 'Everything'], ['expense', 'Costs'], ['income', 'Income'], ['owing', 'Not yet paid'], ['noreceipt', 'Missing a receipt'],
]

interface Draft {
  id?: string
  kind: MoneyKind
  description: string
  party: string
  txn_date: string
  budget_id: string
  amount: string
  tax: string
  status: 'paid' | 'owing'
  paid_on: string
  method: PayMethod | ''
  reference: string
  notes: string
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function Costs({ event, data, reload }: { event: ConfEvent; data: MoneyData; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const rate = Number(event.tax_rate)
  const lineName = new Map(data.lines.map((l) => [l.id, l.category]))

  const rows = data.txns.filter((t) => {
    if (filter === 'expense' || filter === 'income') return t.kind === filter
    if (filter === 'owing') return t.status === 'owing'
    if (filter === 'noreceipt') return t.kind === 'expense' && receiptsFor(data, t).length === 0
    return true
  }).slice().sort((a, b) => b.txn_date.localeCompare(a.txn_date) || b.created_at.localeCompare(a.created_at))

  function start(kind: MoneyKind) {
    const today = localIsoDate()
    setDraft({ kind, description: '', party: '', txn_date: today, budget_id: '', amount: '', tax: '', status: 'paid',
      paid_on: today, method: '', reference: '', notes: '' })
    setFile(null); setMsg(null)
  }
  function edit(t: ConfTransaction) {
    setDraft({
      id: t.id, kind: t.kind, description: t.description, party: t.party ?? '', txn_date: t.txn_date,
      budget_id: t.budget_id ?? '', amount: String(t.amount), tax: t.tax ? String(t.tax) : '', status: t.status,
      paid_on: t.paid_on ?? t.txn_date, method: t.method ?? '', reference: t.reference ?? '', notes: t.notes ?? '',
    })
    setFile(null); setMsg(null)
  }

  async function save() {
    if (!draft) return
    const amount = cents(Number(draft.amount))
    const tax = draft.tax.trim() === '' ? 0 : cents(Number(draft.tax))
    if (!draft.description.trim()) { setMsg({ tone: 'bad', text: 'Say what it was for.' }); return }
    if (!(amount >= 0) || draft.amount.trim() === '') { setMsg({ tone: 'bad', text: 'Enter the total amount.' }); return }
    if (!(tax >= 0) || tax > amount) { setMsg({ tone: 'bad', text: 'The tax can’t be more than the total.' }); return }
    const row = {
      kind: draft.kind, description: draft.description.trim(), party: draft.party.trim() || null,
      txn_date: draft.txn_date || localIsoDate(), budget_id: draft.budget_id || null, amount, tax,
      status: draft.status, paid_on: draft.status === 'paid' ? (draft.paid_on || draft.txn_date || localIsoDate()) : null,
      method: draft.method || null, reference: draft.reference.trim() || null, notes: draft.notes.trim() || null,
    }
    setBusy(true)
    const res = draft.id
      ? await supabase.from('conf_transactions').update(row).eq('id', draft.id).select('id').single()
      : await supabase.from('conf_transactions').insert({ ...row, event_id: event.id }).select('id').single()
    if (res.error) { setBusy(false); setMsg({ tone: 'bad', text: friendly(res.error.message) }); return }
    let warn: string | null = null
    if (file) warn = await attachReceipt(event.id, (res.data as { id: string }).id, file)
    setBusy(false)
    setDraft(null); setFile(null)
    setMsg(warn ? { tone: 'bad', text: `Saved, but the receipt didn’t upload: ${warn}` } : { tone: 'ok', text: 'Saved.' })
    await reload()
  }

  async function remove(t: ConfTransaction) {
    if (!window.confirm(`Delete “${t.description}” (${money(t.amount)})${data.receipts.some((r) => r.transaction_id === t.id) ? ' and its receipts' : ''}?`)) return
    await removeReceipts(data.receipts.filter((r) => r.transaction_id === t.id))
    const { error } = await supabase.from('conf_transactions').delete().eq('id', t.id)
    if (error) { setMsg({ tone: 'bad', text: friendly(error.message) }); return }
    await reload()
  }

  const shownCosts = cents(rows.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amount, 0))
  const shownIncome = cents(rows.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0))
  const d = draft

  return (
    <div className="space-y-4">
      {msg && (
        <p className={`rounded-md border px-4 py-2 text-sm ${msg.tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200'}`}>{msg.text}</p>
      )}
      <Card>
        <CardHeader title="Costs & income"
          sub="Record each bill paid or payment received, and attach the receipt. Speaker payments are added from Speaker pay."
          action={d ? undefined : (
            <div className="flex flex-wrap gap-2">
              <button className={primaryBtn} onClick={() => start('expense')}>+ Record a cost</button>
              <button className={quietBtn} onClick={() => start('income')}>+ Record income</button>
            </div>
          )} />

        {d && (
          <div className="border-b border-line bg-paper px-5 py-4">
            <p className="mb-3 text-sm font-semibold text-ink">{d.id ? 'Edit' : d.kind === 'expense' ? 'Record a cost' : 'Record income'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="What for *" wide>
                <input id="tx-desc" className={input} value={d.description} placeholder={d.kind === 'expense' ? 'e.g. Lunch for 80, day 1' : 'e.g. Registration fees, first batch'}
                  onChange={(e) => setDraft({ ...d, description: e.target.value })} />
              </Field>
              <Field label={d.kind === 'expense' ? 'Paid to' : 'Received from'}>
                <input id="tx-party" className={input} value={d.party} onChange={(e) => setDraft({ ...d, party: e.target.value })} />
              </Field>
              <Field label="Budget line">
                <select id="tx-line" className={input} value={d.budget_id} onChange={(e) => setDraft({ ...d, budget_id: e.target.value })}>
                  <option value="">Not in the budget</option>
                  {data.lines.filter((l) => l.kind === d.kind).map((l) => <option key={l.id} value={l.id}>{l.category}</option>)}
                </select>
              </Field>
              <Field label="Total, including tax ($) *">
                <input id="tx-amount" className={input} type="number" min="0" step="0.01" inputMode="decimal" value={d.amount}
                  onChange={(e) => setDraft({ ...d, amount: e.target.value })} />
              </Field>
              <div>
                <label htmlFor="tx-tax" className="mb-1 block text-xs font-medium text-muted">Of which {event.tax_label} or other tax ($)</label>
                <div className="flex gap-2">
                  <input id="tx-tax" className={input} type="number" min="0" step="0.01" inputMode="decimal" value={d.tax}
                    onChange={(e) => setDraft({ ...d, tax: e.target.value })} />
                  {rate > 0 && (
                    <button type="button" className={`${quietBtn} whitespace-nowrap`} title={`Work out ${rate}% ${event.tax_label} included in the total`}
                      disabled={!(Number(d.amount) > 0)}
                      onClick={() => setDraft({ ...d, tax: String(cents(Number(d.amount) * rate / (100 + rate))) })}>
                      {rate}% {event.tax_label}
                    </button>
                  )}
                </div>
              </div>
              <Field label="Date">
                <input id="tx-date" className={input} type="date" value={d.txn_date}
                  onChange={(e) => setDraft({ ...d, txn_date: e.target.value, paid_on: d.status === 'paid' && d.paid_on === d.txn_date ? e.target.value : d.paid_on })} />
              </Field>
              <div role="radiogroup" aria-label="Status">
                <span className="mb-1 block text-xs font-medium text-muted">Status</span>
                <div className="flex gap-2">
                  {(['paid', 'owing'] as const).map((s) => (
                    <label key={s} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${d.status === s ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                      <input type="radio" name="tx-status" checked={d.status === s} onChange={() => setDraft({ ...d, status: s })} />
                      {s === 'paid' ? (d.kind === 'expense' ? 'Paid' : 'Received') : (d.kind === 'expense' ? 'Still owing' : 'Expected')}
                    </label>
                  ))}
                </div>
              </div>
              {d.status === 'paid' && <>
                <Field label={d.kind === 'expense' ? 'Paid on' : 'Received on'}>
                  <input id="tx-paidon" className={input} type="date" value={d.paid_on} onChange={(e) => setDraft({ ...d, paid_on: e.target.value })} />
                </Field>
                <Field label="How">
                  <select id="tx-method" className={input} value={d.method} onChange={(e) => setDraft({ ...d, method: e.target.value as PayMethod | '' })}>
                    <option value="">—</option>
                    {Object.entries(PAY_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              </>}
              <Field label="Reference">
                <input id="tx-ref" className={input} value={d.reference} placeholder="Invoice, cheque or confirmation number"
                  onChange={(e) => setDraft({ ...d, reference: e.target.value })} />
              </Field>
              {!d.id && (
                <Field label="Receipt (optional)">
                  <input id="tx-file" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </Field>
              )}
              <Field label="Notes" wide>
                <textarea id="tx-notes" rows={2} className={input} value={d.notes} onChange={(e) => setDraft({ ...d, notes: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
              <button className={quietBtn} onClick={() => { setDraft(null); setMsg(null) }}>Cancel</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-b border-line px-5 py-3">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === k ? 'bg-accent text-white' : 'bg-paper text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            {data.txns.length === 0 ? 'Nothing recorded yet.' : 'Nothing matches this filter.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((t) => {
              const recs = receiptsFor(data, t)
              const expanded = open === t.id
              return (
                <li key={t.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                    <div className="w-24 flex-none text-xs text-muted">{fmtDate(t.txn_date)}</div>
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-sm font-medium text-ink">{t.description}</p>
                      <p className="text-xs text-muted">
                        {t.party ? `${t.kind === 'expense' ? 'To' : 'From'} ${t.party} · ` : ''}
                        {t.budget_id ? lineName.get(t.budget_id) : 'Not in the budget'}
                        {t.method ? ` · ${PAY_METHOD_LABEL[t.method]}` : ''}{t.reference ? ` · ${t.reference}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${t.kind === 'income' ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink'}`}>
                        {t.kind === 'income' ? '+' : ''}{money(t.amount)}
                      </p>
                      {t.tax > 0 && <p className="text-xs tabular-nums text-muted">incl. {money(t.tax)} tax</p>}
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-3 text-xs sm:w-auto">
                      {t.status === 'owing' && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          {t.kind === 'expense' ? 'Owing' : 'Expected'}
                        </span>
                      )}
                      <button className={`font-medium ${recs.length ? 'text-accent' : t.kind === 'expense' ? 'text-amber-700 dark:text-amber-300' : 'text-muted'} hover:underline`}
                        onClick={() => setOpen(expanded ? null : t.id)} aria-expanded={expanded}>
                        {recs.length ? `${recs.length} receipt${recs.length === 1 ? '' : 's'}` : 'No receipt'}
                      </button>
                      {t.honorarium_id ? (
                        <span className="text-muted" title="Change or undo this from Speaker pay">Speaker pay</span>
                      ) : (
                        <>
                          <button className="font-medium text-accent hover:underline" onClick={() => edit(t)}>Edit</button>
                          <button className="font-medium text-muted hover:text-rose-600" onClick={() => remove(t)}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                  {expanded && <ReceiptPanel eventId={event.id} t={t} data={data} reload={reload} />}
                </li>
              )
            })}
          </ul>
        )}
        {rows.length > 0 && (
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-line px-5 py-3 text-sm">
            {shownCosts > 0 && <span><span className="text-muted">Costs shown </span><strong className="tabular-nums">{money(shownCosts)}</strong></span>}
            {shownIncome > 0 && <span><span className="text-muted">Income shown </span><strong className="tabular-nums text-emerald-700 dark:text-emerald-300">{money(shownIncome)}</strong></span>}
          </div>
        )}
      </Card>
    </div>
  )
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

function ReceiptPanel({ eventId, t, data, reload }: { eventId: string; t: ConfTransaction; data: MoneyData; reload: () => Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const recs = receiptsFor(data, t)

  async function add(file: File) {
    setBusy(true); setErr(null)
    const e = await attachReceipt(eventId, t.id, file)
    setBusy(false)
    if (ref.current) ref.current.value = ''
    if (e) { setErr(e); return }
    await reload()
  }

  return (
    <div className="mt-3 space-y-2 rounded-md border border-line bg-paper p-3 text-sm">
      {recs.length === 0 && <p className="text-muted">No receipt attached.</p>}
      {recs.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button className="font-medium text-accent hover:underline" onClick={() => openReceipt(r)}>{r.file_name}</button>
          <span className="text-xs text-muted">
            {r.uploaded_by === 'speaker' ? (r.claim_id ? 'from the speaker’s expense claim' : 'the speaker’s invoice') : 'uploaded by you'}
          </span>
          {r.transaction_id === t.id && (
            <button className="text-xs text-muted hover:text-rose-600" onClick={async () => {
              if (!window.confirm(`Remove ${r.file_name}?`)) return
              await removeReceipts([r]); await reload()
            }}>Remove</button>
          )}
        </div>
      ))}
      <div>
        <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Attach a receipt"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f) }} />
        <button className={quietBtn} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Uploading…' : 'Attach a receipt'}</button>
        <span className="ml-2 text-xs text-muted">PDF, JPEG or PNG, up to 10 MB</span>
      </div>
      {err && <p className="text-rose-600">{err}</p>}
    </div>
  )
}
