// ---------------------------------------------------------------------------
// 3D Atlas viewer canvas.
//
// Loads a region's glTF model, lets the user orbit it, and highlights the
// selected muscle among its neighbours. Clicking a muscle selects it; muscles
// with no clinical entry are inert.
//
// The model is anatomy only. No needle-entry markers or electrode positions are
// drawn on it — that detail lives in the reviewed text alongside (see
// MuscleDetail). The 3D view answers "where is this muscle, and what is next to
// it"; the text answers "where does the needle go".
//
// Everything here (and its three.js imports) stays inside the lazily-loaded
// /atlas-3d chunk so the main portal bundle is unaffected.
// ---------------------------------------------------------------------------

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { CameraPose } from '../../data/atlas3d'

// Palette matches the app's Tailwind tokens.
const C_SELECTED = '#0E7C86' // accent
const C_HOVER = '#16B5C2' // signal
const C_MUSCLE = '#C08A7D' // muted anatomical
const C_BONE = '#E7E3DA'

export interface ViewerProps {
  glbPath: string
  camera: CameraPose
  /** Mesh names belonging to the currently selected muscle. */
  selectedMeshes: string[]
  /** Mesh name -> muscle id, for click-to-select. */
  meshToTarget: Record<string, string>
  onSelect: (targetId: string) => void
  onHoverName: (label: string | null) => void
  showBones: boolean
  /** Dim everything that isn't selected, so the target reads clearly. */
  isolate: boolean
  /** Cross-section: null = off. `position` is 0..1 along the limb's long axis. */
  section: { position: number; flip: boolean } | null
  /** Reports the model's vertical extent so the page can label the slider. */
  onBounds?: (b: { minY: number; maxY: number }) => void
  /** Reports the selected muscle's centre, for "cut at this muscle" / "view cut". */
  onSelectionCentre?: (c: [number, number, number] | null) => void
  /** Bumping this number swings the camera round to face the cut. */
  viewCutSignal?: number
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

/** Bone test that also considers ancestors, for the same reason as above. */
function isBoneChain(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj
  while (cur) {
    if (isBone(cur.name)) return true
    cur = cur.parent
  }
  return false
}

// Names are underscore-separated (see the pipeline), so word boundaries don't
// help here — match on underscore-delimited tokens instead.
function isBone(name: string) {
  return /(^|_)(bone|humerus|radius|ulna|scapula|clavicle|phalanx|metacarpal)(_|$)/i.test(name)
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
  showBones,
  isolate,
  section,
  onBounds,
  onSelectionCentre,
  viewCutSignal,
}: Omit<ViewerProps, 'camera'>) {
  const { scene } = useGLTF(glbPath, '/draco/')
  const invalidate = useThree((s) => s.invalidate)
  const [hovered, setHovered] = useState<string | null>(null)
  const [selectionFocus, setSelectionFocus] = useState<THREE.Vector3 | null>(null)

  // One clone per model, so materials we recolour don't leak into the cache.
  const root = useMemo(() => scene.clone(true), [scene])

  const selected = useMemo(() => new Set(selectedMeshes), [selectedMeshes])
  const known = useMemo(() => new Set(Object.keys(meshToTarget)), [meshToTarget])

  // Vertical extent of the whole limb — the slider maps onto this.
  const bounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(root)
    return { minY: box.min.y, maxY: box.max.y }
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
      const owner = ownerName(mesh, known)
      const bone = owner === null && isBoneChain(mesh)
      const isSel = owner !== null && selected.has(owner)
      const isHov = owner !== null && hovered === owner
      const clinical = owner !== null

      mesh.visible = bone ? showBones : true

      const mat = new THREE.MeshStandardMaterial({
        color: isSel ? C_SELECTED : isHov ? C_HOVER : bone ? C_BONE : C_MUSCLE,
        roughness: bone ? 0.85 : 0.65,
        metalness: 0.02,
        // A cross-section is about reading solid tissue, so sectioning turns
        // the ghosting off: everything renders opaque and double-sided, and
        // the selected muscle additionally gets a stencil cap.
        transparent: !sectionOn,
        side: sectionOn ? THREE.DoubleSide : THREE.FrontSide,
        opacity: sectionOn ? 1 : isSel ? 1 : isolate ? (bone ? 0.12 : 0.16) : bone ? 0.9 : 0.95,
        depthWrite: sectionOn || isSel || !isolate,
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
  }, [root, selected, known, hovered, showBones, isolate, sectionOn, plane, invalidate])

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
    const owner = ownerName(e.object, known)
    const target = owner ? meshToTarget[owner] : undefined
    if (!target) return
    e.stopPropagation()
    onSelect(target)
  }

  return (
    <>
      <CutCamera
        signal={viewCutSignal}
        plane={sectionOn ? plane : null}
        bounds={bounds}
        focus={selectionFocus}
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
}: {
  signal?: number
  plane: THREE.Plane | null
  bounds: { minY: number; maxY: number }
  focus: THREE.Vector3 | null
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
    // Far enough back to frame the whole limb at that level — the point is to
    // read the target muscle's position among its neighbours, not to fill the
    // screen with it.
    const dist = Math.max(0.3, (bounds.maxY - bounds.minY) * 0.5)
    // Look from the kept side, back along the normal, towards the cut.
    camera.position.copy(point).addScaledVector(plane.normal, -dist)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(point)
      controls.update()
    }
    invalidate()
  }, [signal, plane, bounds, camera, controls, invalidate])

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
        minDistance={0.1}
        maxDistance={4}
        keyPanSpeed={12}
      />
    </Canvas>
  )
}

export default ViewerCanvas
