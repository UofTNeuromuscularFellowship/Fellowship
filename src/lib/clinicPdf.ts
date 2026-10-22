// Printable clinic schedule: a week-grid PDF of PUBLISHED clinics for a date
// range, for emailing to people who don't use the portal. Built in the browser
// with pdf-lib (already a dependency) — no server round-trip.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { supabase } from './supabase'
import { addDays, mondayOf, dateLabel, fromIso, listClinicFellows } from './schedule'

interface Row {
  fellow_id: string; rotation_date: string; site_code: string | null; provider_name: string | null
  status: string | null; is_protected: boolean | null; is_away: boolean | null
}
interface Fellow { id: string; full_name: string; fellowship_start?: string | null; fellowship_end?: string | null }

const PAGE_W = 792, PAGE_H = 612 // US Letter, landscape
const M = 36 // margin
const NAME_W = 120
const PAD = 4
const FS = 8, FS_SMALL = 7, LINE = 9.5

const INK = rgb(0.1, 0.1, 0.12), MUTED = rgb(0.45, 0.45, 0.5), GRID = rgb(0.78, 0.78, 0.82)
const HEAD_BG = rgb(0.93, 0.94, 0.96), OUT_BG = rgb(0.96, 0.96, 0.96)
const SICKKIDS_BG = rgb(0.86, 0.93, 0.99), AWAY_BG = rgb(0.99, 0.93, 0.9), PROT_BG = rgb(0.94, 0.94, 0.97)
const isSickKids = (s: string | null) => /sick\s*kids|hospital for sick children/i.test(s ?? '')

async function loadRows(from: string, to: string): Promise<Row[]> {
  const out: Row[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('clinic_rotations')
      .select('fellow_id, rotation_date, site_code, provider_name, status, is_protected, is_away')
      .eq('is_draft', false).gte('rotation_date', from).lte('rotation_date', to)
      .order('rotation_date').range(start, start + 999)
    if (error) throw new Error(error.message)
    out.push(...((data as Row[]) ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function buildClinicSchedulePdf(from: string, to: string): Promise<Uint8Array> {
  const [rows, fl] = await Promise.all([loadRows(from, to), listClinicFellows(from, to)])
  if (fl.error) throw new Error(fl.error.message)
  const fellows = ((fl.data as Fellow[]) ?? [])
  const byCell = new Map(rows.map((r) => [`${r.fellow_id}|${r.rotation_date}`, r]))

  const doc = await PDFDocument.create()
  doc.setTitle(`Clinic schedule ${from} to ${to}`)
  doc.setAuthor('Citywide Neuromuscular Fellowship')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Standard PDF fonts only cover Latin-1-ish text; strip accents, swap anything else.
  const clean = (f: PDFFont, s: string) => Array.from(s).map((ch) => {
    try { f.widthOfTextAtSize(ch, FS); return ch } catch { /* not encodable */ }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    try { f.widthOfTextAtSize(base, FS); return base } catch { return '?' }
  }).join('')
  const wrap = (f: PDFFont, s: string, size: number, width: number): string[] => {
    const words = clean(f, s).split(/\s+/).filter(Boolean)
    const lines: string[] = []; let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (f.widthOfTextAtSize(next, size) <= width) { cur = next; continue }
      if (cur) lines.push(cur)
      // a single word wider than the cell: hard-break it
      let piece = w
      while (f.widthOfTextAtSize(piece, size) > width && piece.length > 1) {
        let n = piece.length
        while (n > 1 && f.widthOfTextAtSize(piece.slice(0, n), size) > width) n--
        lines.push(piece.slice(0, n)); piece = piece.slice(n)
      }
      cur = piece
    }
    if (cur) lines.push(cur)
    return lines
  }

  const generated = dateLabel(new Date().toISOString().slice(0, 10))
  let page: PDFPage
  let y = 0
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    page.drawText('Citywide Neuromuscular Fellowship — Clinic Schedule', { x: M, y: PAGE_H - M - 4, size: 13, font: bold, color: INK })
    page.drawText(clean(font, `${dateLabel(from)} – ${dateLabel(to)}  ·  Published clinics  ·  Generated ${generated}`),
      { x: M, y: PAGE_H - M - 20, size: 9, font, color: MUTED })
    y = PAGE_H - M - 38
  }
  newPage()

  const dayW = (PAGE_W - 2 * M - NAME_W) / 5
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const headH = 26

  type Cell = { lines: { text: string; f: PDFFont; size: number; color: ReturnType<typeof rgb> }[]; bg?: ReturnType<typeof rgb> }
  const cellFor = (f: Fellow, dt: string): Cell => {
    if (dt < from || dt > to) return { lines: [], bg: OUT_BG }
    if ((f.fellowship_start && dt < f.fellowship_start) || (f.fellowship_end && dt > f.fellowship_end)) {
      return { lines: [{ text: '—', f: font, size: FS, color: MUTED }], bg: OUT_BG }
    }
    const r = byCell.get(`${f.id}|${dt}`)
    if (!r) return { lines: [{ text: '—', f: font, size: FS, color: MUTED }] }
    if (r.is_away) return { lines: [{ text: 'Away', f: bold, size: FS, color: INK }], bg: AWAY_BG }
    if (r.is_protected) return { lines: [{ text: 'Protected', f: font, size: FS, color: INK }], bg: PROT_BG }
    const w = dayW - 2 * PAD
    const site = wrap(bold, r.site_code ?? 'TBD', FS, w).map((t) => ({ text: t, f: bold, size: FS, color: r.status === 'cancelled' ? MUTED : INK }))
    const prov = r.provider_name ? wrap(font, r.provider_name, FS_SMALL, w).map((t) => ({ text: t, f: font, size: FS_SMALL, color: MUTED })) : []
    const canc = r.status === 'cancelled' ? [{ text: 'CANCELLED', f: bold, size: FS_SMALL, color: rgb(0.75, 0.1, 0.1) }] : []
    return { lines: [...site, ...prov, ...canc], bg: isSickKids(r.site_code) && r.status !== 'cancelled' ? SICKKIDS_BG : undefined }
  }
  const rect = (x: number, top: number, w: number, h: number, fill?: ReturnType<typeof rgb>) =>
    page.drawRectangle({ x, y: top - h, width: w, height: h, color: fill, borderColor: GRID, borderWidth: 0.5 })

  for (let wk = mondayOf(from); wk <= to; wk = addDays(wk, 7)) {
    const dates = [0, 1, 2, 3, 4].map((i) => addDays(wk, i))
    if (dates[4] < from) continue
    const body = fellows.map((f) => {
      const cells = dates.map((dt) => cellFor(f, dt))
      const nameLines = wrap(bold, f.full_name, FS, NAME_W - 2 * PAD)
      const h = Math.max(22, 2 * PAD + LINE * Math.max(nameLines.length, ...cells.map((c) => c.lines.length)))
      return { f, cells, nameLines, h }
    })
    const tableH = 16 + headH + body.reduce((s, r) => s + r.h, 0)
    if (y - tableH < M + 14 && y < PAGE_H - M - 40) newPage()

    page!.drawText(clean(bold, `Week of ${fromIso(wk).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}`),
      { x: M, y: y - 11, size: 10, font: bold, color: INK })
    y -= 16

    const drawHead = () => {
      rect(M, y, NAME_W, headH, HEAD_BG)
      page!.drawText('Fellow', { x: M + PAD, y: y - 16, size: FS, font: bold, color: MUTED })
      dates.forEach((dt, i) => {
        const x = M + NAME_W + i * dayW
        rect(x, y, dayW, headH, HEAD_BG)
        page!.drawText(DAYS[i], { x: x + PAD, y: y - 11, size: FS, font: bold, color: INK })
        page!.drawText(clean(font, fromIso(dt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })),
          { x: x + PAD, y: y - 21, size: FS_SMALL, font, color: MUTED })
      })
      y -= headH
    }
    drawHead()

    for (const r of body) {
      if (y - r.h < M + 14) { newPage(); drawHead() }
      rect(M, y, NAME_W, r.h)
      r.nameLines.forEach((t, i) => page!.drawText(t, { x: M + PAD, y: y - PAD - 7 - i * LINE, size: FS, font: bold, color: INK }))
      r.cells.forEach((c, i) => {
        const x = M + NAME_W + i * dayW
        rect(x, y, dayW, r.h, c.bg)
        c.lines.forEach((l, j) => page!.drawText(l.text, { x: x + PAD, y: y - PAD - 7 - j * LINE, size: l.size, font: l.f, color: l.color }))
      })
      y -= r.h
    }
    y -= 14
  }

  if (fellows.length === 0) {
    page!.drawText('No fellows are scheduled in this date range.', { x: M, y: y - 12, size: 10, font, color: MUTED })
  }

  const pages = doc.getPages()
  pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`, { x: PAGE_W - M - 60, y: M - 16, size: 8, font, color: MUTED }))
  return doc.save()
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
