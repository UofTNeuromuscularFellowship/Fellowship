// ---------------------------------------------------------------------------
// The 3D shapes used for markers: the EMG needle and the four NCS electrodes.
//
// VISIBILITY. Every marker part is built with `transparent: true`,
// `depthTest: false` and a very high renderOrder. All three are needed:
//
//   - depthTest off, so a shaft buried in muscle is not hidden by the tissue
//     it is inside — the whole point is to show where it sits.
//   - transparent true, because three.js draws all opaque objects before any
//     transparent ones. An OPAQUE marker is drawn first and then painted over
//     by the semi-transparent muscles, which is why the needle used to appear
//     only in cross-section or at odd angles.
//   - a high renderOrder so that within the transparent pass it is drawn last.
//
// SCALE. Depth is true to scale. Thickness is not: a real concentric EMG
// needle is about 0.45 mm across, which is sub-pixel at any zoom where you can
// see the whole limb, so the shaft is drawn thicker than life. Proportions are
// kept needle-like — a long fine cannula, a short bevel, a slim hub.
// ---------------------------------------------------------------------------

import * as THREE from 'three'

export const MM = 0.001
const ORDER = 9990

export type ElectrodeKind = 'needle' | 'stim' | 'g1' | 'g2' | 'ground' | 'landmark'

/** Colours follow the conventions used on a real bench. */
export const MARKER_COLORS: Record<ElectrodeKind, string> = {
  needle: '#2B3A4D',
  stim: '#F0B429',
  g1: '#111827', // active — black
  g2: '#C0392B', // reference — red
  ground: '#1E874B', // ground — green
  landmark: '#6B4E8F', // reference point, not hardware
}

export const MARKER_LABELS: Record<ElectrodeKind, string> = {
  needle: 'Needle',
  stim: 'Stimulator',
  g1: 'G1 — active',
  g2: 'G2 — reference',
  ground: 'Ground',
  landmark: 'Landmark',
}

function markerMaterial(color: string, opts: { metal?: boolean; glow?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.metal ? 0.25 : 0.45,
    metalness: opts.metal ? 0.8 : 0.05,
    emissive: new THREE.Color(color),
    emissiveIntensity: opts.glow ?? 0.15,
  })
  m.transparent = true
  m.opacity = 1
  m.depthTest = false
  m.depthWrite = false
  return m
}

function add(group: THREE.Group, mesh: THREE.Mesh, order = 0) {
  mesh.renderOrder = ORDER + order
  mesh.userData.atlasMarker = true
  group.add(mesh)
}

/**
 * A concentric EMG needle: fine cannula, short bevelled tip, slim hub sitting
 * proud of the surface. `depthMm` is the insertion depth and is to scale.
 */
export function buildNeedle(depthMm: number, hubColor: string): THREE.Group {
  const g = new THREE.Group()
  const depth = Math.max(depthMm, 2) * MM

  const R_CANNULA = 0.7 * MM
  const R_HUB = 1.9 * MM
  const BEVEL = 2.2 * MM
  const HUB = 9 * MM

  const steel = markerMaterial('#AEB6C2', { metal: true, glow: 0.05 })
  const hubMat = markerMaterial(hubColor, { glow: 0.3 })

  // Everything is built along +Y then rotated onto the insertion direction by
  // the caller, so here +Y means "further into the tissue".
  const shaftLen = Math.max(depth - BEVEL, 0.5 * MM)
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(R_CANNULA, R_CANNULA, shaftLen, 12),
    steel,
  )
  shaft.position.y = shaftLen / 2
  add(g, shaft, 1)

  // Bevel: a real needle is ground at roughly 15°, so the tip is a long
  // shallow point rather than a cone stuck on the end.
  const tip = new THREE.Mesh(new THREE.ConeGeometry(R_CANNULA, BEVEL, 12), steel)
  tip.position.y = depth - BEVEL / 2
  add(g, tip, 1)

  // Hub above the surface, tapering the way a moulded hub does.
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R_HUB * 0.6, R_HUB, HUB, 14), hubMat)
  hub.position.y = -HUB / 2
  add(g, hub, 2)

  // Collar where hub meets skin, so the entry point itself is unambiguous.
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(R_HUB * 1.25, R_HUB * 1.25, 0.9 * MM, 16),
    hubMat,
  )
  collar.position.y = -0.45 * MM
  add(g, collar, 3)

  return g
}

/**
 * Surface electrodes. G1/G2/ground are flat discs the way a surface electrode
 * sits on skin; the stimulator is a two-pronged probe (cathode and anode) held
 * against the surface.
 */
export function buildElectrode(kind: Exclude<ElectrodeKind, 'needle'>): THREE.Group {
  const g = new THREE.Group()
  const color = MARKER_COLORS[kind]
  const mat = markerMaterial(color, { glow: 0.3 })

  if (kind === 'landmark') {
    // A reference point, not hardware: a pin whose head sits clear of the
    // surface so the callout line has something to point at.
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * MM, 0.6 * MM, 7 * MM, 8), mat)
    pin.position.y = -3.5 * MM
    add(g, pin, 1)
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.4 * MM, 16, 12), mat)
    head.position.y = -7 * MM
    add(g, head, 2)
    return g
  }

  if (kind === 'stim') {
    const steel = markerMaterial('#AEB6C2', { metal: true, glow: 0.05 })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3 * MM, 3.6 * MM, 12 * MM, 14), mat)
    body.position.y = -10 * MM
    add(g, body, 2)

    // Two prongs about 25 mm apart, the usual cathode/anode spacing on a bar
    // stimulator. WHICH WAY ROUND THIS SITS MATTERS: the cathode is the pole
    // that depolarises the nerve, so it must face the recording electrode.
    // The cathode is drawn black with a black collar; the anode is bare steel.
    // Rotate the marker (spin) to aim the cathode.
    const CATHODE_X = -6 * MM
    const ANODE_X = 6 * MM
    const black = markerMaterial('#111827', { metal: true, glow: 0.05 })

    for (const [dx, prongMat] of [
      [CATHODE_X, black],
      [ANODE_X, steel],
    ] as const) {
      const prong = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2 * MM, 1.2 * MM, 5 * MM, 10),
        prongMat,
      )
      prong.position.set(dx, -2 * MM, 0)
      add(g, prong, 1)
      const tipDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8 * MM, 1.8 * MM, 0.9 * MM, 12),
        prongMat,
      )
      tipDisc.position.set(dx, 0, 0)
      add(g, tipDisc, 1)
    }

    // A short fin on the cathode side, so which way the probe is turned is
    // readable even when the two prongs overlap on screen.
    const fin = new THREE.Mesh(new THREE.BoxGeometry(5 * MM, 1 * MM, 1.4 * MM), black)
    fin.position.set(CATHODE_X - 3 * MM, -5 * MM, 0)
    add(g, fin, 2)

    return g
  }

  // Disc electrode: a flat pad with a small lead stub so it reads as an
  // electrode rather than a dot.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4 * MM, 4 * MM, 1.6 * MM, 20), mat)
  disc.position.y = -0.8 * MM
  add(g, disc, 1)

  const rim = new THREE.Mesh(new THREE.TorusGeometry(4 * MM, 0.5 * MM, 8, 22), mat)
  rim.rotation.x = Math.PI / 2
  rim.position.y = -1.6 * MM
  add(g, rim, 2)

  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * MM, 0.8 * MM, 4 * MM, 8), mat)
  stub.position.y = -3.5 * MM
  add(g, stub, 2)

  return g
}
