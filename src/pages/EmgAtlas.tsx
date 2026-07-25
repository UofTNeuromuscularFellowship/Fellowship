import { useMemo, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'
import { DiagramPlaceholder } from '../components/DiagramPlaceholder'
import { EMG_MUSCLES, EMG_REGION_ORDER, EMG_REGION_GROUPS, type EmgMuscle } from '../data/emgAtlas'

// ---------------------------------------------------------------------------
// EMG needle-localization atlas.
// Select a muscle (dropdown grouped by body region, or search) and its
// innervation, needle-localization technique and clinical notes appear.
//
// Innervation/roots are anatomical facts; technique is paraphrased and
// summarised from Perotto/Delagi, Anatomical Guide for the Electromyographer,
// 5th ed. (Charles C Thomas). The book's text and figures are not reproduced.
// For teaching only — confirm against a primary source and your own practice.
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-1.5 sm:grid-cols-[8.5rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  )
}

function chainParts(m: EmgMuscle): string {
  return [m.cord, m.trunk, m.division].filter(Boolean).join(' · ')
}

function MuscleDetail({ muscle }: { muscle: EmgMuscle }) {
  const chain = chainParts(muscle)
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={muscle.name} sub={muscle.region} />
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-md bg-accent-soft/40 px-4 py-3">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p className="text-sm text-ink">
                <span className="font-semibold">Nerve: </span>{muscle.nerve}
              </p>
              <p className="text-sm text-ink">
                <span className="font-semibold">Roots: </span>{muscle.roots}
              </p>
              {chain && (
                <p className="text-sm text-ink sm:col-span-2">
                  <span className="font-semibold">Plexus: </span>{chain}
                </p>
              )}
            </div>
          </div>

          {muscle.action && (
            <Field label="Action" value={muscle.action} />
          )}
        </div>
      </Card>

      {(muscle.position || muscle.localization || muscle.maneuver) && (
        <Card>
          <CardHeader title="Needle localization" sub="Verify landmarks against a primary source" />
          <div className="px-5 py-4">
            <dl className="divide-y divide-line/60">
              <Field label="Position" value={muscle.position} />
              <Field label="Insertion" value={muscle.localization} />
              <Field label="Activation" value={muscle.maneuver} />
            </dl>
          </div>
        </Card>
      )}

      <DiagramPlaceholder
        src={muscle.diagram}
        alt={`Needle insertion site for ${muscle.name}`}
        label="Needle insertion diagram"
        caption="A labelled diagram of the needle insertion site will appear here."
      />

      {muscle.pitfalls && (
        <Card>
          <div className="px-5 py-4">
            <h3 className="font-display text-sm font-semibold text-ink">Pitfalls &amp; cautions</h3>
            <p className="mt-1 text-sm text-ink">{muscle.pitfalls}</p>
          </div>
        </Card>
      )}

      {muscle.pearls && (
        <Card>
          <div className="px-5 py-4">
            <h3 className="font-display text-sm font-semibold text-ink">Clinical pearls</h3>
            <p className="mt-1 text-sm text-ink">{muscle.pearls}</p>
          </div>
        </Card>
      )}
    </div>
  )
}

export default function EmgAtlas() {
  const [selectedId, setSelectedId] = useState<string>('')
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    return EMG_REGION_ORDER.map((region) => ({
      region,
      muscles: EMG_MUSCLES.filter((m) => m.region === region).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.muscles.length > 0)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as EmgMuscle[]
    return EMG_MUSCLES.filter(
      (m) => m.name.toLowerCase().includes(q) || m.nerve.toLowerCase().includes(q) || m.roots.toLowerCase().includes(q),
    ).slice(0, 10)
  }, [query])

  const current = EMG_MUSCLES.find((m) => m.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">EMG needle-localization atlas</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a muscle to see its innervation, needle localization and clinical notes
        </p>
      </div>

      <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
        <span className="font-semibold">Educational reference only.</span> Adapted from{' '}
        <span className="italic">Perotto/Delagi, Anatomical Guide for the Electromyographer</span>,
        5th ed. (Charles C Thomas). Not medical advice and no substitute for hands-on training —
        confirm landmarks against a primary anatomical source and your own supervised practice.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Select a muscle</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="">— Choose a muscle —</option>
            {EMG_REGION_GROUPS.map((grp) => (
              <optgroup key={grp.group} label={`━━ ${grp.group} ━━`}>
                {grouped
                  .filter((g) => grp.regions.includes(g.region))
                  .flatMap((g) =>
                    g.muscles.map((m) => (
                      <option key={m.id} value={m.id}>
                        {g.region} · {m.name}
                      </option>
                    )),
                  )}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Or search by muscle, nerve or root
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. deltoid, ulnar, C8, L5"
            className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
          {matches.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-md border border-line bg-surface">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedId(m.id)
                    setQuery('')
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-accent-soft/40"
                >
                  {m.name}
                  <span className="ml-2 text-xs text-muted">{m.region} · {m.nerve}</span>
                </button>
              ))}
            </div>
          )}
        </label>
      </div>

      {current ? (
        <MuscleDetail muscle={current} />
      ) : (
        <p className="text-sm text-muted">
          {EMG_MUSCLES.length} muscles across {grouped.length} regions.
        </p>
      )}
    </div>
  )
}
