import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card } from '../components/ui/Card'
import { AddDirectoryTest } from '../components/AddDirectoryTest'

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
  /** 'mirror' for a row copied from the public directory, 'local' for one added
   *  in the portal. The weekly sync only ever rewrites the mirrored ones. */
  origin: string | null
  added_by: string | null
  /** Storage path of an uploaded requisition, when one was attached here. */
  requisition_path: string | null
  /** Set when the program has taken a mirrored entry out of the directory.
   *  The row keeps refreshing from the source; it is simply not shown. */
  hidden_at: string | null
  hidden_reason: string | null
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


/** One row of the type-ahead. `search` is everything the entry can be found
 *  by; `label` is what lands in the search box when it is chosen. */
interface Suggestion {
  kind: 'gene' | 'antibody' | 'disease' | 'test'
  label: string
  sub?: string | null
  search: string
}

const KIND_LABEL: Record<Suggestion['kind'], string> = {
  gene: 'Gene',
  antibody: 'Antibody',
  disease: 'Condition',
  test: 'Test',
}

/** How many type-ahead rows to offer. */
const MAX_SUGGESTIONS = 10

/** Several requisitions list a placeholder where the symbols would go —
 *  "Multiple (see requisition)", "Varies by assay (see BCNI directory)". They
 *  are real entries in the source and stay on the test's own detail, but they
 *  are not genes and do not belong in a list of genes to browse or a type-ahead
 *  of things to search for. A single-word entry is always a symbol; a
 *  multi-word one only counts if it starts with a symbol-shaped token, which
 *  keeps "ATN1 (DRPLA)" and drops "others per requisition". */
function isSymbol(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  const [first, ...rest] = s.split(/\s+/)
  if (rest.length === 0) return true
  return /^[A-Z0-9][A-Z0-9-]*$/.test(first)
}

export default function TestDirectory() {
  const { profile } = useAuth()
  // Supervisors and the director keep the directory current between refreshes
  // of the public site; everyone else reads it.
  const canAdd = profile?.role === 'supervisor' || profile?.role === 'director' || profile?.role === 'admin'
  // Hiding a mirrored entry changes what every reader sees, so it sits with
  // program direction rather than with everyone who may add a test.
  const canCurate = profile?.role === 'director' || profile?.role === 'admin'
  const [allTests, setAllTests] = useState<DirectoryTest[]>([])
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // The director's view of what has been taken out of the directory, so a
  // hidden entry can be reviewed and put back.
  const [reviewHidden, setReviewHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [q, setQ] = useState('')
  // Which full list is open. Null, with an empty query, means the page shows
  // nothing but the search box and the three buttons — 478 symbols and 33 tests
  // are not a useful thing to land on.
  const [browse, setBrowse] = useState<'genes' | 'antibodies' | 'tests' | null>(null)
  const [section, setSection] = useState('')
  const [lab, setLab] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [terms, setTerms] = useState<Map<string, GeneTerm>>(new Map())
  const [phenotypes, setPhenotypes] = useState<Map<string, GenePhenotypes>>(new Map())
  const [geneTableVersion, setGeneTableVersion] = useState<string | null>(null)
  // Type-ahead: open while the box has focus and something has been typed.
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function loadTests() {
    return supabase
      .from('neuro_test_directory')
      .select('*')
      .order('primary_section')
      .order('sort_order')
      .then(({ data }) => {
        const rows = (data as DirectoryTest[]) ?? []
        setAllTests(rows)
        setSyncedAt((data as { synced_at?: string }[] | null)?.[0]?.synced_at ?? null)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadTests()

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

  // Everything below works off the visible rows. A hidden entry is out of the
  // directory entirely — searches, the gene and antibody lists, the type-ahead
  // — and is reachable only through the review panel.
  const hiddenTests = useMemo(() => allTests.filter((t) => t.hidden_at), [allTests])
  const tests = useMemo(() => allTests.filter((t) => !t.hidden_at), [allTests])

  const sections = useMemo(
    () => Array.from(new Set(tests.map((t) => t.primary_section).filter(Boolean) as string[])).sort(),
    [tests]
  )
  const labs = useMemo(
    () => Array.from(new Set(tests.map((t) => t.lab_name).filter(Boolean) as string[])).sort(),
    [tests]
  )

  async function setHidden(t: DirectoryTest, hidden: boolean) {
    if (hidden && !window.confirm(
      `Take “${t.test_name}” out of the directory? It stays in the database and can be put back.`)) return
    const { error } = await supabase.from('neuro_test_directory').update(
      hidden
        ? { hidden_at: new Date().toISOString(), hidden_by: profile?.id ?? null }
        : { hidden_at: null, hidden_by: null, hidden_reason: null }
    ).eq('id', t.id)
    if (error) { setMsg(error.message); return }
    loadTests()
  }

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
  // phenotypes as "Myasthenia gravis, familial infantile". The suppression is
  // silent — there is no notice and no override, so a search for an autoimmune
  // condition simply does not return inherited-disease panels.
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

  const hideGenetic = antibodyIntent

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

  const testHay = (t: DirectoryTest) =>
    [t.test_name, t.subsection, t.test_type, t.lab_name, t.lab_city_province,
      ...t.conditions, ...t.genes_or_antibodies.map(termText)].filter(Boolean).join(' ')

  // Which symbols are antibodies and which are genes, taken from the modality
  // of the tests that name them rather than from a list of our own. A symbol
  // can be both: contactin 1 is assayed as an antibody and sequenced as a gene,
  // and it belongs under both buttons.
  const symbolKinds = useMemo(() => {
    const m = new Map<string, { antibody: boolean; genetic: boolean }>()
    for (const t of tests) {
      for (const g of t.genes_or_antibodies) {
        const key = g.trim()
        if (!key || !isSymbol(key)) continue
        const e = m.get(key) ?? { antibody: false, genetic: false }
        if (t.modality === 'antibody') e.antibody = true
        if (t.modality === 'genetic') e.genetic = true
        m.set(key, e)
      }
    }
    return m
  }, [tests])

  const geneTotal = useMemo(
    () => Array.from(symbolKinds.values()).filter((k) => k.genetic).length,
    [symbolKinds]
  )
  const antibodyTotal = useMemo(
    () => Array.from(symbolKinds.values()).filter((k) => k.antibody).length,
    [symbolKinds]
  )

  // Everything the type-ahead can offer: symbols, the conditions attached to
  // them, and the test names. Built once from the loaded rows.
  const catalog = useMemo(() => {
    const out: Suggestion[] = []

    for (const [symbol, kind] of symbolKinds) {
      const t = terms.get(symbol)
      const d = diseases(symbol)
      out.push({
        // A symbol assayed both ways is offered as an antibody, which is the
        // narrower and more often intended reading of a name like MuSK.
        kind: kind.antibody ? 'antibody' : 'gene',
        label: symbol,
        sub: t?.full_name ?? null,
        search: [symbol, t?.full_name, ...(t?.aliases ?? []), ...d.sourced, ...d.added]
          .filter(Boolean).join(' '),
      })
    }

    // Conditions, from every place one is written down, deduplicated on case.
    const seen = new Map<string, string>()
    const addCondition = (raw: string) => {
      const name = raw.trim()
      if (name.length < 3) return
      const k = name.toLowerCase()
      if (!seen.has(k)) seen.set(k, name)
    }
    for (const t of tests) t.conditions.forEach(addCondition)
    for (const t of terms.values()) {
      t.condition_terms?.forEach(addCondition)
      t.added_conditions?.forEach(addCondition)
    }
    for (const p of phenotypes.values()) p.phenotypes?.forEach(addCondition)
    for (const name of seen.values()) out.push({ kind: 'disease', label: name, search: name })

    for (const t of tests) {
      out.push({
        kind: 'test',
        label: t.test_name,
        sub: t.lab_name,
        search: [t.test_name, t.lab_name, t.subsection].filter(Boolean).join(' '),
      })
    }

    return out
  }, [tests, terms, phenotypes, symbolKinds])

  // What to offer for what has been typed. A name that starts with the query
  // comes before one that merely contains it, so typing "ach" offers AChR
  // before every panel that happens to mention acetylcholine.
  const suggestions = useMemo(() => {
    if (needle.length < 2) return []
    const starts: Suggestion[] = []
    const contains: Suggestion[] = []
    for (const s of catalog) {
      if (s.label.toLowerCase() === needle) continue
      const hay = s.search.toLowerCase()
      if (!words.every((w) => hay.includes(w))) continue
      if (s.label.toLowerCase().startsWith(needle)) starts.push(s)
      else contains.push(s)
      if (starts.length >= MAX_SUGGESTIONS) break
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS)
  }, [catalog, needle, words])

  useEffect(() => { setCursor(0) }, [needle])

  function choose(s: Suggestion) {
    setQ(s.label)
    setBrowse(null)
    setSuggestOpen(false)
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestOpen || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(suggestions[cursor]) }
    else if (e.key === 'Escape') { setSuggestOpen(false) }
  }

  // A test matches on anything a reader might reasonably type: the test name,
  // the condition, a gene symbol, the lab.
  const filteredTests = useMemo(() => {
    if (!needle && browse !== 'tests') return []
    return tests.filter((t) => {
      if (section && t.primary_section !== section) return false
      if (lab && t.lab_name !== lab) return false
      if (hideGenetic && t.modality === 'genetic') return false
      if (!needle) return true
      return matches(testHay(t))
    })
  }, [tests, section, lab, words, terms, phenotypes, hideGenetic, browse, needle])

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
    if (!needle && browse !== 'genes' && browse !== 'antibodies') return []
    const m = new Map<string, DirectoryTest[]>()
    for (const t of tests) {
      if (section && t.primary_section !== section) continue
      if (lab && t.lab_name !== lab) continue
      if (hideGenetic && t.modality === 'genetic') continue
      for (const g of t.genes_or_antibodies) {
        const key = g.trim()
        if (!key || !isSymbol(key)) continue
        // Browsing one kind shows only that kind; a search shows both.
        const kind = symbolKinds.get(key)
        if (browse === 'genes' && !kind?.genetic) continue
        if (browse === 'antibodies' && !kind?.antibody) continue
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
  }, [tests, section, lab, words, terms, phenotypes, hideGenetic, browse, needle, symbolKinds])

  const directCount = geneIndex.filter((e) => e.direct).length

  const searching = needle.length > 0
  const showGeneList = searching ? geneIndex.length > 0 : browse === 'genes' || browse === 'antibodies'
  const showTestList = searching ? grouped.length > 0 : browse === 'tests'
  const nothingYet = !searching && !browse

  function pick(next: 'genes' | 'antibodies' | 'tests') {
    setBrowse(browse === next ? null : next)
    setQ('')
    setSuggestOpen(false)
  }

  const browseBtn = (key: 'genes' | 'antibodies' | 'tests', label: string, n: number) => (
    <button
      key={key}
      type="button"
      onClick={() => pick(key)}
      aria-pressed={browse === key}
      className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
        browse === key
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line text-ink hover:border-accent hover:text-accent'
      }`}
    >
      {label} <span className="text-muted">({n})</span>
    </button>
  )

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
        <div className="px-5 py-4">
          {/* The search box owns the top of the page. The type-ahead floats
              over whatever is below it rather than pushing the page around as
              the list of matches changes length. */}
          <div className="relative">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setBrowse(null); setSuggestOpen(true) }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setSuggestOpen(false)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={suggestOpen && suggestions.length > 0}
              aria-autocomplete="list"
              aria-controls="directory-suggestions"
              placeholder="Search a gene, antibody, condition, test or lab — e.g. SMN1, AChR, myasthenia gravis"
              className="w-full rounded-md border border-line bg-surface px-4 py-3 text-base text-ink shadow-sm focus:border-accent focus:outline-none"
            />

            {suggestOpen && suggestions.length > 0 && (
              <ul
                id="directory-suggestions"
                role="listbox"
                // The box loses focus the instant the mouse goes down on an
                // option, which would close this list before the click landed.
                onMouseDown={(e) => e.preventDefault()}
                className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg"
              >
                {suggestions.map((s, i) => (
                  <li key={`${s.kind}-${s.label}`} role="option" aria-selected={i === cursor}>
                    <button
                      type="button"
                      onClick={() => choose(s)}
                      onMouseEnter={() => setCursor(i)}
                      className={`flex w-full items-baseline gap-2 px-4 py-2 text-left text-sm ${
                        i === cursor ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <span className={`w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                        s.kind === 'antibody' ? 'text-accent' : 'text-muted'
                      }`}>
                        {KIND_LABEL[s.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`text-ink ${s.kind === 'gene' || s.kind === 'antibody' ? 'font-mono font-medium' : ''}`}>
                          {s.label}
                        </span>
                        {s.sub && <span className="ml-2 text-muted">{s.sub}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {browseBtn('genes', 'Search by gene', geneTotal)}
            {browseBtn('antibodies', 'Search by antibody', antibodyTotal)}
            {browseBtn('tests', 'Search by test', tests.length)}

            {(searching || browse) && (
              <>
                <select value={section} onChange={(e) => setSection(e.target.value)}
                  className="ml-auto max-w-[13rem] truncate rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
                  <option value="">All sections</option>
                  {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={lab} onChange={(e) => setLab(e.target.value)}
                  className="max-w-[13rem] truncate rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
                  <option value="">All labs</option>
                  {labs.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <button type="button" onClick={() => { setQ(''); setBrowse(null); setSection(''); setLab('') }}
                  className="text-sm font-medium text-accent hover:underline">Clear</button>
              </>
            )}
          </div>

          {nothingYet && (
            <p className="mt-3 text-sm text-muted">
              {loading
                ? 'Loading the directory…'
                : 'Start typing to search, or open one of the lists above.'}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {canAdd && !adding && (
              <button type="button" onClick={() => { setAdding(true); setMsg(null) }}
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
                Add a test
              </button>
            )}
            {canCurate && hiddenTests.length > 0 && (
              <button type="button" onClick={() => setReviewHidden(!reviewHidden)}
                className="text-sm font-medium text-muted hover:text-ink">
                {reviewHidden ? 'Close' : `${hiddenTests.length} entr${hiddenTests.length === 1 ? 'y' : 'ies'} hidden`}
              </button>
            )}
          </div>
        </div>

        {reviewHidden && canCurate && (
          <div className="border-t border-line px-5 py-4">
            <p className="text-sm text-muted">
              Taken out of the directory. These rows are still mirrored from the public site each week — they
              are not shown, searched, or counted in the gene and antibody lists. Deleting one instead would not
              hold: it is on the source site, so the next refresh would bring it back.
            </p>
            <ul className="mt-3 divide-y divide-line">
              {hiddenTests.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-4 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{t.test_name}</p>
                    <p className="text-muted">
                      {[t.lab_name, `${t.genes_or_antibodies.length} genes or antibodies`].filter(Boolean).join(' · ')}
                    </p>
                    {t.hidden_reason && <p className="mt-0.5 text-xs text-muted">{t.hidden_reason}</p>}
                  </div>
                  <button type="button" onClick={() => setHidden(t, false)}
                    className="shrink-0 text-sm font-medium text-accent hover:underline">
                    Show again
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {msg && (
          <p className="border-t border-line bg-accent-soft/40 px-5 py-2.5 text-sm text-ink">
            {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
          </p>
        )}

        {adding && canAdd && profile && (
          <AddDirectoryTest
            userId={profile.id}
            sections={sections}
            onError={setMsg}
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false)
              setMsg('Added. It is in the directory now and the weekly refresh will leave it alone.')
              loadTests()
            }}
          />
        )}
      </Card>

      {showGeneList && (
        <Card>
          <p className="border-b border-line px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            {browse === 'antibodies' ? 'Antibodies' : browse === 'genes' ? 'Genes' : 'Genes and antibodies'}
            {' '}({geneIndex.length})
          </p>
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
                <GeneLabs tests={ts} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showTestList && (
        <Card>
          <p className="border-b border-line px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Tests ({filteredTests.length})
          </p>
          {grouped.map(([sectionName, rows]) => (
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
                      {t.origin === 'local' && (
                        <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted"
                          title="Added by the fellowship — not from the public directory">
                          Added here
                        </span>
                      )}
                      <span className="mt-0.5 block text-muted">
                        {[t.lab_name, t.lab_city_province].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    {openId === t.id && (
                      <TestDetail
                        t={t}
                        onHide={canCurate && t.origin !== 'local' ? () => setHidden(t, true) : undefined}
                        canRemove={Boolean(canAdd && t.origin === 'local' &&
                          (t.added_by === profile?.id || profile?.role === 'director' || profile?.role === 'admin'))}
                        onRemove={async () => {
                          if (!window.confirm(`Remove “${t.test_name}” from the directory?`)) return
                          if (t.requisition_path) {
                            await supabase.storage.from('requisitions').remove([t.requisition_path])
                          }
                          const { error } = await supabase.from('neuro_test_directory').delete().eq('id', t.id)
                          if (error) { setMsg(error.message); return }
                          loadTests()
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {searching && !loading && !showGeneList && !showTestList && (
        <Card>
          <p className="px-5 py-4 text-sm text-muted">Nothing in the directory matches “{q.trim()}”.</p>
        </Card>
      )}

      {showGeneList && (
        <p className="text-xs text-muted">
          Disease names for genes come from the{' '}
          <a href={GENE_TABLE_URL} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
            Gene Table of Neuromuscular Disorders
          </a>{geneTableVersion ? ` (${geneTableVersion})` : ''} — Bonne, Rivier &amp; Hamroun, Sorbonne Université /
          Institut de Myologie and CHU de Montpellier — alongside the conditions the testing directory itself states.
        </p>
      )}

      {showGeneList && geneIndex.some(({ gene }) => (terms.get(gene.trim())?.added_conditions ?? []).length > 0) && (
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

/** Where a gene can be sent, grouped by laboratory.
 *
 *  A single lab often runs the same gene on several overlapping panels — one
 *  broad panel, one disease-specific — and listing each separately made the
 *  same lab appear three or four times under one gene, which reads as
 *  duplication. The lab is named once, with its panels beneath it. */
function GeneLabs({ tests }: { tests: DirectoryTest[] }) {
  const byLab = new Map<string, DirectoryTest[]>()
  for (const t of tests) {
    const key = t.lab_name ?? 'Laboratory not stated'
    byLab.set(key, [...(byLab.get(key) ?? []), t])
  }
  return (
    <ul className="mt-0.5 space-y-1">
      {Array.from(byLab.entries()).map(([labName, rows]) => (
        <li key={labName} className="text-muted">
          {labName}
          {rows.length > 1 && (
            <span className="ml-1.5 text-xs">
              · {rows.length} panels
            </span>
          )}
          <ul className="ml-3 space-y-0.5 border-l border-line pl-2">
            {rows.map((t) => (
              <li key={t.id} className="text-xs">
                {t.test_name}
                {t.requisition_pdf_url && (
                  <a href={t.requisition_pdf_url} target="_blank" rel="noreferrer"
                    className="ml-2 font-medium text-accent hover:underline">Requisition</a>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function TestDetail({ t, canRemove, onRemove, onHide }: {
  t: DirectoryTest
  canRemove?: boolean
  onRemove?: () => void
  /** Present for program direction, on mirrored entries only: a row that came
   *  from the public site cannot be deleted, because the next sync would bring
   *  it back. Hiding it is what sticks. */
  onHide?: () => void
}) {
  const [opening, setOpening] = useState(false)

  // An uploaded requisition lives in a private bucket, so it is opened through
  // a link minted for this reader and good for an hour — the same treatment
  // library documents get.
  async function openUpload() {
    if (!t.requisition_path) return
    setOpening(true)
    const { data, error } = await supabase.storage
      .from('requisitions').createSignedUrl(t.requisition_path, 3600)
    setOpening(false)
    if (error || !data?.signedUrl) return
    window.open(data.signedUrl, '_blank', 'noopener')
  }

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
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {t.requisition_path && (
          <button type="button" onClick={openUpload} disabled={opening}
            className="text-sm font-medium text-accent hover:underline disabled:opacity-50">
            {opening ? 'Opening…' : 'Requisition PDF →'}
          </button>
        )}
        {t.requisition_pdf_url && (
          <a href={t.requisition_pdf_url} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-accent hover:underline">
            {t.requisition_path ? 'Requisition on the lab’s site →' : 'Requisition PDF →'}
          </a>
        )}
        {t.lab_page_url && (
          <a href={t.lab_page_url} target="_blank" rel="noreferrer"
            className="text-sm font-medium text-accent hover:underline">Lab website →</a>
        )}
        {canRemove && onRemove && (
          <button type="button" onClick={onRemove}
            className="ml-auto text-sm font-medium text-red-600 hover:underline">Remove</button>
        )}
        {onHide && (
          <button type="button" onClick={onHide}
            title="Take this out of the directory. It stays in the database and can be put back."
            className="ml-auto text-sm font-medium text-muted hover:text-red-600">Hide from the directory</button>
        )}
      </div>
    </div>
  )
}
