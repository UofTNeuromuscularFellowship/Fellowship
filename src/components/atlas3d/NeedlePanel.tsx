// ---------------------------------------------------------------------------
// Needle-marker authoring and review panel.
//
// Visible only to supervisors and directors. The rules it enforces in the UI
// are also enforced in Postgres by RLS — this is the convenient path, not the
// security boundary.
//
//   supervisor  place and edit their own drafts
//   director    the same, plus approve
//   fellow      never sees this panel, and only ever sees approved markers
//
// Nothing here generates a coordinate. A marker exists because a clinician
// clicked a point on the anatomy.
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { Card, CardHeader } from '../ui/Card'
import { canApproveMarkers, type NeedleMarker } from '../../lib/atlas3dMarkers'
import { MARKER_COLORS, MARKER_LABELS, type ElectrodeKind } from './MarkerShapes'

const ELECTRODES: ElectrodeKind[] = ['stim', 'g1', 'g2', 'ground']

export function NeedlePanel({
  mode,
  targetName,
  electrodeKind,
  onElectrodeKind,
  role,
  markers,
  placing,
  onPlaceNew,
  onMove,
  activeId,
  onSetActive,
  onSave,
  onApprove,
  onDelete,
  busy,
  error,
}: {
  mode: 'emg' | 'ncs'
  targetName: string
  /** Which electrode the next NCS placement creates. Unused in EMG mode. */
  electrodeKind: ElectrodeKind
  onElectrodeKind: (k: ElectrodeKind) => void
  role?: string | null
  markers: NeedleMarker[]
  /** null, 'new', or the id of the marker being repositioned. */
  placing: null | 'new' | string
  onPlaceNew: () => void
  onMove: (id: string) => void
  activeId: string | null
  onSetActive: (id: string | null) => void
  onSave: (id: string, patch: { depthMm?: number; label?: string; note?: string }) => void
  onApprove: (id: string, approved: boolean) => void
  onDelete: (id: string) => void
  busy: boolean
  error: string | null
}) {
  const canApprove = canApproveMarkers(role)
  const [depthDraft, setDepthDraft] = useState<Record<string, string>>({})
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [labelDraft, setLabelDraft] = useState<Record<string, string>>({})

  return (
    <Card>
      <CardHeader
        title={mode === 'emg' ? 'Needle marker' : 'Electrode placement'}
        sub={`${targetName} — faculty only`}
        action={
          <button
            onClick={onPlaceNew}
            disabled={busy}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
              placing === 'new'
                ? 'bg-accent text-white'
                : 'border border-line text-muted hover:text-ink'
            }`}
          >
            {placing === 'new'
              ? 'Click the model…'
              : mode === 'emg'
                ? 'Place a needle'
                : `Place ${MARKER_LABELS[electrodeKind]}`}
          </button>
        }
      />

      <div className="space-y-3 px-5 py-4">
        {mode === 'ncs' && (
          <div className="flex flex-wrap gap-2">
            {ELECTRODES.map((k) => (
              <button
                key={k}
                onClick={() => onElectrodeKind(k)}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  electrodeKind === k
                    ? 'border-accent bg-accent-soft/50 text-accent'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full border border-line"
                  style={{ backgroundColor: MARKER_COLORS[k] }}
                />
                {MARKER_LABELS[k]}
              </button>
            ))}
          </div>
        )}

        {placing !== null && (
          <div className="rounded-md bg-accent-soft/50 px-4 py-3">
            <p className="text-sm text-ink">
              {mode === 'emg'
                ? placing === 'new'
                  ? 'Click the point on the muscle where the needle enters. Only the target muscle is clickable, so you can rotate freely without losing the point.'
                  : 'Click the new entry point for this needle.'
                : placing === 'new'
                  ? `Click where ${MARKER_LABELS[electrodeKind]} sits on the surface.`
                  : 'Click the new position for this electrode.'}{' '}
              The angle is taken from the surface at that point, so click from the direction
              you would actually approach.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        {markers.length === 0 && !placing && (
          <p className="text-sm text-muted">
            {mode === 'emg'
              ? 'No needle marker for this muscle yet.'
              : 'No electrodes placed for this study yet.'}{' '}
            The written technique in the panel above remains the authority either way.
          </p>
        )}

        {markers.map((m) => {
          const approved = m.status === 'approved'
          const depthValue = depthDraft[m.id] ?? String(m.depthMm)
          return (
            <div
              key={m.id}
              onMouseEnter={() => onSetActive(m.id)}
              onMouseLeave={() => onSetActive(null)}
              className={`rounded-md border px-4 py-3 ${
                m.id === activeId ? 'border-accent bg-accent-soft/30' : 'border-line'
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                    approved ? 'bg-accent-soft text-accent' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {approved ? 'Approved' : 'Draft — not visible to fellows'}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full border border-line"
                    style={{ backgroundColor: MARKER_COLORS[m.kind] }}
                  />
                  {MARKER_LABELS[m.kind]}
                </span>
                <span className="text-xs text-muted">{m.meshName.replace(/_/g, ' ')}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                {m.kind === 'needle' && (
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Depth (mm)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={150}
                    step={1}
                    value={depthValue}
                    onChange={(e) =>
                      setDepthDraft((d) => ({ ...d, [m.id]: e.target.value }))
                    }
                    className="mt-1 w-24 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                </label>
                )}

                {m.kind === 'needle' && (
                <button
                  onClick={() => {
                    const v = Number(depthValue)
                    if (Number.isFinite(v) && v > 0 && v <= 150) onSave(m.id, { depthMm: v })
                  }}
                  disabled={busy || depthValue === String(m.depthMm)}
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-accent disabled:cursor-not-allowed disabled:text-muted/50"
                >
                  Save depth
                </button>
                )}

                {canApprove && (
                  <button
                    onClick={() => onApprove(m.id, !approved)}
                    disabled={busy}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      approved
                        ? 'border border-line text-muted hover:text-ink'
                        : 'bg-accent text-white hover:opacity-90'
                    }`}
                  >
                    {approved ? 'Withdraw approval' : 'Approve'}
                  </button>
                )}

                <button
                  onClick={() => onMove(m.id)}
                  disabled={busy}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                    placing === m.id
                      ? 'bg-accent text-white'
                      : 'border border-line text-muted hover:text-ink'
                  }`}
                >
                  {placing === m.id ? 'Click new point…' : 'Move'}
                </button>

                <button
                  onClick={() => onDelete(m.id)}
                  disabled={busy}
                  className="ml-auto text-xs font-semibold text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>

              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Short label (optional)
                  </span>
                  <input
                    value={labelDraft[m.id] ?? m.label ?? ''}
                    onChange={(e) => setLabelDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                    placeholder="e.g. Standard approach"
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Landmarks &amp; cautions
                  </span>
                  <textarea
                    rows={3}
                    value={noteDraft[m.id] ?? m.note ?? ''}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                    placeholder="Surface landmarks, what to palpate first, what lies deep, what to avoid…"
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                </label>

                <button
                  onClick={() =>
                    onSave(m.id, {
                      label: labelDraft[m.id] ?? m.label ?? '',
                      note: noteDraft[m.id] ?? m.note ?? '',
                    })
                  }
                  disabled={
                    busy ||
                    ((labelDraft[m.id] ?? m.label ?? '') === (m.label ?? '') &&
                      (noteDraft[m.id] ?? m.note ?? '') === (m.note ?? ''))
                  }
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-accent disabled:cursor-not-allowed disabled:text-muted/50"
                >
                  Save notes
                </button>

                <p className="text-xs text-muted">
                  Notes stay with an approved marker and are shown to fellows. Text is kept
                  as written — nothing is generated or filled in.
                </p>
              </div>

              {approved && (
                <p className="mt-2 text-xs text-muted">
                  Moving this marker or changing its depth returns it to draft and needs
                  approving again. Editing the notes does not.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
