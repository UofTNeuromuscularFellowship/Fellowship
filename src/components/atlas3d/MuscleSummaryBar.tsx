// ---------------------------------------------------------------------------
// One-line identity strip for the selected muscle, shown under the layer
// legend and above the model.
//
// Two blocks separated by a rule:
//
//   above  what this muscle IS — roots, plexus, nerve, primary action
//   below  what you DO — position, insertion, activation, pitfalls
//
// The lower block is the entire content of MuscleDetail's "Needle localization"
// card, which is why the atlas switches that card (and the identity card, and
// the pitfalls card) off: everything a fellow reads while aiming a needle is in
// view beside the anatomy instead of scrolled past below it.
// ---------------------------------------------------------------------------

import type { EmgMuscle } from '../../data/emgAtlas'

function Part({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <span className="text-sm text-ink">
      <span className="font-semibold text-muted">{label}: </span>
      {value}
    </span>
  )
}

/**
 * Generic strip: the target's NAME on its own line, then its details wrapped
 * underneath. Used for both a muscle and an NCS study so the two modes read
 * the same way.
 */
export function SummaryBar({
  name,
  sub,
  parts,
  partsLayout = 'inline',
  footer,
  footers,
}: {
  name: string
  sub?: string | null
  parts: Array<{ label: string; value?: string | null }>
  /**
   * 'inline' wraps the details across as few lines as possible — right for a
   * nerve conduction montage, where the six electrode fields are short.
   * 'stacked' gives each its own line, which is what the muscle strip needs:
   * roots, plexus, nerve and action are read one at a time, not scanned as a
   * row.
   */
  partsLayout?: 'inline' | 'stacked'
  /** Full-width lines under the details, in order. Empty values are dropped. */
  footer?: { label: string; value: string } | null
  footers?: Array<{ label: string; value?: string | null; tone?: 'ink' | 'caution' }>
}) {
  const shown = parts.filter((p) => p.value)
  const lines = [
    ...(footer ? [{ label: footer.label, value: footer.value, tone: 'ink' as const }] : []),
    ...(footers ?? []),
  ].filter((f) => f.value)
  return (
    <div className="border-b border-line bg-accent-soft/25 px-5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-display text-base font-semibold text-ink">{name}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </div>

      {/* The divider TRAILS each item rather than leading the next one. With a
          leading divider, a row that wraps starts the new line with a dangling
          "|"; trailing it leaves the divider at the end of the previous line,
          where it reads as a continuation. */}
      {shown.length > 0 &&
        (partsLayout === 'stacked' ? (
          <div className="mt-1 space-y-0.5">
            {shown.map((p) => (
              <p key={p.label}>
                <Part label={p.label} value={p.value} />
              </p>
            ))}
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {shown.map((p, i) => (
              <span key={p.label} className="flex items-baseline gap-2">
                <Part label={p.label} value={p.value} />
                {i < shown.length - 1 && (
                  <span aria-hidden="true" className="text-line">
                    |
                  </span>
                )}
              </span>
            ))}
          </div>
        ))}

      {/* A rule separates WHAT THIS MUSCLE IS (roots, plexus, nerve, primary
          action) from WHAT YOU DO (position, insertion, activation) — two
          different kinds of fact that were previously running together. */}
      {lines.length > 0 && (
        <>
          <hr className="mt-2.5 border-t border-line" />
          <div className="mt-2 space-y-1.5">
            {lines.map((f) => (
              <p
                key={f.label}
                className={`text-sm ${f.tone === 'caution' ? 'text-amber-800' : 'text-ink'}`}
              >
                <span
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    f.tone === 'caution' ? 'text-amber-700' : 'text-muted'
                  }`}
                >
                  {f.label}{' '}
                </span>
                {f.value}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function MuscleSummaryBar({ muscle }: { muscle: EmgMuscle }) {
  // Cord › trunk › division reads as a path from the plexus outwards, which is
  // how it is traced clinically.
  const plexus = [muscle.cord, muscle.trunk, muscle.division].filter(Boolean).join(' › ')
  return (
    <SummaryBar
      name={muscle.name}
      sub={muscle.region}
      // What this muscle is, one fact per line. Primary action belongs here
      // rather than below the rule: it is a property of the muscle, not a step
      // in the procedure — and it is what confirms you are on the right muscle
      // when the needle is in.
      parts={[
        { label: 'Roots', value: muscle.roots },
        { label: 'Plexus', value: plexus },
        { label: 'Nerve', value: muscle.nerve },
        { label: 'Primary Action', value: muscle.action },
      ]}
      partsLayout="stacked"
      // Below the rule: everything you do at the bedside, in the order you do
      // it. This is the whole of the old "Needle localization" card, which is
      // why that card is switched off in the 3D Atlas — Position included, so
      // removing the card drops nothing.
      footers={[
        { label: 'Position', value: muscle.position },
        { label: 'Insertion', value: muscle.localization },
        { label: 'Activation', value: muscle.maneuver },
        { label: 'Pitfalls', value: muscle.pitfalls, tone: 'caution' },
      ]}
    />
  )
}
