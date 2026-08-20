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
}: Omit<ViewerProps, 'camera'>) {
  const { scene } = useGLTF(glbPath, '/draco/')
  const invalidate = useThree((s) => s.invalidate)
  const [hovered, setHovered] = useState<string | null>(null)

  // One clone per model, so materials we recolour don't leak into the cache.
  const root = useMemo(() => scene.clone(true), [scene])

  const selected = useMemo(() => new Set(selectedMeshes), [selectedMeshes])
  const known = useMemo(() => new Set(Object.keys(meshToTarget)), [meshToTarget])

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
        transparent: true,
        // Selected is solid; when isolating, everything else recedes.
        opacity: isSel ? 1 : isolate ? (bone ? 0.12 : 0.16) : bone ? 0.9 : 0.95,
        depthWrite: isSel || !isolate,
      })
      if (isSel) {
        mat.emissive = new THREE.Color(C_SELECTED)
        mat.emissiveIntensity = 0.25
      }
      const old = mesh.material as THREE.Material | THREE.Material[]
      if (Array.isArray(old)) old.forEach((m) => m.dispose())
      else old?.dispose()
      mesh.material = mat
      mesh.userData.clinical = clinical
    })
    invalidate()
  }, [root, selected, known, hovered, showBones, isolate, invalidate])

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
    <primitive
      object={root}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    />
  )
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
      gl={{ localClippingEnabled: true, antialias: true }}
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
