// ---------------------------------------------------------------------------
// One-line identity strip for the selected muscle, shown under the layer
// legend and above the model.
//
// It carries the facts you want in view WHILE looking at the anatomy — name,
// roots, plexus chain, nerve, action — laid out horizontally so it costs one
// or two lines instead of a card, plus the insertion line underneath, which is
// the sentence a fellow is actually reading when they aim a needle.
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

export function MuscleSummaryBar({ muscle }: { muscle: EmgMuscle }) {
  // Cord › trunk › division reads as a path from the plexus outwards, which is
  // how it is traced clinically.
  const plexus = [muscle.cord, muscle.trunk, muscle.division].filter(Boolean).join(' › ')

  return (
    <div className="border-b border-line bg-accent-soft/25 px-5 py-3">
      {/* The divider TRAILS each item rather than leading the next one. With a
          leading divider, a row that wraps starts the new line with a dangling
          "|"; trailing it means the divider is left at the end of the previous
          line instead, where it reads as a continuation. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {(
          [
            <span key="name" className="font-display text-base font-semibold text-ink">
              {muscle.name}
            </span>,
            <Part key="roots" label="Roots" value={muscle.roots} />,
            plexus ? <Part key="plexus" label="Plexus" value={plexus} /> : null,
            <Part key="nerve" label="Nerve" value={muscle.nerve} />,
            muscle.action ? <Part key="action" label="Action" value={muscle.action} /> : null,
          ].filter(Boolean) as JSX.Element[]
        ).map((el, i, all) => (
          <span key={i} className="flex items-baseline gap-2">
            {el}
            {i < all.length - 1 && (
              <span aria-hidden="true" className="text-line">
                |
              </span>
            )}
          </span>
        ))}
      </div>

      {muscle.localization && (
        <p className="mt-1.5 text-sm text-ink">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Insertion{' '}
          </span>
          {muscle.localization}
        </p>
      )}
    </div>
  )
}
