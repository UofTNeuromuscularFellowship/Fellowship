// ---------------------------------------------------------------------------
// One-line identity strip for the selected muscle, shown under the layer
// legend and above the model.
//
// It carries the facts you want in view WHILE looking at the anatomy — name,
// roots, plexus chain, nerve, action — laid out horizontally so it costs one
// or two lines instead of a card, plus the insertion line underneath — the
// sentence a fellow is actually reading when they aim a needle — and the
// pitfalls for that muscle directly beneath it.
//
// Because this exists, the identity card that used to sit under the model is
// switched off there (MuscleDetail's `showIdentity`), and the needle
// localization card moves to the top.
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
  footer,
  footers,
}: {
  name: string
  sub?: string | null
  parts: Array<{ label: string; value?: string | null }>
  /** Full-width lines under the details, in order. Empty values are dropped. */
  footer?: { label: string; value: string } | null
  footers?: Array<{ label: string; value?: string | null; tone?: 'ink' | 'caution' }>
}) {
  const shown = parts.filter((p) => p.value)
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
      {shown.length > 0 && (
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
      )}

      {[...(footer ? [{ label: footer.label, value: footer.value, tone: 'ink' as const }] : []),
        ...(footers ?? [])]
        .filter((f) => f.value)
        .map((f) => (
          <p
            key={f.label}
            className={`mt-1.5 text-sm ${f.tone === 'caution' ? 'text-amber-800' : 'text-ink'}`}
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
      parts={[
        { label: 'Roots', value: muscle.roots },
        { label: 'Plexus', value: plexus },
        { label: 'Nerve', value: muscle.nerve },
        { label: 'Action', value: muscle.action },
      ]}
      footer={muscle.localization ? { label: 'Insertion', value: muscle.localization } : null}
      // Pitfalls sit directly under the insertion line: what to avoid belongs
      // beside where to go in, not in a card further down the page that a
      // reader has already scrolled past by the time they aim the needle.
      footers={[{ label: 'Pitfalls', value: muscle.pitfalls, tone: 'caution' }]}
    />
  )
}
