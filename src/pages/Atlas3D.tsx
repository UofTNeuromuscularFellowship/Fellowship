// ---------------------------------------------------------------------------
// 3D Atlas — interactive anatomy viewer for EMG needle localization.
//
// Pick a muscle from the list or click it on the model; it highlights in place
// among its neighbours, and the same clinical text the EMG atlas shows appears
// alongside (shared MuscleDetail component — the two views must never drift).
//
// The model carries NO needle-entry markers. Entry point, depth and activation
// come from the reviewed technique text. The 3D view answers "where is this
// muscle and what is next to it".
//
// Model licensing/attribution: see LICENSES-3D.md at the repo root.
// ---------------------------------------------------------------------------

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../components/ui/Card'
import { MuscleDetail } from '../components/MuscleDetail'
import { AttributionDialog } from '../components/atlas3d/AttributionDialog'
import { detectWebgl, type WebglSupport } from '../components/atlas3d/webgl'
import { REGION_MODELS, MESH_MAP, meshesFor } from '../data/atlas3d'
import { EMG_MUSCLES, type EmgMuscle } from '../data/emgAtlas'

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
    /* Blocked storage: the gate simply reappears. */
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
            The 3D anatomy is a simplified, generic model of one limb. Real patients vary —
            landmarks must be confirmed on the patient in front of you.
          </li>
          <li>
            <span className="font-semibold">No needle-entry points are marked on the model.</span>{' '}
            Insertion site, depth and activation come from the written technique entry shown
            beside it. Confirm against a primary anatomical source and your laboratory&apos;s
            practice.
          </li>
          <li>
            Nothing here supports decisions about an individual patient&apos;s care. Clinical
            questions go to the supervising physician.
          </li>
        </ul>
        <div className="rounded-md bg-accent-soft/40 px-4 py-3">
          <p className="text-sm text-ink">
            Technique summaries are original paraphrases prepared for teaching, not
            reproductions of any published text or figures.
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
          Nothing is lost clinically — every muscle in the 3D atlas carries the same text as the
          standard tools, which work on any device.
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

function CanvasMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper px-6 text-center">
      <p className="text-sm text-muted">{children}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function Atlas3D() {
  const [acked, setAcked] = useState<boolean>(() => readAck())
  const [webgl, setWebgl] = useState<WebglSupport | null>(null)
  const [regionId, setRegionId] = useState<string>(
    () => REGION_MODELS.find((r) => r.ready)?.id ?? REGION_MODELS[0]?.id ?? '',
  )
  const [selectedId, setSelectedId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const [layers, setLayers] = useState({ bones: true, nerves: true, vessels: false })
  const [isolate, setIsolate] = useState(true)
  const [sectionOn, setSectionOn] = useState(false)
  const [sectionPos, setSectionPos] = useState(0.5)
  const [sectionFlip, setSectionFlip] = useState(false)
  const [selectionCentre, setSelectionCentre] = useState<[number, number, number] | null>(null)
  const [viewCutSignal, setViewCutSignal] = useState(0)
  const [bounds, setBounds] = useState<{ minY: number; maxY: number; radius: number } | null>(null)
  const [attributionOpen, setAttributionOpen] = useState(false)

  useEffect(() => {
    if (acked && webgl === null) setWebgl(detectWebgl())
  }, [acked, webgl])

  const region = useMemo(
    () => REGION_MODELS.find((r) => r.id === regionId) ?? REGION_MODELS[0],
    [regionId],
  )

  // Muscles this region covers, whether or not they have a mesh.
  const regionMuscles = useMemo(
    () =>
      EMG_MUSCLES.filter((m) => region?.emgRegions.includes(m.region)).sort((a, b) =>
        a.region === b.region ? a.name.localeCompare(b.name) : a.region.localeCompare(b.region),
      ),
    [region],
  )

  const meshToTarget = useMemo(() => {
    const map: Record<string, string> = {}
    for (const e of MESH_MAP) {
      if (e.regionId !== region?.id || e.kind !== 'muscle') continue
      for (const n of e.meshNames) map[n] = e.targetId
    }
    return map
  }, [region])

  const selectedMeshes = useMemo(() => (selectedId ? meshesFor(selectedId) : []), [selectedId])
  const current: EmgMuscle | null = EMG_MUSCLES.find((m) => m.id === selectedId) ?? null
  const currentHas3d = selectedMeshes.length > 0

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as EmgMuscle[]
    return regionMuscles
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.nerve.toLowerCase().includes(q) ||
          m.roots.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [query, regionMuscles])

  const mappedCount = useMemo(
    () => regionMuscles.filter((m) => meshesFor(m.id).length > 0).length,
    [regionMuscles],
  )

  const section = useMemo(
    () => (sectionOn ? { position: sectionPos, flip: sectionFlip } : null),
    [sectionOn, sectionPos, sectionFlip],
  )

  // Jump the cut to the middle of the selected muscle's belly.
  function cutAtSelection() {
    if (!bounds || selectionCentre === null) return
    const span = bounds.maxY - bounds.minY
    if (span <= 0) return
    setSectionOn(true)
    setSectionPos(Math.min(1, Math.max(0, (selectionCentre[1] - bounds.minY) / span)))
  }

  function accept() {
    writeAck()
    setAcked(true)
  }

  if (!acked) {
    return (
      <div className="space-y-6">
        <Header />
        <Disclaimer onAccept={accept} />
      </div>
    )
  }

  if (webgl && !webgl.ok) {
    return (
      <div className="space-y-6">
        <Header />
        <NoWebgl reason={webgl.reason} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ---------------- viewer ---------------- */}
        <Card className="overflow-hidden">
          <CardHeader
            title={region?.label ?? 'Viewer'}
            sub={
              region?.ready
                ? `Right limb · ${mappedCount} of ${regionMuscles.length} muscles selectable · drag to rotate, scroll to zoom`
                : 'Model not built yet'
            }
            action={
              <button
                onClick={() => setAttributionOpen(true)}
                className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
              >
                Model sources
              </button>
            }
          />

          <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-3">
            {(
              [
                ['bones', 'Bones', '#E7E3DA'],
                ['nerves', 'Nerves', '#E8B62C'],
                ['vessels', 'Vessels', '#C0392B'],
              ] as const
            ).map(([key, label, swatch]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                />
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-sm border border-line"
                  style={{ backgroundColor: swatch }}
                />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isolate}
                onChange={(e) => setIsolate(e.target.checked)}
                className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
              />
              Fade other muscles
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={sectionOn}
                onChange={(e) => setSectionOn(e.target.checked)}
                className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
              />
              Cross-section
            </label>
            {selectedId && (
              <button
                onClick={() => setSelectedId('')}
                className="ml-auto text-xs font-semibold text-accent hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>

          {sectionOn && (
            <div className="space-y-2 border-b border-line bg-paper/60 px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Cut level
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.005}
                  value={sectionPos}
                  onChange={(e) => setSectionPos(Number(e.target.value))}
                  aria-label="Cross-section level along the limb"
                  className="h-2 min-w-[10rem] flex-1 cursor-pointer accent-accent"
                />
                <button
                  onClick={() => setViewCutSignal((n) => n + 1)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
                >
                  View cut face
                </button>
                <button
                  onClick={() => setSectionFlip((f) => !f)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
                >
                  Flip side
                </button>
                <button
                  onClick={cutAtSelection}
                  disabled={selectionCentre === null}
                  className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-accent disabled:cursor-not-allowed disabled:text-muted/50"
                >
                  Cut at this muscle
                </button>
              </div>
              <p className="text-xs text-muted">
                Drag to move the cut along the limb, or use the arrow keys. Cut surfaces show
                the interior of each structure — use it to read depth: what lies superficial and
                deep to your target at that level. Fading is turned off while sectioning so the
                tissue reads solid.
              </p>
            </div>
          )}

          <div className="relative h-[380px] w-full sm:h-[520px]">
            {!region?.ready || !region.glbPath ? (
              <CanvasMessage>
                This region&apos;s model has not been built yet. Its clinical text is available in
                the study tools.
              </CanvasMessage>
            ) : webgl === null ? (
              <CanvasMessage>Checking 3D support…</CanvasMessage>
            ) : (
              <Suspense fallback={<CanvasMessage>Loading anatomy…</CanvasMessage>}>
                <ViewerCanvas
                  glbPath={region.glbPath}
                  camera={region.defaultCamera}
                  selectedMeshes={selectedMeshes}
                  meshToTarget={meshToTarget}
                  onSelect={setSelectedId}
                  onHoverName={setHoverLabel}
                  layers={layers}
                  isolate={isolate}
                  section={section}
                  onBounds={setBounds}
                  onSelectionCentre={setSelectionCentre}
                  viewCutSignal={viewCutSignal}
                />
              </Suspense>
            )}

            {hoverLabel && (
              <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-ink/85 px-3 py-1.5 text-xs font-medium text-white">
                {hoverLabel}
              </div>
            )}
          </div>

          <div className="border-t border-line px-5 py-3">
            <p className="text-xs text-muted">
              Anatomy only — no needle-entry points are marked on the model. Educational
              reference; confirm landmarks and technique against a primary source and your own
              practice.
            </p>
          </div>
        </Card>

        {/* ---------------- picker ---------------- */}
        <div className="space-y-4">
          <Card>
            <div className="space-y-3 px-5 py-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Body region
                </span>
                <select
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value)
                    setSelectedId('')
                  }}
                  className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                >
                  {REGION_MODELS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                      {r.ready ? '' : ' — not built yet'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Search muscle, nerve or root
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. deltoid, ulnar, C8"
                  className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </label>

              {matches.length > 0 && (
                <div className="overflow-hidden rounded-md border border-line">
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
                      <span className="ml-2 text-xs text-muted">{m.nerve}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-72 overflow-y-auto rounded-md border border-line">
                {regionMuscles.map((m) => {
                  const has3d = meshesFor(m.id).length > 0
                  const active = m.id === selectedId
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedId(m.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                        active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-paper'
                      }`}
                    >
                      <span className="truncate">{m.name}</span>
                      {!has3d && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase text-muted">
                          no 3D
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ---------------- clinical detail ---------------- */}
      {current ? (
        <div className="space-y-4">
          {!currentHas3d && (
            <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
              <span className="font-semibold">3D view not available for this muscle.</span> It is
              not present as a separate structure in the source anatomical model, so nothing is
              highlighted rather than showing an approximate neighbour. The technique below is
              unaffected.
            </div>
          )}
          <MuscleDetail muscle={current} />
        </div>
      ) : (
        <Card>
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-muted">
              Select a muscle from the list, or click one on the model, to see its innervation and
              needle-localization technique.
            </p>
          </div>
        </Card>
      )}

      <AttributionDialog open={attributionOpen} onClose={() => setAttributionOpen(false)} />
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">3D Atlas</h1>
      <p className="mt-1 text-sm text-muted">
        Rotate the anatomy behind EMG needle localization — select a muscle to see it in place
      </p>
    </div>
  )
}
