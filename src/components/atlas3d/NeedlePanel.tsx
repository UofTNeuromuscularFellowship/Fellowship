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
import {
  canApproveMarkers,
  type NeedleMarker,
} from '../../lib/atlas3dMarkers'

export function NeedlePanel({
  muscleName,
  role,
  markers,
  placing,
  onTogglePlacing,
  activeId,
  onSetActive,
  onSave,
  onApprove,
  onDelete,
  busy,
  error,
}: {
  muscleName: string
  role?: string | null
  markers: NeedleMarker[]
  placing: boolean
  onTogglePlacing: () => void
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

  return (
    <Card>
      <CardHeader
        title="Needle markers"
        sub={`${muscleName} — faculty only`}
        action={
          <button
            onClick={onTogglePlacing}
            disabled={busy}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold ${
              placing
                ? 'bg-accent text-white'
                : 'border border-line text-muted hover:text-ink'
            }`}
          >
            {placing ? 'Click the model…' : 'Place a needle'}
          </button>
        }
      />

      <div className="space-y-3 px-5 py-4">
        {placing && (
          <div className="rounded-md bg-accent-soft/50 px-4 py-3">
            <p className="text-sm text-ink">
              Click the point on the muscle where the needle enters. The insertion angle is
              taken from the surface at that point, so click from the direction you would
              actually approach. Set the depth afterwards.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        {markers.length === 0 && !placing && (
          <p className="text-sm text-muted">
            No marker for this muscle yet. The written technique in the panel above remains
            the authority either way.
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
                <span className="text-xs text-muted">{m.meshName.replace(/_/g, ' ')}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
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
                  onClick={() => onDelete(m.id)}
                  disabled={busy}
                  className="ml-auto text-xs font-semibold text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>

              {approved && (
                <p className="mt-2 text-xs text-muted">
                  Moving this marker or changing its depth returns it to draft and needs
                  approving again.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
