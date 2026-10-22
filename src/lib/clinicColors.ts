// One colour per clinic (site + provider), shared by the Clinic Rotations page
// and the PDF export so both always match.
//
// Order: clinics in the catalog first (alphabetical), then anything else seen
// in the schedule (free-text entries), so a free-text cell never shifts the
// colours of the regular clinics. SickKids has its own light blue, kept out
// of the rotation.
//
// Full Tailwind class strings are required — Tailwind only generates classes
// it can see in the source. `rgb` is the chip colour for the PDF (the -100
// shade, so it stays visible when printed).

export interface ClinicColor { cell: string; chip: string; rgb: [number, number, number] }

const hex = (h: string): [number, number, number] =>
  [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]

export const SICKKIDS_COLOR: ClinicColor = { cell: 'bg-sky-100', chip: 'bg-sky-200 text-sky-900', rgb: hex('#bae6fd') }

export const CLINIC_COLORS: ClinicColor[] = [
  { cell: 'bg-emerald-50', chip: 'bg-emerald-100 text-emerald-900', rgb: hex('#d1fae5') },
  { cell: 'bg-amber-50', chip: 'bg-amber-100 text-amber-900', rgb: hex('#fef3c7') },
  { cell: 'bg-violet-50', chip: 'bg-violet-100 text-violet-900', rgb: hex('#ede9fe') },
  { cell: 'bg-rose-50', chip: 'bg-rose-100 text-rose-900', rgb: hex('#ffe4e6') },
  { cell: 'bg-teal-50', chip: 'bg-teal-100 text-teal-900', rgb: hex('#ccfbf1') },
  { cell: 'bg-indigo-50', chip: 'bg-indigo-100 text-indigo-900', rgb: hex('#e0e7ff') },
  { cell: 'bg-orange-50', chip: 'bg-orange-100 text-orange-900', rgb: hex('#ffedd5') },
  { cell: 'bg-lime-50', chip: 'bg-lime-100 text-lime-900', rgb: hex('#ecfccb') },
  { cell: 'bg-fuchsia-50', chip: 'bg-fuchsia-100 text-fuchsia-900', rgb: hex('#fae8ff') },
  { cell: 'bg-cyan-50', chip: 'bg-cyan-100 text-cyan-900', rgb: hex('#cffafe') },
  { cell: 'bg-stone-100', chip: 'bg-stone-200 text-stone-900', rgb: hex('#e7e5e4') },
]

export const clinicKeyOf = (site: string | null | undefined, provider: string | null | undefined) =>
  site ? `${site}|${provider ?? ''}` : null

export const isSickKids = (key: string) => /sick\s*kids|hospital for sick children/i.test(key.split('|')[0])

/** Row-like shape: anything with the fields that decide whether a cell is coloured. */
interface ColorableRow {
  site_code: string | null; provider_name: string | null
  is_away?: boolean | null; is_protected?: boolean | null; status?: string | null
}
export const isColoredRow = (r: ColorableRow) => !r.is_away && !r.is_protected && r.status !== 'cancelled'

/**
 * catalog: clinic_template rows (site_code + provider_name); may be empty when
 * the viewer can't read the catalog — then only the schedule's own keys are used.
 * rows: the clinic rotations being shown.
 */
export function buildClinicColorMap(
  catalog: { site_code: string | null; provider_name: string | null }[],
  rows: ColorableRow[],
): Map<string, ClinicColor> {
  const base = new Set<string>()
  for (const c of catalog) {
    const k = clinicKeyOf(c.site_code, c.provider_name)
    if (k && c.site_code !== 'TBD') base.add(k)
  }
  const extra = new Set<string>()
  for (const r of rows) {
    if (!isColoredRow(r)) continue
    const k = clinicKeyOf(r.site_code, r.provider_name)
    if (k && !base.has(k)) extra.add(k)
  }
  const m = new Map<string, ClinicColor>()
  let i = 0
  for (const k of [...Array.from(base).sort(), ...Array.from(extra).sort()]) {
    m.set(k, isSickKids(k) ? SICKKIDS_COLOR : CLINIC_COLORS[i++ % CLINIC_COLORS.length])
  }
  return m
}
