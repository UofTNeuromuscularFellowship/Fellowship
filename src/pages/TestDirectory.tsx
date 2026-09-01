import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'

// A mirror of the public Canadian Neuro Diagnostic Testing Directory. The rows
// are refreshed weekly by the neuro-directory-sync edge function; this page
// only reads them.
//
// Two views over the same 33 records, matching the source site:
//   Tests   — grouped by section, the full requisition detail.
//   Genes   — the ~478 distinct genes and antibodies named across those tests,
//             pivoted so you can go from "I need SMN1" to "who runs it".

interface DirectoryTest {
  id: string
  primary_section: string | null
  subsection: string | null
  test_name: string
  conditions: string[]
  genes_or_antibodies: string[]
  test_type: string | null
  lab_name: string | null
  lab_city_province: string | null
  age_group: string | null
  ontario_vs_out_of_province: string | null
  funding_or_cost: string | null
  requisition_pdf_url: string | null
  lab_page_url: string | null
  notes: string | null
  sort_order: number
}

const SOURCE_URL = 'https://canadian-neuro-lab-directory-5sln.vercel.app'

export default function TestDirectory() {
  const [tests, setTests] = useState<DirectoryTest[]>([])
  const [loading, setLoading] = useState(true)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [view, setView] = useState<'tests' | 'genes'>('tests')
  const [q, setQ] = useState('')
  const [section, setSection] = useState('')
  const [lab, setLab] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('neuro_test_directory')
      .select('*')
      .order('primary_section')
      .order('sort_order')
      .then(({ data }) => {
        const rows = (data as DirectoryTest[]) ?? []
        setTests(rows)
        setSyncedAt((data as { synced_at?: string }[] | null)?.[0]?.synced_at ?? null)
        setLoading(false)
      })
  }, [])

  const sections = useMemo(
    () => Array.from(new Set(tests.map((t) => t.primary_section).filter(Boolean) as string[])).sort(),
    [tests]
  )
  const labs = useMemo(
    () => Array.from(new Set(tests.map((t) => t.lab_name).filter(Boolean) as string[])).sort(),
    [tests]
  )

  const needle = q.trim().toLowerCase()

  // A test matches on anything a reader might reasonably type: the test name,
  // the condition, a gene symbol, the lab.
  const filteredTests = useMemo(() => tests.filter((t) => {
    if (section && t.primary_section !== section) return false
    if (lab && t.lab_name !== lab) return false
    if (!needle) return true
    const hay = [t.test_name, t.subsection, t.test_type, t.lab_name, t.lab_city_province,
      ...t.conditions, ...t.genes_or_antibodies].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(needle)
  }), [tests, section, lab, needle])

  const grouped = useMemo(() => {
    const m = new Map<string, DirectoryTest[]>()
    for (const t of filteredTests) {
      const k = t.primary_section ?? 'Other'
      m.set(k, [...(m.get(k) ?? []), t])
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredTests])

  // gene/antibody -> the tests that name it. Built from the same rows, so the
  // index can never drift out of step with the test list.
  const geneIndex = useMemo(() => {
    const m = new Map<string, DirectoryTest[]>()
    for (const t of tests) {
      if (section && t.primary_section !== section) continue
      if (lab && t.lab_name !== lab) continue
      for (const g of t.genes_or_antibodies) {
        const key = g.trim()
        if (!key) continue
        m.set(key, [...(m.get(key) ?? []), t])
      }
    }
    return Array.from(m.entries())
      .filter(([g, ts]) => !needle
        || g.toLowerCase().includes(needle)
        || ts.some((t) => (t.lab_name ?? '').toLowerCase().includes(needle))
        || ts.some((t) => t.test_name.toLowerCase().includes(needle)))
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [tests, section, lab, needle])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Diagnostic test directory</h1>
        <p className="mt-1 text-sm text-muted">
          Where to send Canadian neurogenetic and neuroimmunology testing — requisitions, eligibility and cost.
          Mirrored weekly from the{' '}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            Canadian Neuro Diagnostic Testing Directory
          </a>
          {syncedAt ? ` · last checked ${new Date(syncedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="flex rounded-md border border-line p-0.5">
            {([['tests', `Tests (${tests.length})`], ['genes', `Gene / antibody index (${geneIndex.length})`]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === v ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search gene, antibody, condition, test or lab…"
            className="min-w-[15rem] flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <select value={section} onChange={(e) => setSection(e.target.value)}
            className="max-w-[13rem] truncate rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="">All sections</option>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={lab} onChange={(e) => setLab(e.target.value)}
            className="max-w-[13rem] truncate rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
            <option value="">All labs</option>
            {labs.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          {(q || section || lab) && (
            <button type="button" onClick={() => { setQ(''); setSection(''); setLab('') }}
              className="text-sm font-medium text-accent hover:underline">Clear</button>
          )}
        </div>

        {loading ? (
          <p className="px-5 py-4 text-sm text-muted">Loading the directory…</p>
        ) : view === 'tests' ? (
          grouped.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">No tests match that search.</p>
          ) : (
            grouped.map(([sectionName, rows]) => (
              <div key={sectionName} className="border-b border-line last:border-b-0">
                <p className="px-5 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{sectionName}</p>
                <ul className="divide-y divide-line">
                  {rows.map((t) => (
                    <li key={t.id} className="px-5 py-3 text-sm">
                      <button type="button" onClick={() => setOpenId(openId === t.id ? null : t.id)}
                        className="w-full text-left">
                        <span className="font-medium text-ink">{t.test_name}</span>
                        <span className="mt-0.5 block text-muted">
                          {[t.lab_name, t.lab_city_province].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                      {openId === t.id && <TestDetail t={t} />}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )
        ) : geneIndex.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No genes or antibodies match that search.</p>
        ) : (
          <ul className="divide-y divide-line">
            {geneIndex.map(([gene, rows]) => (
              <li key={gene} className="px-5 py-2.5 text-sm">
                <span className="font-mono font-medium text-ink">{gene}</span>
                <ul className="mt-0.5 space-y-0.5">
                  {rows.map((t) => (
                    <li key={t.id} className="text-muted">
                      {t.lab_name}
                      {t.requisition_pdf_url && (
                        <a href={t.requisition_pdf_url} target="_blank" rel="noreferrer"
                          className="ml-2 text-xs font-medium text-accent hover:underline">Requisition</a>
                      )}
                      <span className="block text-xs">{t.test_name}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted">
        This is a convenience copy of a public directory the fellowship does not maintain. Confirm eligibility,
        cost and current requisition versions with the performing laboratory before sending a sample.
      </p>
    </div>
  )
}

function TestDetail({ t }: { t: DirectoryTest }) {
  const rows: [string, string | null][] = [
    ['Test type', t.test_type],
    ['Conditions', t.conditions.join(' · ') || null],
    ['Age group', t.age_group],
    ['Eligibility', t.ontario_vs_out_of_province],
    ['Funding / cost', t.funding_or_cost],
    ['Notes', t.notes],
  ]
  return (
    <div className="mt-2 rounded-md border border-line bg-paper px-3 py-2.5">
      <dl className="space-y-1">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="sm:flex sm:gap-2">
            <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-muted sm:w-32">{k}</dt>
            <dd className="text-sm text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {t.genes_or_antibodies.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Genes / antibodies ({t.genes_or_antibodies.length})
          </p>
          <p className="mt-0.5 break-words font-mono text-xs text-ink">{t.genes_or_antibodies.join(', ')}</p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3">
        {t.requisition_pdf_url && (
          <a href={t.requisition_pdf_url} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-accent hover:underline">Requisition PDF →</a>
        )}
        {t.lab_page_url && (
          <a href={t.lab_page_url} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-accent hover:underline">Lab website →</a>
        )}
      </div>
    </div>
  )
}
