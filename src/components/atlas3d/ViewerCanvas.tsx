// ---------------------------------------------------------------------------
// 3D Atlas viewer canvas.
//
// Loads a region's glTF model, lets the user orbit it, and highlights the
// selected muscle among its neighbours. Clicking a muscle selects it; muscles
// with no clinical entry are inert.
//
// Needle markers ARE drawn here, but none of them are invented: every marker
// was placed by a supervisor or director in author mode and approved by a
// director before a fellow can see it (RLS enforces that, not this file). The
// reviewed text in MuscleDetail remains the authority on technique; the marker
// shows where that text is pointing.
//
// Everything here (and its three.js imports) stays inside the lazily-loaded
// /atlas-3d chunk so the main portal bundle is unaffected.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { kindOf, type CameraPose, type StructureKind } from '../../data/atlas3d'
import { ClipCaps, collectCapTargets, type CapTarget } from './ClipCaps'
import { NeedleMarkers } from './NeedleMarkers'
import type { NeedleMarker } from '../../lib/atlas3dMarkers'

// Palette matches the app's Tailwind tokens; nerve/vessel colours follow the
// convention every anatomy text uses, so they read without a legend.
const C_SELECTED = '#0E7C86' // accent
const C_HOVER = '#16B5C2' // signal
const C_MUSCLE = '#C08A7D'
const C_BONE = '#E7E3DA'
const C_NERVE = '#E8B62C'
const C_ARTERY = '#C0392B'
const C_VEIN = '#3A6EA5'

const KIND_COLOR: Record<StructureKind, string> = {
  muscle: C_MUSCLE,
  bone: C_BONE,
  nerve: C_NERVE,
  artery: C_ARTERY,
  vein: C_VEIN,
}

export interface LayerState {
  bones: boolean
  nerves: boolean
  vessels: boolean
}

export interface ViewerProps {
  glbPath: string
  camera: CameraPose
  /** Mesh names belonging to the currently selected muscle. */
  selectedMeshes: string[]
  /** Mesh name -> muscle id, for click-to-select. */
  meshToTarget: Record<string, string>
  onSelect: (targetId: string) => void
  onHoverName: (label: string | null) => void
  /** Which non-muscle layers are drawn. */
  layers: LayerState
  /** Dim everything that isn't selected, so the target reads clearly. */
  isolate: boolean
  /** Cross-section: null = off. `position` is 0..1 along the limb's long axis. */
  section: { position: number; flip: boolean } | null
  /** Reports the model's vertical extent so the page can label the slider. */
  onBounds?: (b: { minY: number; maxY: number; radius: number }) => void
  /** Reports the selected muscle's centre, for "cut at this muscle" / "view cut". */
  onSelectionCentre?: (c: [number, number, number] | null) => void
  /** Bumping this number swings the camera round to face the cut. */
  viewCutSignal?: number

  /** Approved (and, for reviewers, draft) needle markers to draw. */
  markers?: NeedleMarker[]
  activeMarkerId?: string | null
  /**
   * When true, a click places a needle instead of selecting a muscle. The
   * captured point and direction are in the LOCAL space of the mesh that was
   * hit — see lib/atlas3dMarkers.ts for why that matters.
   */
  placingNeedle?: boolean
  onPlaceNeedle?: (p: {
    meshName: string
    local: [number, number, number]
    direction: [number, number, number]
  }) => void
  /** Called when a placement click landed on something other than the target. */
  onPlaceRejected?: (structureLabel: string) => void
  /**
   * NCS electrodes sit wherever the technique puts them — over a muscle belly,
   * a tendon, a bony point — so any structure is a valid anchor. EMG needles
   * stay locked to their own muscle.
   */
  anyStructure?: boolean
}

/**
 * glTF nodes whose mesh has more than one material are loaded as a Group with
 * child Meshes, and those children are named from the glTF *mesh* rather than
 * the node — e.g. node "Long_head_of_biceps_brachii_r" yields child meshes
 * "Long_head_of_biceps_brachii" and "…_1". Matching on the leaf name therefore
 * misses. We walk up to the nearest ancestor whose name we actually know.
 */
function ownerName(obj: THREE.Object3D, known: Set<string>): string | null {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    if (known.has(cur.name)) return cur.name
    cur = cur.parent
  }
  return null
}

/** The nearest ancestor that the pipeline recorded a kind for. */
function structureName(obj: THREE.Object3D): string | null {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    if (kindOf(cur.name)) return cur.name
    cur = cur.parent
  }
  return null
}

/**
 * Turns a mesh name back into readable anatomy for the hover label:
 * "Long_head_of_biceps_brachii_r" -> "Long head of biceps brachii".
 */
export function prettyMeshName(name: string) {
  const base = name.replace(/_(r|l)$/, '').replace(/_+/g, ' ').trim()
  return base.charAt(0).toUpperCase() + base.slice(1)
}

function Model({
  glbPath,
  selectedMeshes,
  meshToTarget,
  onSelect,
  onHoverName,
  layers,
  isolate,
  section,
  onBounds,
  onSelectionCentre,
  viewCutSignal,
  markers,
  activeMarkerId,
  placingNeedle,
  onPlaceNeedle,
  onPlaceRejected,
  anyStructure,
}: Omit<ViewerProps, 'camera'>) {
  const { scene } = useGLTF(glbPath, '/draco/')
  const invalidate = useThree((s) => s.invalidate)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selectionFocus, setSelectionFocus] = useState<THREE.Vector3 | null>(null)
  const [selectionRadius, setSelectionRadius] = useState(0)

  // One clone per model, so materials we recolour don't leak into the cache.
  const root = useMemo(() => scene.clone(true), [scene])

  const selected = useMemo(() => new Set(selectedMeshes), [selectedMeshes])
  const known = useMemo(() => new Set(Object.keys(meshToTarget)), [meshToTarget])

  // Vertical extent of the whole limb — the slider maps onto this.
  const bounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(root)
    // Horizontal half-extent drives the cut-face framing: the cut is as wide
    // as the limb, not as long as it.
    const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2
    return { minY: box.min.y, maxY: box.max.y, radius }
  }, [root])

  useEffect(() => {
    onBounds?.(bounds)
  }, [bounds, onBounds])

  // Mid-height of the selection, so the UI can jump the plane to it.
  useEffect(() => {
    if (selected.size === 0) {
      onSelectionCentre?.(null)
      return
    }
    const box = new THREE.Box3()
    root.updateMatrixWorld(true)
    root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return
      let cur: THREE.Object3D | null = o
      while (cur) {
        if (known.has(cur.name)) {
          if (selected.has(cur.name)) box.expandByObject(o)
          return
        }
        cur = cur.parent
      }
    })
    if (box.isEmpty()) {
      setSelectionFocus(null)
      onSelectionCentre?.(null)
    } else {
      const c = box.getCenter(new THREE.Vector3())
      const sz = box.getSize(new THREE.Vector3())
      setSelectionRadius(Math.max(sz.x, sz.z) / 2)
      setSelectionFocus(c)
      onSelectionCentre?.([c.x, c.y, c.z])
    }
  }, [root, selected, known, onSelectionCentre])

  // One plane instance, mutated in place — swapping it would force every
  // material to recompile its shader.
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), [])

  const sectionOn = section !== null

  if (section) {
    const y = bounds.minY + (bounds.maxY - bounds.minY) * section.position
    plane.normal.set(0, section.flip ? 1 : -1, 0)
    plane.constant = section.flip ? -y : y
  }


  useEffect(() => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if (mesh.userData.atlasMarker) return // needle markers own their materials
      const owner = ownerName(mesh, known)
      const structure = structureName(mesh)
      const kind: StructureKind = (structure && kindOf(structure)) || 'muscle'
      const isSel = owner !== null && selected.has(owner)
      const isHov = owner !== null && hovered === owner
      const clinical = owner !== null

      mesh.visible =
        kind === 'bone' ? layers.bones
        : kind === 'nerve' ? layers.nerves
        : kind === 'artery' || kind === 'vein' ? layers.vessels
        : true

      // Nerves and vessels are landmarks, not targets — they stay legible
      // rather than fading, because knowing what a needle is near is the
      // point of showing them at all.
      const landmark = kind === 'nerve' || kind === 'artery' || kind === 'vein'
      const faded = isolate && !isSel && !landmark

      const mat = new THREE.MeshStandardMaterial({
        color: isSel ? C_SELECTED : isHov ? C_HOVER : KIND_COLOR[kind],
        roughness: kind === 'bone' ? 0.85 : landmark ? 0.4 : 0.65,
        metalness: 0.02,
        // A cross-section is about reading solid tissue, so sectioning turns
        // the ghosting off: everything renders opaque, and each structure gets
        // a stencil cap so the cut face is solid.
        transparent: !sectionOn,
        side: THREE.FrontSide,
        opacity: sectionOn ? 1 : isSel ? 1 : faded ? (kind === 'bone' ? 0.12 : 0.16) : kind === 'bone' ? 0.9 : 0.95,
        depthWrite: sectionOn || isSel || !faded,
      })
      if (isSel) {
        mat.emissive = new THREE.Color(C_SELECTED)
        mat.emissiveIntensity = 0.25
      }
      const old = mesh.material as THREE.Material | THREE.Material[]
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else old?.dispose()
      mat.clippingPlanes = sectionOn ? [plane] : null
      mesh.material = mat
      mesh.userData.clinical = clinical
    })
    invalidate()
  }, [root, selected, known, hovered, layers, isolate, sectionOn, plane, invalidate])

  // While placing a needle, ONLY the target muscle is clickable. Anything else
  // — an overlying muscle, a vein crossing in front — has its raycast disabled,
  // so a click cannot land on the wrong structure in the first place. Without
  // this, placing a marker on anything but the most superficial muscle means
  // fighting whatever happens to be in front of it.
  useEffect(() => {
    const touched: THREE.Mesh[] = []
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if (!placingNeedle) return
      if (mesh.userData.atlasMarker) return
      if (anyStructure) return // NCS: every structure is a valid anchor
      const structure = structureName(mesh)
      if (structure && selected.has(structure)) return
      mesh.userData.savedRaycast = mesh.raycast
      mesh.raycast = () => {}
      touched.push(mesh)
    })
    return () => {
      for (const mesh of touched) {
        if (mesh.userData.savedRaycast) {
          mesh.raycast = mesh.userData.savedRaycast
          delete mesh.userData.savedRaycast
        }
      }
    }
  }, [root, placingNeedle, selected, anyStructure])

  // Cap every visible structure the plane passes through, so the cut reads as
  // solid tissue. Each gets its own stencil pass (see ClipCaps).
  const capTargets: CapTarget[] = useMemo(
    () => (sectionOn ? collectCapTargets(root, layers) : []),
    [sectionOn, root, layers],
  )

  // Moving the slider only changes the plane's constant, so ask for a redraw.
  useEffect(() => {
    invalidate()
  }, [section?.position, section?.flip, invalidate])

  function handleOver(e: ThreeEvent<PointerEvent>) {
    const owner = ownerName(e.object, known)
    if (owner === null) return          // bones and unmapped structures are inert
    e.stopPropagation()
    setHovered(owner)
    onHoverName(prettyMeshName(owner))
    document.body.style.cursor = 'pointer'
  }

  function handleOut() {
    setHovered(null)
    onHoverName(null)
    document.body.style.cursor = 'default'
  }

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (placingNeedle && onPlaceNeedle) {
      const structure = structureName(e.object)
      if (!structure || !e.face) return
      e.stopPropagation()

      // A marker must anchor to the muscle it describes. Without this, a click
      // that lands on an overlying muscle would file a correctly-shaped marker
      // against the wrong anatomy — the kind of error nothing downstream can
      // detect.
      if (!anyStructure && !selected.has(structure)) {
        onPlaceRejected?.(prettyMeshName(structure))
        return
      }

      const node = root.getObjectByName(structure)
      if (!node) return
      node.updateMatrixWorld(true)

      // World hit point -> the anchor mesh's local space, so the marker keeps
      // its place when the region model is rebuilt and recentred.
      const local = node.worldToLocal(e.point.clone())

      // The needle points INTO the tissue: the inward surface normal at the
      // hit, expressed in the same local space. Using the camera ray instead
      // would record the reviewer's viewing angle, not an anatomical one.
      const hitNormal = e.face.normal.clone()
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld)
      const worldNormal = hitNormal.applyMatrix3(normalMatrix).normalize()
      const localNormal = worldNormal
        .clone()
        .applyMatrix3(new THREE.Matrix3().getNormalMatrix(node.matrixWorld).invert())
        .normalize()
        .negate()

      onPlaceNeedle({
        meshName: structure,
        local: [local.x, local.y, local.z],
        direction: [localNormal.x, localNormal.y, localNormal.z],
      })
      return
    }

    const owner = ownerName(e.object, known)
    const target = owner ? meshToTarget[owner] : undefined
    if (!target) return
    e.stopPropagation()
    onSelect(target)
  }

  return (
    <>
      {sectionOn && <ClipCaps targets={capTargets} plane={plane} selected={selected} />}
      {markers && markers.length > 0 && (
        <NeedleMarkers root={root} markers={markers} activeId={activeMarkerId} />
      )}
      <CutCamera
        signal={viewCutSignal}
        plane={sectionOn ? plane : null}
        bounds={bounds}
        focus={selectionFocus}
        radius={selectionRadius}
      />
      <primitive
        object={root}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      />

    </>
  )
}

/**
 * Swings the camera to look straight down the clipping plane's normal, so the
 * cut face is seen head-on — the view an anatomy atlas plate shows.
 */
function CutCamera({
  signal,
  plane,
  bounds,
  focus,
  radius,
}: {
  signal?: number
  plane: THREE.Plane | null
  bounds: { minY: number; maxY: number; radius: number }
  focus: THREE.Vector3 | null
  radius: number
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const invalidate = useThree((s) => s.invalidate)
  const last = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (signal === undefined || signal === last.current) return
    last.current = signal
    if (!plane) return
    // Aim at the selected muscle where the plane crosses it, not at the world
    // origin — at forearm level the origin is outside the limb entirely.
    const point = focus
      ? plane.projectPoint(focus, new THREE.Vector3())
      : plane.coplanarPoint(new THREE.Vector3())
    // Frame on the selected muscle, showing roughly a hand's width of
    // surrounding anatomy. Framing on the whole model instead puts the cut in
    // the far distance, because the shoulder girdle and vessels make the
    // bounding box far wider than the limb at any one level.
    const dist = Math.min(0.22, Math.max(0.07, (radius || bounds.radius * 0.2) * 2.5))
    // Look from the kept side, back along the normal, towards the cut.
    camera.position.copy(point).addScaledVector(plane.normal, -dist)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(point)
      controls.update()
    }
    invalidate()
  }, [signal, plane, bounds, radius, focus, camera, controls, invalidate])

  return null
}

function CameraRig({
  pose,
  controls,
}: {
  pose: CameraPose
  controls: React.RefObject<OrbitControlsImpl>
}) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    camera.position.set(...pose.position)
    camera.updateProjectionMatrix()
    if (controls.current) {
      controls.current.target.set(...pose.target)
      controls.current.update()
    }
    invalidate()
  }, [pose, camera, controls, invalidate])

  return null
}

export function ViewerCanvas({ glbPath, camera, ...rest }: ViewerProps) {
  const controls = useRef<OrbitControlsImpl>(null)

  return (
    <Canvas
      // Local clipping is required for the Phase 2 cross-sections.
      // stencil is required for the capped cross-sections and is NOT on by default.
      gl={{ localClippingEnabled: true, antialias: true, stencil: true }}
      dpr={[1, 2]}
      camera={{ position: camera.position, fov: 45, near: 0.01, far: 100 }}
      // Redraw on interaction only — a static scene shouldn't drain a phone.
      frameloop="demand"
    >
      <color attach="background" args={['#F7F8FA']} />
      <hemisphereLight intensity={0.75} groundColor="#E2E6EC" />
      <directionalLight position={[2, 4, 3]} intensity={1.15} />
      <directionalLight position={[-3, 2, -2]} intensity={0.45} />

      <Suspense fallback={null}>
        <Model glbPath={glbPath} {...rest} />
      </Suspense>

      <CameraRig pose={camera} controls={controls} />

      <OrbitControls
        ref={controls}
        makeDefault
        target={camera.target}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.04}
        maxDistance={4}
        keyPanSpeed={12}
      />
    </Canvas>
  )
}

export default ViewerCanvas
