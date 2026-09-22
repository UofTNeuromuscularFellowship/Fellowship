import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { Card, CardHeader } from '../../ui/Card'
import { input, money, primaryBtn, type ConfEvent } from '../../../lib/conference'
import { BUCKET, budgetTotals, receiptsFor, type MoneyData } from './data'

// ---------------------------------------------------------------------------
// The financial report: pick what goes in, and download a PDF. The PDF code
// (pdf-lib) is only fetched when someone actually makes a report.
// ---------------------------------------------------------------------------

export function Report({ event, data }: { event: ConfEvent; data: MoneyData }) {
  const { profile, site } = useAuth()
  const [receipts, setReceipts] = useState(true)
  const [payee, setPayee] = useState(false)
  const [preparedBy, setPreparedBy] = useState(profile?.full_name ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const t = budgetTotals(data)
  const receiptCount = new Set(data.txns.flatMap((x) => receiptsFor(data, x).map((r) => r.id))).size
  const missing = data.txns.filter((x) => x.kind === 'expense' && x.status === 'paid' && receiptsFor(data, x).length === 0).length
  const owing = data.txns.filter((x) => x.status === 'owing').length

  async function make() {
    setErr(null); setBusy('Preparing…')
    try {
      const { buildFinanceReport } = await import('../../../lib/financeReport')
      const bytes = await buildFinanceReport(event, data,
        { includeReceipts: receipts, includePayeeDetails: payee, preparedBy, programName: site?.name ?? null },
        async (r) => {
          const { data: blob } = await supabase.storage.from(BUCKET).download(r.storage_path)
          return blob ? new Uint8Array(await blob.arrayBuffer()) : null
        },
        (text) => setBusy(text))
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${event.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'event'}-financial-report.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (e) {
      setErr(`The report couldn’t be made: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader title="Financial report" sub="A PDF of the budget against what was actually paid, every transaction, speaker payments and tax — with the receipts attached if you want them." />
      <div className="space-y-5 px-5 py-5">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">Costs paid</p><p className="font-semibold tabular-nums">{money(t.costs.done)}</p></div>
          <div className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">Income received</p><p className="font-semibold tabular-nums">{money(t.income.done)}</p></div>
          <div className="rounded-md border border-line px-3 py-2"><p className="text-xs text-muted">Net so far</p><p className="font-semibold tabular-nums">{money(t.netActual)}</p></div>
        </div>

        {(missing > 0 || owing > 0) && (
          <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {missing > 0 && <li>{missing} paid cost{missing === 1 ? ' has' : 's have'} no receipt attached.</li>}
            {owing > 0 && <li>{owing} transaction{owing === 1 ? ' is' : 's are'} still marked as owing or expected.</li>}
          </ul>
        )}

        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input id="rep-receipts" type="checkbox" className="mt-0.5 h-4 w-4" checked={receipts} onChange={(e) => setReceipts(e.target.checked)} />
            <span className="text-sm"><span className="block font-medium text-ink">Attach receipts</span>
              <span className="block text-xs text-muted">{receiptCount} file{receiptCount === 1 ? '' : 's'}, each labelled with the transaction it supports, at the end of the report.</span></span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input id="rep-payee" type="checkbox" className="mt-0.5 h-4 w-4" checked={payee} onChange={(e) => setPayee(e.target.checked)} />
            <span className="text-sm"><span className="block font-medium text-ink">Include speakers’ mailing addresses and e-Transfer emails</span>
              <span className="block text-xs text-muted">Leave off if the report is going to anyone who doesn’t need them.</span></span>
          </label>
          <label className="block max-w-sm">
            <span className="mb-1 block text-xs font-medium text-muted">Prepared by</span>
            <input id="rep-by" className={input} value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
          </label>
        </div>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className={primaryBtn} disabled={!!busy} onClick={make}>{busy ? 'Working…' : 'Download PDF'}</button>
          {busy && <span className="text-sm text-muted" role="status">{busy}</span>}
        </div>
      </div>
    </Card>
  )
}
