// ---------------------------------------------------------------------------
// Digital nerve conduction study guide — quick-reference technique summaries.
//
// Technique descriptions are paraphrased and the normal-value entries are
// concise "all subjects" cut-offs summarised (not reproduced in full) from:
//   Buschbacher RM, Kumbhare D, Robinson LR. Buschbacher's Manual of Nerve
//   Conduction Studies, 3rd ed. New York: Demos Medical Publishing.
// The book's full age/sex/height-stratified reference tables are NOT
// reproduced here. Values are for teaching only — always validate against
// your own laboratory's normative data and technique.
// ---------------------------------------------------------------------------

export type NerveRegion =
  | 'Upper limb – motor'
  | 'Upper limb – sensory/mixed'
  | 'Lower limb – motor'
  | 'Lower limb – sensory/mixed'
  | 'Head & neck'
  | 'Root & pudendal'
  | 'Other studies'

export interface NerveStudy {
  id: string
  name: string
  region: NerveRegion
  type: string
  recording?: string
  position?: string
  active?: string
  reference?: string
  ground?: string
  stim?: string[]
  distance?: string
  settings?: string
  roots?: string
  cutoffs?: string[]
  sideToSide?: string[]
  notes?: string
  diagram?: string
}

export const REGION_ORDER: NerveRegion[] = [
  'Upper limb – motor',
  'Upper limb – sensory/mixed',
  'Lower limb – motor',
  'Lower limb – sensory/mixed',
  'Head & neck',
  'Root & pudendal',
  'Other studies',
]

export const NERVE_STUDIES: NerveStudy[] = [
  {
    "id": "axillary-motor-deltoid",
    "name": "Axillary motor nerve to the deltoid",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Middle deltoid",
    "position": "Seated",
    "active": "Over the bulkiest part of the middle deltoid (found on shoulder abduction)",
    "reference": "Over where the deltoid meets its insertion tendon",
    "ground": "On the acromion",
    "stim": [
      "S1 (Erb's point): cathode just above the clavicle, lateral to the sternocleidomastoid's clavicular head; anode superomedial"
    ],
    "distance": "",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C5–C6 roots via upper trunk, posterior division, and posterior cord",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 5.4 ms",
      "Amplitude (all subjects): lower limit ≈ 4.6 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.5 ms",
      "Amplitude drop ≤ 54%"
    ],
    "notes": "Stimulation may also fire biceps/brachialis, whose volume-conducted signal can contaminate the recording."
  },
  {
    "id": "h-reflex-fcr",
    "name": "H-reflex to the flexor carpi radialis",
    "region": "Upper limb – motor",
    "type": "Late response",
    "recording": "Flexor carpi radialis",
    "position": "Supine",
    "active": "Over the FCR belly, ~one-third of the way from the medial epicondyle to the radial styloid",
    "reference": "Over the brachioradialis",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "S (elbow): median nerve stimulated with a 0.5–1.0 ms pulse at ≤ 0.5 Hz; cathode proximal, anode distal"
    ],
    "distance": "",
    "settings": "Standard motor settings; 5 ms/div; 500 µV/div",
    "roots": "C6–C8 roots via upper/middle/lower trunks, anterior divisions, and medial and lateral cords",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 18.9 ms",
      "Amplitude (all subjects): lower limit ≈ 0.8 mV"
    ],
    "sideToSide": [
      "H-reflex latency difference ≤ 1.0 ms"
    ],
    "notes": "With too-strong stimulation an F-wave can mimic the H-reflex, so start at low intensity; used as an adjunct for C7 radiculopathy."
  },
  {
    "id": "long-thoracic-serratus-anterior",
    "name": "Long thoracic motor nerve to the serratus anterior",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Serratus anterior",
    "position": "Not stated",
    "active": "Concentric (or monopolar) needle in the serratus digitation along the midaxillary line over the 5th rib",
    "reference": "For monopolar technique, 2 cm caudal to the active needle",
    "ground": "For monopolar technique, at the anterior axillary line near the 12th rib level",
    "stim": [
      "S (Erb's point): cathode just above the clavicle, lateral to the sternocleidomastoid's clavicular head; anode superomedial"
    ],
    "distance": "≈ 23.6 cm (range 22–25 cm) in the concentric-needle study",
    "settings": "Standard motor settings",
    "roots": "Anterior primary branches of C5–C7 roots and the long thoracic nerve",
    "cutoffs": [
      "Onset latency (all subjects, monopolar needle): upper limit ≈ 5.1 ms"
    ],
    "sideToSide": [],
    "notes": "Latency rises ~0.2 ms per extra 1 cm of distance; too-posterior placement risks recording latissimus dorsi."
  },
  {
    "id": "median-ain-pronator-quadratus",
    "name": "Median motor nerve (anterior interosseous branch) to the pronator quadratus",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Pronator quadratus",
    "position": "Supine",
    "active": "Midway between radius and ulna on the dorsal forearm, 3 cm proximal to the ulnar styloid (measure cathode-to-active with calipers afterward)",
    "reference": "Over the radial styloid",
    "ground": "Dorsum of the hand",
    "stim": [
      "S (elbow): cathode just medial to the brachial pulse; anode proximal"
    ],
    "distance": "Variable; caliper-measured forearm distance (~<23 to 25 cm)",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C7–T1 roots via middle and lower trunks, anterior divisions, and medial and lateral cords",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 5.1 ms",
      "Amplitude (all subjects): lower limit ≈ 1.6 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.6 ms",
      "Amplitude drop ≤ 37%",
      "Same-limb PQ minus FCR ≤ 2.2 ms (all subjects)",
      "Same-limb PQ minus PT ≤ 2.2 ms (all subjects)"
    ],
    "notes": "The pronator quadratus's two heads can produce a bimodal response, limiting duration measurement."
  },
  {
    "id": "median-motor-1st-lumbrical",
    "name": "Median motor nerve to the 1st lumbrical",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "First lumbrical",
    "position": "Supine",
    "active": "On the palm just radial to the index finger's long flexor tendon, 1 cm proximal to the midpalmar crease",
    "reference": "At the base of the index finger",
    "ground": "Dorsum of the hand",
    "stim": [
      "S (wrist): cathode 10 cm proximal to active, in a line to the mid distal wrist crease then just ulnar to the FCR tendon; anode proximal"
    ],
    "distance": "10 cm",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C8–T1 roots via lower trunk, anterior division, and medial cord",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 4.4 ms",
      "Amplitude (all subjects): lower limit ≈ 0.8 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.7 ms",
      "Amplitude drop ≤ 59%",
      "Same-limb 1st vs 2nd lumbrical ≤ 0.7/0.6 ms",
      "Same-limb 1st lumbrical vs APB ≤ 1.0 ms (APB longer) / 0.6 ms (lumbrical longer)"
    ],
    "notes": "Lumbrical response may persist when APB CMAP is absent, useful in severe carpal tunnel syndrome."
  },
  {
    "id": "median-motor-2nd-lumbrical",
    "name": "Median motor nerve to the 2nd lumbrical",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Second lumbrical",
    "position": "Supine",
    "active": "On the palm, slightly radial and 1 cm proximal to the midpoint between the third metacarpal and the distal wrist crease",
    "reference": "Just distal to the third MCP joint",
    "ground": "Dorsum of the hand",
    "stim": [
      "S (wrist): cathode 10 cm proximal to active, in a line to the mid distal wrist crease then just ulnar to the FCR tendon; anode proximal"
    ],
    "distance": "10 cm",
    "settings": "2 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C8–T1 roots via lower trunk, anterior division, and medial cord",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 4.5 ms",
      "Amplitude (all subjects): lower limit ≈ 1.0 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.8 ms",
      "Amplitude drop ≤ 67%",
      "Same-limb 2nd lumbrical vs interosseous ≤ 0.2 ms (interosseous longer) / 1.2 ms (lumbrical longer)",
      "Same-limb 2nd lumbrical vs APB ≤ 1.0 ms (APB longer) / 0.8 ms (lumbrical longer)"
    ],
    "notes": "Lumbrical and interosseous overlap here; median stimulation records the lumbrical, ulnar the interosseous, so latencies can be compared directly."
  },
  {
    "id": "median-motor-apb",
    "name": "Median motor nerve to the abductor pollicis brevis",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Abductor pollicis brevis",
    "position": "Supine",
    "active": "Midway between the mid distal wrist crease and the first MCP joint",
    "reference": "Just distal to the first MCP joint",
    "ground": "Dorsum of the hand (or between active and cathode if artifact is a problem)",
    "stim": [
      "S1 (wrist): cathode 8 cm proximal to active, just ulnar to the FCR tendon; anode proximal",
      "S2 (elbow): cathode just medial to the brachial pulse in the antecubital fossa; anode proximal",
      "F-wave: cathode as at S1 but anode distal"
    ],
    "distance": "8 cm (wrist)",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C8–T1 roots via lower trunk, anterior division, and medial cord",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 4.5 ms",
      "Amplitude (all subjects): lower limit ≈ 4.1 mV",
      "Conduction velocity (all subjects): lower limit ≈ 49 m/s",
      "F-wave (all subjects): upper limit ≈ 31.6 ms"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.7 ms",
      "Amplitude drop ≤ 54%",
      "CV drop ≤ 9 m/s",
      "F-wave latency ≤ 2.2 ms",
      "Wrist-to-elbow amplitude drop ≤ 24%"
    ],
    "notes": "Avoid co-stimulating the ulnar nerve; watch for Martin–Gruber anastomosis, especially in carpal tunnel syndrome."
  },
  {
    "id": "median-motor-fcr",
    "name": "Median motor nerve to the flexor carpi radialis",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Flexor carpi radialis",
    "position": "Supine",
    "active": "Over the FCR belly, one-third of the way from the medial epicondyle to the radial styloid",
    "reference": "Over the radial styloid",
    "ground": "Dorsum of the hand",
    "stim": [
      "S (antecubital): cathode 10 cm proximal to active over the median nerve; anode proximal"
    ],
    "distance": "10 cm",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C6–C8 roots via upper/middle/lower trunks, anterior divisions, and medial and lateral cords",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 3.6 ms",
      "Amplitude (all subjects): lower limit ≈ 2.3 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.8 ms",
      "Amplitude drop ≤ 53%",
      "Same-limb pronator teres vs FCR: ≤ 0.8 ms (PT longer) / ≤ 0.4 ms (FCR longer)"
    ],
    "notes": ""
  },
  {
    "id": "median-motor-pronator-teres",
    "name": "Median motor nerve to the pronator teres",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Pronator teres",
    "position": "Supine",
    "active": "At the third apex of an imagined equilateral triangle whose other points are the medial epicondyle and the biceps tendon at epicondyle level, on the proximal forearm",
    "reference": "Over the radial styloid",
    "ground": "Dorsum of the hand",
    "stim": [
      "S (antecubital): cathode 10 cm proximal to active over the median nerve; anode proximal"
    ],
    "distance": "10 cm",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C6–C7 roots via upper and middle trunks, anterior divisions, and lateral cord",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 3.6 ms",
      "Amplitude (all subjects): lower limit ≈ 2.9 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.6 ms",
      "Amplitude drop ≤ 54%",
      "Same-limb PT vs FCR: ≤ 0.8 ms (PT longer) / ≤ 0.4 ms (FCR longer)"
    ],
    "notes": ""
  },
  {
    "id": "musculocutaneous-biceps",
    "name": "Musculocutaneous motor nerve to the biceps brachii",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Biceps brachii",
    "position": "Seated",
    "active": "Just distal to the mid-belly of the biceps brachii",
    "reference": "Proximal to the antecubital fossa, near the muscle-tendon junction",
    "ground": "On the acromion",
    "stim": [
      "S (Erb's point): cathode just above the clavicle, lateral to the sternocleidomastoid's clavicular head; anode superomedial"
    ],
    "distance": "",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C5–C6 roots via upper trunk, anterior division, and lateral cord",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 5.6 ms",
      "Amplitude (all subjects): lower limit ≈ 4.0 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.4 ms",
      "Amplitude drop ≤ 33%"
    ],
    "notes": ""
  },
  {
    "id": "phrenic-diaphragm",
    "name": "Phrenic motor nerve to the diaphragm",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Diaphragm",
    "position": "Supine with neck neutral or slightly extended",
    "active": "Surface electrode 5 cm above the xiphoid tip",
    "reference": "Surface electrode 16 cm distally along the lower costal margin (~7th intercostal space)",
    "ground": "Over the upper chest",
    "stim": [
      "S (neck): at the posterior border of the sternocleidomastoid in the supraclavicular fossa, cathode ~3 cm above the clavicle, anode superior; average two supramaximal responses"
    ],
    "distance": "16 cm between recording electrodes",
    "settings": "LFF 5 Hz; HFF 5 kHz",
    "roots": "C3–C5 roots and phrenic nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 8.1 ms",
      "Amplitude (all subjects): lower limit ≈ 300 µV"
    ],
    "sideToSide": [
      "Latency difference ≤ 0.88 ms",
      "Amplitude difference ≤ 39.5%",
      "Area difference ≤ 46.3%",
      "Duration difference ≤ 5.6 ms"
    ],
    "notes": "Misplaced stimulus can co-activate the brachial plexus, giving a short-latency, initially positive volume-conducted response; EKG artifact and deep breathing should be avoided."
  },
  {
    "id": "radial-motor-ecu-brachioradialis",
    "name": "Radial motor nerve to the extensor carpi ulnaris and brachioradialis",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Extensor carpi ulnaris and brachioradialis",
    "position": "Supine",
    "active": "Brachioradialis: over its belly 3 cm distal to the elbow. ECU: at mid-forearm midway between the lateral epicondyle and ulnar styloid, near the ulnar crease",
    "reference": "On the thumb",
    "ground": "Not stated",
    "stim": [
      "S (upper arm): monopolar needle cathode 5–6 cm proximal to the lateral epicondyle laterally (ideally ultrasound-guided); subcutaneous needle anode 2 cm proximal"
    ],
    "distance": "",
    "settings": "2–5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 3 ms/div",
    "roots": "ECU: C6–C8 via upper/middle/lower trunks, posterior divisions and cord, then radial/posterior interosseous nerve. Brachioradialis: C5–C6 via upper trunk, posterior division and cord, then radial nerve",
    "cutoffs": [
      "Onset latency brachioradialis (all): upper limit ≈ 3.3 ms",
      "Onset latency ECU (all): upper limit ≈ 4.2 ms"
    ],
    "sideToSide": [
      "ECU vs brachioradialis latency difference ≤ 1.8 ms",
      "Side-to-side latency ≤ 0.4 ms"
    ],
    "notes": "The branch to brachioradialis bypasses the radial tunnel while the ECU branch passes through it; needle stimulation is preferred over surface."
  },
  {
    "id": "radial-motor-extensor-digitorum",
    "name": "Radial motor nerve to the extensor digitorum",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Extensor digitorum",
    "position": "Supine",
    "active": "Over the extensor digitorum, 8 cm distal to S1, at roughly the upper-third/middle-third forearm junction (confirm with MCP extension)",
    "reference": "Over the ulnar styloid",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "S1 (antecubital): cathode just lateral to the biceps tendon at the flexor crease, arm abducted 40–45°; anode proximal",
      "S2 (axilla): cathode between coracobrachialis and long head of triceps; anode proximal"
    ],
    "distance": "8 cm (S1 to active)",
    "settings": "5 mV/div; LFF 5 Hz; HFF 10 kHz; 5 ms/div",
    "roots": "C7–C8 roots via middle and lower trunks, posterior divisions and cord, then radial/posterior interosseous nerve",
    "cutoffs": [
      "Onset latency (right side): upper limit ≈ 3.5 ms",
      "Amplitude: lower limit ≈ 4.3 mV",
      "Conduction velocity S1–S2: lower limit ≈ 54 m/s"
    ],
    "sideToSide": [],
    "notes": "Proximal stimulation risks volume-conducted potentials from other muscles; use minimal intensity for a matching waveform. Mean±2SD limits may mislead with skewed data."
  },
  {
    "id": "radial-motor-extensor-indicis-needle",
    "name": "Radial motor nerve to the extensor indicis: needle recording",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Extensor indicis",
    "position": "Supine",
    "active": "Concentric needle in the extensor indicis on the dorsal forearm (~4 cm proximal to the ulnar styloid, radial to ECU tendon, ~½ inch deep), ideally ultrasound-guided",
    "reference": "For monopolar technique, surface electrode on the 5th digit",
    "ground": "Dorsum of the hand or between stimulating and recording electrodes",
    "stim": [
      "S1 (forearm): cathode 3–4 cm proximal to the needle between ECU and extensor digiti minimi; anode proximal",
      "S2 (arm): cathode 5–6 cm proximal to the lateral epicondyle between brachialis and brachioradialis; anode proximal",
      "S3 (Erb's point): stimulating electrodes at Erb's point"
    ],
    "distance": "",
    "settings": "Standard motor settings",
    "roots": "Radial/posterior interosseous nerve (C7–C8)",
    "cutoffs": [
      "Onset latency (monopolar, 2.8–6.6 cm): mean ≈ 1.69 ms",
      "Conduction velocity S1–S2: mean ≈ 61.6 m/s (range 48–75)",
      "Conduction velocity S2–S3: mean ≈ 72.0 m/s (range 56–93)"
    ],
    "sideToSide": [
      "Suspect proximal-segment abnormality if proximal CV < 60 m/s or distal CV is > 6 m/s faster than proximal"
    ],
    "notes": "Waveform shape should match on proximal and distal stimulation; an armboard helps stabilize the needle."
  },
  {
    "id": "radial-motor-extensor-indicis-surface",
    "name": "Radial motor nerve to the extensor indicis: surface recording",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Extensor indicis",
    "position": "Supine, elbow extended, forearm fully pronated",
    "active": "4 cm proximal to the ulnar styloid, over the extensor indicis motor point",
    "reference": "Over the ulnar styloid",
    "ground": "Over the dorsal forearm",
    "stim": [
      "S1 (forearm): cathode 8 cm proximal to active; anode proximal",
      "S2 (arm): cathode 8–10 cm proximal to the lateral epicondyle over the radial groove; anode proximal",
      "F-wave: antecubital region just lateral to the biceps tendon, cathode proximal"
    ],
    "distance": "8 cm (S1 to active)",
    "settings": "2 mV/div; LFF 10 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C7–C8 roots via middle and lower trunks, posterior divisions and cord, then radial/posterior interosseous nerve",
    "cutoffs": [
      "Onset latency: mean ≈ 2.1 ms (no reference limit given)",
      "Amplitude: mean ≈ 4.5 mV (range 1.7–11.1)",
      "Conduction velocity: mean ≈ 71.7 m/s (range 60.2–79.2)",
      "F-wave: mean ≈ 19.8 ms (range 16.2–24.1)"
    ],
    "sideToSide": [],
    "notes": ""
  },
  {
    "id": "suprascapular-supraspinatus-infraspinatus",
    "name": "Suprascapular motor nerve to the supraspinatus and infraspinatus",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Supraspinatus and infraspinatus",
    "position": "Seated",
    "active": "Supraspinatus: 2 cm medial to the midpoint of the scapular spine. Infraspinatus: 2 cm inferior to the midpoint of the scapular spine",
    "reference": "On the midline thoracic spine at the same level",
    "ground": "On the acromion",
    "stim": [
      "S (Erb's point): cathode just above the clavicle, lateral to the sternocleidomastoid's clavicular head; anode superomedial"
    ],
    "distance": "",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C5–C6 roots via upper trunk and suprascapular nerve",
    "cutoffs": [
      "Onset latency supraspinatus (all): upper limit ≈ 4.3 ms",
      "Onset latency infraspinatus (all): upper limit ≈ 4.8 ms",
      "Amplitude supraspinatus (all): lower limit ≈ 1.6 mV",
      "Amplitude infraspinatus (all): lower limit ≈ 1.5 mV"
    ],
    "sideToSide": [
      "Supraspinatus latency increase ≤ 0.7 ms",
      "Infraspinatus latency increase ≤ 0.4 ms",
      "Supraspinatus amplitude drop ≤ 48%",
      "Infraspinatus amplitude drop ≤ 48%",
      "Same-side supraspinatus-to-infraspinatus latency increase ≤ 1.6 ms"
    ],
    "notes": ""
  },
  {
    "id": "thoracodorsal-latissimus-dorsi",
    "name": "Thoracodorsal motor nerve to the latissimus dorsi",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Latissimus dorsi",
    "position": "Supine, shoulder abducted 90°",
    "active": "On the posterior axillary line at the level of the inferior scapular pole",
    "reference": "On the ipsilateral flank",
    "ground": "On the ipsilateral lateral chest wall",
    "stim": [
      "S (axilla): cathode in the axilla, anode proximal, shoulder abducted 90°"
    ],
    "distance": "5–12 cm (stimulus to active)",
    "settings": "2 mV/div; LFF 2 Hz; HFF 10 kHz; 1 ms/div; pulse 0.2 ms",
    "roots": "C6–C8 roots via upper/middle/lower trunks, posterior divisions and cord, and thoracodorsal nerve",
    "cutoffs": [
      "Onset latency (all): upper limit ≈ 2.7 ms",
      "Amplitude: mean ≈ 4.1 mV (range 1.4–10.2)"
    ],
    "sideToSide": [
      "Amplitude drop ≤ 50%"
    ],
    "notes": "In obese subjects, press the stimulator deeper into the axilla toward the lateral scapular margin; Erb's-point conduction velocity was unreliable."
  },
  {
    "id": "ulnar-motor-1st-dorsal-interosseous",
    "name": "Ulnar motor nerve to the 1st dorsal interosseous",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "First dorsal interosseous",
    "position": "Supine",
    "active": "On the dorsum of the first web space, at the center of the triangle formed by the first CMC, first MCP, and second MCP joints",
    "reference": "Just distal to the thumb IP joint",
    "ground": "Dorsum of the hand",
    "stim": [
      "S (wrist): cathode at the S1 site used for the ulnar ADM study"
    ],
    "distance": "",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C8–T1 roots via lower trunk, anterior division, medial cord, and deep palmar branch of the ulnar nerve",
    "cutoffs": [
      "Onset latency (all): upper limit ≈ 4.0 ms",
      "Amplitude (all): lower limit ≈ 9.2 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.8 ms",
      "Amplitude drop ≤ 52%",
      "Same-limb FDI vs ADM latency difference ≤ 1.3 ms"
    ],
    "notes": "For proximal ulnar CV, study ADM instead, since proximal stimulation here activates both median and ulnar nerves; FDI is the muscle most often affected by Martin–Gruber crossing fibers."
  },
  {
    "id": "ulnar-motor-adm",
    "name": "Ulnar motor nerve to the abductor digiti minimi",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Abductor digiti minimi",
    "position": "Arm abducted 45° and externally rotated, elbow flexed 90°, forearm neutral",
    "active": "On the ulnar hypothenar eminence, midway between the pisiform and the 5th MCP joint",
    "reference": "Just distal to the 5th MCP joint",
    "ground": "Dorsum of the hand (or between active and cathode if artifact interferes)",
    "stim": [
      "S1 (wrist): cathode 8 cm proximal to active, just radial to the FCU tendon; anode proximal",
      "S2 (below elbow): cathode ~4 cm distal to the medial epicondyle; anode proximal",
      "S3 (above elbow): cathode ~10 cm proximal to S2, curved behind the medial epicondyle; anode proximal",
      "S4 (axilla): cathode ~10 cm proximal to S3; anode proximal",
      "F-wave: cathode as at S1 but anode distal"
    ],
    "distance": "8 cm (wrist)",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C8–T1 roots via lower trunk, anterior division, medial cord, and ulnar nerve",
    "cutoffs": [
      "Onset latency (all): upper limit ≈ 3.7 ms",
      "Amplitude (all): lower limit ≈ 7.9 mV",
      "Conduction velocity (all segments): lower limit ≈ 52 m/s (S1–S2), 43 (S2–S3), 50 (S3–S4)",
      "F-wave (all subjects): upper limit ≈ 31.5 ms"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.6 ms",
      "Amplitude drop ≤ 25%",
      "S1–S2 CV drop side-to-side ≤ 9 m/s",
      "F-wave latency difference ≤ 2.5 ms",
      "SSIS segmental latency change ≤ 0.4 ms (1-cm) / ≤ 0.7 ms (2-cm)"
    ],
    "notes": "ADM may be spared in Guyon's canal entrapment (study FDI or palmar interosseous instead); watch for Martin–Gruber anastomosis simulating forearm conduction block."
  },
  {
    "id": "ulnar-motor-palmar-interosseous",
    "name": "Ulnar motor nerve to the palmar interosseous",
    "region": "Upper limb – motor",
    "type": "Motor",
    "recording": "Palmar interosseous",
    "position": "Supine",
    "active": "On the palm, slightly radial to the midpoint of the third metacarpal",
    "reference": "Just distal to the third MCP joint",
    "ground": "Dorsum of the hand",
    "stim": [
      "S (wrist): cathode 10 cm proximal to active, slightly radial to the FCU tendon; anode proximal"
    ],
    "distance": "10 cm",
    "settings": "5 mV/div; LFF 2–3 Hz; HFF 10 kHz; 2 ms/div",
    "roots": "C8–T1 roots via lower trunk, anterior division, medial cord, and ulnar nerve",
    "cutoffs": [
      "Onset latency (all): upper limit ≈ 4.0 ms",
      "Amplitude (all): lower limit ≈ 3.0 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 0.5 ms",
      "Amplitude drop ≤ 58%",
      "Same-limb 2nd lumbrical vs interosseous ≤ 0.2 ms (interosseous longer) / 1.2 ms (lumbrical longer)"
    ],
    "notes": "Interosseous and 2nd lumbrical overlap here; ulnar stimulation records the interosseous, median the lumbrical, allowing direct comparison."
  },
  {
    "id": "lateral-antebrachial-cutaneous-sensory",
    "name": "Lateral antebrachial cutaneous sensory nerve",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Lateral forearm skin (antidromic)",
    "position": "Supine",
    "active": "3 cm bar electrode on the lateral forearm aligned with the forearm's long axis, active electrode 10 cm distal to the stimulation site",
    "reference": "Distal end of the bar electrode",
    "ground": "Mid-volar aspect of the proximal forearm",
    "stim": [
      "S1: cathode just lateral to the distal biceps tendon, anode proximal"
    ],
    "distance": "10 cm",
    "settings": "Sensitivity 5–10 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "C5–C6 roots via upper trunk, anterior division, lateral cord; continuation of the musculocutaneous nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.1 ms",
      "Peak latency (all subjects): upper limit ≈ 2.5 ms",
      "Onset-to-peak amplitude (all subjects): lower limit ≈ 5 µV",
      "Peak-to-peak amplitude (all subjects): lower limit ≈ 6 µV"
    ],
    "sideToSide": [
      "Onset latency increase ≤ 0.2 ms",
      "Peak latency increase ≤ 0.3 ms",
      "Onset-to-peak amplitude drop ≤ 69%",
      "Peak-to-peak amplitude drop ≤ 68%"
    ],
    "notes": "Placing the cathode right against the biceps tendon (with slight pressure) optimizes the recording; amplitude is usually larger than the medial antebrachial cutaneous."
  },
  {
    "id": "medial-antebrachial-cutaneous-sensory",
    "name": "Medial antebrachial cutaneous sensory nerve",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Medial forearm skin (antidromic)",
    "position": "Supine",
    "active": "3 cm bar electrode on the medial forearm aligned with the forearm's long axis, active electrode 10 cm from the cathode",
    "reference": "Distal end of the bar electrode",
    "ground": "Mid-volar aspect of the forearm",
    "stim": [
      "S1: cathode midway between the medial epicondyle and distal biceps tendon, anode proximal"
    ],
    "distance": "10 cm",
    "settings": "Sensitivity 5–10 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "C8–T1 roots via lower trunk, anterior division, medial cord",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.0 ms",
      "Peak latency (all subjects): upper limit ≈ 2.6 ms",
      "Onset-to-peak amplitude (all subjects): lower limit ≈ 4 µV",
      "Peak-to-peak amplitude (all subjects): lower limit ≈ 3 µV"
    ],
    "sideToSide": [
      "Onset and peak latency increase ≤ 0.3 ms",
      "Onset-to-peak amplitude drop ≤ 67%",
      "Peak-to-peak amplitude drop ≤ 78%"
    ],
    "notes": "Reducing stimulus intensity limits median motor artifact; rotating the anode or repositioning the ground can reduce stimulus artifact."
  },
  {
    "id": "median-radial-sensory-thumb",
    "name": "Median and radial sensory nerves to the thumb",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Thumb (antidromic), comparing median vs radial",
    "position": "Supine with the forearm supinated",
    "active": "Ring/clip electrode just distal to the first metacarpophalangeal joint",
    "reference": "Ring/clip electrode 4 cm distal on the thumb (or as far distal as possible)",
    "ground": "Dorsum of the hand",
    "stim": [
      "S-Radial: cathode 10 cm proximal to active along the lateral border of the radius (thumb held in line with the radius)",
      "S-Median: cathode 10 cm proximal to active, measured to the midpoint of the distal wrist crease then slightly ulnar to the FCR tendon, anode proximal"
    ],
    "distance": "10 cm (both nerves)",
    "settings": "Sensitivity 5–20 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "Median: C6 via upper trunk, anterior division, lateral cord. Radial: C6 via upper trunk, posterior division, posterior cord",
    "cutoffs": [
      "Median onset latency (all subjects): upper limit ≈ 2.5 ms; radial ≈ 2.4 ms",
      "Median peak latency (all subjects): upper limit ≈ 3.1 ms; radial ≈ 3.0 ms",
      "Median onset-to-peak amplitude (all subjects): lower limit ≈ 10 µV; radial ≈ 3 µV",
      "Median peak-to-peak amplitude (all subjects): lower limit ≈ 11 µV; radial ≈ 4 µV"
    ],
    "sideToSide": [
      "Median vs radial peak latency difference ≤ 0.6 ms (median longer) / 0.4 ms (radial longer); onset ≤ 0.5 ms / 0.3 ms",
      "Median onset latency increase ≤ 0.3 ms, peak ≤ 0.4 ms; amplitude drops ≤ 47% (onset-peak) / ≤ 63% (peak-peak)",
      "Radial onset latency increase ≤ 0.3 ms, peak ≤ 0.4 ms; amplitude drops ≤ 69% (onset-peak) / ≤ 66% (peak-peak)"
    ],
    "notes": "The radial nerve is less prone to injury, making median-vs-radial thumb comparison useful when concurrent ulnar injury exists; keep the thumb extended."
  },
  {
    "id": "median-ulnar-mixed-transcarpal",
    "name": "Median and ulnar mixed nerve studies (transcarpal)",
    "region": "Upper limb – sensory/mixed",
    "type": "Mixed",
    "recording": "Wrist over median and ulnar nerves (orthodromic palmar stimulation)",
    "position": "Supine",
    "active": "Median: 3 cm bar active 3 cm proximal to the distal wrist crease, slightly ulnar to the FCR tendon. Ulnar: 3 cm bar active 3 cm proximal to the wrist crease, slightly radial to the FCU tendon",
    "reference": "Proximal end of the bar electrode (both nerves)",
    "ground": "Dorsum of the hand",
    "stim": [
      "S-Median: cathode 8 cm distal to active in the mid-palm, anode distal",
      "S-Ulnar: cathode 8 cm distal to active in the lateral palm between the flexor tendons of the 4th and 5th digits"
    ],
    "distance": "8 cm (both nerves)",
    "settings": "Sensitivity 20 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "Median and ulnar mixed nerve fibers across the carpal tunnel",
    "cutoffs": [
      "Median onset latency (all subjects): upper limit ≈ 2.0 ms; ulnar ≈ 1.9 ms",
      "Median peak latency (all subjects): upper limit ≈ 2.4 ms; ulnar ≈ 2.4 ms",
      "Median onset-to-peak amplitude lower limit ≈ 15 µV (most subjects); ulnar ≈ 6 µV (most subjects)",
      "Median peak-to-peak amplitude lower limit ≈ 14 µV (most subjects); ulnar ≈ 6 µV (most subjects)"
    ],
    "sideToSide": [
      "Median vs ulnar onset/peak latency difference ≤ 0.3 ms",
      "Onset latency increase side-to-side ≤ 0.3 ms (both)",
      "Peak latency increase ≤ 0.3 ms (median) / 0.4 ms (ulnar)",
      "Onset-to-peak amplitude drop ≤ 64% (median) / 73% (ulnar); peak-to-peak drop ≤ 64% (median) / 72% (ulnar)"
    ],
    "notes": "Amplitude lower limits differ for younger women (median <50; ulnar <30 with BMI <24); the ulnar waveform often has an initial positive deflection from which latency should be measured."
  },
  {
    "id": "median-ulnar-sensory-4th-digit",
    "name": "Median and ulnar sensory studies to the fourth digit",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Fourth (ring) digit (antidromic), comparing median vs ulnar",
    "position": "Supine",
    "active": "Ring/clip electrode midway between the webspace and the fourth PIP joint",
    "reference": "Ring/clip electrode 4 cm distal on the same digit",
    "ground": "Dorsum of the hand",
    "stim": [
      "S-Median: cathode 14 cm proximal to active, slightly ulnar to the FCR tendon, anode proximal",
      "S-Ulnar: cathode 14 cm proximal to active, slightly radial to the FCU tendon, anode proximal"
    ],
    "distance": "14 cm (both nerves)",
    "settings": "Sensitivity 10–20 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "Both C8 via lower trunk, anterior division, medial cord; median nerve and ulnar nerve respectively",
    "cutoffs": [
      "Median onset latency (all subjects): upper limit ≈ 3.4 ms; ulnar ≈ 3.0 ms",
      "Median peak latency (all subjects): upper limit ≈ 4.1 ms; ulnar ≈ 3.9 ms",
      "Median onset-to-peak amplitude lower limit ≈ 5 µV; ulnar ≈ 5 µV",
      "Median peak-to-peak amplitude lower limit ≈ 10 µV; ulnar ≈ 10 µV"
    ],
    "sideToSide": [
      "Median vs ulnar peak latency difference ≤ 0.3 ms / onset ≤ 0.2 ms (ulnar longer); ≤ 0.5 ms when median longer",
      "Median onset/peak latency increase ≤ 0.4 ms; amplitude drops ≤ 62% (onset-peak) / ≤ 56% (peak-peak)",
      "Ulnar onset/peak latency increase ≤ 0.3 ms; amplitude drops ≤ 63% (onset-peak) / ≤ 73% (peak-peak)"
    ],
    "notes": "The ring finger may be fully median- or ulnar-innervated rather than split; the median response can be absent in severe carpal tunnel syndrome."
  },
  {
    "id": "median-palmar-cutaneous-sensory",
    "name": "Median palmar cutaneous sensory nerve",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Palm/thenar skin (antidromic)",
    "position": "Supine; set up as for median motor study to abductor pollicis brevis",
    "active": "Halfway between the midpoint of the distal wrist crease and the first metacarpophalangeal joint",
    "reference": "Just distal to the first metacarpophalangeal joint",
    "ground": "Dorsum of the hand (or near the active electrode between it and the cathode if artifact interferes)",
    "stim": [
      "S1: cathode 8 cm proximal to active, measured to the midpoint of the distal wrist crease then slightly ulnar to the FCR tendon, anode proximal"
    ],
    "distance": "8 cm",
    "settings": "Sensitivity 10 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "C6 root via upper trunk, anterior division, lateral cord; branches off above the carpal tunnel",
    "cutoffs": [
      "Peak latency (all subjects): upper limit ≈ 1.70 ms",
      "Peak-to-peak amplitude: mean ≈ 9.0 µV (no lower reference value published)"
    ],
    "sideToSide": [
      "No side-to-side reference limits published (only 10 subjects, temperature not reported)"
    ],
    "notes": "The SNAP is the first of two small negative waves preceding the APB motor response; the second wave is a far-field junctional/palmar potential."
  },
  {
    "id": "median-sensory-2nd-3rd-digits",
    "name": "Median sensory nerve to the second and third digits",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Second or third digit (antidromic)",
    "position": "Supine",
    "active": "Ring/clip electrode on both sides of the digit, midway between the webspace and PIP joint",
    "reference": "Ring/clip electrode on the digit, at least 4 cm distal to the active",
    "ground": "Dorsum of the hand",
    "stim": [
      "S1: cathode 14 cm proximal to active, over the median nerve at the wrist between the FCR and palmaris longus tendons, anode proximal",
      "S2: cathode at the midpoint between the active electrode and S1, anode proximal"
    ],
    "distance": "14 cm (S1); S2 at midpoint (~7 cm)",
    "settings": "Sensitivity 20 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "C6 (digit 2) and C7 (digit 3) via upper/middle trunks, anterior divisions, lateral cord",
    "cutoffs": [
      "Onset latency S1 (all subjects): upper limit ≈ 3.2 ms",
      "Peak latency S1 (all subjects): upper limit ≈ 4.0 ms",
      "Onset-to-peak amplitude (all subjects): lower limit ≈ 10 µV",
      "Peak-to-peak amplitude (all subjects): lower limit ≈ 12 µV"
    ],
    "sideToSide": [
      "Onset and peak latency increase ≤ 0.4 ms",
      "Onset-to-peak amplitude drop ≤ 51%",
      "Peak-to-peak amplitude drop ≤ 55%",
      "Area drop ≤ 63%",
      "Median (D3) vs ulnar (D5) onset latency difference ≤ 0.5 ms (median longer) / 0.3 ms (ulnar longer)"
    ],
    "notes": "S1 and S2 latencies allow a wrist-to-palm segment ratio to separate median wrist mononeuropathy from polyneuropathy."
  },
  {
    "id": "posterior-antebrachial-cutaneous",
    "name": "Posterior antebrachial cutaneous nerve",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Dorsal forearm skin (antidromic)",
    "position": "Supine with the forearm pronated",
    "active": "Along a line from the stimulus site to the mid-dorsum of the wrist, ~12 cm distal to the stimulating electrode",
    "reference": "3 cm distal to the active",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "S1: cathode just above the lateral epicondyle between the biceps and triceps, anode proximal"
    ],
    "distance": "12 cm",
    "settings": "LFF 5 Hz, HFF 5 kHz, sensitivity 10 µV/div, sweep 1 ms/div",
    "roots": "C5–C8 roots via all three trunks, posterior divisions, posterior cord, then radial nerve",
    "cutoffs": [
      "Onset latency (all subjects): mean 2.07 ms, range up to ≈ 2.60 ms",
      "Peak latency (all subjects): mean 2.35 ms, range up to ≈ 2.90 ms",
      "Peak-to-peak amplitude (all subjects): mean 6.10 µV, range down to ≈ 2.90 µV"
    ],
    "sideToSide": [
      "Amplitude drop ≤ 40% (authors' suggested limit)"
    ],
    "notes": "Supplies the lateral arm/elbow and dorsal forearm; if no response, move the stimulator anteriorly/posteriorly or slightly toward the triceps."
  },
  {
    "id": "radial-sensory-dorsum-hand",
    "name": "Radial sensory nerve to the dorsum of the hand",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Dorsum of the hand over the radial sensory nerve (antidromic)",
    "position": "Supine",
    "active": "3 cm bar with active over the radial sensory nerve where it crosses the extensor pollicis longus tendon",
    "reference": "Distal end of the bar electrode",
    "ground": "Dorsum of the hand",
    "stim": [
      "S1: cathode on the radial forearm 10 cm proximal to active, anode proximal"
    ],
    "distance": "10 cm",
    "settings": "Sensitivity 5–10 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "C6 root via upper trunk, posterior division, posterior cord, then radial nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.2 ms",
      "Peak latency (all subjects): upper limit ≈ 2.8 ms",
      "Onset-to-peak amplitude (all subjects): lower limit ≈ 7 µV",
      "Peak-to-peak amplitude (all subjects): lower limit ≈ 11 µV"
    ],
    "sideToSide": [
      "Onset and peak latency increase ≤ 0.3 ms",
      "Onset-to-peak amplitude drop ≤ 64%",
      "Peak-to-peak amplitude drop ≤ 54%",
      "Radial vs dorsal ulnar cutaneous onset latency difference ≤ 0.5 ms (radial longer) / 0.3 ms (DUC longer); peak ≤ 0.4 ms either way"
    ],
    "notes": "Having the subject actively extend the thumb aids palpation and localization of the nerve."
  },
  {
    "id": "ulnar-dorsal-cutaneous-sensory",
    "name": "Ulnar dorsal cutaneous sensory nerve",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Dorsum of the hand (antidromic)",
    "position": "Supine with the elbow flexed to 90°",
    "active": "3 cm bar with active in the 'V' formed by the proximal dorsal 4th and 5th metacarpals",
    "reference": "Distal end of the bar electrode",
    "ground": "Dorsum of the hand",
    "stim": [
      "S1: cathode 10 cm proximal to active, over the ulna or between the ulna and FCU, anode proximal"
    ],
    "distance": "10 cm",
    "settings": "Sensitivity 5–10 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "C8 root via lower trunk, anterior division, medial cord, ulnar nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.3 ms",
      "Peak latency (all subjects): upper limit ≈ 2.9 ms",
      "Onset-to-peak amplitude (all subjects): lower limit ≈ 5 µV",
      "Peak-to-peak amplitude (all subjects): lower limit ≈ 5 µV"
    ],
    "sideToSide": [
      "Onset latency increase ≤ 0.5 ms",
      "Peak latency increase ≤ 0.4 ms",
      "Onset-to-peak amplitude drop ≤ 59%",
      "Peak-to-peak amplitude drop ≤ 67%",
      "Radial vs dorsal ulnar cutaneous latency differences as for the radial study"
    ],
    "notes": "Anomalous innervation is common; motor artifact often obscures the response, so submaximal stimulation or forearm supination may help."
  },
  {
    "id": "ulnar-sensory-5th-digit",
    "name": "Ulnar sensory nerve to the fifth digit",
    "region": "Upper limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Fifth digit (antidromic)",
    "position": "Supine",
    "active": "Ring/clip electrode on both sides of the fifth digit, midway between the webspace and PIP joint",
    "reference": "Ring/clip electrode 4 cm distal (or as far distal as possible on small fingers)",
    "ground": "Dorsum of the hand",
    "stim": [
      "S1: cathode 14 cm proximal to active, over the ulnar nerve at the wrist slightly radial to the FCU tendon, anode proximal",
      "S2: cathode at the midpoint between the active electrode and S1, anode proximal"
    ],
    "distance": "14 cm (S1); S2 at midpoint (~7 cm)",
    "settings": "Sensitivity 20 µV/div, LFF 20 Hz, HFF 2 kHz, sweep 1 ms/div",
    "roots": "C8 root via lower trunk, anterior division, medial cord, ulnar nerve",
    "cutoffs": [
      "Onset latency S1 (all subjects): upper limit ≈ 3.1 ms",
      "Peak latency S1 (all subjects): upper limit ≈ 4.0 ms",
      "Onset-to-peak amplitude (all subjects): lower limit ≈ 6 µV",
      "Peak-to-peak amplitude (all subjects): lower limit ≈ 4 µV"
    ],
    "sideToSide": [
      "Onset latency increase ≤ 0.3 ms",
      "Peak latency increase ≤ 0.4 ms",
      "Onset-to-peak amplitude drop ≤ 53%",
      "Peak-to-peak amplitude drop ≤ 64%",
      "Area drop ≤ 65%",
      "Median (D3) vs ulnar (D5) onset latency difference ≤ 0.5 ms (median longer) / 0.3 ms (ulnar longer)"
    ],
    "notes": "Across-elbow lower-limit conduction velocities are ~59 m/s below the elbow and ~50 m/s across the elbow; sensory SNAPs fall off rapidly with distance from phase cancellation."
  },
  {
    "id": "femoral-motor-to-quadriceps",
    "name": "Femoral motor nerve to the quadriceps",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Vastus medialis (quadriceps)",
    "position": "Supine",
    "active": "Over the belly of the vastus medialis",
    "reference": "Over the quadriceps tendon just above the patella (over the patella is an alternative)",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "S1 (above ligament): monopolar needle cathode placed above the inguinal ligament just lateral to the femoral artery, ideally under ultrasound guidance, with the anode under the buttock to drive current deeper",
      "S2 (below ligament): needle cathode placed under ultrasound below the inguinal ligament, lateral to the femoral artery"
    ],
    "distance": "",
    "settings": "Sensitivity 1 mV/div, sweep 2 ms/div, LFF 2–3 Hz, HFF 10 kHz",
    "roots": "L2, L3, L4 roots via the posterior division of the lumbosacral plexus and femoral nerve",
    "cutoffs": [
      "Onset latency, above-ligament (all subjects): upper limit ≈ 8.4 ms",
      "Onset latency, below-ligament (all subjects): upper limit ≈ 7.4 ms",
      "Amplitude: range 0.2–11.0 mV (no formal lower limit reported)"
    ],
    "sideToSide": [
      "Not reported"
    ],
    "notes": "Insufficient stimulus intensity can instead elicit an H-reflex; confirm placement with ultrasound and visible quadriceps contraction."
  },
  {
    "id": "fibular-motor-to-edb",
    "name": "Fibular motor nerve to the extensor digitorum brevis",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Extensor digitorum brevis (EDB)",
    "position": "Supine",
    "active": "Over the midbelly of the EDB on the dorsum of the foot",
    "reference": "Just distal to the 5th metatarsophalangeal joint",
    "ground": "On the dorsum of the foot",
    "stim": [
      "S1 (ankle): cathode 8 cm proximal to the active electrode, just lateral to the tibialis anterior tendon, anode proximal",
      "S2 (below fibular head): cathode just posterior and inferior to the fibular head, anode proximal",
      "S3 (above fibular head): cathode about 6–10 cm proximal to S2, medial to the biceps femoris tendon, anode proximal",
      "F-wave: cathode as for S1 but anode reversed distally"
    ],
    "distance": "8 cm (active to ankle cathode)",
    "settings": "Sensitivity 5 mV/div, sweep 5 ms/div, LFF 2–3 Hz, HFF 10 kHz",
    "roots": "L5, S1 roots via the posterior division of the lumbosacral plexus, sciatic and common fibular nerves",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 6.5 ms",
      "Amplitude (all subjects): lower limit ≈ 1.3 mV",
      "Conduction velocity S1–S2 (all subjects): lower limit ≈ 38 m/s",
      "F-wave (all subjects): upper limit ≈ 61.2 ms"
    ],
    "sideToSide": [
      "Latency increase ≤ 1.6 ms",
      "Amplitude decrease ≤ 61%",
      "S1–S2 CV decrease ≤ 8 m/s",
      "S2–S3 CV decrease ≤ 19 m/s",
      "Shortest F-wave difference ≤ 5.1 ms"
    ],
    "notes": "Avoid coactivating the tibial nerve at popliteal stimulation; an accessory fibular nerve is common (20–25%) and is suggested when ankle amplitude is smaller than knee."
  },
  {
    "id": "fibular-motor-to-fibularis-brevis",
    "name": "Fibular motor nerve to the fibularis brevis",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Fibularis (peroneus) brevis",
    "position": "Supine",
    "active": "32 mm disc electrode placed two-fifths of the way from the fibular head to the tip of the lateral malleolus",
    "reference": "Distal to the active electrode over the muscle tendon",
    "ground": "Over the tibia, 3–4 cm distal to the reference electrode",
    "stim": [
      "S1 (below fibular head): cathode just below the fibular head, anode proximal",
      "S2 (popliteal): cathode just medial to the lateral border of the popliteal space at mid-patella level, about 6–10 cm proximal to S1"
    ],
    "distance": "",
    "settings": "Standard motor settings",
    "roots": "L5, S1, S2 roots via the posterior division of the sacral plexus, sciatic and superficial fibular nerves",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 4.6 ms",
      "Amplitude: mean 5.3 mV (no formal lower limit reported)",
      "Conduction velocity (all subjects): lower limit ≈ 35 m/s"
    ],
    "sideToSide": [
      "Not reported"
    ],
    "notes": "Reference values were derived from mean + 2 SD on a small sample and should be interpreted cautiously."
  },
  {
    "id": "fibular-motor-to-fibularis-longus",
    "name": "Fibular motor nerve to the fibularis longus",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Fibularis (peroneus) longus",
    "position": "Supine",
    "active": "Over the fibularis longus on the lateral fibular surface, 8 cm from the cathode",
    "reference": "At the ankle over the fibularis longus tendon",
    "ground": "Over the upper anterior lower leg",
    "stim": [
      "S (fibular neck): cathode at the posterolateral fibular neck, anode proximal"
    ],
    "distance": "8 cm (cathode to active)",
    "settings": "Sensitivity 2 mV/div (1 mV to read onset), sweep 2 ms/div, LFF 2 Hz, HFF 10 kHz",
    "roots": "L5, S1, S2 roots via the posterior division of the lumbosacral plexus, sciatic and superficial fibular nerves",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 3.0 ms",
      "Amplitude: range 3.4–10.6 mV (no formal lower limit reported)"
    ],
    "sideToSide": [
      "Not reported"
    ],
    "notes": "Distance is fixed from the stimulation site rather than the motor point, so the active electrode may be off the motor point and yield submaximal amplitudes—use caution at height/BMI extremes."
  },
  {
    "id": "fibular-motor-to-tibialis-anterior",
    "name": "Fibular motor nerve to the tibialis anterior",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Tibialis anterior",
    "position": "Supine",
    "active": "One-third of the way from the tibial tubercle to the lateral malleolus",
    "reference": "Inferomedial to the active electrode over the bony tibial surface",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "S1 (below fibular head): cathode just posterior and inferior to the fibular head, anode proximal",
      "S2 (above fibular head): about 10 cm proximal to S1, just medial to the biceps femoris tendon, anode proximal"
    ],
    "distance": "",
    "settings": "Sensitivity 5 mV/div, sweep 2 ms/div, LFF 2–3 Hz, HFF 10 kHz",
    "roots": "L4, L5 roots via the posterior division of the lumbosacral plexus and sciatic nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 4.9 ms",
      "Amplitude (all subjects): lower limit ≈ 1.7 mV",
      "Conduction velocity (all subjects): lower limit ≈ 43 m/s"
    ],
    "sideToSide": [
      "Latency increase ≤ 1.2 ms",
      "Amplitude decrease ≤ 50%",
      "CV decrease ≤ 23 m/s or 20%"
    ],
    "notes": "If the waveform is complex, the reference may lie over active muscle—move it distally toward the tibialis anterior tendon at the ankle."
  },
  {
    "id": "h-reflex-to-calf",
    "name": "H-reflex to the calf",
    "region": "Lower limb – motor",
    "type": "Late response",
    "recording": "Calf (gastrocnemius–soleus)",
    "position": "Prone",
    "active": "At the midpoint of the line between the mid-popliteal crease and the posterior calcaneus, with the leg on a pillow and ankle slightly plantarflexed",
    "reference": "Over the posterior calcaneus",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "S (mid-popliteal): cathode at the mid-popliteal crease, anode distal"
    ],
    "distance": "",
    "settings": "Sensitivity 500 µV/div, sweep 10 ms/div, LFF 2–3 Hz, HFF 10 kHz, stimulus duration 1.0 ms",
    "roots": "Afferent and efferent sciatic fibers, S1 root, monosynaptic spinal reflex",
    "cutoffs": [
      "H-reflex onset latency (all subjects): upper limit ≈ 35.0 ms (height/age dependent)"
    ],
    "sideToSide": [
      "Latency increase ≤ 2.0 ms",
      "Peak-to-peak amplitude ratio < 0.4 with normal latency is probably abnormal"
    ],
    "notes": "Unelicitable H-reflexes are more common in older subjects; slight active plantarflexion facilitates the response."
  },
  {
    "id": "sciatic-motor-recording-from-foot",
    "name": "Sciatic motor nerve recording from the foot",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Distal foot muscles (EDB for fibular portion; abductor hallucis or abductor digiti minimi for tibial portion)",
    "position": "Prone",
    "active": "Over the chosen distal foot muscle per the corresponding fibular/tibial recording technique",
    "reference": "As for the corresponding fibular/tibial foot-muscle technique",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "S1 (popliteal): surface stimulation in the popliteal fossa, cathode distal and anode proximal",
      "S2 (gluteal fold): long needle cathode stimulating the sciatic nerve just below the gluteal fold, on a line above the apex of the popliteal fossa, anode nearby"
    ],
    "distance": "",
    "settings": "Sensitivity 5 mV/div, sweep 2 ms/div, LFF 2–3 Hz, HFF 10 kHz",
    "roots": "Sciatic nerve (tibial and fibular divisions)",
    "cutoffs": [
      "Conduction velocity, tibial portion: mean 52.8 m/s (range 46.7–59.6)",
      "Conduction velocity, peroneal portion: mean 54.3 m/s (range 48.5–61.5)"
    ],
    "sideToSide": [
      "Not reported"
    ],
    "notes": "The gluteal fold site is hard to localize—the fibular fibers lie more lateral and the tibial fibers more medial; watch foot motion to confirm which portion is being stimulated."
  },
  {
    "id": "tibial-motor-to-flexor-digiti-minimi-brevis",
    "name": "Tibial motor nerve (lateral plantar branch) to the flexor digiti minimi brevis",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Flexor digiti minimi brevis",
    "position": "Supine",
    "active": "At the midpoint of the inferolateral edge of the 5th metatarsal",
    "reference": "Just distal to the 5th metatarsophalangeal joint on its lateral surface",
    "ground": "On the dorsum of the foot",
    "stim": [
      "S (ankle): same site as the abductor hallucis study—cathode behind the medial malleolus, 8 cm proximal to a point just anterior and inferior to the navicular tubercle, anode proximal"
    ],
    "distance": "8 cm (cathode to recording point)",
    "settings": "Sensitivity 5 mV/div, sweep 5 ms/div, LFF 2–3 Hz, HFF 10 kHz",
    "roots": "S1, S2 roots via the anterior division of the lumbosacral plexus and sciatic nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 8.3 ms",
      "Amplitude (all subjects): lower limit ≈ 1.4 mV"
    ],
    "sideToSide": [
      "Latency increase ≤ 1.5 ms",
      "Amplitude decrease ≤ 58%",
      "Lateral-vs-medial branch latency increase ≤ 3.5 ms; medial coming within 0.3 ms of or exceeding the lateral latency suggests medial branch slowing"
    ],
    "notes": "Allows direct comparison of the lateral versus medial plantar nerve; the recorded potential arises from flexor digiti minimi brevis rather than abductor digiti minimi."
  },
  {
    "id": "tibial-motor-to-abductor-hallucis",
    "name": "Tibial motor nerve (medial plantar branch) to the abductor hallucis",
    "region": "Lower limb – motor",
    "type": "Motor",
    "recording": "Abductor hallucis",
    "position": "Supine",
    "active": "Over the medial foot, just anterior and inferior to the navicular tubercle at the top of the plantar/dorsal skin junction",
    "reference": "Just distal to the 1st metatarsophalangeal joint on its medial surface",
    "ground": "On the dorsum of the foot",
    "stim": [
      "S1 (ankle): cathode 8 cm proximal to the active electrode (measured straight, ankle neutral), just posterior to the medial malleolus, anode proximal",
      "S2 (knee): cathode at the mid-popliteal fossa or slightly to either side of midline, anode proximal",
      "F-wave: cathode as for S1 but anode reversed distally"
    ],
    "distance": "8 cm (active to ankle cathode)",
    "settings": "Sensitivity 5 mV/div, sweep 5 ms/div, LFF 2–3 Hz, HFF 10 kHz",
    "roots": "S1, S2 roots via the anterior division of the lumbosacral plexus and sciatic nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 6.1 ms",
      "Amplitude (all subjects): lower limit ≈ 4.4 mV",
      "Conduction velocity (all subjects): lower limit ≈ 39 m/s",
      "F-wave (all subjects): upper limit ≈ 61.4 ms"
    ],
    "sideToSide": [
      "Latency increase ≤ 1.4 ms",
      "Amplitude decrease ≤ 50%",
      "CV decrease ≤ 10 m/s",
      "Shortest F-wave difference ≤ 5.7 ms"
    ],
    "notes": "The ankle-to-knee amplitude drop is larger than most nerves due to reference-site activity causing phase cancellation; a 10 cm distance may be used for large feet."
  },
  {
    "id": "deep-fibular-sensory",
    "name": "Deep fibular sensory nerve",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Dorsum of the foot at the first web space",
    "position": "Supine",
    "active": "Over the terminal sensory branch in the interspace between the 1st and 2nd metatarsal heads",
    "reference": "3 cm distal on the 2nd digit",
    "ground": "Between the stimulator and recording electrodes on the dorsum of the foot",
    "stim": [
      "S: cathode at the ankle, 12 cm proximal to the active electrode just lateral to the extensor hallucis longus tendon; anode proximal"
    ],
    "distance": "12 cm cathode-to-active",
    "settings": "Averaging 5–20 stimuli; sensitivity 5 µV/div; LFF 20 Hz; HFF 2 kHz; sweep 1 ms/div",
    "roots": "L5 root via the posterior division of the lumbosacral plexus and the common/deep peroneal nerves",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 3.6 ms (range)",
      "Peak latency (all subjects): upper limit ≈ 4.2 ms (range)",
      "Amplitude (all subjects): lower limit ≈ 1.6 µV (range)"
    ],
    "sideToSide": [],
    "notes": ""
  },
  {
    "id": "lateral-femoral-cutaneous-ma-liveson",
    "name": "Lateral femoral cutaneous sensory nerve (Ma and Liveson technique)",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Anterolateral thigh along a line from the ASIS to the lateral patellar border",
    "position": "Supine",
    "active": "Surface electrode positioned 17–20 cm below the ASIS along the ASIS-to-lateral-patella line",
    "reference": "3 cm further distal along the same line",
    "ground": "Sited between the stimulator and the recording electrodes",
    "stim": [
      "S1: just below the inguinal ligament over the origin of the sartorius",
      "S2: just above the inguinal ligament, 1 cm medial to the ASIS"
    ],
    "distance": "S1 measured 14–18 cm, S2 measured 17–20 cm (recording pair 3 cm apart)",
    "settings": "Sensitivity 5 µV/div; LFF 32 Hz; HFF 3.2 kHz",
    "roots": "L2–L3 roots via the posterior division of the lumbosacral plexus",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.8 ms (S1) / 3.2 ms (S2)",
      "Amplitude (all subjects): lower limit ≈ 4 µV (S1) / 3 µV (S2)"
    ],
    "sideToSide": [],
    "notes": "Technically hard, especially in overweight patients; an absent response has doubtful clinical meaning."
  },
  {
    "id": "lateral-femoral-cutaneous-spevak-prevec",
    "name": "Lateral femoral cutaneous sensory nerve (Spevak and Prevec technique)",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Anterolateral thigh, roughly 25 cm distal to the stimulation site",
    "position": "Supine",
    "active": "One of two 8 cm strip electrodes placed 2.5 cm apart on the anterolateral thigh, about 25 cm below the stimulator",
    "reference": "Second strip electrode 2.5 cm from the active on the anterolateral thigh",
    "ground": "Placed between the stimulator and the recording electrodes",
    "stim": [
      "S: 6–10 cm below the ASIS, seeking the point where the shock radiates into the lateral thigh; 0.1 ms duration, intensity twice sensory threshold but under 150 V; 8–32 responses averaged"
    ],
    "distance": "About 25.3 ± 3.5 cm from stimulator to active electrode",
    "settings": "Sensitivity 1–2 µV/div; LFF 100 Hz; HFF 5 kHz; sweep 1 ms/div",
    "roots": "L2–L3 roots via the posterior division of the lumbosacral plexus",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 5.5 ms",
      "Peak latency (all subjects): upper limit ≈ 6.0 ms",
      "Conduction velocity (all subjects): lower limit ≈ 51.3 m/s"
    ],
    "sideToSide": [
      "Conduction velocity difference 2.6 ± 2.2 m/s, not exceeding 6 m/s",
      "Amplitude difference 0.86 ± 0.89 µV"
    ],
    "notes": "Ultrasound guidance is advised for patients with BMI >27.5 to improve yield and reduce side-to-side variability."
  },
  {
    "id": "medial-calcaneal-sensory",
    "name": "Medial calcaneal sensory nerve",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Medial heel",
    "position": "Supine",
    "active": "One-third of the way from the heel apex toward a point midway between the navicular tubercle and the medial malleolar prominence",
    "reference": "Over the apex of the heel",
    "ground": "Between the stimulator and the recording electrodes",
    "stim": [
      "S: cathode 10 cm proximal to the active electrode, measured first to the posterior tip of the medial malleolus then along the medial tibial border, placed 1–2 cm behind the medial tibial edge; anode proximal or rotated"
    ],
    "distance": "10 cm cathode-to-active",
    "settings": "Sensitivity 10–20 µV/div; LFF 2 Hz; HFF 2 kHz; sweep 1 ms/div",
    "roots": "S1 root via the anterior division of the lumbosacral plexus and the tibial nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.0 ms",
      "Peak latency (all subjects): upper limit ≈ 2.8 ms",
      "Amplitude (all subjects): lower limit ≈ 8 µV"
    ],
    "sideToSide": [
      "Onset latency ≤ 0.3 ms",
      "Peak latency ≤ 0.3 ms",
      "Amplitude ≤ 12 µV"
    ],
    "notes": "The sensory response may need averaging and is often followed by volume-conducted motor artifact."
  },
  {
    "id": "medial-femoral-cutaneous-sensory",
    "name": "Medial femoral cutaneous sensory nerve",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Medial thigh along a line from the femoral pulse to the medial patellar border",
    "position": "Supine",
    "active": "14 cm distal to the femoral pulse along the line running to the medial border of the patella",
    "reference": "4 cm further distal along the same line",
    "ground": "Proximal to the active electrode on the lateral thigh",
    "stim": [
      "S: cathode just lateral to the femoral artery in the inguinal region; anode proximal"
    ],
    "distance": "14 cm cathode-to-active",
    "settings": "Sensitivity 5 µV/div; LFF 20 Hz; HFF 2 kHz; sweep 1 ms/div; pulse 0.2 ms",
    "roots": "L2–L3 roots via the posterior division of the lumbosacral plexus and the femoral nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.7–2.8 ms",
      "Peak latency (all subjects): upper limit ≈ 3.3–3.5 ms",
      "Amplitude (all subjects): lower limit ≈ 3.4 µV (range low)"
    ],
    "sideToSide": [],
    "notes": "Averaging of about 5–10 sweeps and anode rotation are usually needed; support the slightly flexed knee on a pillow."
  },
  {
    "id": "posterior-femoral-cutaneous-sensory",
    "name": "Posterior femoral cutaneous sensory nerve",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Posterior thigh midline near the popliteal fossa",
    "position": "Prone",
    "active": "Proximal pole of a bar electrode set at the posterior thigh midline, 6 cm above the midpopliteal region",
    "reference": "Distal pole of the bar electrode",
    "ground": "Just proximal to the bar electrode",
    "stim": [
      "S: cathode 12 cm proximal to the active electrode along a line to the ischial tuberosity, in the groove between the medial and lateral hamstrings; anode proximal"
    ],
    "distance": "12 cm cathode-to-active",
    "settings": "Sensitivity 5 µV/div; LFF 20 Hz; HFF 2 kHz; sweep 1–2 ms/div",
    "roots": "Posterior divisions of S1–S2 and anterior divisions of S2–S3 roots",
    "cutoffs": [
      "Peak latency (all subjects): upper limit ≈ 3.2 ms",
      "Amplitude (all subjects): lower limit ≈ 4.1 µV (range)"
    ],
    "sideToSide": [],
    "notes": "Useful for proximal evaluation of lower-limb neuropathies and in amputees; local muscle depolarization is a theoretical confounder."
  },
  {
    "id": "saphenous-sensory-distal",
    "name": "Saphenous sensory nerve (distal technique)",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Medial ankle near the medial malleolus using a 3 cm bar electrode",
    "position": "Supine",
    "active": "Proximal and slightly medial to the tibialis anterior tendon",
    "reference": "Just anterior to the top of the medial malleolus, between the malleolus and the tibialis anterior tendon",
    "ground": "Between the recording electrodes and the cathode",
    "stim": [
      "S: cathode 14 cm proximal to the active electrode, deep to the medial tibial border; anode proximal"
    ],
    "distance": "14 cm cathode-to-active",
    "settings": "Sensitivity 2–5 µV/div; LFF 20 Hz; HFF 2 kHz; sweep 1 ms/div",
    "roots": "L3–L4 roots via the posterior division of the lumbosacral plexus (continuation of the femoral nerve)",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 3.8 ms",
      "Peak latency (all subjects): upper limit ≈ 4.4 ms",
      "Amplitude (all subjects): lower limit ≈ 2 µV onset-to-peak / 1 µV peak-to-peak"
    ],
    "sideToSide": [
      "Onset and peak latency increase ≤ 0.5 ms",
      "Onset-to-peak amplitude drop ≤ 65%",
      "Peak-to-peak amplitude drop ≤ 78%",
      "Sural–saphenous onset difference ≤ 0.3 ms (sural longer) / 0.7 ms (saphenous longer)",
      "Sural–saphenous peak difference ≤ 0.5 ms (sural longer) / 0.6 ms (saphenous longer)"
    ],
    "notes": "Small or absent responses are common, so an absent response is not necessarily pathologic."
  },
  {
    "id": "saphenous-sensory-proximal",
    "name": "Saphenous sensory nerve (proximal technique)",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Medial leg over the tibial border using a 3 cm bar electrode",
    "position": "Supine",
    "active": "15 cm distal to the cathode on the medial border of the tibia",
    "reference": "3 cm distal to the active electrode",
    "ground": "Between the stimulator and recording electrodes",
    "stim": [
      "S: knee slightly flexed; cathode on the medial knee between the sartorius and gracilis tendons, about 1 cm above the inferior patellar border; anode proximal"
    ],
    "distance": "15 cm cathode-to-active (reference values over 13–16 cm)",
    "settings": "Standard sensory settings",
    "roots": "L3–L4 roots via the posterior division of the lumbosacral plexus (continuation of the femoral nerve)",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 2.8 ms (range)",
      "Amplitude: mean 10.23 ± 2.05 µV (range 7–15 µV)"
    ],
    "sideToSide": [],
    "notes": "Localization is difficult in obese patients; stimulating too anteriorly produces a patellar sensation rather than medial-leg paresthesias."
  },
  {
    "id": "superficial-fibular-sensory-jabre",
    "name": "Superficial fibular sensory nerve, intermediate branch (Jabre technique)",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Just medial to the lateral malleolus using a bar electrode",
    "position": "Supine",
    "active": "Proximal pole of a bar electrode set one to two fingerbreadths medial to the lateral malleolus",
    "reference": "Distal pole of the bar electrode",
    "ground": "Over the anterior lower leg between stimulator and recording electrodes",
    "stim": [
      "S: cathode 12 cm proximal to the active electrode, probe pressed firmly against the anterior fibula; anode proximal; pulse 0.05 ms (0.1 ms sometimes needed)",
      "S2 (optional): 8–9 cm proximal to S for conduction velocity"
    ],
    "distance": "12 cm cathode-to-active",
    "settings": "Sensitivity 10 µV/div; LFF 32 Hz; HFF 1.6 kHz; sweep 2 ms/div",
    "roots": "L4, L5, S1 roots via the posterior division of the lumbosacral plexus and the common fibular nerve",
    "cutoffs": [
      "Peak latency (all subjects): upper limit ≈ 3.5 ms",
      "Amplitude: mean 20.5 ± 6.1 µV (onset-to-negative-peak)",
      "Conduction velocity (proximal segment): ≈ 65.7 ± 3.7 m/s"
    ],
    "sideToSide": [],
    "notes": "Low stimulus intensity helps avoid motor artifact contamination."
  },
  {
    "id": "superficial-fibular-sensory-izzo",
    "name": "Superficial fibular sensory nerve, intermediate dorsal cutaneous branch (Izzo et al. technique)",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Intermediate dorsal cutaneous branch at the ankle",
    "position": "Supine",
    "active": "At the ankle over the branch, localized by inspection and palpation during plantarflexion and inversion",
    "reference": "3–4 cm distal to the active electrode",
    "ground": "Over the distal dorsal lower leg between the active electrode and cathode",
    "stim": [
      "S: cathode 14 cm proximal to the active electrode on the anterolateral leg; anode proximal; pulse 0.05–0.1 ms"
    ],
    "distance": "14 cm cathode-to-active",
    "settings": "Sensitivity 20 µV/div; LFF 20 Hz; HFF 2 kHz; sweep 2 ms/div",
    "roots": "L4, L5, S1 roots via the posterior division of the lumbosacral plexus and the common fibular nerve",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 3.4 ms",
      "Peak latency (all subjects): upper limit ≈ 4.2 ms",
      "Amplitude (all subjects): lower limit ≈ 4 µV (range)"
    ],
    "sideToSide": [],
    "notes": "The branch is superficial and often visible/palpable with the foot plantarflexed and inverted; absent in about 2% of subjects."
  },
  {
    "id": "sural-sensory",
    "name": "Sural sensory nerve",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Behind the lateral malleolus using a 3 cm bar electrode",
    "position": "Side-lying",
    "active": "Just behind the lateral malleolus",
    "reference": "Distal to the active electrode",
    "ground": "Between the stimulator and recording electrodes",
    "stim": [
      "S: cathode 14 cm proximal to the active electrode in or slightly lateral to the midline of the posterior calf; anode proximal"
    ],
    "distance": "14 cm cathode-to-active",
    "settings": "Sensitivity 2–5 µV/div; LFF 20 Hz; HFF 2 kHz; sweep 1 ms/div",
    "roots": "S1–S2 roots via the anterior and posterior divisions of the lumbosacral plexus and the tibial and fibular nerves",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 3.6 ms",
      "Peak latency (all subjects): upper limit ≈ 4.5 ms",
      "Amplitude (all subjects): lower limit ≈ 4 µV (onset-to-peak and peak-to-peak)"
    ],
    "sideToSide": [
      "Onset latency increase ≤ 0.4 ms",
      "Peak latency increase ≤ 0.5 ms",
      "Onset-to-peak amplitude drop ≤ 72%",
      "Peak-to-peak amplitude drop ≤ 67%",
      "Sural–saphenous onset difference ≤ 0.3 ms (sural longer) / 0.7 ms (saphenous longer)",
      "Sural–saphenous peak difference ≤ 0.5 ms (sural longer) / 0.6 ms (saphenous longer)"
    ],
    "notes": "A sural/radial amplitude ratio <0.40 (90% sensitivity/specificity) helps detect axonal polyneuropathy when the sural amplitude is borderline."
  },
  {
    "id": "sural-lateral-dorsal-cutaneous-branch",
    "name": "Sural sensory nerve: lateral dorsal cutaneous branch",
    "region": "Lower limb – sensory/mixed",
    "type": "Sensory",
    "recording": "Dorsolateral foot over the 5th metatarsal using felt-tip electrodes (37 mm apart)",
    "position": "Supine",
    "active": "Over the dorsolateral foot at the midpoint of the 5th metatarsal, just lateral to the extensor digitorum brevis tendon of the 5th toe",
    "reference": "Distal to the active electrode (fixed 37 mm interelectrode distance)",
    "ground": "On the dorsum of the foot",
    "stim": [
      "S: cathode 12 cm proximal to the active electrode behind the lateral malleolus; anode proximal"
    ],
    "distance": "12 cm cathode-to-active",
    "settings": "Averaging 5–10 stimuli; sensitivity 5 µV/div; LFF 20 Hz; HFF 2 kHz; sweep 1 ms/div",
    "roots": "S1–S2 roots via the anterior and posterior divisions of the lumbosacral plexus and the tibial and fibular nerves",
    "cutoffs": [
      "Onset latency (all subjects): upper limit ≈ 4.0 ms",
      "Peak latency (all subjects): upper limit ≈ 4.9 ms",
      "Amplitude (all subjects): lower limit ≈ 3.0 µV (range)"
    ],
    "sideToSide": [],
    "notes": ""
  },
  {
    "id": "tibial-mixed-medial-lateral-plantar",
    "name": "Tibial mixed nerve (medial and lateral plantar branches)",
    "region": "Lower limb – sensory/mixed",
    "type": "Mixed",
    "recording": "Over the tibial nerve just proximal to the flexor retinaculum using a bar electrode",
    "position": "Supine, examiner at the foot of the bed",
    "active": "Distal pole of the bar electrode over the tibial nerve, proximal to the flexor retinaculum (proximal to a line from the posterior calcaneus to the medial malleolus)",
    "reference": "Proximal pole of the bar electrode",
    "ground": "Over the dorsum of the foot",
    "stim": [
      "S (medial branch): cathode 14 cm distal to the active electrode, measured 10 cm to the 1st–2nd metatarsal interspace then 4 cm distally; anode distal",
      "S (lateral branch): cathode 14 cm distal to the active electrode, between the 4th and 5th metatarsals; anode distal"
    ],
    "distance": "14 cm active-to-cathode",
    "settings": "Sensitivity 5–10 µV/div; sweep 1 ms/div; LFF 32 Hz; HFF 3.2 kHz",
    "roots": "Tibial nerve medial and lateral plantar branches",
    "cutoffs": [
      "Peak latency (all subjects): upper limit ≈ 3.7 ms (medial and lateral)",
      "Amplitude: medial 10–30 µV, lateral 8–20 µV (range)"
    ],
    "sideToSide": [],
    "notes": "Often hard to elicit even in normals, so absent responses must be read cautiously; conventional studies are insensitive for tarsal tunnel syndrome."
  },
  {
    "id": "blink-reflex",
    "name": "Blink reflex",
    "region": "Head & neck",
    "type": "Reflex",
    "recording": "Orbicularis oculi muscle (bilateral)",
    "position": "Relaxed (supine/seated)",
    "active": "Over the lower lateral part of the orbicularis oculi on both sides.",
    "reference": "Over the temple, or on the side of the nose just above the nasalis muscle.",
    "ground": "Beneath the chin, or on the forehead or cheek.",
    "stim": [
      "Cathode over the supraorbital nerve at the supraorbital notch (palpable), with the anode positioned superolaterally; the facial nerve at the stylomastoid foramen can alternatively be stimulated directly."
    ],
    "distance": "",
    "settings": "Sensitivity 50-200 uV/div, low-frequency filter 20 Hz, high-frequency filter 10 kHz, sweep 10 ms/div.",
    "roots": "Afferent CN V and efferent CN VII fibers plus their central brainstem connections",
    "cutoffs": [
      "R1 onset latency upper limit 13.0 ms",
      "Ipsilateral R2 latency upper limit 40 ms",
      "Contralateral R2 latency upper limit 41 ms",
      "Direct facial nerve latency upper limit 4.1 ms"
    ],
    "sideToSide": [
      "R1 latency side-to-side difference up to 1.2 ms",
      "R2 latency difference up to 5 ms with dual-channel (one-side stimulation) recording, or 7 ms with single-channel sequential recording",
      "Direct response latency difference up to 0.6 ms"
    ],
    "notes": "Test several blinks and take the shortest latencies (Kimura suggests at least eight trials); the R/D ratio should stay within 2.6-4.6."
  },
  {
    "id": "cranial-nerve-vii-facial",
    "name": "Cranial nerve VII (facial motor)",
    "region": "Head & neck",
    "type": "Motor",
    "recording": "Nasalis (or another facial muscle such as orbicularis oris/oculi, levator labii superioris)",
    "position": "Seated",
    "active": "Over the chosen facial muscle; for the nasalis, on the lateral mid-nose at the muscle's most prominent bulge; for orbicularis oculi, below the eye in line with the pupil; for orbicularis oris, lateral to the corner of the mouth.",
    "reference": "On the tip or bridge of the nose, or over the contralateral nasalis when recording from the nasalis.",
    "ground": "Over the base of the neck or on the cheek.",
    "stim": [
      "Preauricular: cathode just in front of the lower ear over the parotid, several cm above the mandibular angle, anode posterior.",
      "Postauricular: cathode just behind the lower ear at the stylomastoid foramen, below the mastoid and behind the mandibular neck, anode posterior."
    ],
    "distance": "",
    "settings": "Sensitivity 200-1,000 uV/div, low-frequency filter 8 Hz, high-frequency filter 8 kHz, sweep 1-2 ms/div.",
    "roots": "CN VII efferent motor fibers",
    "cutoffs": [
      "Preauricular latency to nasalis mean 3.57 ms (range 2.8-4.1)",
      "Postauricular latency to nasalis mean 3.88 ms (range 3.2-4.4)"
    ],
    "sideToSide": [
      "Amplitude difference over 50% suggests pathology, provided the waveforms are similar bilaterally"
    ],
    "notes": "Surface recording is preferred so amplitude can be assessed; measure amplitude from onset to negative peak."
  },
  {
    "id": "cranial-nerve-xi-spinal-accessory",
    "name": "Cranial nerve XI (spinal accessory)",
    "region": "Head & neck",
    "type": "Motor",
    "recording": "Upper trapezius muscle",
    "position": "Seated",
    "active": "Over the upper trapezius, roughly 9 cm lateral to the C7 spinous process.",
    "reference": "About 3 cm lateral to the active electrode.",
    "ground": "Between the stimulating and recording electrodes.",
    "stim": [
      "Cathode in the posterior triangle of the neck, 1-2 cm behind the posterior border of sternocleidomastoid and just above its midpoint (halfway between the mastoid process and the suprasternal notch), anode superior."
    ],
    "distance": "",
    "settings": "Sensitivity 1 mV/div, sweep 1-2 ms/div, low-frequency filter 2-3 Hz, high-frequency filter 10 kHz.",
    "roots": "CN XI",
    "cutoffs": [
      "Onset latency mean 2.3 ms (range 1.7-3.0)",
      "Peak-to-peak amplitude >3-4 mV"
    ],
    "sideToSide": [],
    "notes": "Avoid stimulating the brachial plexus; arm muscle contraction signals overstimulation, and CN XI activation should produce a shoulder shrug."
  },
  {
    "id": "greater-auricular-sensory",
    "name": "Greater auricular sensory nerve",
    "region": "Head & neck",
    "type": "Sensory",
    "recording": "Back of the earlobe",
    "position": "Seated",
    "active": "On the back of the earlobe, the inferior of two electrodes placed 2 cm apart.",
    "reference": "On the back of the earlobe, 2 cm superior to the active electrode.",
    "ground": "On the back of the neck.",
    "stim": [
      "Along the posterior border of sternocleidomastoid, cathode superior and 8 cm from the active electrode, anode inferior."
    ],
    "distance": "8 cm",
    "settings": "Sensitivity 20 uV/div, low-frequency filter 32 Hz, high-frequency filter 3.2 kHz, sweep 1 ms/div.",
    "roots": "C2 and C3 nerve roots",
    "cutoffs": [
      "Onset latency upper limit 1.6 ms",
      "Peak latency upper limit 2.3 ms",
      "Peak-to-peak amplitude mean 22.4 uV (SD 8.93)",
      "Duration upper limit 1.2 ms"
    ],
    "sideToSide": [],
    "notes": "May be hard to perform in heavy-set patients with short necks; recording can alternatively be taken from the mastoid process."
  },
  {
    "id": "cervical-nerve-root-stimulation",
    "name": "Cervical nerve root stimulation",
    "region": "Root & pudendal",
    "type": "Motor",
    "recording": "Abductor digiti minimi (C8-T1), biceps (C5-C6), or triceps (C6-C8) depending on roots tested",
    "position": "",
    "active": "Over the motor point of the selected muscle (ADM, biceps, or triceps)",
    "reference": "Over a distal tendon of the recorded muscle",
    "ground": "",
    "stim": [
      "Monopolar needle cathode inserted perpendicularly about 1 cm lateral to the spinous processes onto the vertebral lamina; C5 level for C5/C6, C6 level for C6/C7/C8, C7 level for C8/T1; surface anode placed 1 cm caudal and slightly medial to cathode"
    ],
    "distance": "",
    "settings": "LFF 8 Hz, HFF 8 kHz, sensitivity 5 mV/div, sweep 2 ms/div for proximal muscles and 5 ms/div for distal muscles",
    "roots": "C5-C6, C6-C7-C8, C8-T1 cervical roots",
    "cutoffs": [
      "Distinguishing demyelinating neuropathy: onset-latency cutoff 17.5 ms for APB/ADM and 7 ms for biceps/triceps; proximal-to-distal CMAP amplitude reduction cutoff 45%"
    ],
    "sideToSide": [
      "Latency asymmetry upper limit 1.0 ms",
      "Amplitude asymmetry upper limit 20% reduction from larger to smaller"
    ],
    "notes": "Nonspecific test; a 50% or greater amplitude drop between limb and root stimulation defines proximal conduction block"
  },
  {
    "id": "lumbosacral-nerve-root-stimulation",
    "name": "Lumbosacral nerve root stimulation",
    "region": "Root & pudendal",
    "type": "Motor",
    "recording": "Any appropriate lower-extremity muscle (e.g., soleus, tibialis anterior, flexor hallucis brevis, vastus medialis, abductor hallucis)",
    "position": "",
    "active": "Over the motor point or mid-belly of the chosen muscle",
    "reference": "Over the distal tendinous insertion of that muscle",
    "ground": "Between the stimulating and recording electrodes",
    "stim": [
      "Monopolar needle cathode (50-75 mm) placed 2-2.5 cm lateral to the L4 spinous process on the vertebral arch for L2/L3/L4 roots, with needle anode contralaterally",
      "For L5/S1 roots, needle inserted just medial and slightly caudal to the posterior superior iliac spine (alternate: surface anode on abdomen opposite cathode)",
      "Optional distal stimulus (S2) at femoral nerve/inguinal region for L2-L4 or sciatic nerve/gluteal fold for L5-S1 to derive trans-plexus conduction time"
    ],
    "distance": "",
    "settings": "Sensitivity 2-5 mV/div, LFF 10 Hz, HFF 10 kHz, sweep 2-5 ms/div",
    "roots": "L2/L3/L4 and L5/S1 nerve roots",
    "cutoffs": [
      "L5/S1 latency to soleus ~15.4 ms",
      "Latency to tibialis anterior ~12.4-13.5 ms",
      "L2-L4 trans-plexus time to vastus medialis ~3.4 ms (2.0-4.4)",
      "L5-S1 trans-plexus time to abductor hallucis ~3.9 ms (2.5-4.9)"
    ],
    "sideToSide": [
      "Soleus latency difference 0.2 ms (0.0-0.8)",
      "Tibialis anterior latency difference upper limit <0.7 ms",
      "L2-L4 trans-plexus difference 0.0-0.9 ms",
      "L5-S1 trans-plexus difference 0.0-1.0 ms",
      "Tibialis anterior amplitude difference upper limit 9.6%",
      "Tibialis anterior area difference upper limit 12.3%"
    ],
    "notes": "A 50% or greater amplitude drop between limb and root stimulation defines proximal conduction block"
  },
  {
    "id": "pudendal-nerve-studies",
    "name": "Pudendal nerve studies",
    "region": "Root & pudendal",
    "type": "Motor",
    "recording": "External anal sphincter",
    "position": "Supine with hips and knees flexed and legs abducted",
    "active": "1 cm electrodes over the radial creases of the external anal sphincter at the 9 o'clock position for the right response or 3 o'clock position for the left",
    "reference": "Midline several centimeters from the sphincter on the gluteal fold",
    "ground": "",
    "stim": [
      "St. Mark's disposable electrode with cathode and anode at the fingertip of a gloved finger placed at the ischial spine via a transvaginal approach, stimulating each side"
    ],
    "distance": "",
    "settings": "LFF 10 Hz, HFF 10 kHz, sensitivity 50 uV/div, sweep 2 ms/div, stimulus duration 0.05 ms, intensity 10-15 mA, with averaging of multiple responses",
    "roots": "Pudendal nerve",
    "cutoffs": [
      "Onset latency upper limit of normal 2.23 ms (all subjects)",
      "Baseline-to-peak amplitude lower limit of normal 48 uV (all subjects)"
    ],
    "sideToSide": [],
    "notes": "Reference limits vary slightly with age group"
  },
  {
    "id": "accessory-deep-fibular-nerve",
    "name": "Accessory deep fibular nerve",
    "region": "Other studies",
    "type": "Motor",
    "recording": "Extensor digitorum brevis (lateral portion)",
    "position": "",
    "active": "Over the belly of the extensor digitorum brevis",
    "reference": "",
    "ground": "",
    "stim": [
      "Behind the lateral malleolus, where the accessory deep fibular branch runs (compared against routine fibular motor stimulation at the ankle and at the knee/fibular head)"
    ],
    "distance": "",
    "settings": "Sweep about 20 ms per division, sensitivity about 2 mV per division",
    "roots": "Accessory deep fibular nerve (branch of the superficial fibular nerve)",
    "cutoffs": [
      "During routine fibular motor study, the EDB amplitude on ankle stimulation should be roughly 90%–120% of the amplitude obtained on knee stimulation"
    ],
    "sideToSide": [],
    "notes": "Suspect the anomaly when the knee-stimulated amplitude exceeds the ankle amplitude, since accessory fibers reaching the EDB are only captured by stimulating behind the lateral malleolus."
  }
]
