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

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../components/ui/Card'
import { MuscleDetail } from '../components/MuscleDetail'
import { StudyDetail } from '../components/StudyDetail'
import { NeedlePanel } from '../components/atlas3d/NeedlePanel'
import type { ElectrodeKind } from '../components/atlas3d/MarkerShapes'
import { MarkerCallouts, type ScreenPos } from '../components/atlas3d/MarkerCallouts'
import { MuscleSummaryBar, SummaryBar } from '../components/atlas3d/MuscleSummaryBar'
import { NERVE_STUDIES, type NerveStudy } from '../data/nerveGuide'
import { abbrFor, nerveFor, recordingMusclesFor } from '../data/ncsStudyIndex'
import { useAuth } from '../context/AuthContext'
import {
  canAuthorMarkers,
  canPublishMarker,
  createMarker,
  deleteMarker,
  listMarkers,
  renameApproach,
  updateMarker,
  type NeedleMarker,
} from '../lib/atlas3dMarkers'
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
  const [mode, setMode] = useState<'emg' | 'ncs'>('emg')
  const [studyId, setStudyId] = useState('')
  const [electrodeKind, setElectrodeKind] = useState<ElectrodeKind>('g1')
  const [approach, setApproach] = useState('Standard')
  const [screenPos, setScreenPos] = useState<Record<string, ScreenPos>>({})
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })
  const [query, setQuery] = useState('')
  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const [layers, setLayers] = useState({ bones: true, nerves: true, vessels: false })
  const [isolate, setIsolate] = useState(true)
  const [sectionOn, setSectionOn] = useState(false)
  const [sectionPos, setSectionPos] = useState(0.5)
  const [sectionFlip, setSectionFlip] = useState(false)
  const [selectionCentre, setSelectionCentre] = useState<[number, number, number] | null>(null)
  const [viewCutSignal, setViewCutSignal] = useState(0)
  /** Left-drag pans instead of rotating. Right-drag pans either way. */
  const [panMode, setPanMode] = useState(false)
  const [studyQuery, setStudyQuery] = useState('')
  const [studyGroupBy, setStudyGroupBy] = useState<'nerve' | 'region'>('nerve')
  const [resetSignal, setResetSignal] = useState(0)
  const [centreSignal, setCentreSignal] = useState(0)

  const { profile } = useAuth()
  const mayAuthor = canAuthorMarkers(profile?.role)
  const [markers, setMarkers] = useState<NeedleMarker[]>([])
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null)
  // null = not placing. 'new' = next click creates a marker. Otherwise the id
  // of the marker whose position the next click replaces.
  const [placing, setPlacing] = useState<null | 'new' | string>(null)
  /** When true the next placement drops a named landmark rather than hardware. */
  const [landmarkMode, setLandmarkMode] = useState(false)
  const [markerBusy, setMarkerBusy] = useState(false)
  const [markerError, setMarkerError] = useState<string | null>(null)
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

  // In nerve conduction mode the highlight is not a choice the user makes: it
  // is the muscle the selected study RECORDS from, taken from the reviewed
  // NCS_STUDY_INDEX. Clicking anatomy does not change it — a highlight that
  // disagreed with the study's own recording site would be worse than none.
  // Sensory studies record from skin and so highlight nothing.
  const ncsMuscleIds = useMemo(
    () => (mode === 'ncs' && studyId ? recordingMusclesFor(studyId) : []),
    [mode, studyId],
  )

  const selectedMeshes = useMemo(() => {
    if (mode === 'ncs') return ncsMuscleIds.flatMap((id) => meshesFor(id))
    return selectedId ? meshesFor(selectedId) : []
  }, [mode, ncsMuscleIds, selectedId])

  const current: EmgMuscle | null = EMG_MUSCLES.find((m) => m.id === selectedId) ?? null
  const currentHas3d = mode === 'emg' && selectedMeshes.length > 0

  const searching = query.trim().length > 0

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

  // RLS decides what comes back here: fellows get approved markers only.
  // A failure must not break the atlas, so it degrades to "no markers".
  useEffect(() => {
    if (!acked || !region?.ready) return
    let cancelled = false
    listMarkers(region.id)
      .then((rows) => {
        if (!cancelled) setMarkers(rows)
      })
      .catch((e) => {
        if (!cancelled) setMarkerError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [acked, region?.id, region?.ready])

  const targetMarkers = useMemo(
    () =>
      mode === 'emg'
        ? markers.filter((m) => m.muscleId === selectedId)
        : markers.filter((m) => m.studyId === studyId),
    [markers, mode, selectedId, studyId],
  )

  /** Every named approach this target has markers for, plus the current one. */
  const approaches = useMemo(() => {
    const names = new Set<string>(['Standard'])
    for (const m of targetMarkers) if (m.kind !== 'landmark') names.add(m.approach)
    names.add(approach)
    return [...names].sort()
  }, [targetMarkers, approach])

  /**
   * The approaches a READER can actually look at: the named approaches that
   * have a marker this person is allowed to see. RLS already filtered the
   * markers, so a fellow's list contains only approved work.
   *
   * Deliberately not `approaches` above — that one always carries 'Standard'
   * and whatever the author is currently drafting, which is right for the
   * authoring panel and wrong for a switcher, where an approach with nothing
   * behind it is a dead chip.
   */
  const viewerApproaches = useMemo(() => {
    const names = new Set<string>()
    for (const m of targetMarkers) if (m.kind !== 'landmark') names.add(m.approach)
    return [...names].sort()
  }, [targetMarkers])

  // Landmarks are shown with every approach — a bony point does not belong to
  // one technique. Everything else is filtered to the selected approach.
  const visibleMarkers = useMemo(
    () => targetMarkers.filter((m) => m.kind === 'landmark' || m.approach === approach),
    [targetMarkers, approach],
  )

  const regionStudies = useMemo(
    () => (region ? NERVE_STUDIES.filter((st) => region.ncsRegions.includes(st.region)) : []),
    [region],
  )

  const currentStudy = useMemo(
    () => regionStudies.find((st) => st.id === studyId) ?? null,
    [regionStudies, studyId],
  )

  // Search covers the fields a reader would name a study by: its own name, the
  // nerve, the recording site, the roots and the study type.
  const studyMatches = useMemo(() => {
    const q = studyQuery.trim().toLowerCase()
    if (!q) return regionStudies
    // A short query is an abbreviation or a root ("TA", "C8"), not a fragment:
    // matched as a whole word, it finds the study; matched as a substring it
    // also returns every study with "ta" somewhere inside a word, which buries
    // the one that was wanted.
    const short = q.length <= 3
    const word = short ? new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) : null
    return regionStudies.filter((st) => {
      const abbr = abbrFor(st.id)
      if (abbr.some((a) => a.toLowerCase() === q)) return true
      const hay = [st.name, nerveFor(st.id), abbr.join(' '), st.type, st.recording ?? '', st.roots ?? '']
        .join('  ')
        .toLowerCase()
      return word ? word.test(hay) : hay.includes(q)
    })
  }, [studyQuery, regionStudies])

  /** Matching studies bucketed by nerve (or by the guide's own region order). */
  const studyGroups = useMemo(() => {
    const by = new Map<string, NerveStudy[]>()
    for (const st of studyMatches) {
      const key = studyGroupBy === 'nerve' ? nerveFor(st.id) || 'Other' : st.region
      const list = by.get(key)
      if (list) list.push(st)
      else by.set(key, [st])
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [studyMatches, studyGroupBy])

  const approvedMarker = useMemo(
    () => visibleMarkers.find((m) => m.status === 'approved') ?? null,
    [visibleMarkers],
  )

  // Moving to a different muscle or study lands on an approach that target
  // actually has, rather than carrying the last one over and showing an empty
  // model. Keyed on the target only: re-picking whenever the approach list
  // changes would yank an author off a new approach the moment they named it.
  const lastTarget = useRef<string>('')
  useEffect(() => {
    const target = `${mode}:${mode === 'emg' ? selectedId : studyId}`
    if (target === lastTarget.current) return
    lastTarget.current = target
    setApproach(viewerApproaches[0] ?? 'Standard')
  }, [mode, selectedId, studyId, viewerApproaches])

  /**
   * Markers that a rename would have to move: everything in the current
   * approach except landmarks, which are shared across all approaches and must
   * keep their own name.
   */
  const approachMarkers = useMemo(
    () => targetMarkers.filter((m) => m.kind !== 'landmark' && m.approach === approach),
    [targetMarkers, approach],
  )

  // Offered only when there is something to rename AND every marker in the
  // approach is one this person may edit — a half-completed rename would leave
  // the approach split across two names.
  const canRenameApproach =
    approachMarkers.length > 0 &&
    approachMarkers.every((m) => canPublishMarker(profile?.role, profile?.id, m))

  async function handleRenameApproach(to: string) {
    const name = to.trim()
    if (!name || name === approach) return
    // Merging into an existing approach would put two approved markers of the
    // same kind in one approach, which the database's unique index rejects with
    // a constraint error nobody can act on.
    if (viewerApproaches.some((a) => a.toLowerCase() === name.toLowerCase())) {
      setMarkerError(`"${name}" already exists for this target. Pick a different name.`)
      return
    }
    setMarkerBusy(true)
    setMarkerError(null)
    try {
      const updated = await renameApproach(approachMarkers.map((m) => m.id), name)
      const byId = new Map(updated.map((m) => [m.id, m]))
      setMarkers((all) => all.map((m) => byId.get(m.id) ?? m))
      setApproach(name)
    } catch (e) {
      setMarkerError(e instanceof Error ? e.message : String(e))
    } finally {
      setMarkerBusy(false)
    }
  }

  async function handlePlaceNeedle(p: {
    meshName: string
    local: [number, number, number]
    direction: [number, number, number]
  }) {
    const target = mode === 'emg' ? selectedId : studyId
    if (!region || !target || !profile) return
    const placingKind: ElectrodeKind =
      landmarkMode ? 'landmark' : mode === 'emg' ? 'needle' : electrodeKind
    setMarkerBusy(true)
    setMarkerError(null)
    try {
      if (placing && placing !== 'new') {
        const moved = await updateMarker(placing, {
          geometry: { meshName: p.meshName, local: p.local, direction: p.direction },
        })
        setMarkers((all) => all.map((m) => (m.id === moved.id ? moved : m)))
        setActiveMarkerId(moved.id)
        return
      }
      const created = await createMarker(
        {
          muscleId: mode === 'emg' ? selectedId : null,
          studyId: mode === 'ncs' ? studyId : null,
          kind: placingKind,
          approach: placingKind === 'landmark' ? 'Standard' : approach,
          regionId: region.id,
          meshName: p.meshName,
          local: p.local,
          direction: p.direction,
          depthMm: placingKind === 'needle' ? 15 : null,
        },
        profile.id,
      )
      setMarkers((all) => [...all, created])
      setActiveMarkerId(created.id)
    } catch (e) {
      setMarkerError(e instanceof Error ? e.message : String(e))
    } finally {
      setMarkerBusy(false)
      setPlacing(null)
    }
  }

  async function patchMarker(
    id: string,
    patch: { depthMm?: number; label?: string; note?: string; status?: 'draft' | 'approved' },
  ) {
    setMarkerBusy(true)
    setMarkerError(null)
    try {
      const updated = await updateMarker(id, patch)
      setMarkers((all) => all.map((m) => (m.id === id ? updated : m)))
    } catch (e) {
      setMarkerError(e instanceof Error ? e.message : String(e))
    } finally {
      setMarkerBusy(false)
    }
  }

  async function removeMarker(id: string) {
    setMarkerBusy(true)
    setMarkerError(null)
    try {
      await deleteMarker(id)
      setMarkers((all) => all.filter((m) => m.id !== id))
    } catch (e) {
      setMarkerError(e instanceof Error ? e.message : String(e))
    } finally {
      setMarkerBusy(false)
    }
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
                ? mode === 'emg'
                  ? `Right limb · ${mappedCount} of ${regionMuscles.length} muscles selectable · drag to rotate, right-drag or two fingers to pan, scroll to zoom`
                  : 'Right limb · the recording muscle for the chosen study is highlighted · drag to rotate, right-drag or two fingers to pan, scroll to zoom'
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
            {/* Right-drag and two-finger drag always pan. This makes it
                reachable with one button — a trackpad with no right click
                otherwise leaves distal limbs stuck off-screen when zoomed in. */}
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={panMode}
                onChange={(e) => setPanMode(e.target.checked)}
                className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
              />
              Drag to pan
            </label>
            <button
              onClick={() => setCentreSignal((n) => n + 1)}
              className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
              title="Slide the view so the highlighted structure sits in the middle, keeping the current angle and zoom"
            >
              Centre
            </button>
            <button
              onClick={() => setResetSignal((n) => n + 1)}
              className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
            >
              Reset view
            </button>
            {selectedId && mode === 'emg' && (
              <button
                onClick={() => setSelectedId('')}
                className="ml-auto text-xs font-semibold text-accent hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>

          {/* Identity strip: the facts worth having in view while looking at
              the model. Because it is here, MuscleDetail's identity card is
              switched off below and the localization card moves to the top. */}
          {mode === 'emg' && current && <MuscleSummaryBar muscle={current} />}

          {mode === 'ncs' && currentStudy && (
            <SummaryBar
              name={currentStudy.name}
              sub={currentStudy.region}
              parts={[
                { label: 'Type', value: currentStudy.type },
                { label: 'Roots', value: currentStudy.roots },
                { label: 'Recording', value: currentStudy.recording },
                { label: 'G1', value: currentStudy.active },
                { label: 'G2', value: currentStudy.reference },
                { label: 'Ground', value: currentStudy.ground },
              ]}
              footer={
                currentStudy.stim && currentStudy.stim.length > 0
                  ? { label: 'Stimulation', value: currentStudy.stim.join('  ·  ') }
                  : null
              }
            />
          )}

          {/* Approach switcher.
              A muscle like the triceps has one entry in the written atlas but
              more than one accepted place to put the needle. Each approach is a
              separate set of markers, and until now only the authoring panel
              could switch between them — a fellow saw whichever one happened to
              be first and had no idea the others existed.

              Only approaches that carry a marker this reader may see are
              listed, so a fellow never gets a chip that shows an empty model. */}
          {viewerApproaches.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/60 px-5 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Approach
              </span>
              {viewerApproaches.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    setApproach(a)
                    setActiveMarkerId(null)
                  }}
                  aria-pressed={approach === a}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    approach === a
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {a}
                </button>
              ))}
              <span className="text-xs text-muted">
                {viewerApproaches.length} accepted approaches — the markers and notes change with
                your choice
              </span>
            </div>
          )}

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

          <div
            ref={(el) => {
              if (el && (el.clientWidth !== canvasSize.w || el.clientHeight !== canvasSize.h)) {
                setCanvasSize({ w: el.clientWidth, h: el.clientHeight })
              }
            }}
            className="relative h-[380px] w-full sm:h-[520px]"
          >
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
                  // Nerve conduction mode takes its highlight from the study,
                  // so clicking anatomy must not override it.
                  onSelect={mode === 'emg' ? setSelectedId : () => {}}
                  selectable={mode === 'emg'}
                  panMode={panMode}
                  resetSignal={resetSignal}
                  centreSignal={centreSignal}
                  onHoverName={setHoverLabel}
                  layers={layers}
                  isolate={isolate}
                  section={section}
                  onBounds={setBounds}
                  onSelectionCentre={setSelectionCentre}
                  viewCutSignal={viewCutSignal}
                  markers={visibleMarkers}
                  activeMarkerId={activeMarkerId}
                  onMarkerScreenPositions={setScreenPos}
                  placingNeedle={placing !== null}
                  anyStructure={mode === 'ncs' || landmarkMode}
                  onPlaceNeedle={handlePlaceNeedle}
                  onPlaceRejected={(what) =>
                    setMarkerError(
                      `That click landed on ${what}. Rotate until the target muscle is ` +
                        'in front, then click on it — a needle has to be anchored to the ' +
                        'muscle it describes.',
                    )
                  }
                />
              </Suspense>
            )}

            {/* Labels live out here, over the white margin, not in the scene:
                text drawn on the anatomy competes with it and turns with the
                camera. */}
            {canvasSize.w > 0 && (
              <MarkerCallouts
                markers={visibleMarkers}
                positions={screenPos}
                width={canvasSize.w}
                height={canvasSize.h}
                activeId={activeMarkerId}
                onHover={setActiveMarkerId}
              />
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
            <div className="flex gap-1 border-b border-line px-3 pt-3" role="tablist" aria-label="Atlas mode">
              {(
                [
                  ['emg', 'Needle EMG'],
                  ['ncs', 'Nerve conduction'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={mode === key}
                  onClick={() => {
                    setMode(key)
                    setPlacing(null)
                    setLandmarkMode(false)
                    setQuery('')
                    setStudyQuery('')
                    // Clear BOTH selections either way. Clearing only the
                    // mode you are leaving still left a muscle highlighted on
                    // the model when coming back from nerve conduction, with
                    // nothing on the page referring to it.
                    setSelectedId('')
                    setStudyId('')
                  }}
                  className={`-mb-px border-b-2 px-3 py-2 font-display text-sm font-semibold transition-colors ${
                    mode === key
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Body region
                </span>
                <select
                  value={regionId}
                  onChange={(e) => {
                    setRegionId(e.target.value)
                    // A study belongs to a region's list; keeping the old id
                    // after a region change leaves markers filtered against a
                    // study the page no longer shows.
                    setSelectedId('')
                    setStudyId('')
                    setPlacing(null)
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

              {mode === 'ncs' && (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Search study, nerve or recording site
                    </span>
                    <div className="relative mt-1">
                      <input
                        value={studyQuery}
                        onChange={(e) => setStudyQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setStudyQuery('')
                        }}
                        placeholder="e.g. ulnar, APB, sensory, C8"
                        className="w-full rounded-md border border-line bg-surface px-3 py-2 pr-16 text-sm text-ink focus:border-accent focus:outline-none"
                      />
                      {studyQuery.trim() && (
                        <button
                          onClick={() => setStudyQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs font-semibold text-accent hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </label>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      {studyMatches.length} of {regionStudies.length} studies
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted">Group by</span>
                      {(
                        [
                          ['nerve', 'Nerve'],
                          ['region', 'Region'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setStudyGroupBy(key)}
                          className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            studyGroupBy === key
                              ? 'border-accent bg-accent-soft text-accent'
                              : 'border-line text-muted hover:text-ink'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-72 overflow-y-auto rounded-md border border-line">
                    {studyGroups.length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted">
                        No study in this region matches “{studyQuery.trim()}”.
                      </p>
                    )}
                    {studyGroups.map(([group, list]) => (
                      <div key={group}>
                        <p className="sticky top-0 bg-paper px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          {group}
                        </p>
                        {list.map((st) => {
                          const active = st.id === studyId
                          const short = abbrFor(st.id)[0]
                          return (
                            <button
                              key={st.id}
                              onClick={() => {
                                setStudyId(st.id)
                                setPlacing(null)
                              }}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                                active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-paper'
                              }`}
                            >
                              <span className="truncate" title={st.name}>
                                {st.name}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {short && (
                                  <span className="rounded border border-line px-1 text-[10px] font-semibold text-muted">
                                    {short}
                                  </span>
                                )}
                                <span className="text-[10px] font-semibold uppercase text-muted">
                                  {st.type}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {mode === 'emg' && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Search muscle, nerve or root
                </span>
                <div className="relative mt-1">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setQuery('')
                    }}
                    placeholder="e.g. deltoid, ulnar, C8"
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 pr-16 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                  {searching && (
                    <button
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs font-semibold text-accent hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
              )}

              {mode === 'emg' && searching && (
                <div className="overflow-hidden rounded-md border border-line">
                  {matches.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted">
                      No muscle in this region matches “{query.trim()}”.
                    </p>
                  )}
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

              {/* The full list is hidden while searching. Showing both at once
                  reads as one long list where the matches have simply been
                  pushed to the top, which is the opposite of what a search
                  should communicate. */}
              {mode === 'emg' && !searching && (
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
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ---------------- NCS detail ---------------- */}
      {mode === 'ncs' && currentStudy && (
        <div className="space-y-4">
          <StudyDetail study={currentStudy} showIdentity={false} showDiagram={false} />

          {approvedMarker && approvedMarker.note && (
            <Card>
              <CardHeader title="Electrode landmarks" sub={approvedMarker.label || 'Reviewed and approved'} />
              <div className="px-5 py-4">
                <p className="whitespace-pre-line text-sm text-ink">{approvedMarker.note}</p>
              </div>
            </Card>
          )}

          {mayAuthor && (
            <NeedlePanel
              mode="ncs"
              targetName={currentStudy.name}
              electrodeKind={electrodeKind}
              onElectrodeKind={setElectrodeKind}
              approach={approach}
              approaches={approaches}
              onApproach={setApproach}
              onRenameApproach={handleRenameApproach}
              canRenameApproach={canRenameApproach}
              landmarkMode={landmarkMode}
              onLandmarkMode={setLandmarkMode}
              role={profile?.role}
              userId={profile?.id}
              markers={visibleMarkers}
              placing={placing}
              onPlaceNew={() => setPlacing((p) => (p === 'new' ? null : 'new'))}
              onMove={(id) => setPlacing((p) => (p === id ? null : id))}
              activeId={activeMarkerId}
              onSetActive={setActiveMarkerId}
              onSave={(id, patch) => void patchMarker(id, patch)}
              onApprove={(id, approved) =>
                void patchMarker(id, { status: approved ? 'approved' : 'draft' })
              }
              onDelete={(id) => void removeMarker(id)}
              busy={markerBusy}
              error={markerError}
            />
          )}
        </div>
      )}

      {mode === 'ncs' && !currentStudy && (
        <p className="text-sm text-muted">
          {regionStudies.length} nerve conduction studies cover this region. Choose one to place
          or review its electrodes.
        </p>
      )}

      {/* ---------------- clinical detail ---------------- */}
      {mode === 'emg' && current ? (
        <div className="space-y-4">
          {!currentHas3d && (
            <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
              <span className="font-semibold">3D view not available for this muscle.</span> It is
              not present as a separate structure in the source anatomical model, so nothing is
              highlighted rather than showing an approximate neighbour. The technique below is
              unaffected.
            </div>
          )}
          {/* Per-approach notes. The written atlas entry below has ONE
              localization paragraph per muscle — for the triceps it names all
              three bellies in a single sentence — so the text that separates
              one approach from another is whatever the reviewing faculty wrote
              on that approach's marker. Shown here rather than left inside the
              authoring panel, where only supervisors could read it. */}
          {viewerApproaches.length > 1 && (
            <Card>
              <CardHeader
                title={`${approach} approach`}
                sub={approvedMarker ? 'Reviewed and approved' : 'No approved marker for this approach yet'}
              />
              <div className="space-y-2 px-5 py-4">
                {/* Faculty put the short "where it goes in" line in the marker's
                    label and anything longer in its note. Both are shown, and
                    the label alone is enough — most markers carry only that. */}
                {approvedMarker?.label && (
                  <p className="text-sm font-medium text-ink">{approvedMarker.label}</p>
                )}
                {approvedMarker?.note && (
                  <p className="whitespace-pre-line text-sm text-ink">{approvedMarker.note}</p>
                )}
                {!approvedMarker?.label && !approvedMarker?.note && (
                  <p className="text-sm text-muted">
                    Nothing written for this approach yet. The technique below is the muscle&apos;s
                    general entry and covers every approach; the marker on the model shows where
                    this one goes in.
                  </p>
                )}
              </div>
            </Card>
          )}

          <MuscleDetail muscle={current} showDiagram={false} showIdentity={false} />


          {mayAuthor && (
            <NeedlePanel
              mode="emg"
              targetName={current.name}
              electrodeKind={electrodeKind}
              onElectrodeKind={setElectrodeKind}
              approach={approach}
              approaches={approaches}
              onApproach={setApproach}
              onRenameApproach={handleRenameApproach}
              canRenameApproach={canRenameApproach}
              landmarkMode={landmarkMode}
              onLandmarkMode={setLandmarkMode}
              role={profile?.role}
              userId={profile?.id}
              markers={visibleMarkers}
              placing={placing}
              onPlaceNew={() => setPlacing((p) => (p === 'new' ? null : 'new'))}
              onMove={(id) => setPlacing((p) => (p === id ? null : id))}
              activeId={activeMarkerId}
              onSetActive={setActiveMarkerId}
              onSave={(id, patch) => void patchMarker(id, patch)}
              onApprove={(id, approved) =>
                void patchMarker(id, { status: approved ? 'approved' : 'draft' })
              }
              onDelete={(id) => void removeMarker(id)}
              busy={markerBusy}
              error={markerError}
            />
          )}
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
        Rotate the anatomy behind EMG needle localization and nerve conduction technique
      </p>
    </div>
  )
}
