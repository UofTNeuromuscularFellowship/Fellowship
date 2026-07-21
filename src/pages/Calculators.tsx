import { useMemo, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'

// ---------------------------------------------------------------------------
// EMG / NCS calculators — educational reference tools for the fellowship.
// Formulas and cutoffs are drawn from the cited literature and the reference
// implementations at eletrodiagnostico.com.br. Normative limits vary by lab,
// technique, and filter settings — always validate against your own values.
// ---------------------------------------------------------------------------

type TabKey = 'tli' | 'fh' | 'srar' | 'cidp'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'tli', label: 'Terminal Latency Index' },
  { key: 'fh', label: 'F-wave & H-reflex' },
  { key: 'srar', label: 'Sural / Radial ratio' },
  { key: 'cidp', label: 'CIDP checklist' },
]

export default function Calculators() {
  const [tab, setTab] = useState<TabKey>('tli')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">EMG / NCS calculators</h1>
        <p className="mt-1 text-sm text-muted">Quick electrodiagnostic calculations with the formula and interpretation shown for each</p>
      </div>

      <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
        <span className="font-semibold">Educational use only.</span> These tools support teaching and interpretation —
        they are not medical advice and do not diagnose any individual. Cutoffs are technique- and lab-dependent;
        always validate results against your own laboratory's normative values and the full clinical picture.
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tli' && <TerminalLatencyIndex />}
      {tab === 'fh' && <FWaveHReflex />}
      {tab === 'srar' && <SuralRadialRatio />}
      {tab === 'cidp' && <CidpChecklist />}
    </div>
  )
}

// ---- shared bits ----------------------------------------------------------

function NumField({ label, value, onChange, unit, step, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; unit?: string; step?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}{unit ? ` (${unit})` : ''}</label>
      <input
        type="number" inputMode="decimal" step={step ?? 'any'} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
      />
    </div>
  )
}

function Result({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls = {
    neutral: 'border-line bg-paper text-ink',
    good: 'border-accent bg-accent-soft text-ink',
    warn: 'border-amber-400 bg-amber-50 text-ink',
    bad: 'border-red-500 bg-red-50 text-ink',
  }[tone]
  return <div className={`rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

function Explain({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-paper px-4 py-3 text-sm leading-relaxed text-muted">
      {children}
    </div>
  )
}

const num = (s: string): number | null => {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ---- 1) Terminal Latency Index -------------------------------------------

function TerminalLatencyIndex() {
  const [dist, setDist] = useState('')
  const [mcv, setMcv] = useState('')
  const [dml, setDml] = useState('')

  const d = num(dist), v = num(mcv), l = num(dml)
  const tli = d !== null && v !== null && l !== null && v > 0 && l > 0 ? d / (v * l) : null

  let tone: 'good' | 'warn' | 'bad' = 'good'
  let verdict = ''
  if (tli !== null) {
    if (tli >= 0.34) { tone = 'good'; verdict = 'Normal — distal conduction is proportional to the proximal segment.' }
    else if (tli >= 0.25) { tone = 'warn'; verdict = 'Moderate disproportionate distal slowing — seen in carpal tunnel syndrome and focal demyelination.' }
    else { tone = 'bad'; verdict = 'Marked distal slowing — the pattern seen in anti-MAG / DADS neuropathy (finding it in two nerves adds specificity).' }
  }

  return (
    <Card>
      <CardHeader title="Terminal Latency Index (TLI)" sub="Distal vs. proximal conduction along a motor nerve" />
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-3">
          <NumField label="Distal distance" unit="mm" value={dist} onChange={setDist} placeholder="e.g. 65" />
          <NumField label="Motor conduction velocity" unit="m/s" value={mcv} onChange={setMcv} placeholder="e.g. 52" />
          <NumField label="Distal motor latency" unit="ms" value={dml} onChange={setDml} placeholder="e.g. 3.6" />
        </div>

        {tli !== null ? (
          <Result tone={tone}>
            <p className="font-semibold">TLI = {tli.toFixed(2)}</p>
            <p className="mt-0.5">{verdict}</p>
          </Result>
        ) : (
          <Result>Enter the distal distance, proximal-segment conduction velocity, and distal motor latency.</Result>
        )}

        <Explain>
          <p className="mb-1 font-medium text-ink">How it's calculated</p>
          <p>TLI = distal distance (mm) ÷ [motor conduction velocity (m/s) × distal motor latency (ms)]. Because m/s equals mm/ms, the result is dimensionless — it compares how fast the terminal (distal) segment conducts relative to the proximal segment.</p>
          <p className="mt-2"><span className="font-medium text-ink">Interpretation:</span> ≥ 0.34 normal · 0.25–0.33 moderate distal slowing (CTS, focal demyelination) · ≤ 0.25 marked distal slowing (anti-MAG / DADS pattern). For the median nerve, a value under ~0.29 can flag superimposed carpal tunnel compression (e.g. in diabetes).</p>
          <p className="mt-2 text-xs">Distal distance is the skin distance from the distal stimulating cathode to the active recording electrode; velocity is measured over the proximal segment.</p>
        </Explain>
      </div>
    </Card>
  )
}

// ---- 2) F-wave & H-reflex -------------------------------------------------

function FWaveHReflex() {
  // Predicted soleus H-reflex (Braddom–Johnson 1974)
  const [age, setAge] = useState('')
  const [leg, setLeg] = useState('')
  const [hMeasured, setHMeasured] = useState('')

  const a = num(age), L = num(leg), hm = num(hMeasured)
  const hPred = a !== null && L !== null ? 9.14 + 0.46 * L + 0.10 * a : null

  // Side-to-side differences
  const [hR, setHR] = useState('')
  const [hL, setHL] = useState('')
  const [fR, setFR] = useState('')
  const [fL, setFL] = useState('')
  const hDiff = num(hR) !== null && num(hL) !== null ? Math.abs(num(hR)! - num(hL)!) : null
  const fDiff = num(fR) !== null && num(fL) !== null ? Math.abs(num(fR)! - num(fL)!) : null

  // F-wave chronodispersion
  const [fMax, setFMax] = useState('')
  const [fMin, setFMin] = useState('')
  const chrono = num(fMax) !== null && num(fMin) !== null ? num(fMax)! - num(fMin)! : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Predicted soleus H-reflex latency" sub="Braddom–Johnson regression from age and leg length" />
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-3">
            <NumField label="Age" unit="years" value={age} onChange={setAge} placeholder="e.g. 45" />
            <NumField label="Leg length (popliteal fossa → medial malleolus)" unit="cm" value={leg} onChange={setLeg} placeholder="e.g. 39" />
            <NumField label="Measured H latency (optional)" unit="ms" value={hMeasured} onChange={setHMeasured} placeholder="e.g. 32" />
          </div>
          {hPred !== null ? (
            <Result tone={hm !== null ? (hm > hPred + 1.5 ? 'warn' : 'good') : 'neutral'}>
              <p className="font-semibold">Predicted H latency ≈ {hPred.toFixed(1)} ms</p>
              {hm !== null && (
                <p className="mt-0.5">
                  Measured {hm.toFixed(1)} ms is {(hm - hPred >= 0 ? '+' : '') + (hm - hPred).toFixed(1)} ms vs. predicted.
                  {hm > hPred + 1.5 ? ' Exceeds the predicted value by more than ~1.5 ms — consider an S1 radiculopathy or proximal tibial lesion in context.' : ' Within the expected range.'}
                </p>
              )}
            </Result>
          ) : (
            <Result>Enter age and leg length to estimate the expected soleus H-reflex latency.</Result>
          )}
          <Explain>
            <p className="mb-1 font-medium text-ink">How it's calculated</p>
            <p>Predicted H latency (ms) = 9.14 + 0.46 × leg length (cm) + 0.10 × age (years), measured to the soleus. Leg length is taken from the popliteal fossa to the medial malleolus (Braddom &amp; Johnson, 1974). The absolute value is a guide only — a side-to-side comparison is more reliable.</p>
          </Explain>
        </div>
      </Card>

      <Card>
        <CardHeader title="Side-to-side (interside) differences" sub="The most robust way to flag a unilateral late-response abnormality" />
        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">H-reflex (tibial)</p>
            <div className="flex flex-wrap items-end gap-3">
              <NumField label="Right H latency" unit="ms" value={hR} onChange={setHR} />
              <NumField label="Left H latency" unit="ms" value={hL} onChange={setHL} />
              {hDiff !== null && (
                <Result tone={hDiff > 1.5 ? 'warn' : 'good'}>
                  Interside difference = <span className="font-semibold">{hDiff.toFixed(1)} ms</span>
                  {hDiff > 1.5 ? ' — abnormal (commonly > 1.5–1.8 ms).' : ' — within normal limits.'}
                </Result>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">F-wave (minimum latency, same nerve both sides)</p>
            <div className="flex flex-wrap items-end gap-3">
              <NumField label="Right F latency" unit="ms" value={fR} onChange={setFR} />
              <NumField label="Left F latency" unit="ms" value={fL} onChange={setFL} />
              {fDiff !== null && (
                <Result tone={fDiff > 2 ? 'warn' : 'good'}>
                  Interside difference = <span className="font-semibold">{fDiff.toFixed(1)} ms</span>
                  {fDiff > 2 ? ' — abnormal (commonly > 2 ms; nerve- and lab-dependent).' : ' — within normal limits.'}
                </Result>
              )}
            </div>
          </div>
          <Explain>
            Interside differences bypass the need for height/age normatives. Typical abnormal thresholds are &gt; 1.5–1.8 ms for the tibial H-reflex and &gt; 2 ms for F-wave minimum latency, but exact limits vary by nerve, distance, and laboratory.
          </Explain>
        </div>
      </Card>

      <Card>
        <CardHeader title="F-wave chronodispersion" sub="Scatter between the earliest and latest F waves in a train" />
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <NumField label="F max latency" unit="ms" value={fMax} onChange={setFMax} />
            <NumField label="F min latency" unit="ms" value={fMin} onChange={setFMin} />
            {chrono !== null && (
              <Result tone="neutral">
                Chronodispersion (F<sub>max</sub> − F<sub>min</sub>) = <span className="font-semibold">{chrono.toFixed(1)} ms</span>
              </Result>
            )}
          </div>
          <Explain>
            Chronodispersion is the spread between the latest and earliest F-wave latencies over a run (typically 10–20 stimuli). Increased scatter can accompany demyelination, but there is no single universal cutoff — interpret against your lab's reference and the rest of the study.
          </Explain>
        </div>
      </Card>
    </div>
  )
}

// ---- 3) Sural / Radial amplitude ratio ------------------------------------

function SuralRadialRatio() {
  const [sural, setSural] = useState('')
  const [radial, setRadial] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'' | 'M' | 'F'>('')

  const s = num(sural), r = num(radial), a = num(age)
  const srar = s !== null && r !== null && r > 0 ? s / r : null
  const expected = a !== null && sex !== '' ? 0.519 - 0.006 * a + 0.046 * (sex === 'M' ? 1 : 0) : null

  let tone: 'good' | 'bad' = 'good'
  let verdict = ''
  if (srar !== null) {
    if (srar < 0.4) { tone = 'bad'; verdict = 'Below 0.40 — supports a length-dependent axonal sensory polyneuropathy (≈90% sensitivity/specificity for mild cases where the absolute sural amplitude is borderline).' }
    else { tone = 'good'; verdict = 'At or above 0.40 — within the range that argues against a length-dependent axonal polyneuropathy.' }
  }

  return (
    <Card>
      <CardHeader title="Sural / Radial amplitude ratio (SRAR)" sub="Sensitises borderline sural amplitudes for early axonal polyneuropathy" />
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-3">
          <NumField label="Sural SNAP amplitude" unit="µV" value={sural} onChange={setSural} placeholder="e.g. 6" />
          <NumField label="Superficial radial SNAP amplitude" unit="µV" value={radial} onChange={setRadial} placeholder="e.g. 20" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumField label="Age (optional, for expected value)" unit="years" value={age} onChange={setAge} />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Sex (optional)</label>
            <select value={sex} onChange={(e) => setSex(e.target.value as '' | 'M' | 'F')}
              className="w-40 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="">—</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
        </div>

        {srar !== null ? (
          <Result tone={tone}>
            <p className="font-semibold">SRAR = {srar.toFixed(2)}</p>
            <p className="mt-0.5">{verdict}</p>
            {expected !== null && (
              <p className="mt-1 text-xs">Age/sex-adjusted expected ratio ≈ {expected.toFixed(2)} (Expected = 0.519 − 0.006·age + 0.046·[male]).</p>
            )}
          </Result>
        ) : (
          <Result>Enter the sural and superficial radial sensory amplitudes.</Result>
        )}

        <Explain>
          <p className="mb-1 font-medium text-ink">How it's calculated</p>
          <p>SRAR = sural SNAP amplitude (µV) ÷ superficial radial SNAP amplitude (µV). The mean value in healthy adults is ≈ 0.71. Because both nerves are affected similarly by age, temperature, and technique, the ratio is more sensitive than the absolute sural amplitude for detecting an early, length-dependent axonal polyneuropathy — a value &lt; 0.40 is the usual abnormal threshold (Rutkove et al., 1997).</p>
        </Explain>
      </div>
    </Card>
  )
}

// ---- 4) CIDP EAN/PNS 2021 motor checklist ---------------------------------

interface Criterion { key: string; label: string; help: string; excludeTibial?: boolean }

const CIDP_CRITERIA: Criterion[] = [
  { key: 'dml', label: 'A · Distal motor latency prolonged', help: '≥ 50% above the upper limit of normal (≥ 1.5× ULN)' },
  { key: 'cv', label: 'B · Motor conduction velocity reduced', help: '≥ 30% below the lower limit of normal (≤ 0.7× LLN)' },
  { key: 'fwave', label: 'C · F-wave latency prolonged', help: '≥ 20% above ULN (≥ 50% if distal CMAP amplitude < 80% LLN)' },
  { key: 'fabsent', label: 'D · Absent F-waves', help: 'with distal CMAP amplitude ≥ 20% LLN' },
  { key: 'block', label: 'E · Partial motor conduction block', help: '≥ 30% proximal-vs-distal CMAP area/amplitude drop — excludes the tibial nerve', excludeTibial: true },
  { key: 'disp', label: 'F · Abnormal temporal dispersion', help: '> 30% increase in proximal-vs-distal CMAP duration' },
  { key: 'dur', label: 'G · Prolonged distal CMAP duration', help: 'LFF 5 Hz: median > 8.0 ms · ulnar > 8.6 ms · peroneal > 8.5 ms · tibial > 8.3 ms' },
]

const CIDP_NERVES = ['Median', 'Ulnar', 'Peroneal', 'Tibial'] as const

function CidpChecklist() {
  // checked[nerve][criterionKey]
  const [checked, setChecked] = useState<Record<string, Record<string, boolean>>>({})

  function toggle(nerve: string, key: string) {
    setChecked((prev) => ({
      ...prev,
      [nerve]: { ...(prev[nerve] ?? {}), [key]: !(prev[nerve]?.[key]) },
    }))
  }

  const nervesMeeting = useMemo(
    () => CIDP_NERVES.filter((n) => CIDP_CRITERIA.some((c) => checked[n]?.[c.key])).length,
    [checked],
  )

  let tone: 'neutral' | 'warn' | 'bad' = 'neutral'
  let title = 'No motor demyelinating criteria selected yet'
  let detail = 'Tick the criteria that are met for each nerve based on your own reading against your lab’s limits.'
  if (nervesMeeting >= 2) {
    tone = 'bad'; title = 'Motor criteria met in ≥ 2 nerves'
    detail = 'Consistent with the EAN/PNS 2021 motor conduction criteria for CIDP. A full diagnosis still requires the supporting sensory criteria (typically ≥ 2 abnormal sensory nerves) and a compatible clinical picture.'
  } else if (nervesMeeting === 1) {
    tone = 'warn'; title = 'Motor criteria met in 1 nerve'
    detail = 'Meets the electrophysiological threshold for “possible CIDP.” Correlate with sensory studies and clinical features.'
  }

  return (
    <Card>
      <CardHeader title="CIDP electrodiagnostic checklist" sub="EAN/PNS 2021 motor conduction criteria — median, ulnar, peroneal, tibial" />
      <div className="space-y-4 px-5 py-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">Criterion</th>
                {CIDP_NERVES.map((n) => (
                  <th key={n} className="p-2 text-center text-xs font-semibold uppercase tracking-wider text-muted">{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CIDP_CRITERIA.map((c) => (
                <tr key={c.key} className="border-t border-line align-top">
                  <td className="p-2">
                    <p className="font-medium text-ink">{c.label}</p>
                    <p className="text-xs text-muted">{c.help}</p>
                  </td>
                  {CIDP_NERVES.map((n) => {
                    const na = c.excludeTibial && n === 'Tibial'
                    return (
                      <td key={n} className="p-2 text-center">
                        {na ? (
                          <span className="text-xs text-muted">n/a</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={!!checked[n]?.[c.key]}
                            onChange={() => toggle(n, c.key)}
                            className="h-4 w-4 accent-[#0E7C86]"
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Result tone={tone}>
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5">{detail}</p>
          <p className="mt-1 text-xs">{nervesMeeting} of 4 nerves currently meet ≥ 1 motor criterion.</p>
        </Result>

        <Explain>
          <p className="mb-1 font-medium text-ink">How this checklist works</p>
          <p>A nerve counts toward the criteria when at least one motor demyelinating parameter (A–G) is met for it. Under the EAN/PNS 2021 guideline, motor criteria met in <span className="font-medium text-ink">≥ 2 nerves</span> supports CIDP, and <span className="font-medium text-ink">1 nerve</span> supports “possible CIDP,” alongside the sensory criteria and clinical assessment that the full guideline also requires.</p>
          <p className="mt-2 text-xs">Distal CMAP duration cutoffs shown are at a 5 Hz low-frequency filter and differ with filter settings; conduction block excludes the tibial nerve because of physiological proximal drop. Confirm every threshold against your own laboratory and the published guideline before applying it clinically.</p>
        </Explain>
      </div>
    </Card>
  )
}
