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
    glbPath: '/models/upper-limb.glb',
    emgRegions: ['Hand', 'Forearm', 'Arm', 'Shoulder', 'Shoulder girdle'],
    ncsRegions: ['Upper limb – motor', 'Upper limb – sensory/mixed'],
    // Model is recentred on the limb at export, so the target is the origin.
    // Extent is roughly 0.34 x 0.84 x 0.25 m (x, y-up, z).
    defaultCamera: { position: [0.52, 0.06, 0.72], target: [0, 0, 0] },
    ready: true,
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

/**
 * Mesh mapping, upper limb (Phase 1). Generated against Z-Anatomy source commit
 * 4169f1e and reviewed entry by entry; see docs in tools/atlas-pipeline/.
 *
 * The model ships the RIGHT limb only, so every mesh name ends in "_r".
 * Names are the source's Terminologia Anatomica names normalised to word
 * characters, because three.js's GLTFLoader strips "." and ":" from node names
 * (see tools/atlas-pipeline/extract_region.py).
 * Several muscles map to more than one mesh because the source separates their
 * heads/parts - biceps (2), triceps (3), pectoralis major (3), deltoid (by part),
 * pronator teres (2), FCU/ECU/FDS (2 each), adductor pollicis (2), FPB (2).
 * That split is anatomically real, not a naming artifact.
 *
 * NOT MAPPED: palmaris brevis. It is absent from the source model (only
 * palmaris longus exists there), so it is declared in regions.json ->
 * knownUnmapped and the UI shows "3D view not available" for it. We do not
 * point it at a neighbouring structure.
 */
export const MESH_MAP: MeshMapEntry[] = [
  { targetId: "abductor-digiti-minimi", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Abductor_digiti_minimi_of_hand_r"] },
  { targetId: "abductor-pollicis-brevis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Abductor_pollicis_brevis_r"] },
  { targetId: "abductor-pollicis-longus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Abductor_pollicis_longus_r"] },
  { targetId: "adductor-pollicis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Oblique_head_of_adductor_pollicis_r", "Transverse_head_of_adductor_pollicis_r"] },
  { targetId: "anconeus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Anconeus_muscle_r"] },
  { targetId: "biceps-brachii", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Long_head_of_biceps_brachii_r", "Short_head_of_biceps_brachii_r"] },
  { targetId: "brachialis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Brachialis_muscle_r"] },
  { targetId: "brachioradialis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Brachioradialis_muscle_r"] },
  { targetId: "coracobrachialis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Coracobrachialis_muscle_r"] },
  { targetId: "deltoid-anterior", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Clavicular_part_of_deltoid_muscle_r"] },
  { targetId: "deltoid-middle", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Acromial_part_of_deltoid_muscle_r"] },
  { targetId: "deltoid-posterior", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Scapular_spinal_part_of_deltoid_muscle_r"] },
  { targetId: "dorsal-interossei", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Dorsal_interossei_muscles_of_hand_r"] },
  { targetId: "extensor-carpi-radialis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Extensor_carpi_radialis_brevis_r", "Extensor_carpi_radialis_longus_r"] },
  { targetId: "extensor-carpi-ulnaris", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Humeral_head_of_extensor_carpi_ulnaris_r", "Ulnar_head_of_extensor_carpi_ulnaris_r"] },
  { targetId: "extensor-digitorum-communis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Extensor_digiti_minimi_r", "Extensor_digitorum_r"] },
  { targetId: "extensor-indicis-proprius", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Extensor_indicis_r"] },
  { targetId: "extensor-pollicis-brevis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Extensor_pollicis_brevis_r"] },
  { targetId: "extensor-pollicis-longus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Extensor_pollicis_longus_r"] },
  { targetId: "flexor-carpi-radialis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Flexor_carpi_radialis_r"] },
  { targetId: "flexor-carpi-ulnaris", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Humeral_head_of_flexor_carpi_ulnaris_r", "Ulnar_head_of_flexor_carpi_ulnaris_r"] },
  { targetId: "flexor-digiti-minimi", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Flexor_digiti_minimi_of_hand_r"] },
  { targetId: "flexor-digitorum-profundus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Flexor_digitorum_profundus_r"] },
  { targetId: "flexor-digitorum-superficialis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Humero_ulnar_head_of_flexor_digitorum_superficialis_r", "Radial_head_of_flexor_digitorum_superficialis_r"] },
  { targetId: "flexor-pollicis-brevis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Deep_head_of_flexor_pollicis_brevis_r", "Superficial_head_of_flexor_pollicis_brevis_r"] },
  { targetId: "flexor-pollicis-longus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Flexor_pollicis_longus_r"] },
  { targetId: "infraspinatus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Infraspinatus_muscle_r"] },
  { targetId: "latissimus-dorsi", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Latissimus_dorsi_muscle_r"] },
  { targetId: "levator-scapulae", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Levator_scapulae_r"] },
  { targetId: "lumbricals", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Lumbrical_muscles_of_hand_r"] },
  { targetId: "opponens-digiti-minimi", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Opponens_digiti_minimi_muscle_of_hand_r"] },
  { targetId: "opponens-pollicis", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Opponens_pollicis_muscle_r"] },
  { targetId: "palmaris-longus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Palmaris_longus_muscle_r"] },
  { targetId: "pectoralis-major", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Abdominal_part_of_pectoralis_major_muscle_r", "Clavicular_head_of_pectoralis_major_muscle_r", "Sternocostal_head_of_pectoralis_major_muscle_r"] },
  { targetId: "pectoralis-minor", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Pectoralis_minor_muscle_r"] },
  { targetId: "pronator-quadratus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Pronator_quadratus_r"] },
  { targetId: "pronator-teres", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Deep_head_of_pronator_teres_r", "Superficial_head_of_pronator_teres_r"] },
  { targetId: "rhomboideus-major", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Rhomboid_major_muscle_r"] },
  { targetId: "rhomboideus-minor", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Rhomboid_minor_muscle_r"] },
  { targetId: "serratus-anterior", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Serratus_anterior_muscle_r"] },
  { targetId: "supinator", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Supinator_r"] },
  { targetId: "supraspinatus", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Supraspinatus_muscle_r"] },
  { targetId: "teres-major", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Teres_major_muscle_r"] },
  { targetId: "teres-minor", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Teres_minor_muscle_r"] },
  { targetId: "triceps-brachii", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Lateral_head_of_triceps_brachii_r", "Long_head_of_triceps_brachii_r", "Medial_head_of_triceps_brachii_r"] },
  { targetId: "volar-interossei", kind: 'muscle', regionId: 'upper-limb', meshNames: ["Palmar_interossei_muscles_r"] },
]

/**
 * What each named structure in the GLB actually is. Generated by the pipeline
 * from the source's own object lists — NOT guessed from the mesh name, which
 * is how you end up colouring a muscle as a nerve.
 */
export type StructureKind = 'muscle' | 'bone' | 'nerve' | 'artery' | 'vein'

export const STRUCTURE_KINDS: Record<string, StructureKind> = {
  "Abdominal_part_of_pectoralis_major_muscle_r": "muscle",
  "Abductor_digiti_minimi_of_hand_r": "muscle",
  "Abductor_pollicis_brevis_r": "muscle",
  "Abductor_pollicis_longus_r": "muscle",
  "Acromial_part_of_deltoid_muscle_r": "muscle",
  "Anconeus_muscle_r": "muscle",
  "Anterior_interosseous_nerve_of_forearm_r": "nerve",
  "Axillary_artery_r": "artery",
  "Axillary_nerve_r": "nerve",
  "Axillary_vein_r": "vein",
  "Basilic_vein_r": "vein",
  "Brachial_artery_r": "artery",
  "Brachial_veins_r": "vein",
  "Brachialis_muscle_r": "muscle",
  "Brachioradialis_muscle_r": "muscle",
  "Capitate_bone_r": "bone",
  "Cephalic_vein_r": "vein",
  "Clavicle_r": "bone",
  "Clavicular_head_of_pectoralis_major_muscle_r": "muscle",
  "Clavicular_part_of_deltoid_muscle_r": "muscle",
  "Common_interosseous_artery_r": "artery",
  "Common_palmar_digital_branches_of_median_nerve_r": "nerve",
  "Common_palmar_digital_branches_of_ulnar_nerve_r": "nerve",
  "Coracobrachialis_muscle_r": "muscle",
  "Deep_branch_of_radial_nerve_r": "nerve",
  "Deep_branch_of_ulnar_nerve_r": "nerve",
  "Deep_head_of_flexor_pollicis_brevis_r": "muscle",
  "Deep_head_of_pronator_teres_r": "muscle",
  "Deep_palmar_arch_r": "artery",
  "Distal_phalanx_of_fifth_finger_of_hand_r": "bone",
  "Distal_phalanx_of_first_finger_of_hand_r": "bone",
  "Distal_phalanx_of_fourth_finger_of_hand_r": "bone",
  "Distal_phalanx_of_second_finger_of_hand_r": "bone",
  "Distal_phalanx_of_third_finger_of_hand_r": "bone",
  "Dorsal_branch_of_ulnar_nerve_r": "nerve",
  "Dorsal_interossei_muscles_of_hand_r": "muscle",
  "Dorsal_scapular_nerve_r": "nerve",
  "Extensor_carpi_radialis_brevis_r": "muscle",
  "Extensor_carpi_radialis_longus_r": "muscle",
  "Extensor_digiti_minimi_r": "muscle",
  "Extensor_digitorum_r": "muscle",
  "Extensor_indicis_r": "muscle",
  "Extensor_pollicis_brevis_r": "muscle",
  "Extensor_pollicis_longus_r": "muscle",
  "Fifth_metacarpal_bone_r": "bone",
  "First_metacarpal_bone_r": "bone",
  "Flexor_carpi_radialis_r": "muscle",
  "Flexor_digiti_minimi_of_hand_r": "muscle",
  "Flexor_digitorum_profundus_r": "muscle",
  "Flexor_pollicis_longus_r": "muscle",
  "Fourth_metacarpal_bone_r": "bone",
  "Hamate_bone_r": "bone",
  "Humeral_head_of_extensor_carpi_ulnaris_r": "muscle",
  "Humeral_head_of_flexor_carpi_ulnaris_r": "muscle",
  "Humero_ulnar_head_of_flexor_digitorum_superficialis_r": "muscle",
  "Humerus_r": "bone",
  "Infraspinatus_muscle_r": "muscle",
  "Lateral_antebrachial_cutaneous_nerve_r": "nerve",
  "Lateral_head_of_triceps_brachii_r": "muscle",
  "Latissimus_dorsi_muscle_r": "muscle",
  "Levator_scapulae_r": "muscle",
  "Long_head_of_biceps_brachii_r": "muscle",
  "Long_head_of_triceps_brachii_r": "muscle",
  "Long_thoracic_nerve_r": "nerve",
  "Lumbrical_muscles_of_hand_r": "muscle",
  "Lunate_bone_r": "bone",
  "Medial_antebrachial_cutaneous_nerve_r": "nerve",
  "Medial_brachial_cutaneous_nerve_r": "nerve",
  "Medial_head_of_triceps_brachii_r": "muscle",
  "Median_cubital_vein_r": "vein",
  "Median_nerve_r": "nerve",
  "Middle_phalanx_of_fifth_finger_of_hand_r": "bone",
  "Middle_phalanx_of_fourth_finger_of_hand_r": "bone",
  "Middle_phalanx_of_second_finger_of_hand_r": "bone",
  "Middle_phalanx_of_third_finger_of_hand_r": "bone",
  "Musculocutaneous_nerve_r": "nerve",
  "Oblique_head_of_adductor_pollicis_r": "muscle",
  "Opponens_digiti_minimi_muscle_of_hand_r": "muscle",
  "Opponens_pollicis_muscle_r": "muscle",
  "Palmar_interossei_muscles_r": "muscle",
  "Palmaris_longus_muscle_r": "muscle",
  "Pectoralis_minor_muscle_r": "muscle",
  "Pisiform_bone_r": "bone",
  "Posterior_cord_of_brachial_plexus_r": "nerve",
  "Posterior_interosseous_artery_r": "artery",
  "Posterior_interosseous_nerve_of_forearm_r": "nerve",
  "Pronator_quadratus_r": "muscle",
  "Proximal_phalanx_of_fifth_finger_of_hand_r": "bone",
  "Proximal_phalanx_of_first_finger_of_hand_r": "bone",
  "Proximal_phalanx_of_fourth_finger_of_hand_r": "bone",
  "Proximal_phalanx_of_second_finger_of_hand_r": "bone",
  "Proximal_phalanx_of_third_finger_of_hand_r": "bone",
  "Radial_artery_r": "artery",
  "Radial_head_of_flexor_digitorum_superficialis_r": "muscle",
  "Radial_nerve_r": "nerve",
  "Radius_r": "bone",
  "Rhomboid_major_muscle_r": "muscle",
  "Rhomboid_minor_muscle_r": "muscle",
  "Scaphoid_bone_r": "bone",
  "Scapula_r": "bone",
  "Scapular_spinal_part_of_deltoid_muscle_r": "muscle",
  "Second_metacarpal_bone_r": "bone",
  "Serratus_anterior_muscle_r": "muscle",
  "Short_head_of_biceps_brachii_r": "muscle",
  "Sternocostal_head_of_pectoralis_major_muscle_r": "muscle",
  "Superficial_branch_of_radial_nerve_r": "nerve",
  "Superficial_branch_of_ulnar_nerve_r": "nerve",
  "Superficial_head_of_flexor_pollicis_brevis_r": "muscle",
  "Superficial_head_of_pronator_teres_r": "muscle",
  "Superficial_palmar_arch_r": "artery",
  "Supinator_r": "muscle",
  "Suprascapular_nerve_r": "nerve",
  "Supraspinatus_muscle_r": "muscle",
  "Teres_major_muscle_r": "muscle",
  "Teres_minor_muscle_r": "muscle",
  "Third_metacarpal_bone_r": "bone",
  "Thoracodorsal_nerve_r": "nerve",
  "Transverse_head_of_adductor_pollicis_r": "muscle",
  "Trapezium_bone_r": "bone",
  "Trapezoid_bone_r": "bone",
  "Triquetrum_bone_r": "bone",
  "Ulna_r": "bone",
  "Ulnar_artery_r": "artery",
  "Ulnar_head_of_extensor_carpi_ulnaris_r": "muscle",
  "Ulnar_head_of_flexor_carpi_ulnaris_r": "muscle",
  "Ulnar_nerve_r": "nerve",
}

export function kindOf(meshName: string): StructureKind | undefined {
  return STRUCTURE_KINDS[meshName]
}

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
