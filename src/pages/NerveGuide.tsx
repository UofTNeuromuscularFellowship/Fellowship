import { useMemo, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'
import { NERVE_STUDIES, REGION_ORDER, type NerveStudy } from '../data/nerveGuide'

// ---------------------------------------------------------------------------
// Digital nerve conduction study guide.
// Select a nerve from the dropdown (grouped by region) and its technique
// summary and concise normal-value cut-offs appear.
//
// Technique is paraphrased and cut-offs are summarised from Buschbacher's
// Manual of Nerve Conduction Studies, 3rd ed. (Demos Medical Publishing).
// The book's full stratified reference tables are not reproduced. Values are
// for teaching only — validate against your own laboratory's normative data.
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  )
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
      <ul className="mt-1 space-y-1">
        {items.map((it, idx) => (
          <li key={idx} className="flex gap-2 text-sm text-ink">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StudyDetail({ study }: { study: NerveStudy }) {
  const hasTechnique =
    study.recording || study.position || study.active || study.reference ||
    study.ground || study.distance || study.settings ||
    (study.stim && study.stim.length > 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={study.name} sub={`${study.region} · ${study.type}`} />
        <div className="space-y-4 px-5 py-4">
          {study.roots && (
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">Roots / trunk: </span>
              {study.roots}
            </p>
          )}

          {hasTechnique && (
            <div>
              <h3 className="font-display text-sm font-semibold text-ink">Technique</h3>
              <dl className="mt-1 divide-y divide-line/60">
                <Field label="Recording" value={study.recording} />
                <Field label="Active (G1)" value={study.active} />
                <Field label="Reference (G2)" value={study.reference} />
                <Field label="Ground" value={study.ground} />
                <Field label="Position" value={study.position} />
                <Field label="Distance" value={study.distance} />
                <Field label="Settings" value={study.settings} />
              </dl>
              {study.stim && study.stim.length > 0 && (
                <div className="mt-3">
                  <ListBlock title="Stimulation sites" items={study.stim} />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {(study.cutoffs?.length || study.sideToSide?.length) && (
        <Card>
          <CardHeader title="Normal values" sub="Concise key cut-offs — validate against your own lab" />
          <div className="space-y-4 px-5 py-4">
            <ListBlock title="Key normal limits (all subjects)" items={study.cutoffs} />
            <ListBlock title="Acceptable side-to-side / segment differences" items={study.sideToSide} />
            <p className="text-xs text-muted">
              Concise cut-offs summarised from Buschbacher's Manual of Nerve Conduction
              Studies, 3rd ed. Full age/sex/height-stratified tables are not reproduced —
              consult the manual and your own laboratory's reference values.
            </p>
          </div>
        </Card>
      )}

      {study.notes && (
        <Card>
          <div className="px-5 py-4">
            <h3 className="font-display text-sm font-semibold text-ink">Notes</h3>
            <p className="mt-1 text-sm text-ink">{study.notes}</p>
          </div>
        </Card>
      )}
    </div>
  )
}

export default function NerveGuide() {
  const [selectedId, setSelectedId] = useState<string>('')
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    return REGION_ORDER.map((region) => ({
      region,
      studies: NERVE_STUDIES
        .filter((s) => s.region === region)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.studies.length > 0)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as NerveStudy[]
    return NERVE_STUDIES.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [query])

  const current = NERVE_STUDIES.find((s) => s.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Nerve conduction study guide</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a nerve to see its recording technique and concise normal-value cut-offs
        </p>
      </div>

      <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
        <span className="font-semibold">Educational reference only.</span> Technique is
        paraphrased and normal limits are concise summaries adapted from{' '}
        <span className="italic">Buschbacher's Manual of Nerve Conduction Studies</span>, 3rd ed.
        (Demos Medical Publishing) — the book's full stratified tables are not reproduced.
        These summaries are not medical advice and do not diagnose any individual; always
        validate against your own laboratory's normative values, technique, and temperature.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Select a nerve study
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="">— Choose a nerve —</option>
            {grouped.map((g) => (
              <optgroup key={g.region} label={g.region}>
                {g.studies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Or search by name
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. median, sural, blink"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
          {matches.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-md border border-line bg-surface">
              {matches.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id)
                    setQuery('')
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-accent-soft/40"
                >
                  {s.name}
                  <span className="ml-2 text-xs text-muted">{s.region}</span>
                </button>
              ))}
            </div>
          )}
        </label>
      </div>

      {current ? (
        <StudyDetail study={current} />
      ) : (
        <p className="text-sm text-muted">
          {NERVE_STUDIES.length} studies available across {grouped.length} regions.
        </p>
      )}
    </div>
  )
}
