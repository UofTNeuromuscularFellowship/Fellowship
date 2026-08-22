// ---------------------------------------------------------------------------
// Markers in the scene: the EMG needle and the four NCS electrodes.
//
// Each marker is anchored in the LOCAL space of a named mesh and is added as a
// child of that mesh's node, so the scene's own transform carries it — the
// export pipeline recentres each region, and a world-space marker would drift.
//
// The shapes and their render settings live in MarkerShapes.ts; that file
// explains why every part is transparent with depth testing off.
// ---------------------------------------------------------------------------

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { NeedleMarker } from '../../lib/atlas3dMarkers'
import { buildElectrode, buildNeedle, MARKER_COLORS } from './MarkerShapes'

const HIGHLIGHT = '#16B5C2'
const DRAFT = '#E07B2C'

function markerGroup(m: NeedleMarker, active: boolean): THREE.Group {
  const dir = new THREE.Vector3(...m.direction)
  if (dir.lengthSq() === 0) dir.set(0, -1, 0)
  dir.normalize()

  // Draft markers are orange wherever the shape allows it, so an unreviewed
  // marker never passes for an approved one at a glance.
  const tint = active ? HIGHLIGHT : m.status === 'approved' ? MARKER_COLORS[m.kind] : DRAFT

  const inner =
    m.kind === 'needle' ? buildNeedle(m.depthMm ?? 20, tint) : buildElectrode(m.kind)

  if (m.kind !== 'needle' && (active || m.status !== 'approved')) {
    inner.traverse((o) => {
      const mesh = o as THREE.Mesh
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined
      if (mesh.isMesh && mat?.color) {
        mat.color.set(tint)
        mat.emissive?.set(tint)
      }
    })
  }

  // The shapes are built along +Y; rotate the whole group onto the direction
  // that points into the tissue. The surface normal fixes which way the marker
  // faces but not how it is turned on that surface, so `spinDeg` rotates it
  // about its own axis — that is what aims the stimulator's cathode.
  inner.rotation.y = THREE.MathUtils.degToRad(m.spinDeg ?? 0)

  const g = new THREE.Group()
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  g.add(inner)

  const outer = new THREE.Group()
  outer.add(g)
  outer.position.set(...m.local)
  // The viewer's material pass walks every mesh under the model root and
  // reassigns materials. Marker meshes live inside a muscle's node, so they
  // would be recoloured as muscle unless flagged to be skipped.
  outer.traverse((o) => {
    o.userData.atlasMarker = true
  })
  return outer
}

export function NeedleMarkers({
  root,
  markers,
  activeId,
  onScreenPositions,
}: {
  root: THREE.Object3D
  markers: NeedleMarker[]
  activeId?: string | null
  /** Marker id -> position in canvas pixels, for the side callouts. */
  onScreenPositions?: (p: Record<string, { x: number; y: number; visible: boolean }>) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const attached = useMemo(() => {
    const made: Array<{
      group: THREE.Group
      parent: THREE.Object3D
      id: string
      marker: NeedleMarker
    }> = []
    for (const m of markers) {
      const parent = root.getObjectByName(m.meshName)
      if (!parent) continue // mesh renamed or region rebuilt — skip, never guess
      const g = markerGroup(m, m.id === activeId)
      parent.add(g)
      made.push({ group: g, parent, id: m.id, marker: m })
    }
    return made
  }, [root, markers, activeId])

  // Project every marker to screen space so the page can draw its label off to
  // the side, on the white background, with a leader line back to the marker.
  // Text drawn in the scene itself is unreadable against the anatomy.
  useFrame(() => {
    if (!onScreenPositions) return
    const out: Record<string, { x: number; y: number; visible: boolean }> = {}
    const v = new THREE.Vector3()
    for (const { group, id } of attached) {
      group.getWorldPosition(v)
      const behind = v.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) < 0
      v.project(camera)
      out[id] = {
        x: ((v.x + 1) / 2) * size.width,
        y: ((1 - v.y) / 2) * size.height,
        visible: !behind,
      }
    }
    onScreenPositions(out)
  })

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
