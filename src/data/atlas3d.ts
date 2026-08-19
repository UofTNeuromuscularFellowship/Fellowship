// ---------------------------------------------------------------------------
// 3D Atlas — static model manifest and mesh mapping.
//
// This file is the bridge between the clinical text data we already have
// (EMG_MUSCLES in emgAtlas.ts, NERVE_STUDIES in nerveGuide.ts) and the meshes
// inside each region's .glb file.
//
// It contains OUR identifiers only. The models themselves are adapted from
// Z-Anatomy / BodyParts3D under CC BY-SA — see LICENSES-3D.md at the repo root
// for the licence position and the attribution that must be shown in the app.
//
// Phase 0: types + region skeleton, no assets yet. Phase 1 fills in the upper
// limb; tools/atlas-pipeline/validate.mjs checks this file against the shipped
// .glb files and against the atlas data in CI.
// ---------------------------------------------------------------------------

/** Camera framing used when a region first loads. Units match the model (metres). */
export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
}

/** One downloadable region model. */
export interface RegionModel {
  id: string
  /** Shown in the region picker. */
  label: string
  /** Path under /public. Empty string = not built yet. */
  glbPath: string
  /** EMG atlas regions (EMG_REGION_ORDER values) covered by this model. */
  emgRegions: string[]
  /** NCS guide regions (NerveRegion values) covered by this model. */
  ncsRegions: string[]
  defaultCamera: CameraPose
  /**
   * False until the region's asset has been built and validated. The UI shows
   * "3D view not available yet" for anything not ready, rather than failing.
   */
  ready: boolean
}

/**
 * Maps one clinical entry to the mesh(es) that represent it in the region GLB.
 * One-to-many is expected: "Interossei (Foot)" is many meshes; some muscles are
 * split by head in the source data.
 */
export interface MeshMapEntry {
  /** EMG_MUSCLES.id, or a nerve identifier used by NCS mode. */
  targetId: string
  kind: 'muscle' | 'nerve'
  regionId: string
  meshNames: string[]
}

// ---------------------------------------------------------------------------
// Region skeleton. Ordered as the picker shows them. `ready` flips to true in
// the phase that builds each asset — Phase 1 upper limb, Phase 3 the rest.
// ---------------------------------------------------------------------------

export const REGION_MODELS: RegionModel[] = [
  {
    id: 'upper-limb',
    label: 'Upper limb',
    glbPath: '',
    emgRegions: ['Hand', 'Forearm', 'Arm', 'Shoulder', 'Shoulder girdle'],
    ncsRegions: ['Upper limb – motor', 'Upper limb – sensory/mixed'],
    defaultCamera: { position: [0.85, 0.6, 0.85], target: [0, 0.3, 0] },
    ready: false,
  },
  {
    id: 'lower-limb',
    label: 'Lower limb',
    glbPath: '',
    emgRegions: ['Thigh', 'Leg', 'Foot', 'Pelvis & hip'],
    ncsRegions: ['Lower limb – motor', 'Lower limb – sensory/mixed'],
    defaultCamera: { position: [1.0, 0.7, 1.0], target: [0, 0.35, 0] },
    ready: false,
  },
  {
    id: 'head-neck',
    label: 'Head & neck',
    glbPath: '',
    emgRegions: ['Head & neck'],
    ncsRegions: ['Head & neck'],
    defaultCamera: { position: [0.6, 0.5, 0.6], target: [0, 0.3, 0] },
    ready: false,
  },
  {
    id: 'trunk',
    label: 'Trunk & paraspinal',
    glbPath: '',
    emgRegions: ['Paraspinal', 'Abdominal wall', 'Thorax', 'Perineum'],
    ncsRegions: ['Root & pudendal'],
    defaultCamera: { position: [0.9, 0.6, 0.9], target: [0, 0.3, 0] },
    ready: false,
  },
]

/** Mesh mapping. Populated per region by the pipeline; empty until Phase 1. */
export const MESH_MAP: MeshMapEntry[] = []

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function regionForEmgRegion(emgRegion: string): RegionModel | undefined {
  return REGION_MODELS.find((r) => r.emgRegions.includes(emgRegion))
}

export function regionForNcsRegion(ncsRegion: string): RegionModel | undefined {
  return REGION_MODELS.find((r) => r.ncsRegions.includes(ncsRegion))
}

export function meshesFor(targetId: string): string[] {
  return MESH_MAP.filter((m) => m.targetId === targetId).flatMap((m) => m.meshNames)
}

/** True when this clinical entry can be shown in 3D today. */
export function has3dView(targetId: string, region: RegionModel | undefined): boolean {
  return Boolean(region?.ready) && meshesFor(targetId).length > 0
}

export const ANY_REGION_READY = REGION_MODELS.some((r) => r.ready)
