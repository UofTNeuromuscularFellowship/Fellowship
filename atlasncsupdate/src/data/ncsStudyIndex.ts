// ---------------------------------------------------------------------------
// Nerve conduction study index — reviewed, not inferred.
//
// Two things the study text does not carry in machine-readable form:
//
//   nerve    the nerve being tested, used to group and filter the study list
//   muscles  the EMG_MUSCLES id(s) the study RECORDS from, used to highlight
//            the recording muscle on the model in nerve conduction mode
//
// Both are written out one study at a time rather than matched by string,
// because a near-match here puts the highlight on the wrong muscle and there
// is nothing downstream that can catch it. The same rule produced the mesh map
// (where fuzzy matching offered "Palm" for palmaris brevis and "Urethra" for
// the urethral sphincter).
//
// muscles: [] is a deliberate statement, not a gap, wherever:
//   - the study records from SKIN (all sensory and mixed studies), or
//   - the recording site is chosen per patient ("any appropriate muscle"),
//     so no single muscle can be shown as "the" recording site, or
//   - the muscle named has no entry in EMG_MUSCLES (noted inline).
//
// Every id below is checked against NERVE_STUDIES and EMG_MUSCLES by
// tools/atlas-pipeline/validate.mjs, so a renamed study or muscle fails the
// build instead of silently dropping a highlight.
// ---------------------------------------------------------------------------

export interface NcsIndexEntry {
  /** Nerve tested, for grouping and search. */
  nerve: string
  /** EMG_MUSCLES ids recorded from. Empty = nothing to highlight (see above). */
  muscles: string[]
  /**
   * Everyday lab shorthand for this study, so the search box finds it the way
   * people actually type it ("APB", "FDI", "LFCN"). Only shorthand in common
   * use is listed — this is not a place to coin abbreviations.
   */
  abbr?: string[]
}

export const NCS_STUDY_INDEX: Record<string, NcsIndexEntry> = {
  // ---- Upper limb – motor ------------------------------------------------
  'axillary-motor-deltoid': { nerve: 'Axillary', muscles: ['deltoid-middle'] },
  'h-reflex-fcr': { nerve: 'Median', muscles: ['flexor-carpi-radialis'], abbr: ['FCR'] },
  'long-thoracic-serratus-anterior': { nerve: 'Long thoracic', muscles: ['serratus-anterior'] },
  'median-ain-pronator-quadratus': { nerve: 'Median', muscles: ['pronator-quadratus'], abbr: ['AIN', 'PQ'] },
  // Both lumbrical studies record over the lumbrical mass; the atlas models
  // the lumbricals as one target.
  'median-motor-1st-lumbrical': { nerve: 'Median', muscles: ['lumbricals'] },
  'median-motor-2nd-lumbrical': { nerve: 'Median', muscles: ['lumbricals'] },
  'median-motor-apb': { nerve: 'Median', muscles: ['abductor-pollicis-brevis'], abbr: ['APB'] },
  'median-motor-fcr': { nerve: 'Median', muscles: ['flexor-carpi-radialis'], abbr: ['FCR'] },
  'median-motor-pronator-teres': { nerve: 'Median', muscles: ['pronator-teres'], abbr: ['PT'] },
  'musculocutaneous-biceps': { nerve: 'Musculocutaneous', muscles: ['biceps-brachii'] },
  // The diaphragm's mesh lives in the trunk model, so the highlight appears
  // when the trunk region is loaded.
  'phrenic-diaphragm': { nerve: 'Phrenic', muscles: ['diaphragm'] },
  'radial-motor-ecu-brachioradialis': {
    nerve: 'Radial',
    muscles: ['extensor-carpi-ulnaris', 'brachioradialis'],
    abbr: ['ECU', 'BR'],
  },
  'radial-motor-extensor-digitorum': {
    nerve: 'Radial',
    muscles: ['extensor-digitorum-communis'],
    abbr: ['EDC'],
  },
  'radial-motor-extensor-indicis-needle': {
    nerve: 'Radial',
    muscles: ['extensor-indicis-proprius'],
    abbr: ['EIP'],
  },
  'radial-motor-extensor-indicis-surface': {
    nerve: 'Radial',
    muscles: ['extensor-indicis-proprius'],
    abbr: ['EIP'],
  },
  'suprascapular-supraspinatus-infraspinatus': {
    nerve: 'Suprascapular',
    muscles: ['supraspinatus', 'infraspinatus'],
  },
  'thoracodorsal-latissimus-dorsi': { nerve: 'Thoracodorsal', muscles: ['latissimus-dorsi'] },
  // The atlas target for the first dorsal interosseous is the dorsal
  // interossei group; the palmar (volar) interossei are a separate target.
  'ulnar-motor-1st-dorsal-interosseous': { nerve: 'Ulnar', muscles: ['dorsal-interossei'], abbr: ['FDI'] },
  'ulnar-motor-adm': { nerve: 'Ulnar', muscles: ['abductor-digiti-minimi'], abbr: ['ADM'] },
  'ulnar-motor-palmar-interosseous': { nerve: 'Ulnar', muscles: ['volar-interossei'], abbr: ['PI'] },

  // ---- Upper limb – sensory/mixed ---------------------------------------
  // All record from skin: nothing to highlight on a muscle model.
  'lateral-antebrachial-cutaneous-sensory': {
    nerve: 'Lateral antebrachial cutaneous',
    muscles: [],
    abbr: ['LABC', 'LACN'],
  },
  'medial-antebrachial-cutaneous-sensory': {
    nerve: 'Medial antebrachial cutaneous',
    muscles: [],
    abbr: ['MABC', 'MACN'],
  },
  'median-radial-sensory-thumb': { nerve: 'Median and radial', muscles: [] },
  'median-ulnar-mixed-transcarpal': { nerve: 'Median and ulnar', muscles: [] },
  'median-ulnar-sensory-4th-digit': { nerve: 'Median and ulnar', muscles: [] },
  'median-palmar-cutaneous-sensory': { nerve: 'Median', muscles: [] },
  'median-sensory-2nd-3rd-digits': { nerve: 'Median', muscles: [] },
  'posterior-antebrachial-cutaneous': { nerve: 'Posterior antebrachial cutaneous', muscles: [], abbr: ['PABC'] },
  'radial-sensory-dorsum-hand': { nerve: 'Radial', muscles: [] },
  'ulnar-dorsal-cutaneous-sensory': { nerve: 'Ulnar', muscles: [] },
  'ulnar-sensory-5th-digit': { nerve: 'Ulnar', muscles: [] },

  // ---- Lower limb – motor ------------------------------------------------
  // Recording is from vastus medialis, not the whole quadriceps.
  'femoral-motor-to-quadriceps': { nerve: 'Femoral', muscles: ['vastus-medialis'], abbr: ['VM'] },
  'fibular-motor-to-edb': { nerve: 'Fibular (peroneal)', muscles: ['extensor-digitorum-brevis'], abbr: ['EDB'] },
  'fibular-motor-to-fibularis-brevis': { nerve: 'Fibular (peroneal)', muscles: ['peroneus-brevis'] },
  'fibular-motor-to-fibularis-longus': { nerve: 'Fibular (peroneal)', muscles: ['peroneus-longus'] },
  'fibular-motor-to-tibialis-anterior': {
    nerve: 'Fibular (peroneal)',
    muscles: ['tibialis-anterior'],
    abbr: ['TA'],
  },
  'h-reflex-to-calf': {
    nerve: 'Tibial',
    muscles: ['soleus', 'gastrocnemius-medial-head', 'gastrocnemius-lateral-head'],
  },
  // The study names three possible recording sites depending on which portion
  // of the sciatic nerve is being followed; all three are shown.
  'sciatic-motor-recording-from-foot': {
    nerve: 'Sciatic',
    muscles: ['extensor-digitorum-brevis', 'abductor-hallucis', 'abductor-digiti-quinti'],
  },
  'tibial-motor-to-flexor-digiti-minimi-brevis': {
    nerve: 'Tibial',
    muscles: ['flexor-digiti-quinti-brevis'],
    abbr: ['FDMB'],
  },
  'tibial-motor-to-abductor-hallucis': { nerve: 'Tibial', muscles: ['abductor-hallucis'], abbr: ['AH'] },

  // ---- Lower limb – sensory/mixed ---------------------------------------
  'deep-fibular-sensory': { nerve: 'Deep fibular (peroneal)', muscles: [] },
  'lateral-femoral-cutaneous-ma-liveson': { nerve: 'Lateral femoral cutaneous', muscles: [], abbr: ['LFCN'] },
  'lateral-femoral-cutaneous-spevak-prevec': { nerve: 'Lateral femoral cutaneous', muscles: [], abbr: ['LFCN'] },
  'medial-calcaneal-sensory': { nerve: 'Medial calcaneal', muscles: [] },
  'medial-femoral-cutaneous-sensory': { nerve: 'Medial femoral cutaneous', muscles: [], abbr: ['MFCN'] },
  'posterior-femoral-cutaneous-sensory': { nerve: 'Posterior femoral cutaneous', muscles: [], abbr: ['PFCN'] },
  'saphenous-sensory-distal': { nerve: 'Saphenous', muscles: [] },
  'saphenous-sensory-proximal': { nerve: 'Saphenous', muscles: [] },
  'superficial-fibular-sensory-jabre': { nerve: 'Superficial fibular (peroneal)', muscles: [] },
  'superficial-fibular-sensory-izzo': { nerve: 'Superficial fibular (peroneal)', muscles: [] },
  'sural-sensory': { nerve: 'Sural', muscles: [] },
  'sural-lateral-dorsal-cutaneous-branch': { nerve: 'Sural', muscles: [] },
  'tibial-mixed-medial-lateral-plantar': { nerve: 'Tibial', muscles: [] },

  // ---- Head & neck -------------------------------------------------------
  'blink-reflex': { nerve: 'Trigeminal and facial', muscles: ['orbicularis-oculi'] },
  // Recording is from nasalis, which has no EMG_MUSCLES entry (the atlas
  // lists dilator naris, a different muscle). The alternatives the study
  // offers are not "the" recording site, so nothing is highlighted.
  'cranial-nerve-vii-facial': { nerve: 'Facial (VII)', muscles: [], abbr: ['CN VII'] },
  'cranial-nerve-xi-spinal-accessory': {
    nerve: 'Spinal accessory (XI)',
    muscles: ['trapezius-upper'],
    abbr: ['CN XI', 'SAN'],
  },
  'greater-auricular-sensory': { nerve: 'Greater auricular', muscles: [] },

  // ---- Root & pudendal ---------------------------------------------------
  // Root stimulation records from whichever muscle suits the roots being
  // tested, so there is no single recording site to show.
  'cervical-nerve-root-stimulation': { nerve: 'Cervical roots', muscles: [] },
  'lumbosacral-nerve-root-stimulation': { nerve: 'Lumbosacral roots', muscles: [] },
  'pudendal-nerve-studies': { nerve: 'Pudendal', muscles: ['sphincter-ani-externus'], abbr: ['EAS'] },

  // ---- Other studies -----------------------------------------------------
  'accessory-deep-fibular-nerve': {
    nerve: 'Accessory deep fibular (peroneal)',
    muscles: ['extensor-digitorum-brevis'],
    abbr: ['EDB'],
  },
}

/** Lab shorthand for this study, for search. */
export function abbrFor(studyId: string): string[] {
  return NCS_STUDY_INDEX[studyId]?.abbr ?? []
}

/** Nerve tested, or '' if the study is not in the reviewed index. */
export function nerveFor(studyId: string): string {
  return NCS_STUDY_INDEX[studyId]?.nerve ?? ''
}

/**
 * EMG_MUSCLES ids this study records from. Empty means nothing should be
 * highlighted — see the header for the three reasons that happens.
 */
export function recordingMusclesFor(studyId: string): string[] {
  return NCS_STUDY_INDEX[studyId]?.muscles ?? []
}
