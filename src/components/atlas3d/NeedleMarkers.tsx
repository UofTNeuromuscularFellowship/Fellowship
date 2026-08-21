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
import { buildElectrode, buildNeedle, MARKER_COLORS, MM, CATHODE_OFFSET_MM } from './MarkerShapes'

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

/**
 * The point a distance is measured FROM or TO. For the stimulator that is the
 * cathode tip, not the middle of the probe — the cathode is the pole that
 * depolarises the nerve, so it is what the textbook distance is measured from.
 * It moves with the spin, which is why this has to be derived rather than
 * taken as the marker's own position.
 */
function measurePoint(group: THREE.Object3D, m: NeedleMarker): THREE.Vector3 {
  const p = new THREE.Vector3()
  group.getWorldPosition(p)
  if (m.kind !== 'stim') return p
  const local = new THREE.Vector3(CATHODE_OFFSET_MM * MM, 0, 0)
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(m.spinDeg ?? 0))
  const dir = new THREE.Vector3(...m.direction)
  if (dir.lengthSq() === 0) dir.set(0, -1, 0)
  dir.normalize()
  local.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
  )
  // The offset is in the model's local metres; the parent's world scale is 1,
  // so it can be added directly.
  return p.add(local)
}

export function NeedleMarkers({
  root,
  markers,
  activeId,
  onScreenPositions,
  showDistance,
  onDistance,
}: {
  root: THREE.Object3D
  markers: NeedleMarker[]
  activeId?: string | null
  /** Marker id -> position in canvas pixels, for the side callouts. */
  onScreenPositions?: (p: Record<string, { x: number; y: number; visible: boolean }>) => void
  /** Draw a straight line from the stimulator cathode to G1 and measure it. */
  showDistance?: boolean
  onDistance?: (mm: number | null) => void
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

  // Cathode-to-G1 distance. STRAIGHT LINE through space — a real conduction
  // distance is measured over the skin with a tape and is longer wherever the
  // limb curves between the two, so this is a sanity check on placement, not a
  // number to compute a velocity from. The UI says so.
  useEffect(() => {
    if (!showDistance) {
      onDistance?.(null)
      return
    }
    const stim = attached.find((a) => a.marker.kind === 'stim')
    const g1 = attached.find((a) => a.marker.kind === 'g1')
    if (!stim || !g1) {
      onDistance?.(null)
      return
    }
    root.updateMatrixWorld(true)
    const from = measurePoint(stim.group, stim.marker)
    const to = measurePoint(g1.group, g1.marker)
    onDistance?.(from.distanceTo(to) / MM)

    const geom = new THREE.BufferGeometry().setFromPoints([from, to])
    const mat = new THREE.LineDashedMaterial({
      color: '#0E7C86',
      dashSize: 6 * MM,
      gapSize: 4 * MM,
      transparent: true,
      depthTest: false,
    })
    const line = new THREE.Line(geom, mat)
    line.computeLineDistances()
    line.renderOrder = 9995
    line.userData.atlasMarker = true
    root.add(line)
    invalidate()
    return () => {
      root.remove(line)
      geom.dispose()
      mat.dispose()
    }
  }, [showDistance, attached, root, onDistance, invalidate])

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
