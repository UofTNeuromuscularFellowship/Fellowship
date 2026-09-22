import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import {
  cents, type ConfBudgetLine, type ConfClaim, type ConfHonorarium, type ConfReceipt,
  type ConfSpeaker, type ConfTransaction, type MoneyKind,
} from '../../../lib/conference'

// ---------------------------------------------------------------------------
// Everything the money pages read for one event, and the arithmetic on it.
//
// One load feeds the budget, the ledger, speaker pay, the overview numbers and
// the PDF report, so they can never disagree. All of it comes through RLS:
// only the program's director or admin can read any of these tables.
// ---------------------------------------------------------------------------

export const BUCKET = 'conference'

export interface MoneyData {
  lines: ConfBudgetLine[]
  txns: ConfTransaction[]
  honoraria: ConfHonorarium[]
  claims: ConfClaim[]
  receipts: ConfReceipt[]
  speakers: ConfSpeaker[]
}

export async function loadMoney(eventId: string): Promise<MoneyData> {
  const [l, t, h, c, r, s] = await Promise.all([
    supabase.from('conf_budget').select('*').eq('event_id', eventId).order('sort').order('category'),
    supabase.from('conf_transactions').select('*').eq('event_id', eventId).order('txn_date').order('created_at'),
    supabase.from('conf_honoraria').select('*').eq('event_id', eventId),
    supabase.from('conf_claims').select('*').eq('event_id', eventId).order('created_at'),
    supabase.from('conf_receipts').select('*').eq('event_id', eventId).order('created_at'),
    supabase.from('conf_speakers').select('*').eq('event_id', eventId).order('full_name'),
  ])
  const num = <T,>(rows: unknown, keys: string[]): T[] =>
    ((rows as Record<string, unknown>[]) ?? []).map((x) => {
      const o = { ...x }
      for (const k of keys) if (o[k] != null) o[k] = Number(o[k])
      return o as T
    })
  return {
    lines: num<ConfBudgetLine>(l.data, ['estimated', 'sort']),
    txns: num<ConfTransaction>(t.data, ['amount', 'tax']),
    honoraria: num<ConfHonorarium>(h.data, ['amount']),
    claims: num<ConfClaim>(c.data, ['amount', 'tax']),
    receipts: (r.data as ConfReceipt[]) ?? [],
    speakers: (s.data as ConfSpeaker[]) ?? [],
  }
}

export function useMoney(eventId: string) {
  const [data, setData] = useState<MoneyData | null>(null)
  const reload = useCallback(async () => { setData(await loadMoney(eventId)) }, [eventId])
  useEffect(() => { reload() }, [reload])
  return { data, reload }
}

// ------------------------------- the budget --------------------------------

export interface LineTotals {
  line: ConfBudgetLine | null   // null: money not put against any line
  kind: MoneyKind
  label: string
  budgeted: number
  /** paid out (costs) or received (income) */
  done: number
  /** still owing (costs, including agreed honoraria not yet paid) or still expected (income) */
  pending: number
  /** budgeted minus done minus pending; negative means over budget */
  left: number
}

export function budgetTotals(d: MoneyData) {
  const rows: LineTotals[] = []
  const sumTx = (pred: (t: ConfTransaction) => boolean) => cents(d.txns.filter(pred).reduce((a, t) => a + t.amount, 0))
  // agreed honoraria not yet paid, counted against their line as owing
  const committed = (lineId: string | null) => cents(d.honoraria
    .filter((h) => !h.paid_at && (h.budget_id ?? null) === lineId)
    .reduce((a, h) => a + (h.amount ?? 0), 0))

  for (const line of d.lines) {
    const done = sumTx((t) => t.budget_id === line.id && t.status === 'paid')
    const pending = cents(sumTx((t) => t.budget_id === line.id && t.status === 'owing') + (line.kind === 'expense' ? committed(line.id) : 0))
    const budgeted = line.estimated ?? 0
    rows.push({ line, kind: line.kind, label: line.category, budgeted, done, pending, left: cents(budgeted - done - pending) })
  }
  for (const kind of ['expense', 'income'] as const) {
    const done = sumTx((t) => t.kind === kind && !t.budget_id && t.status === 'paid')
    const pending = cents(sumTx((t) => t.kind === kind && !t.budget_id && t.status === 'owing') + (kind === 'expense' ? committed(null) : 0))
    if (done || pending) rows.push({ line: null, kind, label: 'Not in the budget', budgeted: 0, done, pending, left: cents(-done - pending) })
  }

  const total = (kind: MoneyKind) => {
    const r = rows.filter((x) => x.kind === kind)
    return {
      budgeted: cents(r.reduce((a, x) => a + x.budgeted, 0)),
      done: cents(r.reduce((a, x) => a + x.done, 0)),
      pending: cents(r.reduce((a, x) => a + x.pending, 0)),
      left: cents(r.reduce((a, x) => a + x.left, 0)),
    }
  }
  const costs = total('expense')
  const income = total('income')
  return {
    rows, costs, income,
    netBudgeted: cents(income.budgeted - costs.budgeted),
    netActual: cents(income.done - costs.done),
    taxPaid: cents(d.txns.filter((t) => t.kind === 'expense' && t.status === 'paid').reduce((a, t) => a + t.tax, 0)),
    taxCollected: cents(d.txns.filter((t) => t.kind === 'income' && t.status === 'paid').reduce((a, t) => a + t.tax, 0)),
  }
}

// ------------------------------ speaker pay --------------------------------

export type PayStage = 'none' | 'ready' | 'requested' | 'details' | 'paid'

export const STAGE_LABEL: Record<PayStage, string> = {
  none: 'Not set up',
  ready: 'Not yet asked',
  requested: 'Asked for details',
  details: 'Ready to pay',
  paid: 'Paid',
}

export const STAGE_TONE: Record<PayStage, string> = {
  none: 'bg-paper text-muted',
  ready: 'bg-paper text-ink',
  requested: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  details: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  paid: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
}

export function stageOf(h: ConfHonorarium | undefined): PayStage {
  if (!h) return 'none'
  if (h.paid_at) return 'paid'
  if (h.details_at) return 'details'
  if (h.requested_at) return 'requested'
  return 'ready'
}

// -------------------------------- receipts ---------------------------------

/** Upload a coordinator's receipt and attach it to a transaction. */
export async function attachReceipt(eventId: string, transactionId: string, file: File): Promise<string | null> {
  if (file.size > 10 * 1024 * 1024) return 'That file is larger than 10 MB.'
  const ok = /^(application\/pdf|image\/(jpeg|png))$/.test(file.type)
  if (!ok) return 'Receipts can be PDF, JPEG or PNG files.'
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `${eventId}/finance/txn/${crypto.randomUUID()}-${safe}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) return `Upload failed: ${up.error.message}`
  const { error } = await supabase.from('conf_receipts').insert({
    event_id: eventId, transaction_id: transactionId, storage_path: path,
    file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: 'coordinator',
  })
  if (error) { await supabase.storage.from(BUCKET).remove([path]); return error.message }
  return null
}

export async function openReceipt(r: ConfReceipt) {
  // open the tab first, synchronously, so a popup blocker lets it through
  const w = window.open('', '_blank')
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, 300)
  if (data?.signedUrl && w) w.location.href = data.signedUrl
  else if (w) w.close()
}

export async function removeReceipts(rs: ConfReceipt[]) {
  if (rs.length === 0) return
  await supabase.storage.from(BUCKET).remove(rs.map((r) => r.storage_path))
  await supabase.from('conf_receipts').delete().in('id', rs.map((r) => r.id))
}

/** Every receipt that belongs to a transaction: its own, plus the speaker's invoice or claim receipts behind it. */
export function receiptsFor(d: MoneyData, t: ConfTransaction): ConfReceipt[] {
  const own = d.receipts.filter((r) => r.transaction_id === t.id)
  if (!t.honorarium_id) return own
  const isExpenses = d.claims.some((c) => c.transaction_id === t.id)
  if (isExpenses) {
    const claimIds = new Set(d.claims.filter((c) => c.transaction_id === t.id).map((c) => c.id))
    return [...own, ...d.receipts.filter((r) => r.claim_id && claimIds.has(r.claim_id))]
  }
  return [...own, ...d.receipts.filter((r) => r.honorarium_id === t.honorarium_id)]
}

/** Remove an event's files from storage, before the event itself is deleted. */
export async function removeEventFiles(eventId: string): Promise<void> {
  const [p, r] = await Promise.all([
    supabase.from('conf_presentations').select('storage_path').eq('event_id', eventId),
    supabase.from('conf_receipts').select('storage_path').eq('event_id', eventId),
  ])
  const paths = [...((p.data as { storage_path: string }[]) ?? []), ...((r.data as { storage_path: string }[]) ?? [])]
    .map((x) => x.storage_path)
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
  }
}
