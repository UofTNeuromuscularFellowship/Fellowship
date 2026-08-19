// ---------------------------------------------------------------------------
// 3D Atlas — interactive anatomy viewer for EMG needle localization and NCS.
//
// PHASE 0 SCAFFOLD. The route, the disclaimer gate, the WebGL fallback, the
// attribution requirement and the region skeleton are all real; the anatomy is
// not built yet. Phase 1 loads the upper-limb model into ViewerCanvas.
//
// Clinical content is NOT authored here. Needle-entry and electrode detail
// live in src/data/emgAtlas.ts and src/data/nerveGuide.ts, written and
// reviewed by faculty, and are displayed alongside the model.
//
// Model licensing/attribution: see LICENSES-3D.md at the repo root.
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../components/ui/Card'
import { AttributionDialog } from '../components/atlas3d/AttributionDialog'
import { detectWebgl, type WebglSupport } from '../components/atlas3d/webgl'
import { REGION_MODELS, ANY_REGION_READY } from '../data/atlas3d'

// three.js and R3F live behind this boundary so they stay out of the main
// bundle and are only fetched once a user has accepted the disclaimer.
const ViewerCanvas = lazy(() => import('../components/atlas3d/ViewerCanvas'))

const ACK_KEY = 'atlas3d:disclaimer-ack'

function readAck(): boolean {
  try {
    return sessionStorage.getItem(ACK_KEY) === '1'
  } catch {
    return false
  }
}

function writeAck() {
  try {
    sessionStorage.setItem(ACK_KEY, '1')
  } catch {
    /* Private-mode or blocked storage: the gate simply reappears. */
  }
}

// ---------------------------------------------------------------------------

function Disclaimer({ onAccept }: { onAccept: () => void }) {
  return (
    <Card>
      <CardHeader title="Before you use the 3D Atlas" sub="Please read — teaching tool, not clinical guidance" />
      <div className="space-y-4 px-5 py-4">
        <p className="text-sm text-ink">
          This atlas is an <span className="font-semibold">educational reference</span> for
          qualified clinicians and trainees learning EMG needle localization and nerve
          conduction technique. It is not medical advice and is not a substitute for
          supervised training.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
          <li>
            The 3D anatomy is a simplified, generic model. Real patients vary — landmarks must
            be confirmed on the patient in front of you.
          </li>
          <li>
            Needle-localization and electrode-placement detail comes from the written technique
            entries in the EMG atlas and NCS guide. Confirm technique against a primary
            anatomical source and your own laboratory&apos;s practice.
          </li>
          <li>
            Nothing here supports decisions about an individual patient&apos;s care. Clinical
            questions go to the supervising physician.
          </li>
        </ul>
        <div className="rounded-md bg-accent-soft/40 px-4 py-3">
          <p className="text-sm text-ink">
            Technique summaries in the linked atlas and guide are original paraphrases prepared
            for teaching, not reproductions of any published text or figures.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={onAccept}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            I understand — open the atlas
          </button>
          <Link to="/study" className="text-sm font-medium text-accent hover:underline">
            Back to study tools
          </Link>
        </div>
      </div>
    </Card>
  )
}

function NoWebgl({ reason }: { reason: string }) {
  return (
    <Card>
      <CardHeader title="3D view unavailable on this device" />
      <div className="space-y-3 px-5 py-4">
        <p className="text-sm text-ink">{reason}</p>
        <p className="text-sm text-ink">
          Nothing is lost clinically — every muscle and study in the 3D atlas carries the same
          text as the standard tools, which work on any device.
        </p>
        <Link
          to="/study"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Open study tools
        </Link>
      </div>
    </Card>
  )
}

function CanvasFallback({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper">
      <p className="text-sm text-muted">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function Atlas3D() {
  const [acked, setAcked] = useState<boolean>(() => readAck())
  const [webgl, setWebgl] = useState<WebglSupport | null>(null)
  const [regionId, setRegionId] = useState<string>(REGION_MODELS[0]?.id ?? '')
  const [attributionOpen, setAttributionOpen] = useState(false)

  // Deferred until the disclaimer is accepted: no reason to spin up a WebGL
  // context for someone who is about to navigate away.
  useEffect(() => {
    if (acked && webgl === null) setWebgl(detectWebgl())
  }, [acked, webgl])

  const region = useMemo(
    () => REGION_MODELS.find((r) => r.id === regionId) ?? REGION_MODELS[0],
    [regionId],
  )

  function accept() {
    writeAck()
    setAcked(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">3D Atlas</h1>
        <p className="mt-1 text-sm text-muted">
          Rotate and cross-section the anatomy behind EMG needle localization and nerve
          conduction studies
        </p>
      </div>

      {!acked ? (
        <Disclaimer onAccept={accept} />
      ) : webgl && !webgl.ok ? (
        <NoWebgl reason={webgl.reason} />
      ) : (
        <>
          <div className="rounded-md border border-line bg-accent-soft/30 px-4 py-3">
            <p className="text-sm text-ink">
              <span className="font-semibold">Build in progress. </span>
              The viewer, controls and licensing are in place; the anatomical models are being
              prepared region by region. Until a region is ready, use the{' '}
              <Link to="/study" className="font-medium text-accent hover:underline">
                study tools
              </Link>{' '}
              for the full clinical content.
            </p>
          </div>

          <Card>
            <CardHeader
              title={region?.label ?? 'Viewer'}
              sub={region?.ready ? 'Drag to rotate · scroll to zoom' : 'Model not built yet — placeholder scene'}
              action={
                <button
                  onClick={() => setAttributionOpen(true)}
                  className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
                >
                  Model sources
                </button>
              }
            />

            <div className="border-b border-line px-5 py-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Body region
                </span>
                <select
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none sm:max-w-xs"
                >
                  {REGION_MODELS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                      {r.ready ? '' : ' — not built yet'}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="h-[420px] w-full sm:h-[520px]">
              {webgl === null ? (
                <CanvasFallback message="Checking 3D support…" />
              ) : (
                <Suspense fallback={<CanvasFallback message="Loading viewer…" />}>
                  {region && <ViewerCanvas camera={region.defaultCamera} />}
                </Suspense>
              )}
            </div>

            <div className="border-t border-line px-5 py-3">
              <p className="text-xs text-muted">
                Educational reference for clinicians and trainees. Not medical advice — confirm
                landmarks and technique against a primary source and your own practice.
                {!ANY_REGION_READY && ' No anatomical model is loaded in this build.'}
              </p>
            </div>
          </Card>
        </>
      )}

      <AttributionDialog open={attributionOpen} onClose={() => setAttributionOpen(false)} />
    </div>
  )
}
