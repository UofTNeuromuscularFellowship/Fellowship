// Suggested reference lists for case-logging form fields. These are *suggestions*
// surfaced via datalist/autocomplete — fellows can type anything. The diagnosis
// suggestions mirror the program's own 2026-27 didactic curriculum topics so they
// stay grounded in the program rather than invented requirements.

export const PROCEDURE_METRICS = [
  { key: 'ncs', label: 'Nerve conduction studies', column: 'ncs_count' },
  { key: 'emg', label: 'Needle EMG studies', column: 'emg_count' },
  { key: 'rns', label: 'Repetitive nerve stimulation', column: 'rns_count' },
  { key: 'sfemg', label: 'Single-fibre EMG', column: 'sfemg_count' },
] as const

export type ProcedureKey = (typeof PROCEDURE_METRICS)[number]['key']

export const DIAGNOSIS_SUGGESTIONS = [
  'Focal neuropathy',
  'Radiculopathy',
  'Plexopathy',
  'Traumatic neuropathy',
  'GBS / acute neuropathy',
  'CIDP / chronic inflammatory neuropathy',
  'Hereditary neuropathy',
  'Toxic neuropathy',
  'Small fibre neuropathy',
  'Idiopathic inflammatory myopathy',
  'Toxic / acquired myopathy',
  'Hereditary myopathy',
  'Myasthenia gravis',
  'Other NMJ disorder',
  'ALS',
  'SMA / motor neuron disease',
]

export const NERVE_SUGGESTIONS = [
  'Median (motor)', 'Median (sensory)', 'Ulnar (motor)', 'Ulnar (sensory)',
  'Radial', 'Peroneal (motor)', 'Tibial (motor)', 'Sural', 'Superficial peroneal',
  'Femoral', 'Facial', 'Phrenic',
]

export const MUSCLE_SUGGESTIONS = [
  'APB', 'FDI', 'ADM', 'Biceps', 'Triceps', 'Deltoid', 'Pronator teres',
  'Tibialis anterior', 'Gastrocnemius', 'Vastus lateralis', 'Iliopsoas',
  'Cervical paraspinals', 'Lumbar paraspinals', 'Genioglossus',
]
