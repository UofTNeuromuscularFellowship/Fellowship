// ---------------------------------------------------------------------------
// Shared per-study detail panel for nerve conduction studies.
//
// Extracted from the NCS guide page so the 3D Atlas renders exactly the same
// clinical content — settings, distance, normal limits, side-to-side and notes
// included. One copy, one place to change it; the two views must never drift
// apart on anything clinical.
//
// Technique is paraphrased and cut-offs are summarised from Buschbacher's
// Manual of Nerve Conduction Studies, 3rd ed. (Demos Medical Publishing). The
// book's full stratified reference tables are not reproduced. Values are for
// teaching only — validate against your own laboratory's normative data.
// ---------------------------------------------------------------------------

import { Card, CardHeader } from './ui/Card'
import { DiagramPlaceholder } from './DiagramPlaceholder'
import type { NerveStudy } from '../data/nerveGuide'

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

export function StudyDetail({
  study,
  showIdentity = true,
  showDiagram = true,
}: {
  study: NerveStudy
  /**
   * The 3D Atlas turns this off: the study's name, type, recording site and
   * electrode positions are already in the summary bar above the model there.
   */
  showIdentity?: boolean
  /** The model is the diagram on the 3D page, so the placeholder is noise. */
  showDiagram?: boolean
}) {
  const hasTechnique =
    study.recording || study.position || study.active || study.reference ||
    study.ground || study.distance || study.settings ||
    (study.stim && study.stim.length > 0)

  return (
    <div className="space-y-4">
      <Card>
        {showIdentity ? (
          <CardHeader title={study.name} sub={`${study.region} · ${study.type}`} />
        ) : (
          <CardHeader title="Technique" sub="Verify against your own laboratory's practice" />
        )}
        <div className="space-y-4 px-5 py-4">
          {showIdentity && study.roots && (
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

      {showDiagram && (
        <DiagramPlaceholder
          src={study.diagram}
          alt={`Electrode and stimulation placement for ${study.name}`}
          label="Electrode & stimulation placement"
          caption="A labelled diagram of the recording electrodes and stimulation site will appear here."
        />
      )}

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

