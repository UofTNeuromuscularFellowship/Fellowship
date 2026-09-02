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
  /** 'antibody' | 'genetic' | 'other', derived by the database from the
   *  source's own test_type wording. */
  modality: string | null
}

/** Search synonyms: official gene names from mygene.info, plus curated
 *  antibody and biomarker nomenclature. Lets "spastin" find SPAST and
 *  "acetylcholine receptor" find AChR. */
interface GeneTerm {
  symbol: string
  full_name: string | null
  aliases: string[]
  /** Conditions the source directory itself states, from tests naming exactly
   *  one condition. Attributable to them. */
  condition_terms: string[]
  /** Pairings the fellowship added where the source is silent — the bundled
   *  requisitions list many diseases against many antibodies without saying
   *  which pairs with which. Shown with a marker. */
  added_conditions: string[]
  /** 'curated' marks the antibody and biomarker entries. */
  source: string | null
}

/** Gene -> neuromuscular disease, from the Gene Table of Neuromuscular
 *  Disorders. Cached in the portal and joined to the directory's symbols. */
interface GenePhenotypes { symbol: string; gene_table_gene: string; phenotypes: string[]; source_version: string | null }

const SOURCE_URL = 'https://canadian-neuro-lab-directory-5sln.vercel.app'
const GENE_TABLE_URL = 'https://www.musclegenetable.fr'
/** How many disease names to show per gene before collapsing the rest. */
const SHOWN_DISEASES = 3

export default function TestDirectory() {
  const [tests, setTests] = useState<DirectoryTest[]>([])
  const [loading, setLoading] = useState(true)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [view, setView] = useState<'tests' | 'genes'>('tests')
  const [q, setQ] = useState('')
  const [section, setSection] = useState('')
  const [lab, setLab] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [showGenetic, setShowGenetic] = useState(false)
  const [terms, setTerms] = useState<Map<string, GeneTerm>>(new Map())
  const [phenotypes, setPhenotypes] = useState<Map<string, GenePhenotypes>>(new Map())
  const [geneTableVersion, setGeneTableVersion] = useState<string | null>(null)

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

    supabase
      .from('gene_search_terms')
      .select('symbol, full_name, aliases, condition_terms, added_conditions, source')
      .then(({ data }) => setTerms(new Map(((data as GeneTerm[]) ?? []).map((t) => [t.symbol, t]))))

    supabase
      .from('directory_gene_phenotypes')
      .select('symbol, gene_table_gene, phenotypes, source_version')
      .then(({ data }) => {
        const rows = (data as GenePhenotypes[]) ?? []
        setPhenotypes(new Map(rows.map((r) => [r.symbol, r])))
        setGeneTableVersion(rows[0]?.source_version ?? null)
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

  // Every word must appear somewhere, in any order. Plain substring matching
  // fails on the way disease names are written: the Gene Table has "Myasthenic
  // syndrome, fast-channel congenital", so a reader typing "congenital
  // myasthenic" would get nothing.
  const words = useMemo(
    () => q.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [q]
  )
  const matches = (hay: string) => {
    if (words.length === 0) return true
    const h = hay.toLowerCase()
    return words.every((w) => h.includes(w))
  }
  const needle = q.trim().toLowerCase()

  // Is this search about antibody testing? True when the query names an
  // antibody entry — its symbol, full name or an alias — or one of the
  // autoimmune conditions attached to those entries. Both lists are the
  // curated antibody set, so this is derived from data rather than a hardcoded
  // list of diseases.
  //
  // It exists because an autoimmune search was returning genetics panels:
  // "MuSK" also names a gene, and the Gene Table still records CHAT's
  // phenotypes as "Myasthenia gravis, familial infantile".
  const antibodyIntent = useMemo(() => {
    if (words.length === 0) return false
    for (const t of terms.values()) {
      if (t.source !== 'curated') continue
      const hay = [t.symbol, t.full_name, ...(t.aliases ?? []), ...(t.added_conditions ?? [])]
        .filter(Boolean).join(' ').toLowerCase()
      if (words.every((w) => hay.includes(w))) return true
    }
    return false
  }, [terms, words])

  /** Genetics is hidden while an antibody search is in play, unless asked for. */
  const hideGenetic = antibodyIntent && !showGenetic

  /** Disease names for a symbol, split by whether they can be attributed.
   *  `sourced` merges the testing directory's own conditions with the Gene
   *  Table's phenotypes; `added` is what the fellowship supplied. */
  function diseases(symbol: string): { sourced: string[]; added: string[] } {
    const key = symbol.trim()
    const t = terms.get(key)
    const merged = [...(t?.condition_terms ?? []), ...(phenotypes.get(key)?.phenotypes ?? [])]
    const seen = new Set<string>()
    const sourced = merged.filter((d) => {
      const k = d.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k); return true
    })
    return { sourced, added: t?.added_conditions ?? [] }
  }

  /** Everything a symbol can be found by in its own right: the symbol, its
   *  official name, nomenclature aliases, and every disease term. */
  function termText(symbol: string): string {
    const t = terms.get(symbol.trim())
    const d = diseases(symbol)
    return [symbol, t?.full_name, ...(t?.aliases ?? []), ...d.sourced, ...d.added]
      .filter(Boolean).join(' ')
  }

  // A test matches on anything a reader might reasonably type: the test name,
  // the condition, a gene symbol, the lab.
  const filteredTests = useMemo(() => tests.filter((t) => {
    if (section && t.primary_section !== section) return false
    if (lab && t.lab_name !== lab) return false
    if (hideGenetic && t.modality === 'genetic') return false
    if (!needle) return true
    return matches([t.test_name, t.subsection, t.test_type, t.lab_name, t.lab_city_province,
      ...t.conditions, ...t.genes_or_antibodies.map(termText)].filter(Boolean).join(' '))
  }), [tests, section, lab, words, terms, phenotypes, hideGenetic])

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
  //
  // Two grades of match, kept apart on purpose. A "direct" hit is the symbol,
  // its official name or an alias. A "context" hit is a symbol that merely sits
  // on a requisition covering the disease you typed — several labs bundle
  // unrelated antibodies onto one form, so searching "myasthenia gravis" would
  // otherwise return NMDAR and cN1A as though they were MG antibodies.
  const geneIndex = useMemo(() => {
    const m = new Map<string, DirectoryTest[]>()
    for (const t of tests) {
      if (section && t.primary_section !== section) continue
      if (lab && t.lab_name !== lab) continue
      if (hideGenetic && t.modality === 'genetic') continue
      for (const g of t.genes_or_antibodies) {
        const key = g.trim()
        if (!key) continue
        m.set(key, [...(m.get(key) ?? []), t])
      }
    }
    const entries = Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    if (!needle) return entries.map(([gene, ts]) => ({ gene, ts, direct: true }))

    const out: { gene: string; ts: DirectoryTest[]; direct: boolean }[] = []
    for (const [gene, ts] of entries) {
      if (matches(termText(gene))) { out.push({ gene, ts, direct: true }); continue }
      const context = ts.flatMap((t) => [t.test_name, t.lab_name, t.subsection, ...t.conditions])
        .filter(Boolean).join(' ')
      if (matches(context)) out.push({ gene, ts, direct: false })
    }
    return [...out.filter((e) => e.direct), ...out.filter((e) => !e.direct)]
  }, [tests, section, lab, words, terms, phenotypes, hideGenetic])

  const directCount = geneIndex.filter((e) => e.direct).length

  // What the suppression is holding back, so the notice can say how much.
  const hiddenGeneticTests = useMemo(() => {
    if (!antibodyIntent) return 0
    return tests.filter((t) => {
      if (t.modality !== 'genetic') return false
      if (section && t.primary_section !== section) return false
      if (lab && t.lab_name !== lab) return false
      return matches([t.test_name, t.subsection, t.test_type, t.lab_name, t.lab_city_province,
        ...t.conditions, ...t.genes_or_antibodies.map(termText)].filter(Boolean).join(' '))
    }).length
  }, [antibodyIntent, tests, section, lab, words, terms, phenotypes])

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
            placeholder="Search by symbol, full name, condition, test or lab — e.g. AChR, acetylcholine receptor, myasthenia gravis"
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
            <button type="button" onClick={() => { setQ(''); setSection(''); setLab(''); setShowGenetic(false) }}
              className="text-sm font-medium text-accent hover:underline">Clear</button>
          )}
        </div>

        {antibodyIntent && (hiddenGeneticTests > 0 || showGenetic) && (
          <p className="border-b border-line bg-accent-soft/40 px-5 py-2.5 text-xs text-ink">
            {showGenetic ? (
              <>
                Showing genetic tests alongside antibody testing for “{q.trim()}”.{' '}
                <button type="button" onClick={() => setShowGenetic(false)}
                  className="font-medium text-accent hover:underline">Hide them</button>
              </>
            ) : (
              <>
                “{q.trim()}” is antibody testing, so {hiddenGeneticTests} genetic
                {hiddenGeneticTests === 1 ? ' test is' : ' tests are'} hidden — a gene of the same name, or an
                inherited condition with a similar name, is a different investigation.{' '}
                <button type="button" onClick={() => setShowGenetic(true)}
                  className="font-medium text-accent hover:underline">Show them anyway</button>
              </>
            )}
          </p>
        )}

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
                        {t.modality === 'antibody' && (
                          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Antibody</span>
                        )}
                        {t.modality === 'genetic' && (
                          <span className="ml-2 rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Genetic</span>
                        )}
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
            {geneIndex.map(({ gene, ts }, i) => (
              <li key={gene} className="px-5 py-2.5 text-sm">
                {i === directCount && needle && (
                  <p className="-mx-5 mb-2.5 border-y border-line bg-paper px-5 py-1.5 text-xs text-muted">
                    Also on requisitions that cover “{q.trim()}” — these are not themselves
                    {' '}“{q.trim()}” tests
                  </p>
                )}
                <span className="font-mono font-medium text-ink">{gene}</span>
                {terms.get(gene.trim())?.full_name && (
                  <span className="ml-2 text-muted">{terms.get(gene.trim())!.full_name}</span>
                )}
                <GeneConditions {...diseases(gene)} />
                <ul className="mt-0.5 space-y-0.5">
                  {ts.map((t) => (
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

      {view === 'genes' && (
        <p className="text-xs text-muted">
          Disease names for genes come from the{' '}
          <a href={GENE_TABLE_URL} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            Gene Table of Neuromuscular Disorders
          </a>{geneTableVersion ? ` (${geneTableVersion})` : ''} — Bonne, Rivier &amp; Hamroun, Sorbonne Université /
          Institut de Myologie and CHU de Montpellier — alongside the conditions the testing directory itself states.
        </p>
      )}

      {view === 'genes' && geneIndex.some(({ gene }) => (terms.get(gene.trim())?.added_conditions ?? []).length > 0) && (
        <p className="text-xs text-muted">
          <span className="font-medium text-ink">†</span> Antibody–disease pairing added by the fellowship as a
          search aid. The source directory lists conditions per requisition, not per antibody, so these
          associations are ours rather than theirs. Unmarked conditions are the directory's own words.
        </p>
      )}

      <p className="text-xs text-muted">
        This is a convenience copy of a public directory the fellowship does not maintain. Confirm eligibility,
        cost and current requisition versions with the performing laboratory before sending a sample.
      </p>
    </div>
  )
}

/** Disease names under a gene, separated by who says so. Sourced names — the
 *  testing directory's own conditions and the Gene Table's phenotypes — are
 *  shown plainly; pairings the fellowship supplied carry a † explained in the
 *  footnote. */
function GeneConditions({ sourced, added }: { sourced: string[]; added: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (sourced.length === 0 && added.length === 0) return null
  const shown = expanded ? sourced : sourced.slice(0, SHOWN_DISEASES)
  const hidden = sourced.length - shown.length
  return (
    <span className="ml-2 text-xs text-muted">
      {shown.join(' · ')}
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)}
          className="ml-1 font-medium text-accent hover:underline">+{hidden} more</button>
      )}
      {shown.length > 0 && added.length > 0 && ' · '}
      {added.length > 0 && (
        <span title="Added by the fellowship — not stated by either source">
          {added.join(' · ')}<span className="ml-0.5 font-medium text-ink">†</span>
        </span>
      )}
    </span>
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
