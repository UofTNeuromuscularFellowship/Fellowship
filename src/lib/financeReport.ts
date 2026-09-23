import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { eventWhen, fmtHst, PAY_METHOD_LABEL, CLAIM_CATEGORY_LABEL, type ConfEvent, type ConfReceipt } from './conference'
import { budgetTotals, receiptsFor, type MoneyData } from '../components/conference/money/data'

// ---------------------------------------------------------------------------
// The event's financial report, as a PDF built in the browser.
//
//   1. Summary          the headline figures
//   2. Budget vs actual every budget line: budgeted, paid, owing, remaining
//   3. Tax              sales tax paid on costs and included in income
//   4. Ledger           every transaction, in date order
//   5. Speakers         honoraria and reimbursed expenses, and who was paid
//   6. Sign-off         lines for whoever prepares and approves the report
//   7. Receipts         optionally, every receipt behind the ledger, each
//                       labelled with the transaction it supports
//
// Built with pdf-lib and its standard Helvetica, which can only draw the
// Windows-1252 character set; anything outside it is simplified or replaced
// rather than failing the whole report.
// ---------------------------------------------------------------------------

export interface ReportOptions {
  includeReceipts: boolean
  includePayeeDetails: boolean
  preparedBy: string
  programName: string | null
}

export type FetchFile = (r: ConfReceipt) => Promise<Uint8Array | null>

const W = 612, H = 792, M = 50
const INK = rgb(0.06, 0.11, 0.18), MUTED = rgb(0.36, 0.4, 0.47), LINE = rgb(0.82, 0.84, 0.86), ACCENT = rgb(0.05, 0.49, 0.53)

// Characters Helvetica's WinAnsi encoding can draw, beyond printable Latin-1.
const WIN_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
export function winAnsi(s: string | null | undefined): string {
  if (!s) return ''
  let out = ''
  for (const ch of s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')) {
    const c = ch.codePointAt(0)!
    if (ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_EXTRA.has(ch)) { out += ch; continue }
    const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    if (base && [...base].every((b) => { const k = b.codePointAt(0)!; return (k >= 0x20 && k <= 0x7e) || (k >= 0xa0 && k <= 0xff) })) { out += base; continue }
    out += ch === '→' ? '->' : ch === '✓' ? 'v' : '?'
  }
  return out
}

const cad = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })
const day = (iso: string | null | undefined) => {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

interface Col { label: string; width: number; align?: 'left' | 'right' }

class Writer {
  doc: PDFDocument
  page!: PDFPage
  y = 0
  font: PDFFont
  bold: PDFFont
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc; this.font = font; this.bold = bold
    this.newPage()
  }
  newPage() { this.page = this.doc.addPage([W, H]); this.y = H - M }
  ensure(h: number) { if (this.y - h < M + 20) this.newPage() }

  wrap(text: string, size: number, maxWidth: number, f = this.font): string[] {
    const lines: string[] = []
    for (const para of winAnsi(text).split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/)) {
        if (!word) continue
        const tryLine = line ? `${line} ${word}` : word
        if (f.widthOfTextAtSize(tryLine, size) <= maxWidth) { line = tryLine; continue }
        if (line) lines.push(line)
        // a single word wider than the column is broken by character
        let w = word
        while (f.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
          let cut = w.length - 1
          while (cut > 1 && f.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--
          lines.push(w.slice(0, cut)); w = w.slice(cut)
        }
        line = w
      }
      lines.push(line)
    }
    return lines
  }

  text(t: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; x?: number; width?: number } = {}) {
    const size = opts.size ?? 10, f = opts.bold ? this.bold : this.font, lh = size * 1.35
    const lines = this.wrap(t, size, opts.width ?? W - 2 * M - (opts.x ?? 0), f)
    for (const l of lines) {
      this.ensure(lh)
      this.page.drawText(l, { x: M + (opts.x ?? 0), y: this.y - size, size, font: f, color: opts.color ?? INK })
      this.y -= lh
    }
    this.y -= opts.gap ?? 0
  }

  heading(t: string) {
    this.ensure(48)
    this.y -= 10
    this.text(t, { size: 14, bold: true, gap: 2 })
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.8, color: ACCENT })
    this.y -= 10
  }

  table(cols: Col[], rows: string[][], opts: { totals?: number[]; size?: number } = {}) {
    const size = opts.size ?? 8.5, lh = size * 1.3, pad = 4
    const drawHeader = () => {
      this.ensure(lh + 2 * pad + lh)
      let x = M
      for (const c of cols) {
        const t = winAnsi(c.label)
        const tx = c.align === 'right' ? x + c.width - pad - this.bold.widthOfTextAtSize(t, size) : x + pad
        this.page.drawText(t, { x: tx, y: this.y - pad - size, size, font: this.bold, color: MUTED })
        x += c.width
      }
      this.y -= lh + 2 * pad
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + cols.reduce((a, c) => a + c.width, 0), y: this.y }, thickness: 0.6, color: LINE })
    }
    drawHeader()
    rows.forEach((r, i) => {
      const isTotal = opts.totals?.includes(i)
      const f = isTotal ? this.bold : this.font
      const cells = cols.map((c, j) => this.wrap(r[j] ?? '', size, c.width - 2 * pad, f))
      const h = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad
      if (this.y - h < M + 20) { this.newPage(); drawHeader() }
      let x = M
      cols.forEach((c, j) => {
        cells[j].forEach((l, k) => {
          const tx = c.align === 'right' ? x + c.width - pad - f.widthOfTextAtSize(l, size) : x + pad
          this.page.drawText(l, { x: tx, y: this.y - pad - size - k * lh, size, font: f, color: INK })
        })
        x += c.width
      })
      this.y -= h
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + cols.reduce((a, c) => a + c.width, 0), y: this.y },
        thickness: isTotal ? 0.8 : 0.3, color: isTotal ? INK : LINE })
    })
    this.y -= 8
  }
}

/** Phone photos: turned the right way up and shrunk, so the report stays a sensible size. */
async function normaliseImage(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }), { imageOrientation: 'from-image' })
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}

export async function buildFinanceReport(
  event: ConfEvent, d: MoneyData, opts: ReportOptions, fetchFile: FetchFile,
  onProgress?: (text: string) => void,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(winAnsi(`${event.name} - financial report`))
  doc.setCreator('Conference toolkit')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(doc, font, bold)
  const t = budgetTotals(d)
  const lineName = new Map(d.lines.map((l) => [l.id, l.category]))
  const tax = event.tax_label

  // ---------------------------------------------------------------- cover
  if (event.logo_url) {
    // The event's logo, top left. A logo that can't be fetched is left out
    // rather than holding up the report.
    try {
      const res = await fetch(event.logo_url)
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer())
        const flat = await normaliseImage(bytes, res.headers.get('content-type') || 'image/png')
        if (flat) {
          const img = await doc.embedJpg(flat)
          const scale = Math.min(160 / img.width, 44 / img.height, 1)
          const iw = img.width * scale, ih = img.height * scale
          w.page.drawImage(img, { x: M, y: w.y - ih, width: iw, height: ih })
          w.y -= ih + 14
        }
      }
    } catch { /* no logo */ }
  }
  w.text('FINANCIAL REPORT', { size: 9, bold: true, color: MUTED, gap: 4 })
  w.text(event.name, { size: 20, bold: true, gap: 6 })
  w.text(eventWhen(event.starts_on, event.ends_on), { size: 11, color: MUTED })
  if (event.venue_name) w.text(event.venue_name, { size: 11, color: MUTED })
  if (event.organizer_name || opts.programName) w.text(`Organized by ${event.organizer_name || opts.programName}`, { size: 11, color: MUTED })
  w.y -= 6
  w.text(`Prepared ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}${opts.preparedBy.trim() ? ` by ${opts.preparedBy.trim()}` : ''}. All amounts in Canadian dollars.`, { size: 9, color: MUTED })

  // -------------------------------------------------------------- summary
  w.heading('Summary')
  w.table([{ label: '', width: 260 }, { label: 'Budgeted', width: 125, align: 'right' }, { label: 'Actual', width: 127, align: 'right' }], [
    ['Costs', cad(t.costs.budgeted), cad(t.costs.done)],
    ['Income', cad(t.income.budgeted), cad(t.income.done)],
    ['Net (income minus costs)', cad(t.netBudgeted), cad(t.netActual)],
  ], { totals: [2], size: 10 })
  const notes: string[] = []
  if (t.costs.pending) notes.push(`${cad(t.costs.pending)} in costs is still owing, including agreed speaker honoraria not yet paid.`)
  if (t.income.pending) notes.push(`${cad(t.income.pending)} in income is expected but not yet received.`)
  for (const n of notes) w.text(n, { size: 9, color: MUTED })

  // ------------------------------------------------------ budget vs actual
  w.heading('Budget compared with actual')
  for (const kind of ['expense', 'income'] as const) {
    const rows = t.rows.filter((r) => r.kind === kind)
    if (rows.length === 0) continue
    const tot = kind === 'expense' ? t.costs : t.income
    w.text(kind === 'expense' ? 'Costs' : 'Income', { size: 11, bold: true, gap: 2 })
    w.table([
      { label: 'Heading', width: 172 },
      { label: 'Budgeted', width: 85, align: 'right' },
      { label: kind === 'expense' ? 'Paid' : 'Received', width: 85, align: 'right' },
      { label: kind === 'expense' ? 'Still owing' : 'Expected', width: 85, align: 'right' },
      { label: kind === 'expense' ? 'Remaining' : 'Still to come', width: 85, align: 'right' },
    ], [
      ...rows.map((r) => [r.label, r.line ? cad(r.budgeted) : '-', cad(r.done), cad(r.pending), r.line ? cad(r.left) : '-']),
      ['Total', cad(tot.budgeted), cad(tot.done), cad(tot.pending), cad(tot.left)],
    ], { totals: [rows.length] })
  }

  // ------------------------------------------------------------------ tax
  w.heading('Sales tax')
  w.table([{ label: '', width: 385 }, { label: 'Amount', width: 127, align: 'right' }], [
    [`${tax} and other sales tax included in costs paid`, cad(t.taxPaid)],
    [`${tax} and other sales tax included in income received`, cad(t.taxCollected)],
  ])
  w.text('As entered with each transaction. Whether any of it can be recovered depends on the organizer’s own tax status.', { size: 8.5, color: MUTED })

  // --------------------------------------------------------------- ledger
  const txns = d.txns.slice().sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.created_at.localeCompare(b.created_at))
  const exhibit = new Map<string, string>()   // receipt id -> "A3"
  let n = 0
  for (const x of txns) for (const r of receiptsFor(d, x)) if (!exhibit.has(r.id)) exhibit.set(r.id, `A${++n}`)

  w.heading('Ledger')
  if (txns.length === 0) w.text('No transactions recorded.', { color: MUTED })
  else {
    const rows = txns.map((x) => {
      const recs = receiptsFor(d, x).map((r) => exhibit.get(r.id)).filter(Boolean).join(', ')
      return [
        day(x.txn_date),
        `${x.description}${x.party ? ` - ${x.kind === 'expense' ? 'to' : 'from'} ${x.party}` : ''}`,
        x.budget_id ? lineName.get(x.budget_id) ?? '' : 'Not in budget',
        [x.status === 'owing' ? (x.kind === 'expense' ? 'Owing' : 'Expected') : x.method ? PAY_METHOD_LABEL[x.method] : 'Paid', x.reference].filter(Boolean).join(' '),
        recs || (x.kind === 'expense' ? 'none' : ''),
        x.tax ? cad(x.tax) : '',
        `${x.kind === 'income' ? '+' : '-'}${cad(x.amount)}`,
      ]
    })
    w.table([
      { label: 'Date', width: 64 }, { label: 'Description', width: 144 }, { label: 'Budget line', width: 78 },
      { label: 'Status / ref.', width: 72 }, { label: 'Receipt', width: 40 }, { label: 'Tax', width: 52, align: 'right' },
      { label: 'Amount', width: 62, align: 'right' },
    ], rows)
  }

  // ------------------------------------------------------------- speakers
  if (d.honoraria.length) {
    w.heading('Speaker honoraria and expenses')
    const rows = d.honoraria.map((h) => {
      const sp = d.speakers.find((s) => s.id === h.speaker_id)
      const fee = d.txns.find((x) => x.honorarium_id === h.id && !d.claims.some((c) => c.transaction_id === x.id))
      const exp = d.claims.filter((c) => c.honorarium_id === h.id && (c.status === 'approved' || c.status === 'paid')).reduce((a, c) => a + c.amount, 0)
      return [
        sp?.full_name ?? '',
        [h.legal_name, h.payee_type === 'corporation' ? '(corporation)' : h.payee_type ? '(individual)' : ''].filter(Boolean).join(' ') || 'Not given',
        fmtHst(h.hst_number),
        h.amount != null ? cad(h.amount) : '',
        fee?.tax ? cad(fee.tax) : '',
        exp ? cad(exp) : '',
        h.paid_at ? day(fee?.paid_on ?? h.paid_at) : 'Not paid',
      ]
    })
    w.table([
      { label: 'Speaker', width: 88 }, { label: 'Paid to', width: 104 }, { label: `${tax} no.`, width: 80 },
      { label: 'Honorarium', width: 62, align: 'right' }, { label: tax, width: 50, align: 'right' },
      { label: 'Expenses', width: 60, align: 'right' }, { label: 'Paid on', width: 68 },
    ], rows)

    const claims = d.claims.filter((c) => c.status !== 'declined')
    if (claims.length) {
      w.text('Expense claims', { size: 11, bold: true, gap: 2 })
      w.table([
        { label: 'Speaker', width: 100 }, { label: 'Expense', width: 190 }, { label: 'Date', width: 66 },
        { label: 'Status', width: 70 }, { label: 'Amount', width: 86, align: 'right' },
      ], claims.map((c) => {
        const h = d.honoraria.find((x) => x.id === c.honorarium_id)
        const sp = d.speakers.find((s) => s.id === h?.speaker_id)
        return [sp?.full_name ?? '', `${CLAIM_CATEGORY_LABEL[c.category]}: ${c.description}`, day(c.incurred_on),
          c.status === 'submitted' ? 'To review' : c.status === 'approved' ? 'Approved' : 'Paid', cad(c.amount)]
      }))
    }

    if (opts.includePayeeDetails) {
      const withDetails = d.honoraria.filter((h) => h.details_at)
      if (withDetails.length) {
        w.text('Payment details', { size: 11, bold: true, gap: 2 })
        w.table([{ label: 'Paid to', width: 150 }, { label: 'Method', width: 90 }, { label: 'Mailing address or e-Transfer email', width: 272 }],
          withDetails.map((h) => [h.legal_name ?? '', h.pay_method === 'etransfer' ? 'e-Transfer' : 'Cheque',
            h.pay_method === 'etransfer' ? `${h.etransfer_email ?? ''}${h.address ? `\n${h.address}` : ''}` : h.address ?? '']))
      }
    }
  }

  // ------------------------------------------------------------- sign-off
  w.ensure(130)
  w.heading('Sign-off')
  for (const who of ['Prepared by', 'Reviewed and approved by']) {
    w.y -= 26
    w.page.drawLine({ start: { x: M, y: w.y }, end: { x: M + 250, y: w.y }, thickness: 0.6, color: INK })
    w.page.drawLine({ start: { x: M + 300, y: w.y }, end: { x: W - M, y: w.y }, thickness: 0.6, color: INK })
    w.page.drawText(`${who}${who === 'Prepared by' && opts.preparedBy.trim() ? `: ${winAnsi(opts.preparedBy.trim())}` : ''}`, { x: M, y: w.y - 11, size: 8.5, font, color: MUTED })
    w.page.drawText('Date', { x: M + 300, y: w.y - 11, size: 8.5, font, color: MUTED })
    w.y -= 16
  }

  // ------------------------------------------------------------- receipts
  if (opts.includeReceipts && exhibit.size) {
    const txnOf = new Map<string, string>()
    for (const x of txns) for (const r of receiptsFor(d, x)) if (!txnOf.has(r.id)) txnOf.set(r.id, `${day(x.txn_date)} - ${x.description} - ${cad(x.amount)}`)
    const list = [...exhibit.entries()].map(([id, label]) => ({ r: d.receipts.find((x) => x.id === id)!, label })).filter((x) => x.r)
    w.ensure(140)
    w.heading('Receipts')
    w.table([{ label: 'Ref.', width: 40 }, { label: 'File', width: 190 }, { label: 'Supports', width: 282 }],
      list.map(({ r, label }) => [label, r.file_name, txnOf.get(r.id) ?? '']))

    let i = 0
    for (const { r, label } of list) {
      i++
      onProgress?.(`Adding receipt ${i} of ${list.length}…`)
      const caption = winAnsi(`${label} · ${r.file_name} · ${txnOf.get(r.id) ?? ''}`)
      const bytes = await fetchFile(r).catch(() => null)
      let ok = false
      if (bytes) {
        try {
          if ((r.mime_type ?? '').includes('pdf') || r.file_name.toLowerCase().endsWith('.pdf')) {
            const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
            const pages = await doc.copyPages(src, src.getPageIndices())
            for (const p of pages) {
              doc.addPage(p)
              const { width, height } = p.getSize()
              const size = 8
              const tw = Math.min(font.widthOfTextAtSize(caption, size), width - 24)
              p.drawRectangle({ x: 8, y: height - 20, width: tw + 8, height: 14, color: rgb(1, 1, 1), opacity: 0.9 })
              p.drawText(caption, { x: 12, y: height - 16, size, font, color: INK, maxWidth: width - 24 })
            }
            ok = pages.length > 0
          } else {
            const jpg = await normaliseImage(bytes, r.mime_type ?? 'image/jpeg')
            const img = jpg ? await doc.embedJpg(jpg)
              : (r.mime_type === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes))
            const page = doc.addPage([W, H])
            page.drawText(caption, { x: M, y: H - M, size: 9, font: bold, color: INK, maxWidth: W - 2 * M })
            const maxW = W - 2 * M, maxH = H - 2 * M - 24
            const s = Math.min(maxW / img.width, maxH / img.height, 1.5)
            page.drawImage(img, { x: M + (maxW - img.width * s) / 2, y: M + (maxH - img.height * s), width: img.width * s, height: img.height * s })
            ok = true
          }
        } catch { ok = false }
      }
      if (!ok) {
        const page = doc.addPage([W, H])
        page.drawText(caption, { x: M, y: H - M, size: 9, font: bold, color: INK, maxWidth: W - 2 * M })
        page.drawText('This file could not be added to the report. Open it from the event’s Costs & income page.'.replace('’', "'"),
          { x: M, y: H - M - 20, size: 10, font, color: MUTED, maxWidth: W - 2 * M })
      }
    }
  }

  // ---------------------------------------------------------- page footer
  const pages = doc.getPages()
  const foot = winAnsi(`${event.name} - financial report`)
  pages.forEach((p, k) => {
    const { width } = p.getSize()
    const label = `${foot}  ·  Page ${k + 1} of ${pages.length}`
    p.drawText(label, { x: width / 2 - font.widthOfTextAtSize(label, 7.5) / 2, y: 22, size: 7.5, font, color: MUTED })
  })
  return doc.save()
}
