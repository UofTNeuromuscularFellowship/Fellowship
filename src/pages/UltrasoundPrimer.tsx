import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'
import { FIGURES, SOURCES, type PrimerFigure } from '../data/ultrasoundPrimer'

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

type SectionId = 'physics' | 'transducers' | 'modes' | 'settings' | 'diaphragm'

const SECTIONS: Array<{ id: SectionId; label: string; sub: string; source: string }> = [
  { id: 'physics', label: 'Physics', sub: 'What the picture is made of', source: SOURCES.physics },
  { id: 'transducers', label: 'Transducers', sub: 'Choosing and holding the probe', source: SOURCES.transducers },
  { id: 'modes', label: 'Scanning modes', sub: 'B, M and Doppler', source: SOURCES.scanning },
  { id: 'settings', label: 'Machine settings', sub: 'Depth, focus, gain', source: SOURCES.settings },
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
        refraction, scattering, or the named artefacts (shadowing, enhancement, reverberation,
        anisotropy). Anisotropy in particular matters when scanning nerve and tendon — worth adding
        from a primary source before this is used for teaching.
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

const BODIES: Record<SectionId, () => JSX.Element> = {
  physics: Physics,
  transducers: Transducers,
  modes: Modes,
  settings: Settings,
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

      <Card>
        <div className="px-5 py-4">
          <p className="text-sm text-ink">
            <span className="font-semibold">Source and credit. </span>
            Adapted with permission from NYSORA&apos;s POCUS series — the pages on{' '}
            <a href={SOURCES.physics} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">physics</a>,{' '}
            <a href={SOURCES.transducers} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">transducers</a>,{' '}
            <a href={SOURCES.scanning} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">scanning modes</a>,{' '}
            <a href={SOURCES.settings} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">machine settings</a>, and the{' '}
            <a href={SOURCES.diaphragm} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">diaphragm case study</a>.
            Figures are reproduced from those pages; the text is written for this fellowship rather
            than copied.
          </p>
          <p className="mt-2 text-sm text-muted">
            Educational reference for clinicians in training. Nothing here is guidance for the care of
            an individual patient, and the values quoted are those of the sources cited — confirm them
            against a primary source and your own laboratory&apos;s practice.
          </p>
        </div>
      </Card>
    </div>
  )
}
