import { useState } from 'react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Adding a test to the diagnostic directory from inside the portal.
//
// The directory is a weekly mirror of a public site the fellowship does not
// control, and the sync deletes any row the site no longer lists. Rows written
// here are marked origin='local', which is what the sync now skips — so a test
// added by hand survives every refresh. The database enforces it too: the
// insert policy only accepts a row that is local and owned by the person
// adding it, so nothing written from the portal can pose as mirrored.
//
// Nothing is guessed. Every field is what the person typed, and the ones they
// leave blank are stored blank rather than filled with a plausible default.
// ---------------------------------------------------------------------------

const BUCKET = 'requisitions'
/** Matches the requisitions the public directory links to. */
const ACCEPT = '.pdf,application/pdf'
const MAX_BYTES = 20 * 1024 * 1024

/** `modality` is a generated column: the database reads it out of test_type
 *  and test_name. These are the words that make it land on the right answer,
 *  which is what keeps an antibody test out of the genetics lists. */
const KINDS = [
  { key: 'antibody', label: 'Antibody / serology', testType: 'Antibody testing' },
  { key: 'genetic', label: 'Genetic', testType: 'Genetic testing' },
  { key: 'other', label: 'Something else', testType: 'Other' },
] as const

type Kind = (typeof KINDS)[number]['key']

/** Comma or newline separated free text into a clean list. */
function toList(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
  ))
}

export function AddDirectoryTest({ userId, sections, onDone, onCancel, onError }: {
  userId: string
  /** Sections already in the directory, offered so a new test files itself
   *  alongside the existing ones instead of starting a section of one. */
  sections: string[]
  onDone: () => void
  onCancel: () => void
  onError: (m: string) => void
}) {
  const [kind, setKind] = useState<Kind>('genetic')
  const [testName, setTestName] = useState('')
  const [genes, setGenes] = useState('')
  const [conditions, setConditions] = useState('')
  const [sectionChoice, setSectionChoice] = useState('')
  const [newSection, setNewSection] = useState('')
  const [labName, setLabName] = useState('')
  const [labCity, setLabCity] = useState('')
  const [labUrl, setLabUrl] = useState('')
  const [reqUrl, setReqUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [method, setMethod] = useState('')
  const [funding, setFunding] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const label = 'mb-1 block text-xs font-medium text-muted'
  const field = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink'

  async function save() {
    const name = testName.trim()
    const lab = labName.trim()
    const geneList = toList(genes)
    const section = (sectionChoice === '__new' ? newSection : sectionChoice).trim()

    if (!name) { onError('Give the test a name.'); return }
    if (geneList.length === 0) { onError('List at least one gene or antibody this test covers.'); return }
    if (!lab) { onError('Name the laboratory that performs the test.'); return }
    if (file && file.size > MAX_BYTES) { onError('That requisition is larger than 20 MB.'); return }

    setBusy(true)

    // The form is uploaded first: a row pointing at a file that failed to
    // upload would show a broken requisition link to everyone.
    let path: string | null = null
    if (file) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      path = `${crypto.randomUUID()}-${safe}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      })
      if (error) { setBusy(false); onError(`The requisition did not upload: ${error.message}`); return }
    }

    const base = KINDS.find((k) => k.key === kind)!.testType
    const { error } = await supabase.from('neuro_test_directory').insert({
      id: `local-${crypto.randomUUID()}`,
      origin: 'local',
      added_by: userId,
      added_at: new Date().toISOString(),
      test_name: name,
      // The method the person typed is appended rather than replacing the kind,
      // so the generated modality column still reads the right word.
      test_type: method.trim() ? `${base} — ${method.trim()}` : base,
      primary_section: section || null,
      genes_or_antibodies: geneList,
      conditions: toList(conditions),
      lab_name: lab,
      lab_city_province: labCity.trim() || null,
      lab_page_url: labUrl.trim() || null,
      requisition_pdf_url: reqUrl.trim() || null,
      requisition_path: path,
      funding_or_cost: funding.trim() || null,
      ontario_vs_out_of_province: eligibility.trim() || null,
      notes: notes.trim() || null,
      // Locally added tests sort after the mirrored ones inside their section.
      sort_order: 1000,
    })

    setBusy(false)
    if (error) {
      // Don't strand the uploaded file if the row was refused.
      if (path) await supabase.storage.from(BUCKET).remove([path])
      onError(error.message)
      return
    }
    onDone()
  }

  return (
    <div className="space-y-4 border-t border-line px-5 py-4">
      <p className="text-sm text-muted">
        This test will sit alongside the mirrored entries, marked as added by the program. The weekly refresh of
        the public directory leaves it alone.
      </p>

      <div>
        <span className={label}>What kind of test is this?</span>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              aria-pressed={kind === k.key}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                kind === k.key ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink hover:border-accent'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          This is what keeps an antibody test out of the genetics results, and out of the gene list.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="dt-name">Test name</label>
        <input id="dt-name" value={testName} onChange={(e) => setTestName(e.target.value)}
          placeholder="As the laboratory calls it on the requisition" className={field} />
      </div>

      <div>
        <label className={label} htmlFor="dt-genes">
          {kind === 'antibody' ? 'Antibodies covered' : 'Genes or antibodies covered'}
        </label>
        <textarea id="dt-genes" value={genes} onChange={(e) => setGenes(e.target.value)} rows={2}
          placeholder="One per line, or separated by commas"
          className={field} />
        <p className="mt-1 text-xs text-muted">
          Each one becomes searchable on its own. Full names and disease associations are filled in
          automatically on the weekly run for symbols the gene databases recognise.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="dt-conditions">Conditions it is used for (optional)</label>
        <input id="dt-conditions" value={conditions} onChange={(e) => setConditions(e.target.value)}
          placeholder="Separated by commas" className={field} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[14rem] flex-1">
          <label className={label} htmlFor="dt-section">Section</label>
          <select id="dt-section" value={sectionChoice} onChange={(e) => setSectionChoice(e.target.value)} className={field}>
            <option value="">— none —</option>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="__new">Add a new section…</option>
          </select>
        </div>
        {sectionChoice === '__new' && (
          <div className="min-w-[14rem] flex-1">
            <label className={label} htmlFor="dt-newsection">New section name</label>
            <input id="dt-newsection" value={newSection} onChange={(e) => setNewSection(e.target.value)} className={field} />
          </div>
        )}
      </div>

      <div className="rounded-md border border-line bg-paper px-4 py-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Where the testing is done</p>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[14rem] flex-1">
              <label className={label} htmlFor="dt-lab">Laboratory</label>
              <input id="dt-lab" value={labName} onChange={(e) => setLabName(e.target.value)} className={field} />
            </div>
            <div className="min-w-[10rem] flex-1">
              <label className={label} htmlFor="dt-city">City and province</label>
              <input id="dt-city" value={labCity} onChange={(e) => setLabCity(e.target.value)}
                placeholder="e.g. London, ON" className={field} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="dt-laburl">Laboratory web page (optional)</label>
            <input id="dt-laburl" value={labUrl} onChange={(e) => setLabUrl(e.target.value)}
              placeholder="https://" className={field} />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-line bg-paper px-4 py-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Requisition</p>
        <div>
          <label className={label} htmlFor="dt-file">Upload the form (PDF, up to 20 MB)</label>
          <input id="dt-file" type="file" accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink" />
        </div>
        <p className="my-2 text-xs text-muted">or</p>
        <div>
          <label className={label} htmlFor="dt-requrl">Link to the form on the lab's site</label>
          <input id="dt-requrl" value={reqUrl} onChange={(e) => setReqUrl(e.target.value)}
            placeholder="https://" className={field} />
          <p className="mt-1 text-xs text-muted">
            A link stays current when the lab reissues the form; an upload keeps working if their site moves it.
            Both can be given.
          </p>
        </div>
      </div>

      <details className="rounded-md border border-line px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Eligibility, cost and notes <span className="font-normal text-muted">— optional</span>
        </summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className={label} htmlFor="dt-elig">Who is eligible</label>
              <input id="dt-elig" value={eligibility} onChange={(e) => setEligibility(e.target.value)} className={field} />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label className={label} htmlFor="dt-fund">Funding or cost</label>
              <input id="dt-fund" value={funding} onChange={(e) => setFunding(e.target.value)} className={field} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="dt-method">Method, if it matters</label>
            <input id="dt-method" value={method} onChange={(e) => setMethod(e.target.value)}
              placeholder="e.g. cell-based assay, NGS panel, repeat expansion" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="dt-notes">Notes</label>
            <textarea id="dt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Turnaround, sample requirements, who to call" className={field} />
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? 'Adding…' : 'Add to the directory'}
        </button>
        <button onClick={onCancel} className="text-sm font-medium text-muted hover:text-ink">Cancel</button>
      </div>
    </div>
  )
}
