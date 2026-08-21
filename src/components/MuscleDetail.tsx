// ---------------------------------------------------------------------------
// Shared per-muscle detail panel.
//
// Extracted from the EMG atlas page so the 3D Atlas renders exactly the same
// clinical content. One copy, one place to change it - the two views must never
// drift apart on anything clinical.
// ---------------------------------------------------------------------------

import { Card, CardHeader } from './ui/Card'
import { DiagramPlaceholder } from './DiagramPlaceholder'
import type { EmgMuscle } from '../data/emgAtlas'

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

export function MuscleDetail({
  muscle,
  showDiagram = true,
  showIdentity = true,
}: {
  muscle: EmgMuscle
  /**
   * The 3D Atlas turns this off: the model IS the diagram there, so an empty
   * "a diagram will appear here" placeholder is just noise next to it.
   * The text atlas keeps it.
   */
  showDiagram?: boolean
  /**
   * The 3D Atlas turns this off too: name, roots, plexus, nerve and action are
   * already in the summary bar above the model there, so repeating them in a
   * card underneath just pushes the needle-localization detail down the page.
   */
  showIdentity?: boolean
}) {
  const chain = chainParts(muscle)
  return (
    <div className="space-y-4">
      {showIdentity && (
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
      )}

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

      {showDiagram && (
        <DiagramPlaceholder
          src={muscle.diagram}
          alt={`Needle insertion site for ${muscle.name}`}
          label="Needle insertion diagram"
          caption="A labelled diagram of the needle insertion site will appear here."
        />
      )}

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
