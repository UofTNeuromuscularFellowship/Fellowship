// ---------------------------------------------------------------------------
// Needle markers in the scene.
//
// Each marker is drawn as an entry dot on the structure's surface plus a shaft
// running into the tissue along the recorded direction, its length equal to the
// recorded depth. Depth is stored in millimetres and the model is in metres, so
// everything converts through MM.
//
// Markers are anchored in the LOCAL space of a named mesh, so they are placed
// as children of that mesh's node. That way the scene's own transform — which
// the export pipeline changes whenever it recentres a region — carries them
// along instead of leaving them behind.
// ---------------------------------------------------------------------------

import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { NeedleMarker } from '../../lib/atlas3dMarkers'

const MM = 0.001

// The shaft must not share a colour with the selected muscle, or an approved
// marker vanishes into exactly the structure it is marking. Steel shaft, bright
// entry dot: reads against both the teal selection and the brown of unselected
// muscle.
const SHAFT_STEEL = '#8D97A6'
const HUB_APPROVED = '#243044'
const HUB_DRAFT = '#E07B2C'
const HUB_ACTIVE = '#16B5C2'

// Drawn thicker than a real needle on purpose: a true-to-scale 0.45 mm shaft
// is sub-pixel at any sensible zoom. The DEPTH is to scale; the thickness and
// the hub are legibility choices.
const R_SHAFT = 1.1 * MM
const R_HUB = 3.2 * MM

function needleGroup(
  m: NeedleMarker,
  colors: { shaft: string; hub: string },
): THREE.Group {
  const g = new THREE.Group()
  const dir = new THREE.Vector3(...m.direction)
  if (dir.lengthSq() === 0) dir.set(0, -1, 0)
  dir.normalize()

  const depth = Math.max(m.depthMm, 1) * MM
  const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)

  // Cylinder and cone geometry is built along +Y and centred on the origin, so
  // each piece is rotated onto `dir` and then pushed along it by half its own
  // length plus however far down the needle it sits.
  const place = (mesh: THREE.Mesh, from: number, length: number) => {
    mesh.quaternion.copy(rot)
    mesh.position.copy(dir).multiplyScalar(from + length / 2)
    mesh.renderOrder = 900
    g.add(mesh)
  }

  const steel = new THREE.MeshStandardMaterial({
    color: colors.shaft,
    roughness: 0.25,
    metalness: 0.75,
    depthTest: false,
  })
  const hubMat = new THREE.MeshStandardMaterial({
    color: colors.hub,
    roughness: 0.5,
    metalness: 0.1,
    emissive: new THREE.Color(colors.hub),
    emissiveIntensity: 0.25,
    depthTest: false,
  })

  // ---- the needle itself, in three parts ------------------------------
  // A bevelled tip. Real EMG needles are ground at an angle; a cone reads as
  // "sharp end, and this is the end that goes in" at a glance.
  const TIP = Math.min(depth * 0.35, 4 * MM)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(R_SHAFT, TIP, 12), steel)
  tip.quaternion.copy(rot)
  // Cone points +Y by default; flip it so the point leads into the tissue.
  tip.rotateX(Math.PI)
  tip.position.copy(dir).multiplyScalar(depth - TIP / 2)
  tip.renderOrder = 900
  g.add(tip)

  // Shaft: from the surface down to where the bevel starts.
  const shaftLen = Math.max(depth - TIP, 0.5 * MM)
  place(new THREE.Mesh(new THREE.CylinderGeometry(R_SHAFT, R_SHAFT, shaftLen, 12), steel), 0, shaftLen)

  // Hub: the coloured grip, sitting ABOVE the surface. This is what carries
  // the draft/approved colour and what the eye lands on.
  const HUB = 7 * MM
  place(
    new THREE.Mesh(new THREE.CylinderGeometry(R_HUB * 0.75, R_HUB, HUB, 12), hubMat),
    -HUB,
    HUB,
  )
  // A thin collar where hub meets skin, so the entry point is unambiguous.
  place(
    new THREE.Mesh(new THREE.CylinderGeometry(R_HUB * 1.15, R_HUB * 1.15, 1.2 * MM, 14), hubMat),
    -1.2 * MM,
    1.2 * MM,
  )

  // The viewer's material pass walks every mesh under the model root and
  // reassigns materials. Marker meshes live inside the muscle's node, so they
  // would be recoloured as muscle unless they are flagged to be skipped.
  g.traverse((o) => {
    o.userData.atlasMarker = true
  })

  g.position.set(...m.local)
  return g
}

export function NeedleMarkers({
  root,
  markers,
  activeId,
}: {
  root: THREE.Object3D
  markers: NeedleMarker[]
  activeId?: string | null
}) {
  const invalidate = useThree((s) => s.invalidate)

  const attached = useMemo(() => {
    const made: Array<{ group: THREE.Group; parent: THREE.Object3D }> = []
    for (const m of markers) {
      const parent = root.getObjectByName(m.meshName)
      if (!parent) continue // mesh renamed or region rebuilt — skip, never guess
      const hub =
        m.id === activeId ? HUB_ACTIVE : m.status === 'approved' ? HUB_APPROVED : HUB_DRAFT
      const g = needleGroup(m, { shaft: SHAFT_STEEL, hub })
      parent.add(g)
      made.push({ group: g, parent })
    }
    return made
  }, [root, markers, activeId])

  useEffect(() => {
    invalidate()
    return () => {
      for (const { group, parent } of attached) {
        parent.remove(group)
        group.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.geometry.dispose()
          const mat = mesh.material as THREE.Material | THREE.Material[]
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
          else mat?.dispose()
        })
      }
    }
  }, [attached, invalidate])

  return null
}
