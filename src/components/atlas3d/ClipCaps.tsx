// ---------------------------------------------------------------------------
// Capped cross-sections.
//
// A clipping plane on its own leaves a hollow shell — you look through the cut
// into the inside of a muscle, which reads as a hole rather than a section.
// The fix is the standard three.js stencil technique: for each structure, draw
// its back faces incrementing the stencil buffer and its front faces
// decrementing it, then draw a quad wherever the count is non-zero. What
// remains is a solid face exactly where the plane passes through tissue.
//
// TWO THINGS MAKE OR BREAK THIS, both learned the hard way:
//
//  1. The stencil passes MUST carry the same clipping plane as the scene.
//     Without it, front and back faces cancel everywhere and no cap draws.
//
//  2. Each structure needs its OWN stencil pass and its OWN cap quad, with
//     interleaved render order. Sharing one buffer across structures lets
//     their counts add together, and the cap spills far outside any real
//     cross-section — a confident-looking shape that is anatomically wrong.
//     The cap material writes 0 back as it draws (ReplaceStencilOp with
//     stencilRef 0), which resets the buffer for the next structure.
// ---------------------------------------------------------------------------

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { kindOf, type StructureKind } from '../../data/atlas3d'

export interface CapTarget {
  name: string
  kind: StructureKind
  geometry: THREE.BufferGeometry
  matrixWorld: THREE.Matrix4
}

export interface CapLayers {
  bones: boolean
  nerves: boolean
  vessels: boolean
}

function layerVisible(kind: StructureKind, layers: CapLayers) {
  if (kind === 'bone') return layers.bones
  if (kind === 'nerve') return layers.nerves
  if (kind === 'artery' || kind === 'vein') return layers.vessels
  return true
}

/** Every visible mesh that the plane could pass through, with its kind. */
export function collectCapTargets(root: THREE.Object3D, layers: CapLayers): CapTarget[] {
  const out: CapTarget[] = []
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.visible) return
    if (mesh.userData.atlasMarker) return // markers are not tissue; never cap them
    let cur: THREE.Object3D | null = mesh
    let kind: StructureKind | undefined
    let name = ''
    while (cur && !kind) {
      kind = kindOf(cur.name)
      if (kind) name = cur.name
      cur = cur.parent
    }
    if (!kind || !layerVisible(kind, layers)) return
    out.push({ name, kind, geometry: mesh.geometry, matrixWorld: mesh.matrixWorld.clone() })
  })
  return out
}

function stencilMaterial(side: THREE.Side, op: THREE.StencilOp, plane: THREE.Plane) {
  const m = new THREE.MeshBasicMaterial()
  m.clippingPlanes = [plane]
  m.depthWrite = false
  m.depthTest = false
  m.colorWrite = false
  m.stencilWrite = true
  m.stencilFunc = THREE.AlwaysStencilFunc
  m.side = side
  m.stencilFail = op
  m.stencilZFail = op
  m.stencilZPass = op
  return m
}

// Cut faces are a touch darker than the surface, the way a cut surface reads
// in a real section.
const CAP_COLOR: Record<StructureKind, string> = {
  muscle: '#A96F62',
  bone: '#D8D2C6',
  nerve: '#D0A11E',
  artery: '#A32E22',
  vein: '#2F5C8C',
}
const CAP_SELECTED = '#0B6A73'

export function ClipCaps({
  targets,
  plane,
  selected,
  size = 1.2,
}: {
  targets: CapTarget[]
  plane: THREE.Plane | null
  selected?: Set<string>
  size?: number
}) {
  const invalidate = useThree((s) => s.invalidate)

  const { group, caps, disposables } = useMemo(() => {
    const g = new THREE.Group()
    const capMeshes: THREE.Mesh[] = []
    const junk: Array<THREE.Material | THREE.BufferGeometry> = []
    if (!plane) return { group: g, caps: capMeshes, disposables: junk }

    targets.forEach((t, i) => {
      const back = stencilMaterial(THREE.BackSide, THREE.IncrementWrapStencilOp, plane)
      const front = stencilMaterial(THREE.FrontSide, THREE.DecrementWrapStencilOp, plane)
      junk.push(back, front)

      for (const mat of [back, front]) {
        const m = new THREE.Mesh(t.geometry, mat)
        m.matrixAutoUpdate = false
        m.matrix.copy(t.matrixWorld)
        m.renderOrder = 1 + i * 2
        g.add(m)
      }

      const capMat = new THREE.MeshStandardMaterial({
        color: selected?.has(t.name) ? CAP_SELECTED : CAP_COLOR[t.kind],
        roughness: 0.6,
        metalness: 0,
        side: THREE.DoubleSide,
      })
      capMat.stencilWrite = true
      capMat.stencilRef = 0
      capMat.stencilFunc = THREE.NotEqualStencilFunc
      // Writing 0 back resets the buffer for the next structure in the loop.
      capMat.stencilFail = THREE.ReplaceStencilOp
      capMat.stencilZFail = THREE.ReplaceStencilOp
      capMat.stencilZPass = THREE.ReplaceStencilOp
      junk.push(capMat)

      const geo = new THREE.PlaneGeometry(size, size)
      junk.push(geo)
      const cap = new THREE.Mesh(geo, capMat)
      cap.renderOrder = 2 + i * 2
      g.add(cap)
      capMeshes.push(cap)
    })

    return { group: g, caps: capMeshes, disposables: junk }
  }, [targets, plane, selected, size])

  useEffect(() => {
    invalidate()
    return () => {
      for (const d of disposables) d.dispose()
    }
  }, [disposables, invalidate])

  // Keep every cap quad sitting on the plane, facing along its normal.
  useFrame(() => {
    if (!plane) return
    for (const cap of caps) {
      plane.coplanarPoint(cap.position)
      cap.position.addScaledVector(plane.normal, -0.0004)
      cap.lookAt(cap.position.clone().add(plane.normal))
    }
  })

  if (!plane || targets.length === 0) return null
  return <primitive object={group} />
}
