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
const SHAFT_APPROVED = '#243044'
const DOT_APPROVED = '#FFFFFF'
const SHAFT_DRAFT = '#B26320'
const DOT_DRAFT = '#F6A554'
const SHAFT_ACTIVE = '#0B4A66'
const DOT_ACTIVE = '#16B5C2'

function needleGroup(
  m: NeedleMarker,
  colors: { shaft: string; dot: string },
  dimmed: boolean,
): THREE.Group {
  const g = new THREE.Group()
  const dir = new THREE.Vector3(...m.direction)
  if (dir.lengthSq() === 0) dir.set(0, -1, 0)
  dir.normalize()

  const length = Math.max(m.depthMm, 1) * MM
  const opacity = dimmed ? 0.45 : 1

  // Shaft: a thin cylinder from the entry point along the direction. Cylinder
  // geometry is built along +Y and centred, hence the rotation and half-length
  // offset.
  // Drawn thicker than a real needle on purpose: at the zoom levels people
  // actually use, a true-to-scale 0.45 mm shaft is sub-pixel and invisible.
  // The DEPTH is to scale; the thickness is a legibility choice.
  const shaftGeo = new THREE.CylinderGeometry(3 * MM, 1.8 * MM, length, 10)
  const shaftMat = new THREE.MeshStandardMaterial({
    color: colors.shaft,
    roughness: 0.35,
    metalness: 0.5,
    transparent: dimmed,
    opacity,
    depthTest: false,
  })
  const shaft = new THREE.Mesh(shaftGeo, shaftMat)
  shaft.userData.isShaft = true
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  shaft.position.copy(dir).multiplyScalar(length / 2)
  shaft.renderOrder = 900
  g.add(shaft)

  // Entry dot, sitting slightly proud of the surface so it stays visible.
  const dotGeo = new THREE.SphereGeometry(8 * MM, 20, 14)
  const dotMat = new THREE.MeshStandardMaterial({
    color: colors.dot,
    roughness: 0.25,
    emissive: new THREE.Color(colors.dot),
    emissiveIntensity: 0.5,
    transparent: dimmed,
    opacity,
    depthTest: false,
  })
  const dot = new THREE.Mesh(dotGeo, dotMat)
  dot.userData.isDot = true
  dot.position.copy(dir).multiplyScalar(-3 * MM)
  dot.renderOrder = 901
  g.add(dot)

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
      const colors =
        m.id === activeId
          ? { shaft: SHAFT_ACTIVE, dot: DOT_ACTIVE }
          : m.status === 'approved'
            ? { shaft: SHAFT_APPROVED, dot: DOT_APPROVED }
            : { shaft: SHAFT_DRAFT, dot: DOT_DRAFT }
      const g = needleGroup(m, colors, false)
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
