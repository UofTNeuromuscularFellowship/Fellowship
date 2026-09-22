import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Card, CardHeader } from '../../ui/Card'
import { friendly, input, money, quietBtn, primaryBtn, type ConfBudgetLine, type MoneyKind } from '../../../lib/conference'
import { budgetTotals, type LineTotals, type MoneyData } from './data'

// ---------------------------------------------------------------------------
// The budget: what the event plans to spend and take in, line by line, and
// how that compares with what has actually been paid.
//
// Headings and budgeted amounts are edited in place and saved as you leave
// the field. "Paid" and "Still owing" are never typed here: they add up the
// payments recorded under Costs & income (and agreed honoraria not yet paid).
// ---------------------------------------------------------------------------

const STARTER: { kind: MoneyKind; category: string }[] = [
  { kind: 'expense', category: 'Venue and AV' },
  { kind: 'expense', category: 'Catering' },
  { kind: 'expense', category: 'Speaker honoraria' },
  { kind: 'expense', category: 'Speaker travel and accommodation' },
  { kind: 'expense', category: 'Printing and materials' },
  { kind: 'expense', category: 'Other costs' },
  { kind: 'income', category: 'Registration fees' },
  { kind: 'income', category: 'Sponsorship' },
]

export function Budget({ eventId, data, reload, compact = false }: {
  eventId: string; data: MoneyData; reload: () => Promise<void>; compact?: boolean
}) {
  const [msg, setMsg] = useState<string | null>(null)
  const t = budgetTotals(data)

  async function starter() {
    const { error } = await supabase.from('conf_budget').insert(
      STARTER.map((s, i) => ({ event_id: eventId, kind: s.kind, category: s.category, estimated: null, sort: i })))
    if (error) setMsg(friendly(error.message))
    await reload()
  }

  if (data.lines.length === 0 && t.rows.length === 0) {
    return (
      <Card>
        <CardHeader title="Budget" sub="Plan what you expect to spend and take in. As you record payments, this fills in with what was actually paid." />
        <div className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap gap-2">
            <button className={primaryBtn} onClick={starter}>Start with typical headings</button>
          </div>
          <p className="text-xs text-muted">
            Adds headings such as venue, catering, speaker honoraria, registration fees and sponsorship, with no amounts.
            Rename, remove or add your own.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <AddLine eventId={eventId} kind="expense" reload={reload} onError={setMsg} />
            <AddLine eventId={eventId} kind="income" reload={reload} onError={setMsg} />
          </div>
          {msg && <p className="text-sm text-rose-600">{msg}</p>}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {msg && <p className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{msg}</p>}
      <Section title="Costs" kind="expense" rows={t.rows.filter((r) => r.kind === 'expense')} total={t.costs}
        eventId={eventId} data={data} reload={reload} onError={setMsg} compact={compact} />
      <Section title="Income" kind="income" rows={t.rows.filter((r) => r.kind === 'income')} total={t.income}
        eventId={eventId} data={data} reload={reload} onError={setMsg} compact={compact} />
      <Card>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Stat label="Net, as budgeted" value={t.netBudgeted} hint="Income budgeted minus costs budgeted" />
          <Stat label="Net, so far" value={t.netActual} hint="Income received minus costs paid" />
        </div>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${value < 0 ? 'text-rose-600' : 'text-ink'}`}>{money(value)}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  )
}

function Section({ title, kind, rows, total, eventId, data, reload, onError, compact }: {
  title: string; kind: MoneyKind; rows: LineTotals[]
  total: { budgeted: number; done: number; pending: number; left: number }
  eventId: string; data: MoneyData; reload: () => Promise<void>; onError: (m: string | null) => void; compact: boolean
}) {
  const cost = kind === 'expense'
  const heads = cost ? ['Budgeted', 'Paid', 'Still owing', 'Remaining'] : ['Budgeted', 'Received', 'Expected', 'Still to come']
  return (
    <Card>
      <CardHeader title={title} sub={cost
        ? 'Still owing includes bills recorded as unpaid and agreed speaker honoraria not yet paid.'
        : 'Received is money in hand; expected is recorded but not yet received.'} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <th className="w-full px-5 py-2 font-medium">Heading</th>
              {heads.map((h, i) => (
                <th key={h} className={`px-3 py-2 text-right font-medium ${compact && i > 0 ? 'hidden sm:table-cell' : ''}`}>{h}</th>
              ))}
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => r.line
              ? <LineRow key={r.line.id} r={r} line={r.line} data={data} reload={reload} onError={onError} compact={compact} />
              : (
                <tr key={`none-${kind}`} className="text-muted">
                  <td className="px-5 py-2.5 italic">{r.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">—</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''}`}>{money(r.done)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''}`}>{money(r.pending)}</td>
                  <td className={`px-3 py-2.5 text-right ${compact ? 'hidden sm:table-cell' : ''}`}>—</td>
                  <td />
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold text-ink">
              <td className="px-5 py-2.5">Total {title.toLowerCase()}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(total.budgeted)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''}`}>{money(total.done)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''}`}>{money(total.pending)}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''} ${cost && total.left < 0 ? 'text-rose-600' : ''}`}>{money(total.left)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="border-t border-line px-5 py-3">
        <AddLine eventId={eventId} kind={kind} reload={reload} onError={onError} sort={data.lines.length} />
      </div>
    </Card>
  )
}

function LineRow({ r, line, data, reload, onError, compact }: {
  r: LineTotals; line: ConfBudgetLine; data: MoneyData; reload: () => Promise<void>; onError: (m: string | null) => void; compact: boolean
}) {
  const [name, setName] = useState(line.category)
  const [amt, setAmt] = useState(line.estimated == null ? '' : String(line.estimated))
  const [saved, setSaved] = useState(false)
  useEffect(() => { setName(line.category); setAmt(line.estimated == null ? '' : String(line.estimated)) }, [line.category, line.estimated])

  async function save() {
    const category = name.trim()
    const estimated = amt.trim() === '' ? null : Math.round(Number(amt) * 100) / 100
    if (!category) { setName(line.category); return }
    if (estimated != null && (!Number.isFinite(estimated) || estimated < 0)) { setAmt(line.estimated == null ? '' : String(line.estimated)); return }
    if (category === line.category && estimated === line.estimated) return
    const { error } = await supabase.from('conf_budget').update({ category, estimated }).eq('id', line.id)
    if (error) { onError(friendly(error.message)); return }
    onError(null)
    setSaved(true); setTimeout(() => setSaved(false), 1500)
    await reload()
  }

  async function remove() {
    const n = data.txns.filter((t) => t.budget_id === line.id).length
    const extra = n ? ` ${n} payment${n === 1 ? ' is' : 's are'} recorded against it; ${n === 1 ? 'it' : 'they'} will show as “Not in the budget”.` : ''
    if (!window.confirm(`Remove “${line.category}” from the budget?${extra}`)) return
    const { error } = await supabase.from('conf_budget').delete().eq('id', line.id)
    if (error) { onError(friendly(error.message)); return }
    await reload()
  }

  const over = line.kind === 'expense' && r.left < 0
  return (
    <tr className="align-middle">
      <td className="px-5 py-1.5">
        <input aria-label="Heading" className={`${input} min-w-[12rem] border-transparent bg-transparent px-2 hover:border-line focus:border-accent`}
          value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      </td>
      <td className="px-3 py-1.5 text-right">
        <input aria-label={`Budgeted for ${line.category}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
          className={`${input} w-32 border-transparent bg-transparent px-2 text-right tabular-nums hover:border-line focus:border-accent`}
          value={amt} onChange={(e) => setAmt(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        {saved && <span className="sr-only" role="status">Saved</span>}
      </td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''}`}>{money(r.done)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''}`}>{money(r.pending)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${compact ? 'hidden sm:table-cell' : ''} ${over ? 'font-semibold text-rose-600' : ''}`}>
        {over ? `${money(-r.left)} over` : money(r.left)}
      </td>
      <td className="px-3 py-1.5 text-right">
        <button aria-label={`Remove ${line.category}`} title="Remove" className="text-muted hover:text-rose-600" onClick={remove}>×</button>
      </td>
    </tr>
  )
}

function AddLine({ eventId, kind, reload, onError, sort = 0 }: {
  eventId: string; kind: MoneyKind; reload: () => Promise<void>; onError: (m: string | null) => void; sort?: number
}) {
  const [name, setName] = useState('')
  const [amt, setAmt] = useState('')
  const [busy, setBusy] = useState(false)
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const estimated = amt.trim() === '' ? null : Math.round(Number(amt) * 100) / 100
    if (estimated != null && (!Number.isFinite(estimated) || estimated < 0)) { onError('Enter an amount of zero or more.'); return }
    setBusy(true)
    const { error } = await supabase.from('conf_budget').insert({ event_id: eventId, kind, category: name.trim(), estimated, sort })
    setBusy(false)
    if (error) { onError(friendly(error.message)); return }
    onError(null)
    setName(''); setAmt('')
    await reload()
  }
  return (
    <form onSubmit={add} className="flex flex-wrap items-end gap-2">
      <label className="min-w-[12rem] flex-1">
        <span className="mb-1 block text-xs font-medium text-muted">{kind === 'expense' ? 'New cost heading' : 'New income heading'}</span>
        <input className={input} value={name} placeholder={kind === 'expense' ? 'e.g. Venue rental' : 'e.g. Registration fees'}
          onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="w-36">
        <span className="mb-1 block text-xs font-medium text-muted">Budgeted ($)</span>
        <input className={input} type="number" min="0" step="0.01" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
      </label>
      <button className={quietBtn} disabled={busy || !name.trim()}>Add</button>
    </form>
  )
}
