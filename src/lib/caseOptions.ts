// Structured case-logging options for the City Wide Neuromuscular Fellowship.
// Lists transcribed from the program specification.

export const NCS_COMMON = ['Upper limb (common protocol)', 'Lower limb (common protocol)']

export const NCS_INFREQUENT = [
  'Median antebrachial cutaneous',
  'Lateral antebrachial cutaneous',
  'Radial motor',
  'Median-ulnar palmar comparison',
  'Median-ulnar lumbrical interossei comparison',
  'Median-radial thumb comparison',
  'Lateral femoral cutaneous sensory',
  'Femoral motor',
  'Musculocutaneous motor',
  'Blink reflex',
  'Facial motor',
  'Plantar sensory study',
  'H reflex',
]

export const RNS_SITES = ['Facial', 'Spinal accessory', 'ADM', 'High frequency']

export const SFEMG_SITES = ['Frontalis', 'Orbicularis oculi']

export const EMG_MUSCLES: { group: string; muscles: string[] }[] = [
  {
    group: 'Upper limb',
    muscles: [
      'Deltoid', 'Biceps', 'Triceps', 'Pronator teres', 'EDC', 'EIP',
      'FDP 2/3', 'FDC 4/5', 'FCU', 'FPL', 'APB', 'FDI',
      'Supraspinatous', 'Infraspinatous', 'Rhomboids', 'Trapezius',
      'Pectoralis', 'Serratus anterior',
    ],
  },
  {
    group: 'Lower limb',
    muscles: [
      'Iliopsoas', 'Vastus lateralis', 'Vastus medialis', 'Adductor longus',
      'TFL', 'Gluteus medius/gluteus minimus', 'Gluteus maximus',
      'Short head of biceps femoris', 'Medial gastrocnemius',
      'Tibialis anterior', 'Tibialis posterior', 'EHL',
      'Peroneus/fibularis longus', 'ADQP', 'AH',
    ],
  },
  {
    group: 'Facial',
    muscles: [
      'Orbicularis oris', 'Orbicularis oculi', 'Temporalis', 'Masseter',
      'Genioglossus (side of tongue)', 'Genioglossus (under chin)',
    ],
  },
  {
    group: 'Paraspinals',
    muscles: ['Cervical paraspinals', 'Thoracic paraspinals', 'Lumbar paraspinals'],
  },
]

export const DIAGNOSIS_CATEGORIES = [
  'Motor neuron disease',
  'Multifocal motor neuropathy',
  'Myopathy',
  'Neuromuscular junction disorder',
  'Brachial plexopathy',
  'Polyneuropathy',
  'Polyradiculoneuropathy (CIDP, AIDP/GBS)',
  'Median neuropathy',
  'Ulnar neuropathy',
  'Radial neuropathy',
  'Sciatic neuropathy',
  'Peroneal neuropathy',
  'Tibial neuropathy',
  'Lateral femoral cutaneous neuropathy',
  'Femoral neuropathy',
  'Lumbar radiculopathy',
  'Cervical radiculopathy',
  'Thoracic radiculopathy',
  'Other not listed',
]

export function cohortYears(): string[] {
  const now = new Date().getFullYear()
  const years: string[] = []
  for (let y = 2024; y <= now + 6; y++) years.push(`${y}-${y + 1}`)
  return years
}
