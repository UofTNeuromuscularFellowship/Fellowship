// ---------------------------------------------------------------------------
// Neuromuscular ultrasound primer — figure manifest.
//
// Every figure is served from the portal's own /public/ultrasound/ folder, NOT
// hotlinked from nysora.com. The fellowship has permission to use these images;
// keeping local copies means the primer does not break if the source site is
// reorganised, which it has been at least once already (the POCUS pages were
// republished in March 2026).
//
// `source` is kept for two reasons: it is where the file came from if a copy is
// ever lost, and it is what the credit line links to. It is never used as an
// <img src> — see Figure in pages/UltrasoundPrimer.tsx.
//
// A file that has not been placed yet renders as a labelled gap naming the
// missing file, rather than a broken image icon.
// ---------------------------------------------------------------------------

export interface PrimerFigure {
  /** File under /public/ultrasound/. */
  file: string
  /** Short description for screen readers. */
  alt: string
  /** Printed under the figure. */
  caption: string
  /** Original NYSORA page this figure appears on. */
  source: string
}

/** NYSORA pages this primer is built from, for the credit line. */
export const SOURCES = {
  physics: 'https://nysora.com/pocus/physics/',
  transducers: 'https://nysora.com/pocus/transducers/',
  scanning: 'https://nysora.com/pocus/scanning-modes/',
  settings: 'https://nysora.com/pocus/machine-settings/',
  diaphragm:
    'https://nysora.com/education-news/case-study-assessing-diaphragmatic-function-using-ultrasound/',
} as const

export const FIGURES: Record<string, PrimerFigure> = {
  // ---- Physics ------------------------------------------------------------
  physicsOverview: {
    file: 'physics-overview.jpg',
    alt: 'Ultrasound waves leaving a transducer and reflecting back from a tissue interface',
    caption:
      'Waves leave the transducer, meet an interface, and part of the beam returns. What comes back is the image.',
    source: SOURCES.physics,
  },
  soundWave: {
    file: 'sound-wave.jpg',
    alt: 'A sound wave labelled with amplitude, wavelength and period, comparing high and low frequency',
    caption: 'Amplitude, wavelength and period — and the same wave at high and low frequency.',
    source: SOURCES.physics,
  },
  acousticImpedance: {
    file: 'acoustic-impedance.jpg',
    alt: 'Chart comparing the acoustic impedance of body tissues',
    caption: 'Acoustic impedance across tissues. The bigger the step between two, the brighter the interface.',
    source: SOURCES.physics,
  },
  attenuation: {
    file: 'attenuation-frequency.jpg',
    alt: 'Diagram showing that higher frequency beams attenuate faster and reach less deeply',
    caption: 'Attenuation rises with frequency: 8 MHz reaches deeper than 10 or 12 MHz.',
    source: SOURCES.physics,
  },

  // ---- Transducers --------------------------------------------------------
  transducerTypes: {
    file: 'transducer-types.jpg',
    alt: 'Curved array, linear array and phased array transducers side by side',
    caption: 'A. Curved array   B. Linear array   C. Phased array.',
    source: SOURCES.transducers,
  },
  transducerManeuvers: {
    file: 'transducer-maneuvers.jpg',
    alt: 'The four transducer movements: sliding, tilting, rotating and rocking',
    caption: 'Sliding, tilting, rotating and rocking — the four ways the probe moves.',
    source: SOURCES.transducers,
  },

  // ---- Scanning modes -----------------------------------------------------
  aMode: {
    file: 'a-mode.jpg',
    alt: 'A-mode trace shown as a series of vertical peaks',
    caption: 'A-mode: one line of data, drawn as peaks at the depth of each interface.',
    source: SOURCES.scanning,
  },
  bMode: {
    file: 'b-mode.jpg',
    alt: 'A B-mode transducer and the two-dimensional grey-scale image it produces',
    caption: 'B-mode: the two-dimensional grey-scale picture almost all scanning is done in.',
    source: SOURCES.scanning,
  },
  dopplerEffect: {
    file: 'doppler-effect.jpg',
    alt: 'The Doppler effect: pitch rises approaching and falls receding',
    caption: 'The Doppler effect — pitch rises coming towards you and falls going away.',
    source: SOURCES.scanning,
  },
  dopplerAngle: {
    file: 'doppler-angle.jpg',
    alt: 'Doppler shift plotted against the angle between beam and blood flow',
    caption: 'Doppler shift against angle: greatest head-on, nothing at all at 90°.',
    source: SOURCES.scanning,
  },
  colourDoppler: {
    file: 'colour-doppler.jpg',
    alt: 'Colour Doppler map overlaid on a B-mode image',
    caption: 'Colour Doppler: a colour map of flow direction laid over the B-mode image.',
    source: SOURCES.scanning,
  },
  dopplerModes: {
    file: 'doppler-modes.jpg',
    alt: 'Colour, power, pulsed wave and continuous wave Doppler compared',
    caption: 'A. Colour   B. Power   C. Pulsed wave   D. Continuous wave.',
    source: SOURCES.scanning,
  },
  mMode: {
    file: 'm-mode.jpg',
    alt: 'M-mode trace with depth on the vertical axis and time on the horizontal',
    caption: 'M-mode: one line of the image plotted against time. Depth up the side, time across.',
    source: SOURCES.scanning,
  },

  // ---- Machine settings ---------------------------------------------------
  depth: {
    file: 'depth.jpg',
    alt: 'The same structure imaged at different depth settings',
    caption: 'Set depth so the structure of interest fills the screen — no deeper.',
    source: SOURCES.settings,
  },
  focus: {
    file: 'focus.jpg',
    alt: 'Beam focusing: the principle, annular focusing and linear focusing',
    caption: 'A. The focusing principle   B. Annular focusing   C. Linear focusing.',
    source: SOURCES.settings,
  },
  timeGainCompensation: {
    file: 'time-gain-compensation.jpg',
    alt: 'Three images showing the effect of different time-gain compensation settings',
    caption: 'Time-gain compensation: brightness corrected band by band, so depth reads evenly.',
    source: SOURCES.settings,
  },

  // ---- Diaphragm ----------------------------------------------------------
  thoracicLandmarks: {
    file: 'diaphragm-landmarks.jpg',
    alt: 'Chest landmarks: midclavicular line, anterior axillary line, costal margin, xiphoid',
    caption: 'The lines the two windows are found from.',
    source: SOURCES.diaphragm,
  },
  zoneOfApposition: {
    file: 'diaphragm-zone-of-apposition.jpg',
    alt: 'Three-layered diaphragm seen in the zone of apposition',
    caption: 'Zone of apposition: the diaphragm as three layers, between the ribs.',
    source: SOURCES.diaphragm,
  },
  diaphragmMMode: {
    file: 'diaphragm-m-mode.jpg',
    alt: 'M-mode trace of normal diaphragm movement with breathing',
    caption: 'Normal excursion in M-mode — a smooth sinusoid moving towards the probe on inspiration.',
    source: SOURCES.diaphragm,
  },
  excursionValues: {
    file: 'diaphragm-excursion-values.jpg',
    alt: 'Table of normal diaphragm excursion values',
    caption: 'Normal excursion by breathing effort.',
    source: SOURCES.diaphragm,
  },
  thickening: {
    file: 'diaphragm-thickening.jpg',
    alt: 'Diaphragm thickness measured at end expiration and end inspiration',
    caption: 'Thickness at end expiration and end inspiration — the two numbers behind the thickening fraction.',
    source: SOURCES.diaphragm,
  },
}
