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
    glbPath: '/models/lower-limb.glb',
    emgRegions: ['Thigh', 'Leg', 'Foot', 'Pelvis & hip'],
    ncsRegions: ['Lower limb – motor', 'Lower limb – sensory/mixed'],
    defaultCamera: { position: [1.1, 0.25, 1.1], target: [0, 0, 0] },
    ready: true,
  },
  {
    id: 'head-neck',
    label: 'Head & neck',
    glbPath: '/models/head-neck.glb',
    emgRegions: ['Head & neck'],
    ncsRegions: ['Head & neck'],
    defaultCamera: { position: [0.5, 0.1, 0.5], target: [0, 0, 0] },
    ready: true,
  },
  {
    id: 'trunk',
    label: 'Trunk & paraspinal',
    glbPath: '/models/trunk.glb',
    emgRegions: ['Paraspinal', 'Abdominal wall', 'Thorax', 'Perineum'],
    ncsRegions: ['Root & pudendal'],
    defaultCamera: { position: [0.6, 0.1, 0.6], target: [0, 0, 0] },
    ready: true,
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
  { targetId: "adductor-brevis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Adductor_brevis_r"] },
  { targetId: "adductor-longus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Adductor_longus_r"] },
  { targetId: "adductor-magnus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Adductor_magnus_r"] },
  { targetId: "biceps-femoris-long-head", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Long_head_of_biceps_femoris_r"] },
  { targetId: "biceps-femoris-short-head", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Short_head_of_biceps_femoris_r"] },
  { targetId: "gracilis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Gracilis_muscle_r"] },
  { targetId: "iliopsoas", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Iliacus_muscle_r", "Psoas_major_r"] },
  { targetId: "pectineus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Pectineus_muscle_r"] },
  { targetId: "rectus-femoris", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Rectus_femoris_muscle_r"] },
  { targetId: "sartorius", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Sartorius_muscle_r"] },
  { targetId: "semimembranosus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Semimembranosus_muscle_r"] },
  { targetId: "semitendinosus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Semitendinosus_muscle_r"] },
  { targetId: "tensor-fasciae-latae", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Tensor_fasciae_latae_r"] },
  { targetId: "vastus-intermedius", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Vastus_intermedius_muscle_r"] },
  { targetId: "vastus-lateralis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Vastus_lateralis_muscle_r"] },
  { targetId: "vastus-medialis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Vastus_medialis_muscle_r"] },
  { targetId: "gluteus-maximus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Gluteus_maximus_muscle_r"] },
  { targetId: "gluteus-medius", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Gluteus_medius_muscle_r"] },
  { targetId: "gluteus-minimus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Gluteus_minimus_muscle_r"] },
  { targetId: "obturator-internus-and-gemelli", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Inferior_gemellus_muscle_r", "Obturator_internus_r", "Superior_gemellus_muscle_r"] },
  { targetId: "piriformis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Piriformis_muscle_r"] },
  { targetId: "quadratus-femoris", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Quadratus_femoris_muscle_r"] },
  { targetId: "extensor-digitorum-longus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Extensor_digitorum_longus_r"] },
  { targetId: "extensor-hallucis-longus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Extensor_hallucis_longus_r"] },
  { targetId: "flexor-digitorum-longus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Flexor_digitorum_longus_r"] },
  { targetId: "flexor-hallucis-longus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Flexor_hallucis_longus_r"] },
  { targetId: "gastrocnemius-lateral-head", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Lateral_head_of_gastrocnemius_r"] },
  { targetId: "gastrocnemius-medial-head", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Medial_head_of_gastrocnemius_r"] },
  { targetId: "peroneus-brevis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Fibularis_brevis_muscle_r"] },
  { targetId: "peroneus-longus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Fibularis_longus_muscle_r"] },
  { targetId: "peroneus-tertius", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Fibularis_tertius_muscle_r"] },
  { targetId: "popliteus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Popliteus_muscle_r"] },
  { targetId: "soleus", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Soleus_muscle_r"] },
  { targetId: "tibialis-anterior", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Tibialis_anterior_muscle_r"] },
  { targetId: "tibialis-posterior", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Tibialis_posterior_muscle_r"] },
  { targetId: "abductor-digiti-quinti", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Abductor_digiti_minimi_of_foot_r"] },
  { targetId: "abductor-hallucis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Abductor_hallucis_r"] },
  { targetId: "adductor-hallucis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Oblique_head_of_adductor_hallucis_r", "Transverse_head_of_adductor_hallucis_r"] },
  { targetId: "extensor-digitorum-brevis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Extensor_digitorum_brevis_r", "Extensor_hallucis_brevis_r"] },
  { targetId: "flexor-digiti-quinti-brevis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["x_r"] },
  { targetId: "flexor-digitorum-brevis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Flexor_digitorum_brevis_r"] },
  { targetId: "flexor-hallucis-brevis", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Lateral_head_of_flexor_hallucis_brevis_r", "Medial_head_of_flexor_hallucis_brevis_r"] },
  { targetId: "interossei-foot", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Dorsal_interossei_muscles_of_foot_r", "Plantar_interossei_muscles_r"] },
  { targetId: "quadratus-plantae", kind: 'muscle', regionId: 'lower-limb', meshNames: ["Quadratus_plantae_muscle_r"] },
  { targetId: "cricothyroid", kind: 'muscle', regionId: 'head-neck', meshNames: ["Oblique_part_of_cricothyroid_muscle_r", "Straight_part_of_cricothyroid_muscle_r"] },
  { targetId: "masseter", kind: 'muscle', regionId: 'head-neck', meshNames: ["Masseteric_fascia_r"] },
  { targetId: "orbicularis-oculi", kind: 'muscle', regionId: 'head-neck', meshNames: ["Orbital_part_of_orbicularis_oculi_r"] },
  { targetId: "orbicularis-oris", kind: 'muscle', regionId: 'head-neck', meshNames: ["Orbicularis_oris_muscle_r"] },
  { targetId: "sterno-cleido-mastoid", kind: 'muscle', regionId: 'head-neck', meshNames: ["Sternocleidomastoid_muscle_r"] },
  { targetId: "temporalis", kind: 'muscle', regionId: 'head-neck', meshNames: ["Temporalis_muscle_r"] },
  { targetId: "tongue", kind: 'muscle', regionId: 'head-neck', meshNames: ["Tongue"] },
  { targetId: "trapezius-lower", kind: 'muscle', regionId: 'head-neck', meshNames: ["Ascending_part_of_trapezius_muscle_r"] },
  { targetId: "trapezius-middle", kind: 'muscle', regionId: 'head-neck', meshNames: ["Transverse_part_of_trapezius_muscle_r"] },
  { targetId: "trapezius-upper", kind: 'muscle', regionId: 'head-neck', meshNames: ["Descending_part_of_trapezius_muscle_r"] },
  { targetId: "vocalis-thyroarytenoid", kind: 'muscle', regionId: 'head-neck', meshNames: ["External_part_of_thyro_arytenoid_muscle_r", "Thyro_epiglottic_part_of_thyro_arytenoid_muscle_r"] },
  { targetId: "paraspinals", kind: 'muscle', regionId: 'trunk', meshNames: ["Iliocostalis_lumborum_muscle_r", "Iliocostalis_thoracis_muscle_r", "Longissimus_colli_muscle_r", "Longissimus_thoracis_muscle_r", "Multifidus_lumborum_muscle_r", "Multifidus_thoracis_muscle_r", "Spinalis_thoracis_muscle_r"] },
  { targetId: "quadratus-lumborum", kind: 'muscle', regionId: 'trunk', meshNames: ["Quadratus_lumborum_muscle_r"] },
  { targetId: "external-oblique", kind: 'muscle', regionId: 'trunk', meshNames: ["External_abdominal_oblique_muscle_r"] },
  { targetId: "rectus-abdominis", kind: 'muscle', regionId: 'trunk', meshNames: ["Rectus_abdominis_muscle_r"] },
  { targetId: "diaphragm", kind: 'muscle', regionId: 'trunk', meshNames: ["Diaphragm"] },
  { targetId: "intercostals", kind: 'muscle', regionId: 'trunk', meshNames: ["External_intercostal_muscles_r", "Innermost_intercostal_muscles_r", "Internal_intercostal_muscles_r"] },
  { targetId: "sphincter-ani-externus", kind: 'muscle', regionId: 'trunk', meshNames: ["External_anal_sphincter_r"] },
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
  "Abdominal_aorta": "artery",
  "Abductor_digiti_minimi_of_foot_r": "muscle",
  "Abductor_hallucis_r": "muscle",
  "Accessory_nerve_XI_r": "nerve",
  "Adductor_brevis_r": "muscle",
  "Adductor_longus_r": "muscle",
  "Adductor_magnus_r": "muscle",
  "Anterior_branch_of_obturator_nerve_r": "nerve",
  "Anterior_division_of_mandibular_nerve_r": "nerve",
  "Anterior_tibial_artery_r": "artery",
  "Ascending_part_of_trapezius_muscle_r": "muscle",
  "Body_of_sternum": "bone",
  "Calcaneus_r": "bone",
  "Coccyx": "bone",
  "Common_fibular_nerve_r": "nerve",
  "Cricoid_cartilage": "bone",
  "Cuboid_bone_r": "bone",
  "Deep_femoral_artery_r": "artery",
  "Deep_fibular_nerve_r": "nerve",
  "Descending_part_of_trapezius_muscle_r": "muscle",
  "Diaphragm": "muscle",
  "Distal_phalanx_of_fifth_finger_of_foot_r": "bone",
  "Distal_phalanx_of_first_finger_of_foot_r": "bone",
  "Distal_phalanx_of_fourth_finger_of_foot_r": "bone",
  "Distal_phalanx_of_second_finger_of_foot_r": "bone",
  "Distal_phalanx_of_third_finger_of_foot_r": "bone",
  "Dorsal_interossei_muscles_of_foot_r": "muscle",
  "Dorsalis_pedis_artery_r": "artery",
  "Eighth_rib_r": "bone",
  "Eleventh_rib_r": "bone",
  "Extensor_digitorum_brevis_r": "muscle",
  "Extensor_digitorum_longus_r": "muscle",
  "Extensor_hallucis_brevis_r": "muscle",
  "Extensor_hallucis_longus_r": "muscle",
  "External_abdominal_oblique_muscle_r": "muscle",
  "External_anal_sphincter_r": "muscle",
  "External_carotid_artery_r": "artery",
  "External_intercostal_muscles_r": "muscle",
  "External_jugular_vein_r": "vein",
  "External_part_of_thyro_arytenoid_muscle_r": "muscle",
  "Facial_artery_r": "artery",
  "Facial_nerve_VII_r": "nerve",
  "Femoral_artery_r": "artery",
  "Femoral_nerve_r": "nerve",
  "Femoral_vein_r": "vein",
  "Femur_r": "bone",
  "Fibula_r": "bone",
  "Fibular_artery_r": "artery",
  "Fibularis_brevis_muscle_r": "muscle",
  "Fibularis_longus_muscle_r": "muscle",
  "Fibularis_tertius_muscle_r": "muscle",
  "Fifth_metatarsal_bone_r": "bone",
  "Fifth_rib_r": "bone",
  "First_metatarsal_bone_r": "bone",
  "First_rib_r": "bone",
  "Flexor_digitorum_brevis_r": "muscle",
  "Flexor_digitorum_longus_r": "muscle",
  "Flexor_hallucis_longus_r": "muscle",
  "Fourth_metatarsal_bone_r": "bone",
  "Fourth_rib_r": "bone",
  "Frontal_bone": "bone",
  "Genitofemoral_nerve_r": "nerve",
  "Gluteus_maximus_muscle_r": "muscle",
  "Gluteus_medius_muscle_r": "muscle",
  "Gluteus_minimus_muscle_r": "muscle",
  "Gracilis_muscle_r": "muscle",
  "Great_saphenous_vein_r": "vein",
  "Hip_bone_r": "bone",
  "Hyoid_bone": "bone",
  "Hypoglossal_nerve_XII_r": "nerve",
  "Iliacus_muscle_r": "muscle",
  "Iliocostalis_lumborum_muscle_r": "muscle",
  "Iliocostalis_thoracis_muscle_r": "muscle",
  "Iliohypogastric_nerve_r": "nerve",
  "Inferior_epigastric_artery_r": "artery",
  "Inferior_gemellus_muscle_r": "muscle",
  "Infrapatellar_branch_of_saphenous_nerve_r": "nerve",
  "Innermost_intercostal_muscles_r": "muscle",
  "Intercostal_nerves_r": "nerve",
  "Intermediate_cuneiform_bone_r": "bone",
  "Internal_carotid_artery_r": "artery",
  "Internal_intercostal_muscles_r": "muscle",
  "Internal_jugular_vein_r": "vein",
  "Internal_pudendal_artery_r": "artery",
  "Lateral_cuneiform_bone_r": "bone",
  "Lateral_femoral_cutaneous_nerve_r": "nerve",
  "Lateral_head_of_flexor_hallucis_brevis_r": "muscle",
  "Lateral_head_of_gastrocnemius_r": "muscle",
  "Lateral_plantar_nerve_r": "nerve",
  "Left_common_carotid_artery": "artery",
  "Long_head_of_biceps_femoris_r": "muscle",
  "Longissimus_colli_muscle_r": "muscle",
  "Longissimus_thoracis_muscle_r": "muscle",
  "Mandible": "bone",
  "Manubrium_of_sternum": "bone",
  "Masseteric_fascia_r": "muscle",
  "Maxilla_r": "bone",
  "Maxillary_nerve_r": "nerve",
  "Medial_cuneiform_bone_r": "bone",
  "Medial_head_of_flexor_hallucis_brevis_r": "muscle",
  "Medial_head_of_gastrocnemius_r": "muscle",
  "Medial_plantar_nerve_r": "nerve",
  "Medial_sural_cutaneous_nerve_r": "nerve",
  "Middle_phalanx_of_fifth_finger_of_foot_r": "bone",
  "Middle_phalanx_of_fourth_finger_of_foot_r": "bone",
  "Middle_phalanx_of_second_finger_of_foot_r": "bone",
  "Middle_phalanx_of_third_finger_of_foot_r": "bone",
  "Multifidus_lumborum_muscle_r": "muscle",
  "Multifidus_thoracis_muscle_r": "muscle",
  "Nasal_bone_r": "bone",
  "Navicular_bone_r": "bone",
  "Ninth_rib_r": "bone",
  "Oblique_head_of_adductor_hallucis_r": "muscle",
  "Oblique_part_of_cricothyroid_muscle_r": "muscle",
  "Obturator_internus_r": "muscle",
  "Obturator_nerve_r": "nerve",
  "Occipital_bone": "bone",
  "Ophthalmic_nerve_r": "nerve",
  "Orbicularis_oris_muscle_r": "muscle",
  "Orbital_part_of_orbicularis_oculi_r": "muscle",
  "Parietal_bone_r": "bone",
  "Patella_r": "bone",
  "Pectineus_muscle_r": "muscle",
  "Piriformis_muscle_r": "muscle",
  "Plantar_interossei_muscles_r": "muscle",
  "Popliteal_artery_r": "artery",
  "Popliteal_vein_r": "vein",
  "Popliteus_muscle_r": "muscle",
  "Posterior_branch_of_obturator_nerve_r": "nerve",
  "Posterior_division_of_mandibular_nerve_r": "nerve",
  "Posterior_femoral_cutaneous_nerve_r": "nerve",
  "Posterior_tibial_artery_r": "artery",
  "Proximal_phalanx_of_fifth_finger_of_foot_r": "bone",
  "Proximal_phalanx_of_first_finger_of_foot_r": "bone",
  "Proximal_phalanx_of_fourth_finger_of_foot_r": "bone",
  "Proximal_phalanx_of_second_finger_of_foot_r": "bone",
  "Proximal_phalanx_of_third_finger_of_foot_r": "bone",
  "Psoas_major_r": "muscle",
  "Pudendal_nerve_r": "nerve",
  "Quadratus_femoris_muscle_r": "muscle",
  "Quadratus_lumborum_muscle_r": "muscle",
  "Quadratus_plantae_muscle_r": "muscle",
  "Rectus_abdominis_muscle_r": "muscle",
  "Rectus_femoris_muscle_r": "muscle",
  "Right_common_carotid_artery": "artery",
  "Sacrum": "bone",
  "Saphenous_nerve_r": "nerve",
  "Sartorius_muscle_r": "muscle",
  "Sciatic_nerve_r": "nerve",
  "Second_metatarsal_bone_r": "bone",
  "Second_rib_r": "bone",
  "Semimembranosus_muscle_r": "muscle",
  "Semitendinosus_muscle_r": "muscle",
  "Seventh_rib_r": "bone",
  "Short_head_of_biceps_femoris_r": "muscle",
  "Sixth_rib_r": "bone",
  "Small_saphenous_vein_r": "vein",
  "Soleus_muscle_r": "muscle",
  "Sphenoid_bone": "bone",
  "Spinalis_thoracis_muscle_r": "muscle",
  "Sternocleidomastoid_muscle_r": "muscle",
  "Straight_part_of_cricothyroid_muscle_r": "muscle",
  "Superficial_fibular_nerve_r": "nerve",
  "Superficial_temporal_artery_r": "artery",
  "Superior_epigastric_artery_r": "artery",
  "Superior_gemellus_muscle_r": "muscle",
  "Superior_gluteal_nerve_r": "nerve",
  "Sural_nerve_r": "nerve",
  "Talus_r": "bone",
  "Temporal_bone_r": "bone",
  "Temporalis_muscle_r": "muscle",
  "Tensor_fasciae_latae_r": "muscle",
  "Tenth_rib_r": "bone",
  "Third_metatarsal_bone_r": "bone",
  "Third_rib_r": "bone",
  "Thoracic_aorta": "artery",
  "Thyro_epiglottic_part_of_thyro_arytenoid_muscle_r": "muscle",
  "Thyroid_cartilage": "bone",
  "Tibia_r": "bone",
  "Tibial_nerve_r": "nerve",
  "Tibialis_anterior_muscle_r": "muscle",
  "Tibialis_posterior_muscle_r": "muscle",
  "Tongue": "muscle",
  "Transverse_head_of_adductor_hallucis_r": "muscle",
  "Transverse_part_of_trapezius_muscle_r": "muscle",
  "Trigeminal_nerve_V_r": "nerve",
  "Twelfth_rib_r": "bone",
  "Vagus_nerve_X_r": "nerve",
  "Vastus_intermedius_muscle_r": "muscle",
  "Vastus_lateralis_muscle_r": "muscle",
  "Vastus_medialis_muscle_r": "muscle",
  "Xiphoid_process": "bone",
  "Zygomatic_bone_r": "bone",
  "x_r": "muscle",
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
