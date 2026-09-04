import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'
import { ARTEFACT_REFERENCES, FIGURES, SOURCES, type PrimerFigure } from '../data/ultrasoundPrimer'

// ---------------------------------------------------------------------------
// Neuromuscular ultrasound primer.
//
// Five sections, read in order: the physics, the probe, the modes, the knobs,
// and one worked assessment (the diaphragm) that uses all four.
//
// SCOPE, stated plainly because it matters clinically: this is the knobology
// and physics foundation plus the diaphragm case. It does NOT carry nerve
// cross-sectional area reference values, entrapment cut-offs, or muscle
// echogenicity grading — none of that is in the source material, and inventing
// reference values a fellow might act on is the one failure this project will
// not tolerate. The page says so where a reader would otherwise assume it.
//
// Adapted from NYSORA's POCUS series with permission; every section credits and
// links its source page, and the figures are local copies (see
// data/ultrasoundPrimer.ts).
// ---------------------------------------------------------------------------

type SectionId = 'physics' | 'transducers' | 'modes' | 'settings' | 'artefacts' | 'diaphragm'

const SECTIONS: Array<{ id: SectionId; label: string; sub: string; source: string }> = [
  { id: 'physics', label: 'Physics', sub: 'What the picture is made of', source: SOURCES.physics },
  { id: 'transducers', label: 'Transducers', sub: 'Choosing and holding the probe', source: SOURCES.transducers },
  { id: 'modes', label: 'Scanning modes', sub: 'B, M and Doppler', source: SOURCES.scanning },
  { id: 'settings', label: 'Machine settings', sub: 'Depth, focus, gain', source: SOURCES.settings },
  { id: 'artefacts', label: 'Artefacts', sub: 'What the machine gets wrong', source: SOURCES.artefacts },
  { id: 'diaphragm', label: 'Diaphragm', sub: 'A worked assessment', source: SOURCES.diaphragm },
]

/**
 * A figure with its caption.
 *
 * Falls back to a labelled gap rather than a broken image: the primer ships
 * before the image files are placed, and "diaphragm-m-mode.jpg is not in
 * public/ultrasound yet" is a message someone can act on, where a broken icon
 * is not.
 */
function Figure({ id, wide }: { id: keyof typeof FIGURES; wide?: boolean }) {
  const fig: PrimerFigure | undefined = FIGURES[id]
  const [failed, setFailed] = useState(false)
  if (!fig) return null

  return (
    <figure className={`my-4 ${wide ? '' : 'max-w-2xl'}`}>
      {failed ? (
        <div className="rounded-md border border-dashed border-line bg-paper px-4 py-6 text-center">
          <p className="text-sm font-medium text-ink">Figure not uploaded yet</p>
          <p className="mt-1 font-mono text-xs text-muted">public/ultrasound/{fig.file}</p>
          <a
            href={fig.source}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
          >
            Source page on NYSORA
          </a>
        </div>
      ) : (
        <img
          src={`/ultrasound/${fig.file}`}
          alt={fig.alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full rounded-md border border-line bg-white"
        />
      )}
      <figcaption className="mt-2 text-xs text-muted">{fig.caption}</figcaption>
    </figure>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 font-display text-sm font-semibold text-ink first:mt-0">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-ink">{children}</p>
}

/** A short fact worth remembering, set apart from the prose. */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md border-l-2 border-accent bg-accent-soft/30 px-4 py-2 text-sm text-ink">
      {children}
    </p>
  )
}

/** Something the source material does not cover — never filled in by guesswork. */
function Gap({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-ink">
      <span className="font-semibold text-amber-800">Not covered here. </span>
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------

function Physics() {
  return (
    <>
      <P>
        Ultrasound is sound above the range you can hear — above 20 kHz, where human hearing stops
        at about 20 kHz and diagnostic probes work at several megahertz. The transducer sends a
        pulse into tissue and then listens. Wherever the beam crosses a boundary between two
        tissues, part of it comes back. The machine times each echo, works out how deep it came
        from, and paints a dot whose brightness is the echo&apos;s strength. Strong reflectors read
        bright (hyperechoic); weak ones read dark (hypoechoic).
      </P>
      <Figure id="physicsOverview" />

      <H>The four properties of the wave</H>
      <P>
        <span className="font-semibold">Amplitude</span> is the height of the wave — its energy.{' '}
        <span className="font-semibold">Wavelength</span> is the length of one cycle, and it sets
        how close two points can be and still be told apart.{' '}
        <span className="font-semibold">Period</span> is how long one cycle takes, in microseconds.{' '}
        <span className="font-semibold">Frequency</span> is how many cycles happen per second, in
        hertz. Frequency and wavelength are two ways of saying the same thing, and the whole
        trade-off in scanning comes out of the relationship between them.
      </P>
      <Figure id="soundWave" />

      <H>Speed, and why the machine can trust it</H>
      <P>
        Sound travels at a speed set by the stiffness and density of what it is passing through:
        faster through stiffer tissue, slower through denser. Every depth on the screen is a
        calculation from the time an echo took to return, so the machine has to assume a speed — it
        assumes <span className="font-semibold">1540 m/s</span>, the average for soft tissue, which
        actually ranges from about 1400 to 1640 m/s. Air and bone sit far outside that range, which
        is why the beam gets nowhere through lung or through cortical bone.
      </P>
      <Key>
        c = f × λ. Speed is fixed by the tissue, so raising frequency shortens the wavelength — and
        a shorter wavelength is what buys resolution.
      </Key>

      <H>Acoustic impedance — why some interfaces are bright</H>
      <P>
        Impedance is a tissue&apos;s resistance to sound passing through it: density times speed. An
        echo is generated at the <em>step</em> between two impedances, and the size of the step sets
        the brightness. Two similar tissues meeting produce almost nothing, which is why a
        homogeneous structure looks dark and featureless inside. Bone at the other extreme reflects
        or absorbs nearly everything, giving a bright line with a black shadow behind it.
      </P>
      <Figure id="acousticImpedance" />

      <H>Attenuation — why you cannot have both</H>
      <P>
        A beam loses amplitude as it travels, and it loses it faster at higher frequency. That single
        fact is the reason there is more than one probe. High frequency gives fine detail and runs
        out of energy quickly; low frequency reaches deep and resolves less. An 8 MHz beam penetrates
        further than a 10 or 12 MHz beam of the same power.
      </P>
      <Figure id="attenuation" />
      <Key>
        Pick the highest frequency that still reaches your target. For nerve and muscle in a limb
        that is usually the top of the linear probe&apos;s range; go lower only when the target is
        genuinely deep.
      </Key>

      <Gap>
        The source page does not separate axial from lateral resolution, and does not cover
        refraction or scattering. The named artefacts that follow from this physics — anisotropy,
        shadowing, enhancement and reverberation — have their own section further on.
      </Gap>
    </>
  )
}

function Transducers() {
  return (
    <>
      <P>
        A transducer both speaks and listens. Piezoelectric elements deform when a voltage is applied
        across them, producing the pulse; the returning echo deforms them again and produces a
        voltage the machine turns into brightness on the screen.
      </P>

      <H>Three shapes, three jobs</H>
      <P>
        <span className="font-semibold">Linear array</span> — parallel scan lines, a rectangular
        image, the highest frequencies and the best near-field detail. Limited depth. This is the
        probe for vessels, musculoskeletal work, and everything superficial.
      </P>
      <P>
        <span className="font-semibold">Curved array</span> — a curved face giving an arc-shaped
        image at lower frequency. Deep penetration and a wide field at depth, at the cost of
        near-field resolution. For abdominal and other deep structures.
      </P>
      <P>
        <span className="font-semibold">Phased array</span> — a small footprint steering the beam
        electronically into a wide arc from a narrow window. Lower near-field resolution again, but
        it fits between ribs, which nothing else does.
      </P>
      <Figure id="transducerTypes" />

      <H>Orientation</H>
      <P>
        Every probe has a marker on one side that corresponds to one side of the image. Conventionally
        it points to the patient&apos;s right — cardiac imaging is the exception, where it points to
        the patient&apos;s left. Scanning longitudinally, point it towards the head. Getting this
        wrong does not make a bad image; it makes a mirrored one, which is worse, because it looks
        fine.
      </P>
      <Key>
        Rest the palmar side of your wrist on the patient. A hand braced on the body holds a still
        image; a hand held in the air does not.
      </Key>

      <H>The four movements</H>
      <P>
        <span className="font-semibold">Slide</span> across the skin to find the window.{' '}
        <span className="font-semibold">Tilt</span> the beam perpendicular to the index mark.{' '}
        <span className="font-semibold">Rotate</span> clockwise or anticlockwise to change the plane.{' '}
        <span className="font-semibold">Rock</span> (heel–toe) parallel to the index mark. Most
        &ldquo;I cannot see it&rdquo; problems are one small movement away from solved, and knowing
        which of the four you are making is what makes the search systematic rather than a wiggle.
      </P>
      <Figure id="transducerManeuvers" />
    </>
  )
}

function Modes() {
  return (
    <>
      <H>A-mode</H>
      <P>
        The oldest mode, from 1930: a single pulse down a single line, displayed as peaks at the
        depth of each interface. One dimension, no anatomy — of historical interest, and useful for
        understanding that everything else is built from exactly this.
      </P>
      <Figure id="aMode" />

      <H>B-mode</H>
      <P>
        The mode you scan in. A row of 100–300 elements fires together, and every returning echo
        becomes a dot whose brightness is its amplitude — a two-dimensional grey-scale slice where
        distances on screen are real distances in tissue.
      </P>
      <Figure id="bMode" />

      <H>M-mode</H>
      <P>
        One line of the B-mode image, plotted against time. Depth runs down the screen, time runs
        across, and anything that moves draws a trace. It is how movement gets measured rather than
        described — and it is the mode the diaphragm assessment in the last section depends on.
      </P>
      <Figure id="mMode" />

      <H>Doppler</H>
      <P>
        A wave reflected off something moving comes back at a different frequency: higher if the
        movement is towards you, lower if away. The size of that shift depends on the angle — largest
        when you are looking straight along the direction of flow, and exactly zero at 90°, where a
        vessel with excellent flow can appear to have none.
      </P>
      <Figure id="dopplerEffect" />
      <Figure id="dopplerAngle" />

      <P>
        <span className="font-semibold">Colour Doppler</span> paints the shifts as a colour map over
        the B-mode image. Red is flow towards the probe, blue is away — BART, &ldquo;Blue Away, Red
        Towards&rdquo;. The colours mean direction relative to the probe, not artery and vein.
      </P>
      <Figure id="colourDoppler" />

      <P>
        <span className="font-semibold">Power Doppler</span> shows the strength of the Doppler signal
        rather than its direction: up to five times more sensitive than colour, much less
        angle-dependent, and therefore the one that finds small vessels — but it tells you nothing
        about direction or velocity.
      </P>
      <P>
        <span className="font-semibold">Spectral Doppler</span> plots velocity against time, above
        the baseline towards the probe and below it away.{' '}
        <span className="font-semibold">Continuous wave</span> uses separate crystals to send and
        receive, so it measures high velocities accurately but cannot say where along the line they
        came from. <span className="font-semibold">Pulsed wave</span> samples one chosen depth, so it
        does know where — but it has a velocity ceiling (the Nyquist limit), and beyond it the trace
        wraps around and aliases.
      </P>
      <Figure id="dopplerModes" />
    </>
  )
}

function Settings() {
  return (
    <>
      <H>Depth</H>
      <P>
        Set it so the structure of interest fills the screen and little else does. Too deep and your
        target is a small object in a large field; too shallow and you lose the context behind it.
      </P>
      <Figure id="depth" />

      <H>Focus</H>
      <P>
        Focusing narrows the beam at a chosen depth, the way a lens does, and that is where the
        picture is sharpest. It is a trade, not a free improvement: narrowing the beam at the focal
        zone widens it elsewhere, so everything deeper than the focus gets worse. Put the focal
        marker at your target, not below it.
      </P>
      <Figure id="focus" />

      <H>Gain and time-gain compensation</H>
      <P>
        Echoes returning from deeper structures are weaker — energy is reflected away at every
        interface and absorbed steadily in between. <span className="font-semibold">Gain</span>{' '}
        amplifies everything equally, in decibels, and it amplifies noise exactly as much as signal:
        turning it up does not recover detail that is not there.
      </P>
      <P>
        <span className="font-semibold">Time-gain compensation</span> is the answer to the real
        problem, amplifying by depth. The row of sliders maps to bands down the image, so you can
        lift the far field without washing out the near field and get an image of even brightness top
        to bottom.
      </P>
      <Figure id="timeGainCompensation" />
      <Key>
        If the whole image is too bright or too dark, reach for gain. If the top is fine and the
        bottom is dark, reach for the TGC sliders.
      </Key>
    </>
  )
}

function Diaphragm() {
  return (
    <>
      <P>
        The reason this primer ends here: the diaphragm is where ultrasound answers a question the
        electrodiagnostic lab is asked constantly and cannot always answer comfortably — is this
        diaphragm working, and if not, is it weak or paralysed. It is also a complete worked example,
        using the probe choice, the modes and the settings from the sections above.
      </P>

      <Card className="mt-4 border-accent/30 bg-accent-soft/20">
        <div className="px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">The case</p>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            A 60-year-old woman with COPD and hypertension, after elective cardiac surgery, could not
            be weaned from the ventilator. She was in respiratory distress, breathing shallowly, using
            accessory muscles, with reduced breath sounds at both bases — and no overt neuromuscular
            weakness to explain it.
          </p>
        </div>
      </Card>

      <H>Setting up</H>
      <P>
        Two windows, two probes. The <span className="font-semibold">subcostal area</span> is scanned
        with a curvilinear or phased array probe on an abdominal preset at{' '}
        <span className="font-semibold">12–18 cm</span> depth, using the liver on the right or the
        spleen on the left as the acoustic window. The{' '}
        <span className="font-semibold">zone of apposition</span> is scanned with a linear probe at{' '}
        <span className="font-semibold">1.5–3 cm</span>. The patient lies supine with arms at their
        sides; lateral decubitus and semi-upright both work but reproduce less reliably, which matters
        if the study will be repeated.
      </P>
      <Figure id="thoracicLandmarks" />

      <H>Finding it</H>
      <P>
        For the subcostal window, place the probe transversely at the midclavicular line below the
        costal margin and angle up through the liver or spleen. For the zone of apposition, put the
        linear probe parallel to the ribs between the{' '}
        <span className="font-semibold">8th and 10th intercostal spaces</span> at the anterior
        axillary line: the diaphragm appears as three layers — a dark muscle between two bright
        membranes.
      </P>
      <Figure id="zoneOfApposition" />

      <H>Excursion: how far it moves</H>
      <P>
        From the subcostal window, put an M-mode line through the moving dome and record. Normal
        breathing draws a smooth sinusoid, moving towards the probe on inspiration.
      </P>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-1.5 pr-4 font-semibold text-muted">Effort</th>
              <th className="py-1.5 font-semibold text-muted">Normal excursion</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            <tr className="border-b border-line/60"><td className="py-1.5 pr-4">Quiet breathing</td><td className="py-1.5">≈ 1.0 cm</td></tr>
            <tr className="border-b border-line/60"><td className="py-1.5 pr-4">Deep breathing</td><td className="py-1.5">≈ 2.5 cm</td></tr>
            <tr><td className="py-1.5 pr-4">Sniff</td><td className="py-1.5">≈ 3.5 cm</td></tr>
          </tbody>
        </table>
      </div>
      <Figure id="diaphragmMMode" />
      <Figure id="excursionValues" />

      <H>Thickening: whether it is contracting</H>
      <P>
        Excursion alone can mislead — a passively dragged diaphragm still moves. Thickening asks
        whether the muscle is doing the work. In the zone of apposition, measure thickness at end
        expiration and at end inspiration. Normal thickness runs from about{' '}
        <span className="font-semibold">1.7 mm at rest to 4.5 mm at total lung capacity</span>.
      </P>
      <Key>
        Thickening fraction = (D<sub>insp</sub> − D<sub>exp</sub>) / D<sub>exp</sub>. Below{' '}
        <span className="font-semibold">20%</span> indicates dysfunction.
      </Key>
      <Figure id="thickening" />

      <H>What she had</H>
      <P>
        Excursion of <span className="font-semibold">0.5 cm</span>, moving{' '}
        <span className="font-semibold">paradoxically upwards</span> on inspiration, with a thickening
        fraction of <span className="font-semibold">15%</span>. Reduced movement, movement in the
        wrong direction, and a muscle not thickening: diaphragmatic dysfunction, most consistent with
        paralysis, and enough to explain why she would not wean.
      </P>

      <Gap>
        This is one published case, reproduced as a worked example of technique. It is not a
        laboratory protocol, and the cut-offs above are the ones that case used — confirm the values
        your own laboratory reports against a primary source before applying them.
      </Gap>
    </>
  )
}

// ---------------------------------------------------------------------------
// Artefacts.
//
// Written from Radiopaedia's reference articles (ARTEFACT_REFERENCES), rewritten
// in this primer's voice rather than reproduced, and illustrated with diagrams
// drawn here rather than borrowed images — the mechanism is geometry, and a
// clean drawing of the geometry teaches it better than a screen capture.
//
// The clinical framing is deliberately neuromuscular: the artefact that will
// actually mislead a fellow in this lab is anisotropy on a nerve, not a
// cholesterol crystal in a gallbladder.
// ---------------------------------------------------------------------------

/** Shared drawing tokens, so the three diagrams read as one set. */
const D = {
  probe: '#0E7C86',
  beam: '#2F6FD0',
  echo: '#1FA363',
  lost: '#B91C1C',
  tissue: '#E8EAEE',
  ink: '#111827',
  muted: '#6B7280',
  line: '#C9CDD4',
}

function Diagram({
  title,
  caption,
  children,
  viewBox,
}: {
  title: string
  caption: string
  viewBox: string
  children: React.ReactNode
}) {
  return (
    <figure className="my-4 max-w-2xl">
      <svg
        viewBox={viewBox}
        role="img"
        aria-label={title}
        className="w-full rounded-md border border-line bg-white"
      >
        <defs>
          <marker id="ar-beam" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 1 L9 5 L0 9 z" fill={D.beam} />
          </marker>
          <marker id="ar-echo" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 1 L9 5 L0 9 z" fill={D.echo} />
          </marker>
          <marker id="ar-lost" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0 1 L9 5 L0 9 z" fill={D.lost} />
          </marker>
        </defs>
        {children}
      </svg>
      <figcaption className="mt-2 text-xs text-muted">{caption}</figcaption>
    </figure>
  )
}

/** The probe face, drawn the same way in every diagram. */
function Probe({ x, y, w = 90 }: { x: number; y: number; w?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={16} rx={3} fill={D.probe} />
      <rect x={x + 4} y={y + 16} width={w - 8} height={4} fill={D.probe} opacity={0.45} />
    </g>
  )
}

function Artefacts() {
  return (
    <>
      <P>
        Every artefact below is the machine reporting exactly what it measured, under an assumption
        that has stopped being true. It assumes sound travelled in a straight line, at 1540 m/s, out
        and back once. Where that assumption breaks, the picture is wrong in a way that is
        reproducible — which is what makes these worth learning rather than merely tolerating.
      </P>

      <H>Anisotropy — the one that will fool you</H>
      <P>
        A tendon, a ligament and a peripheral nerve are all built from fibrils running in parallel.
        Structures like that reflect sound the way a mirror reflects light, not the way a wall
        scatters it: the echo goes off at the angle it arrived, and only a beam striking the fibres
        squarely sends its echo back to the probe. Tilt off perpendicular and most of the beam
        leaves in a direction the transducer is not listening in. The machine hears nothing back and
        does the only thing it can — it paints that region dark.
      </P>

      <Diagram
        title="Anisotropy: a fibrillar structure appears bright only when the beam strikes it squarely"
        viewBox="0 0 540 250"
        caption="Left: beam perpendicular, echoes return, the tendon reads bright. Right: the same tendon, the probe tilted a few degrees — the echoes leave at an angle the probe cannot hear and the structure reads falsely dark."
      >
        {/* ---- left panel: perpendicular ---- */}
        <rect x={10} y={40} width={240} height={175} fill={D.tissue} />
        <Probe x={80} y={20} />
        {[100, 125, 150].map((x) => (
          <line key={`b${x}`} x1={x} y1={44} x2={x} y2={140} stroke={D.beam} strokeWidth={2} markerEnd="url(#ar-beam)" />
        ))}
        {/* fibrillar band */}
        <rect x={40} y={150} width={190} height={22} rx={4} fill="#FFFFFF" stroke={D.line} />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={`f${i}`} x1={46} y1={155 + i * 4} x2={224} y2={155 + i * 4} stroke={D.line} strokeWidth={1.4} />
        ))}
        {[100, 125, 150].map((x) => (
          <line key={`e${x}`} x1={x + 8} y1={148} x2={x + 8} y2={52} stroke={D.echo} strokeWidth={2} markerEnd="url(#ar-echo)" />
        ))}
        <text x={130} y={196} textAnchor="middle" fontSize={12} fontWeight={700} fill={D.ink}>
          90° — bright
        </text>
        <text x={130} y={211} textAnchor="middle" fontSize={11} fill={D.muted}>
          echoes return to the probe
        </text>

        {/* ---- right panel: off-perpendicular ---- */}
        <rect x={290} y={40} width={240} height={175} fill={D.tissue} />
        <Probe x={360} y={20} />
        {[380, 405, 430].map((x) => (
          <line key={`b2${x}`} x1={x} y1={44} x2={x} y2={132} stroke={D.beam} strokeWidth={2} markerEnd="url(#ar-beam)" />
        ))}
        {/* Clipped to the panel: rotating a full-width band pushes its corners
            outside the tissue rectangle, and a tendon hanging in the margin
            reads as a drawing error rather than as anatomy. */}
        <clipPath id="ar-panel-right">
          <rect x={290} y={40} width={240} height={175} />
        </clipPath>
        <g clipPath="url(#ar-panel-right)">
          <g transform="rotate(-14 410 161)">
            <rect x={318} y={150} width={184} height={22} rx={4} fill="#FFFFFF" stroke={D.line} />
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={`f2${i}`} x1={324} y1={155 + i * 4} x2={496} y2={155 + i * 4} stroke={D.line} strokeWidth={1.4} />
            ))}
          </g>
        </g>
        {[380, 405, 430].map((x, i) => (
          <line
            key={`e2${x}`}
            x1={x + 4}
            y1={138 - i * 6}
            x2={x + 72}
            y2={78 - i * 6}
            stroke={D.lost}
            strokeWidth={2}
            markerEnd="url(#ar-lost)"
          />
        ))}
        <text x={410} y={196} textAnchor="middle" fontSize={12} fontWeight={700} fill={D.ink}>
          off-perpendicular — falsely dark
        </text>
        <text x={410} y={211} textAnchor="middle" fontSize={11} fill={D.muted}>
          echoes deflect away from the probe
        </text>
      </Diagram>

      <P>
        In musculoskeletal scanning this is the artefact that produces wrong diagnoses: a normal
        tendon rendered hypoechoic by a few degrees of probe tilt looks like tendinosis, or like a
        tear. The fix is mechanical, not electronic — heel-and-toe the probe through the angle and
        watch the structure brighten and darken. Anything that brightens when you square up to it
        was never hypoechoic; real pathology stays dark at every angle.
      </P>
      <Key>
        Anisotropy is reversible and pathology is not. Before you call a nerve or tendon hypoechoic,
        rock the probe. If it lights up, you were looking at the artefact.
      </Key>
      <P>
        It can also be turned to use. A tendon running through hyperechoic fat can be hard to
        delineate when both are bright; deliberately angling off perpendicular darkens the tendon
        alone and separates it from its surroundings.
      </P>

      <H>Acoustic shadowing</H>
      <P>
        Where an interface reflects or absorbs essentially the whole beam, nothing is left to travel
        deeper and nothing returns from beyond it. The result is a dark band extending to the bottom
        of the image. It happens at a very dense or calcified structure — bone, a calcified stone —
        and at any interface with a large impedance mismatch, of which soft tissue against air is
        the extreme case.
      </P>
      <P>
        Shadow intensity is not fixed: bringing the focal zone closer to the shadowing object
        deepens the shadow. And the artefact is diagnostically useful in its own right, which is how
        gallstones are identified. In a limb it is how you know where you are — the bright line and
        black shadow of the fibular head or the medial epicondyle is a landmark, not a problem.
      </P>

      <H>Acoustic enhancement</H>
      <P>
        The mirror image of shadowing, and also called posterior enhancement or enhanced through
        transmission. Fluid attenuates sound far less than tissue does — for a 1 MHz beam the
        attenuation coefficient of water is roughly two thousand times lower than that of soft
        tissue. The beam therefore arrives at the far side of a cyst having lost almost nothing,
        while the time gain compensation is still applying the amplification it would need had it
        crossed the same depth of tissue. Over-amplified, the tissue behind the cyst is painted too
        bright.
      </P>

      <Diagram
        title="Acoustic shadowing and acoustic enhancement compared"
        viewBox="0 0 540 250"
        caption="The same mechanism read two ways. A near-total reflector leaves nothing to return from deeper tissue (dark); a fluid structure lets almost everything through while the gain compensation still assumes tissue (bright)."
      >
        <rect x={10} y={40} width={240} height={185} fill={D.tissue} />
        <Probe x={80} y={20} />
        {/* calcified reflector */}
        <path d="M92 120 A38 38 0 0 1 168 120 Z" fill="#FFFFFF" stroke={D.ink} strokeWidth={3} />
        <rect x={92} y={122} width={76} height={103} fill="#4B5563" opacity={0.85} />
        {[110, 130, 150].map((x) => (
          <line key={`sb${x}`} x1={x} y1={44} x2={x} y2={104} stroke={D.beam} strokeWidth={2} markerEnd="url(#ar-beam)" />
        ))}
        <text x={130} y={200} textAnchor="middle" fontSize={12} fontWeight={700} fill="#FFFFFF">
          shadow
        </text>
        <text x={130} y={243} textAnchor="middle" fontSize={11} fill={D.muted}>
          bone, calcification, air
        </text>

        <rect x={290} y={40} width={240} height={185} fill={D.tissue} />
        <Probe x={360} y={20} />
        {/* fluid structure */}
        <circle cx={410} cy={122} r={40} fill="#1F2937" opacity={0.9} />
        <rect x={372} y={162} width={76} height={63} fill="#FFFFFF" />
        {[392, 410, 428].map((x) => (
          <line key={`eb${x}`} x1={x} y1={44} x2={x} y2={78} stroke={D.beam} strokeWidth={2} markerEnd="url(#ar-beam)" />
        ))}
        {[392, 410, 428].map((x) => (
          <line key={`ec${x}`} x1={x} y1={166} x2={x} y2={214} stroke={D.beam} strokeWidth={2} markerEnd="url(#ar-beam)" />
        ))}
        <text x={410} y={128} textAnchor="middle" fontSize={12} fontWeight={700} fill="#FFFFFF">
          fluid
        </text>
        <text x={410} y={243} textAnchor="middle" fontSize={11} fill={D.muted}>
          enhancement behind it
        </text>
      </Diagram>

      <P>
        Enhancement is what identifies a cystic structure — a ganglion, say — but it is not proof of
        one: some solid masses, lymphoma in particular, can enhance posteriorly too.
      </P>

      <H>Reverberation</H>
      <P>
        When the beam meets two strong reflectors lying parallel to each other, it does not simply
        return once. It bounces between them and comes back in instalments. The machine has no way
        to know it made the trip more than once, so it converts the extra travel time into extra
        depth and draws a ladder of copies at regular intervals, each fainter than the last. As with
        anisotropy, the fix is to change the angle of insonation so the two surfaces are no longer
        parallel to the beam.
      </P>

      <Diagram
        title="Reverberation: repeated round trips between two parallel reflectors are drawn as deeper copies"
        viewBox="0 0 540 250"
        caption="The beam bounces between two parallel reflectors. Each extra round trip takes longer, and the machine reads longer as deeper — so the pair is redrawn at equal intervals, fading with depth."
      >
        <rect x={10} y={40} width={520} height={185} fill={D.tissue} />
        <Probe x={40} y={20} w={70} />
        <line x1={75} y1={44} x2={75} y2={68} stroke={D.beam} strokeWidth={2} markerEnd="url(#ar-beam)" />

        {/* An evenly stepped ladder, because that is what the artefact looks
            like: the two real reflectors, then a repeat at the SAME interval
            for every extra round trip, each weaker than the one above it. */}
        {[
          { y: 76, real: true, o: 1 },
          { y: 106, real: true, o: 1 },
          { y: 136, real: false, o: 0.6 },
          { y: 166, real: false, o: 0.38 },
          { y: 196, real: false, o: 0.2 },
        ].map((r) => (
          <line
            key={r.y}
            x1={30}
            y1={r.y}
            x2={330}
            y2={r.y}
            stroke={D.ink}
            strokeWidth={r.real ? 3.5 : 3}
            opacity={r.o}
          />
        ))}
        <text x={344} y={80} fontSize={11} fontWeight={700} fill={D.ink}>real</text>
        <text x={344} y={110} fontSize={11} fontWeight={700} fill={D.ink}>real</text>
        <text x={344} y={140} fontSize={11} fill={D.muted}>1st repeat</text>
        <text x={344} y={170} fontSize={11} fill={D.muted}>2nd</text>
        <text x={344} y={200} fontSize={11} fill={D.muted}>3rd, fading</text>

        {/* the beam bouncing between the two real surfaces */}
        <path
          d="M150 76 L180 106 L210 76 L240 106"
          fill="none"
          stroke={D.lost}
          strokeWidth={2}
          strokeDasharray="5 4"
        />

        {/* interval bracket: every step is the same depth apart */}
        {[76, 106, 136, 166].map((y) => (
          <g key={`br${y}`}>
            <line x1={438} y1={y} x2={438} y2={y + 30} stroke={D.muted} strokeWidth={1} />
            <line x1={434} y1={y} x2={442} y2={y} stroke={D.muted} strokeWidth={1} />
            <line x1={434} y1={y + 30} x2={442} y2={y + 30} stroke={D.muted} strokeWidth={1} />
          </g>
        ))}
        <text x={448} y={124} fontSize={11} fill={D.muted}>equal</text>
        <text x={448} y={138} fontSize={11} fill={D.muted}>intervals</text>
      </Diagram>

      <P>
        <span className="font-semibold">Comet tail</span> is a form of reverberation, arising from a
        small echogenic focus that contains strongly reflecting parallel surfaces within itself. The
        separation between them can be less than half the spatial pulse length, so the individual
        echoes are not resolved as separate lines; they render as a short tapering train, narrowing
        with depth because each successive echo is weaker.
      </P>
      <Key>
        Reverberation is the artefact to expect around a needle. Two parallel metal surfaces in the
        beam is precisely the geometry that produces it — angling the probe, rather than turning the
        gain down, is what clears it.
      </Key>
      <Gap>
        Ring-down artefact looks similar to reverberation and is often grouped with it, but it does
        not arise from the same mechanism and is treated as a separate entity in the source. It is
        not described here.
      </Gap>

      <H>Where this came from</H>
      <P>
        This section is not from the NYSORA series the rest of the primer follows. It is written
        from four Radiopaedia reference articles, rewritten here rather than reproduced, and the
        diagrams above are drawn for this page. Radiopaedia articles are revised over time, so the
        revision each was written from is recorded.
      </P>
      <ul className="mt-2 space-y-1">
        {ARTEFACT_REFERENCES.map((r) => (
          <li key={r.url} className="text-sm text-ink">
            <a
              href={r.url}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-accent hover:underline"
            >
              {r.title}
            </a>
            <span className="text-muted">
              {' '}
              — Radiopaedia, last revised by {r.author} on {r.revised}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

const BODIES: Record<SectionId, () => JSX.Element> = {
  physics: Physics,
  transducers: Transducers,
  modes: Modes,
  settings: Settings,
  artefacts: Artefacts,
  diaphragm: Diaphragm,
}

// ---------------------------------------------------------------------------

export default function UltrasoundPrimer() {
  const [active, setActive] = useState<SectionId>('physics')

  const index = useMemo(() => SECTIONS.findIndex((s) => s.id === active), [active])
  const section = SECTIONS[index]
  const Body = BODIES[active]

  // A primer is read in order, so moving between sections should behave like
  // turning a page: start at the top of the new one, not partway down it.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [active])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Neuromuscular ultrasound primer</h1>
        <p className="mt-1 text-sm text-muted">
          The physics and knobology behind an ultrasound image, and one worked assessment
        </p>
      </div>

      {/* Section rail. Chips rather than a sidebar: five sections is few enough
          to show every label at once, which a reader needs in order to know how
          long the primer is. */}
      <nav aria-label="Primer sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            aria-current={active === s.id ? 'page' : undefined}
            className={`rounded-md border px-3 py-2 text-left transition-colors ${
              active === s.id
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line text-muted hover:text-ink'
            }`}
          >
            <span className="block text-sm font-semibold">
              {i + 1}. {s.label}
            </span>
            <span className="block text-xs opacity-80">{s.sub}</span>
          </button>
        ))}
      </nav>

      <Card>
        <CardHeader
          title={section.label}
          sub={section.sub}
          action={
            <a
              href={section.source}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink"
            >
              Source
            </a>
          }
        />
        <div className="px-5 py-4">
          <Body />
        </div>

        {/* Turning the page. */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <button
            onClick={() => setActive(SECTIONS[index - 1].id)}
            disabled={index === 0}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← {index > 0 ? SECTIONS[index - 1].label : 'Start'}
          </button>
          <span className="text-xs text-muted">
            {index + 1} of {SECTIONS.length}
          </span>
          <button
            onClick={() => setActive(SECTIONS[index + 1].id)}
            disabled={index === SECTIONS.length - 1}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-accent hover:underline disabled:cursor-not-allowed disabled:text-muted/40 disabled:no-underline"
          >
            {index < SECTIONS.length - 1 ? SECTIONS[index + 1].label : 'End'} →
          </button>
        </div>
      </Card>

      {/* The credit paragraph that stood here was removed at the fellowship's
          request on 2026-09-03. Each section still carries a Source button to
          the NYSORA page it came from, so the figures are not presented as the
          fellowship's own work. */}
      <Card>
        <div className="px-5 py-4">
          <p className="text-sm text-muted">
            Educational reference for clinicians in training. Nothing here is guidance for the care of
            an individual patient, and the values quoted are those of the sources cited — confirm them
            against a primary source and your own laboratory&apos;s practice.
          </p>
        </div>
      </Card>
    </div>
  )
}
