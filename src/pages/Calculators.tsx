import { useMemo, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'

// ---------------------------------------------------------------------------
// EMG / NCS calculators — educational reference tools for the fellowship.
// Formulas and cutoffs are drawn from the cited literature and the reference
// implementations at eletrodiagnostico.com.br. Normative limits vary by lab,
// technique, and filter settings — always validate against your own values.
// ---------------------------------------------------------------------------

type TabKey = 'tli' | 'fh' | 'srar' | 'cidp' | 'temp' | 'filter'

interface ToolMeta { key: TabKey; label: string; blurb: string; category: 'calc' | 'teach'; icon: string }

const TOOLS: ToolMeta[] = [
  { key: 'tli', label: 'Terminal Latency Index', category: 'calc', icon: 'TLI',
    blurb: 'Distal vs. proximal motor conduction (TLI), with the normal / distal-slowing / anti-MAG cutoffs.' },
  { key: 'fh', label: 'F-wave & H-reflex', category: 'calc', icon: 'F/H',
    blurb: 'Predicted soleus H-reflex latency, interside F and H differences, and F-wave chronodispersion.' },
  { key: 'srar', label: 'Sural / Radial ratio', category: 'calc', icon: 'SR',
    blurb: 'The SRAR — sensitises a borderline sural amplitude for early length-dependent axonal polyneuropathy.' },
  { key: 'cidp', label: 'Demyelination & CIDP', category: 'calc', icon: 'DM',
    blurb: 'Compute each demyelinating parameter against your lab’s limits, plus the EAN/PNS 2021 motor checklist.' },
  { key: 'temp', label: 'Temperature & waveform', category: 'teach', icon: '°C',
    blurb: 'See how cooling slows conduction and prolongs latency — with a temperature-correction calculator.' },
  { key: 'filter', label: 'Filter settings', category: 'teach', icon: 'Hz',
    blurb: 'See how the low- and high-frequency filters reshape the waveform (duration, amplitude, onset latency).' },
]

const CATEGORIES: { key: 'calc' | 'teach'; title: string; sub: string }[] = [
  { key: 'calc', title: 'Diagnostic calculators', sub: 'Enter values and get the computed index with its interpretation' },
  { key: 'teach', title: 'Teaching tools', sub: 'Interactive visuals that show how the waveform behaves' },
]

export default function Calculators() {
  const [active, setActive] = useState<TabKey | null>(null)
  const current = TOOLS.find((t) => t.key === active) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">EMG / NCS calculators &amp; teaching tools</h1>
        <p className="mt-1 text-sm text-muted">
          {current ? 'Formula and interpretation are shown with each result' : 'Pick a tool — each shows its formula and interpretation'}
        </p>
      </div>

      <div className="rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-ink">
        <span className="font-semibold">Educational use only.</span> These tools support teaching and interpretation —
        they are not medical advice and do not diagnose any individual. Cutoffs are technique- and lab-dependent;
        always validate results against your own laboratory's normative values and the full clinical picture.
      </div>

      {current === null ? (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <div className="mb-2">
                <h2 className="font-display text-base font-semibold text-ink">{cat.title}</h2>
                <p className="text-sm text-muted">{cat.sub}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TOOLS.filter((t) => t.category === cat.key).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActive(t.key)}
                    className="group flex gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft/30"
                  >
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent">
                      {t.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="font-display text-sm font-semibold text-ink">{t.label}</span>
                      <span className="mt-0.5 block text-sm text-muted">{t.blurb}</span>
                      <span className="mt-1 inline-block text-xs font-medium text-accent">Open →</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActive(null)}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
            >
              ← All tools
            </button>
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActive(t.key)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    t.key === active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{current.label}</h2>
            <p className="text-sm text-muted">{current.blurb}</p>
          </div>

          {active === 'tli' && <TerminalLatencyIndex />}
          {active === 'fh' && <FWaveHReflex />}
          {active === 'srar' && <SuralRadialRatio />}
          {active === 'cidp' && <><DemyelinationParams /><CidpChecklist /></>}
          {active === 'temp' && <TemperatureTool />}
          {active === 'filter' && <FilterTool />}
        </div>
      )}
    </div>
  )
}

// ---- 6) EMG filter settings effect on the waveform ------------------------

const LFF_VALS = [1, 2, 3, 5, 10, 20, 30, 50, 100]
const HFF_VALS = [500, 1000, 2000, 3000, 5000, 8000, 10000]
const hzLabel = (v: number) => (v >= 1000 ? `${v / 1000} kHz` : `${v} Hz`)

function FilterTool() {
  const [lffIdx, setLffIdx] = useState(4) // 10 Hz
  const [hffIdx, setHffIdx] = useState(6) // 10 kHz
  const lff = LFF_VALS[lffIdx], hff = HFF_VALS[hffIdx]

  const durF = Math.min(1.8, Math.max(0.6, 1 + 0.18 * Math.log2(10 / lff)))
  const ampF = Math.min(1.1, Math.max(0.3, 1 - 0.13 * Math.log2(10000 / hff)))
  // Lowering the HFF also delays the onset latency (the rise is a high-frequency
  // event); the LFF does not change onset latency.
  const latShift = Math.max(0, 0.3 * Math.log2(10000 / hff))

  const W = 460, H = 150, TOTAL = 15
  const refPath = waveformPath(W, H, 3.5, 4, 1, TOTAL)
  const curPath = waveformPath(W, H, 3.5 + latShift, 4 * durF, ampF, TOTAL)

  function preset(kind: 'motor' | 'sensory') {
    if (kind === 'motor') { setLffIdx(LFF_VALS.indexOf(10)); setHffIdx(HFF_VALS.indexOf(10000)) }
    else { setLffIdx(LFF_VALS.indexOf(20)); setHffIdx(HFF_VALS.indexOf(2000)) }
  }

  return (
    <Card>
      <CardHeader
        title="How filter settings change the waveform"
        sub="Adjust the low- and high-frequency filters and watch duration and amplitude change"
      />
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => preset('motor')} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft">Motor preset (10 Hz – 10 kHz)</button>
          <button onClick={() => preset('sensory')} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft">Sensory preset (20 Hz – 2 kHz)</button>
        </div>

        <div className="rounded-md border border-line bg-paper p-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Waveform changing with filter settings">
            <line x1="0" y1={H * 0.72} x2={W} y2={H * 0.72} stroke="#E2E6EC" strokeWidth="1" />
            {[0, 3, 6, 9, 12, 15].map((ms) => (
              <text key={ms} x={(ms / TOTAL) * W} y={H - 2} fontSize="9" fill="#5B6677" textAnchor="middle">{ms}</text>
            ))}
            <path d={refPath} fill="none" stroke="#B7C0CC" strokeWidth="1.5" strokeDasharray="4 3" />
            <path d={curPath} fill="none" stroke="#0E7C86" strokeWidth="2.5" />
          </svg>
          <div className="mt-1 flex items-center justify-between text-xs text-muted">
            <span>standard settings (dashed)</span><span>time (ms) →</span><span>current (solid)</span>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-ink">Low-frequency filter (high-pass)</span>
            <span className="font-semibold text-accent">{hzLabel(lff)}</span>
          </div>
          <input type="range" min={0} max={LFF_VALS.length - 1} step={1} value={lffIdx}
            onChange={(e) => setLffIdx(parseInt(e.target.value, 10))} className="w-full accent-[#0E7C86]" />
          <div className="flex justify-between text-[11px] text-muted"><span>1 Hz</span><span>lower LFF → longer duration</span><span>100 Hz</span></div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-ink">High-frequency filter (low-pass)</span>
            <span className="font-semibold text-accent">{hzLabel(hff)}</span>
          </div>
          <input type="range" min={0} max={HFF_VALS.length - 1} step={1} value={hffIdx}
            onChange={(e) => setHffIdx(parseInt(e.target.value, 10))} className="w-full accent-[#0E7C86]" />
          <div className="flex justify-between text-[11px] text-muted"><span>500 Hz</span><span>lower HFF → smaller amplitude</span><span>10 kHz</span></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Result tone={Math.abs(durF - 1) > 0.02 ? 'warn' : 'good'}>
            <p className="text-xs text-muted">Duration vs standard</p>
            <p className="font-semibold">×{durF.toFixed(2)}</p>
            <p className="text-xs">{durF > 1.02 ? 'longer — LFF lowered' : durF < 0.98 ? 'shorter — LFF raised' : 'standard'}</p>
          </Result>
          <Result tone={ampF < 0.98 ? 'warn' : 'good'}>
            <p className="text-xs text-muted">Amplitude vs standard</p>
            <p className="font-semibold">×{ampF.toFixed(2)}</p>
            <p className="text-xs">{ampF < 0.98 ? 'smaller — HFF lowered' : 'standard / max'}</p>
          </Result>
          <Result tone={latShift > 0.02 ? 'warn' : 'good'}>
            <p className="text-xs text-muted">Onset latency vs standard</p>
            <p className="font-semibold">{latShift > 0.005 ? '+' : ''}{latShift.toFixed(2)} ms</p>
            <p className="text-xs">{latShift > 0.02 ? 'later — HFF lowered' : 'unchanged'}</p>
          </Result>
        </div>

        <Explain>
          <p>Every recorded potential passes through a low-frequency (high-pass) and high-frequency (low-pass) filter. <strong>Lowering the LFF</strong> lets more low-frequency signal through and <strong>lengthens the duration</strong> (duration is mainly a low-frequency response) — but it does <strong>not</strong> change the onset latency. <strong>Lowering the HFF</strong> excludes more high-frequency signal and <strong>reduces the amplitude</strong> (amplitude is mainly a high-frequency response) and also <strong>delays the onset latency</strong> (the rising phase is a high-frequency event), in a similar manner to how it broadens the potential. Standard settings: motor 10 Hz–10 kHz; sensory 20 Hz–2 kHz — the HFF is set lower for sensory to cut high-frequency noise that more easily obscures SNAPs.</p>
          <p className="mt-2 text-xs">Filtering always alters the signal of interest, so use standardized settings and compare only to normal values obtained with the same filters. Very low LFF also lets the baseline wander. This is an illustrative teaching model, not a signal-processing simulation.</p>
        </Explain>
      </div>
    </Card>
  )
}

// ---- 5) Temperature effect on waveforms + correction ----------------------

const REF_TEMP = 34 // warm end of the physiologic range (21–34 °C)
// Illustrative baseline response used only for the teaching visual/readout.
const BASE_CV = 50 // m/s at the reference temperature
const BASE_DL = 3.5 // ms distal latency at the reference temperature

function waveformPath(width: number, height: number, onsetMs: number, durMs: number, amp: number, totalMs: number): string {
  const baseY = height * 0.72
  const xAt = (t: number) => (t / totalMs) * width
  const pts: string[] = []
  const N = 140
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * totalMs
    let y = baseY
    if (t >= onsetMs && t <= onsetMs + durMs) {
      const phase = (t - onsetMs) / durMs
      y = baseY - Math.sin(Math.PI * phase) * amp * height * 0.5
    }
    pts.push(`${xAt(t).toFixed(1)},${y.toFixed(1)}`)
  }
  return 'M' + pts.join(' L')
}

function TemperatureTool() {
  const [temp, setTemp] = useState(30)
  const cvCoeff = 2.0 // m/s per °C (midpoint of the 1.5–2.5 range)
  const latCoeff = 0.2 // ms per °C

  const dT = REF_TEMP - temp // degrees cooler than the warm reference
  const cvNow = BASE_CV - cvCoeff * dT
  const dlNow = BASE_DL + latCoeff * dT

  const W = 460, H = 150, TOTAL = 15
  // Reference (warm) waveform, faint
  const refPath = waveformPath(W, H, BASE_DL, 4, 1, TOTAL)
  // Current (cooled) waveform: later onset, broader and taller (amp/duration
  // change shown qualitatively to illustrate that cooling enlarges the response)
  const curPath = waveformPath(W, H, dlNow, 4 * (1 + 0.03 * dT), 1 + 0.03 * dT, TOTAL)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="How temperature changes the waveform"
          sub="Slide the limb temperature and watch the response shift and slow — a small drop moves things more than most expect"
        />
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-md border border-line bg-paper p-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Waveform changing with temperature">
              {/* baseline + latency axis */}
              <line x1="0" y1={H * 0.72} x2={W} y2={H * 0.72} stroke="#E2E6EC" strokeWidth="1" />
              {[0, 3, 6, 9, 12, 15].map((ms) => (
                <g key={ms}>
                  <line x1={(ms / TOTAL) * W} y1={H * 0.72} x2={(ms / TOTAL) * W} y2={H * 0.72 + 4} stroke="#5B6677" strokeWidth="1" />
                  <text x={(ms / TOTAL) * W} y={H - 2} fontSize="9" fill="#5B6677" textAnchor="middle">{ms}</text>
                </g>
              ))}
              <path d={refPath} fill="none" stroke="#B7C0CC" strokeWidth="1.5" strokeDasharray="4 3" />
              <path d={curPath} fill="none" stroke="#0E7C86" strokeWidth="2.5" />
            </svg>
            <div className="mt-1 flex items-center justify-between text-xs text-muted">
              <span><span className="inline-block h-0.5 w-4 align-middle" style={{ background: '#B7C0CC' }} /> warm reference ({REF_TEMP}°C)</span>
              <span>time (ms) →</span>
              <span><span className="inline-block h-0.5 w-4 align-middle" style={{ background: '#0E7C86' }} /> at {temp}°C</span>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-ink">Limb temperature</span>
              <span className="font-semibold text-accent">{temp}°C</span>
            </div>
            <input type="range" min={21} max={34} step={1} value={temp}
              onChange={(e) => setTemp(parseInt(e.target.value, 10))}
              className="w-full accent-[#0E7C86]" />
            <div className="flex justify-between text-[11px] text-muted"><span>21°C (cool)</span><span>34°C (warm)</span></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Result tone={dT === 0 ? 'good' : 'warn'}>
              <p className="text-xs text-muted">Cooler than reference</p>
              <p className="font-semibold">{dT} °C</p>
            </Result>
            <Result tone={dT === 0 ? 'good' : 'warn'}>
              <p className="text-xs text-muted">Conduction velocity</p>
              <p className="font-semibold">{cvNow.toFixed(1)} m/s</p>
              <p className="text-xs">{dT === 0 ? 'baseline' : `−${(cvCoeff * dT).toFixed(1)} m/s`}</p>
            </Result>
            <Result tone={dT === 0 ? 'good' : 'warn'}>
              <p className="text-xs text-muted">Distal latency</p>
              <p className="font-semibold">{dlNow.toFixed(1)} ms</p>
              <p className="text-xs">{dT === 0 ? 'baseline' : `+${(latCoeff * dT).toFixed(1)} ms`}</p>
            </Result>
          </div>

          <Explain>
            <p>Cooler temperatures delay inactivation of sodium channels and prolong depolarization. In myelinated fibres, conduction velocity is set by the nodal depolarization delay, so cooling slows conduction — roughly linearly across the physiologic limb range (~21–34°C). Motor and sensory conduction velocities slow about <strong>1.5–2.5 m/s per 1°C</strong> drop (≈2 shown here), and distal latency lengthens about <strong>0.2 ms per 1°C</strong>. Cooling also tends to increase amplitude and broaden the response (shown qualitatively above).</p>
            <p className="mt-2 text-xs">The conduction velocity and distal latency numbers use an illustrative warm baseline of {BASE_CV} m/s and {BASE_DL} ms at {REF_TEMP}°C; the point is the size of the change per degree, not the absolute values.</p>
          </Explain>
        </div>
      </Card>

      <TemperatureCorrection cvCoeff={cvCoeff} latCoeff={latCoeff} />
    </div>
  )
}

function TemperatureCorrection({ cvCoeff, latCoeff }: { cvCoeff: number; latCoeff: number }) {
  const [measTemp, setMeasTemp] = useState('')
  const [targetTemp, setTargetTemp] = useState('33')
  const [cv, setCv] = useState('')
  const [dl, setDl] = useState('')
  const [kCv, setKCv] = useState(String(cvCoeff))
  const [kDl, setKDl] = useState(String(latCoeff))

  const tm = num(measTemp), tt = num(targetTemp)
  const cvV = num(cv), dlV = num(dl), kc = num(kCv), kd = num(kDl)
  const deg = tm !== null && tt !== null ? tt - tm : null // degrees to warm to target

  const cvCorr = cvV !== null && deg !== null && kc !== null ? cvV + kc * deg : null
  const dlCorr = dlV !== null && deg !== null && kd !== null ? dlV - kd * deg : null

  return (
    <Card>
      <CardHeader
        title="Temperature correction"
        sub="Estimate what a value would be at a target (warm) temperature when the limb was measured cooler"
      />
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-3">
          <NumField label="Measured limb temp" unit="°C" value={measTemp} onChange={setMeasTemp} placeholder="e.g. 28" />
          <NumField label="Target temp" unit="°C" value={targetTemp} onChange={setTargetTemp} placeholder="e.g. 33" />
        </div>
        {deg !== null && (
          <Result tone="neutral">
            {deg === 0 ? 'Measured at the target temperature — no correction needed.'
              : deg > 0 ? `The limb was ${deg}°C below target — values are corrected as if warmed to ${tt}°C.`
              : `The limb was ${Math.abs(deg)}°C above target — values are corrected as if cooled to ${tt}°C.`}
          </Result>
        )}

        <div className="flex flex-wrap gap-3">
          <NumField label="Measured conduction velocity" unit="m/s" value={cv} onChange={setCv} placeholder="e.g. 42" />
          <NumField label="Measured distal latency" unit="ms" value={dl} onChange={setDl} placeholder="e.g. 4.8" />
        </div>
        <div className="flex flex-wrap gap-3">
          <NumField label="CV correction" unit="m/s per °C" value={kCv} onChange={setKCv} />
          <NumField label="Latency correction" unit="ms per °C" value={kDl} onChange={setKDl} />
        </div>

        {(cvCorr !== null || dlCorr !== null) ? (
          <Result tone="good">
            {cvCorr !== null && (
              <p>Corrected conduction velocity ≈ <span className="font-semibold">{cvCorr.toFixed(1)} m/s</span>
                {deg !== null && <span className="text-xs text-muted"> ({cvV!.toFixed(1)} {deg >= 0 ? '+' : '−'} {kc!.toFixed(1)}×{Math.abs(deg)})</span>}
              </p>
            )}
            {dlCorr !== null && (
              <p className={cvCorr !== null ? 'mt-1' : ''}>Corrected distal latency ≈ <span className="font-semibold">{dlCorr.toFixed(2)} ms</span>
                {deg !== null && <span className="text-xs text-muted"> ({dlV!.toFixed(2)} {deg >= 0 ? '−' : '+'} {kd!.toFixed(1)}×{Math.abs(deg)})</span>}
              </p>
            )}
          </Result>
        ) : (
          <Result>Enter the measured temperature, target temperature, and a measured CV and/or distal latency.</Result>
        )}

        <Explain>
          <p className="mb-1 font-medium text-ink">How it's calculated</p>
          <p>Corrected CV = measured + (CV coefficient × degrees to warm to target). Corrected distal latency = measured − (latency coefficient × degrees to warm to target). Warming a cool limb speeds conduction and shortens latency, so a limb measured below target has its CV raised and its latency reduced. Defaults are 2.0 m/s/°C and 0.2 ms/°C — adjust the coefficients to your lab's convention (the literature gives 1.5–2.5 m/s/°C).</p>
          <p className="mt-2 text-xs">Correction is an approximation valid within the roughly linear physiologic range (~21–34°C); the better practice is to warm the limb to ≥ 32–33°C and re-measure. Educational tool — not a diagnosis.</p>
        </Explain>
      </div>
    </Card>
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

// ---- 4a) Demyelination parameter calculator (per nerve) -------------------

// Distal CMAP duration cutoffs for demyelination (EFNS/PNS, LFF 2 Hz):
// onset of first negative peak to return to baseline.
const DUR_CUTOFF: Record<string, number> = { Median: 6.6, Ulnar: 6.7, Peroneal: 7.6, Tibial: 8.8 }
const DEMYE_NERVES = ['Median', 'Ulnar', 'Peroneal', 'Tibial'] as const

function DemyelinationParams() {
  const [nerve, setNerve] = useState<string>('Median')
  const [dml, setDml] = useState(''); const [dmlUln, setDmlUln] = useState('')
  const [amp, setAmp] = useState(''); const [ampLln, setAmpLln] = useState('')
  const [cv, setCv] = useState(''); const [cvLln, setCvLln] = useState('')
  const [distDur, setDistDur] = useState(''); const [proxDur, setProxDur] = useState('')

  const durCutoff = DUR_CUTOFF[nerve]
  const dmlV = num(dml), dmlU = num(dmlUln)
  const ampV = num(amp), ampL = num(ampLln)
  const cvV = num(cv), cvL = num(cvLln)
  const dd = num(distDur), pd = num(proxDur)

  // A) Distal motor latency: demyelinating if ≥ 50% above ULN (≥ 1.5× ULN)
  const dmlPct = dmlV !== null && dmlU !== null && dmlU > 0 ? (dmlV / dmlU - 1) * 100 : null
  const dmlFlag = dmlPct !== null ? dmlPct >= 50 : null
  // B) Conduction velocity: demyelinating if ≥ 30% below LLN (≤ 0.7× LLN)
  const cvPct = cvV !== null && cvL !== null && cvL > 0 ? (1 - cvV / cvL) * 100 : null
  const cvFlag = cvPct !== null ? cvPct >= 30 : null
  // Distal CMAP duration: demyelinating if ≥ nerve cutoff
  const durFlag = dd !== null ? dd >= durCutoff : null
  // Temporal dispersion: (prox − dist)/dist × 100, demyelinating if > 30%
  const td = pd !== null && dd !== null && dd > 0 ? ((pd - dd) / dd) * 100 : null
  const tdFlag = td !== null ? td > 30 : null
  // Amplitude context (not itself a demyelinating flag)
  const ampPct = ampV !== null && ampL !== null && ampL > 0 ? (ampV / ampL) * 100 : null

  const present = [dmlFlag, cvFlag, durFlag, tdFlag].filter((f) => f === true).length

  return (
    <Card>
      <CardHeader
        title="Demyelination parameters (single nerve)"
        sub="Enter the measured values and your lab's normal limits — each demyelinating criterion is computed and flagged"
      />
      <div className="space-y-4 px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Nerve</label>
          <select value={nerve} onChange={(e) => setNerve(e.target.value)}
            className="w-48 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
            {DEMYE_NERVES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* A · Distal motor latency */}
        <div className="rounded-md border border-line p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">A · Distal motor latency</p>
          <div className="flex flex-wrap gap-3">
            <NumField label="Measured DML" unit="ms" value={dml} onChange={setDml} placeholder="e.g. 6.5" />
            <NumField label="Your lab's ULN" unit="ms" value={dmlUln} onChange={setDmlUln} placeholder="e.g. 4.2" />
          </div>
          {dmlFlag !== null && (
            <div className="mt-2"><Result tone={dmlFlag ? 'bad' : 'good'}>
              {dmlPct! >= 0 ? '+' : ''}{dmlPct!.toFixed(0)}% vs. ULN — {dmlFlag ? 'demyelinating (≥ 50% above ULN).' : 'below the ≥ 50% demyelinating threshold.'}
            </Result></div>
          )}
        </div>

        {/* B · Conduction velocity */}
        <div className="rounded-md border border-line p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">B · Motor conduction velocity</p>
          <div className="flex flex-wrap gap-3">
            <NumField label="Measured CV" unit="m/s" value={cv} onChange={setCv} placeholder="e.g. 32" />
            <NumField label="Your lab's LLN" unit="m/s" value={cvLln} onChange={setCvLln} placeholder="e.g. 49" />
          </div>
          {cvFlag !== null && (
            <div className="mt-2"><Result tone={cvFlag ? 'bad' : 'good'}>
              {cvPct!.toFixed(0)}% below LLN — {cvFlag ? 'demyelinating (≥ 30% below LLN).' : 'below the ≥ 30% demyelinating threshold.'}
            </Result></div>
          )}
        </div>

        {/* Distal CMAP duration + temporal dispersion (share the distal duration) */}
        <div className="rounded-md border border-line p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Distal CMAP duration &amp; temporal dispersion</p>
          <div className="flex flex-wrap gap-3">
            <NumField label="Distal CMAP duration" unit="ms" value={distDur} onChange={setDistDur} placeholder="e.g. 7.0" />
            <NumField label="Proximal CMAP duration" unit="ms" value={proxDur} onChange={setProxDur} placeholder="e.g. 10.0" />
          </div>
          {durFlag !== null && (
            <div className="mt-2"><Result tone={durFlag ? 'bad' : 'good'}>
              Distal duration {dd!.toFixed(1)} ms vs. {nerve.toLowerCase()} cutoff {durCutoff} ms — {durFlag ? 'prolonged (demyelinating).' : 'within normal limits.'}
            </Result></div>
          )}
          {td !== null && (
            <div className="mt-2"><Result tone={tdFlag ? 'bad' : 'good'}>
              Temporal dispersion = {td.toFixed(0)}% — {tdFlag ? 'abnormal (> 30% duration increase, demyelinating).' : 'within normal limits (≤ 30%).'}
            </Result></div>
          )}
        </div>

        {/* Amplitude context */}
        <div className="rounded-md border border-line p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Distal CMAP amplitude (context)</p>
          <div className="flex flex-wrap gap-3">
            <NumField label="Measured amplitude" unit="mV" value={amp} onChange={setAmp} placeholder="e.g. 3.0" />
            <NumField label="Your lab's LLN" unit="mV" value={ampLln} onChange={setAmpLln} placeholder="e.g. 4.0" />
          </div>
          {ampPct !== null && (
            <div className="mt-2"><Result tone="neutral">
              Amplitude is {ampPct.toFixed(0)}% of LLN{ampPct < 80 ? ` (< 80% LLN — the F-wave criterion then uses a ≥ 50% prolongation threshold${ampPct < 20 ? '; below 20% LLN, absent F-waves no longer count' : ''})` : ''}.
            </Result></div>
          )}
          <p className="mt-1 text-xs text-muted">Amplitude isn't itself a demyelinating feature, but its value relative to the LLN determines the F-wave and conduction-block criteria.</p>
        </div>

        <Result tone={present >= 1 ? 'warn' : 'neutral'}>
          <span className="font-semibold">{present} demyelinating feature{present === 1 ? '' : 's'} met for the {nerve.toLowerCase()} nerve</span>
          {present >= 1 ? ' — record this nerve in the checklist below and repeat for the other nerves.' : ' from the values entered so far.'}
        </Result>

        <Explain>
          <p className="mb-1 font-medium text-ink">Formulas &amp; cutoffs</p>
          <p>Distal motor latency: (measured ÷ ULN − 1) × 100 — demyelinating at ≥ 50% above ULN. Conduction velocity: (1 − measured ÷ LLN) × 100 — demyelinating at ≥ 30% below LLN. Distal CMAP duration prolonged when ≥ the nerve cutoff (median 6.6 · ulnar 6.7 · peroneal 7.6 · tibial 8.8 ms, LFF 2 Hz). Temporal dispersion = (proximal − distal) ÷ distal × 100 — abnormal &gt; 30% (some criteria treat the tibial nerve separately).</p>
          <p className="mt-2 text-xs">Enter your own laboratory's ULN/LLN values — normative limits are technique-, temperature-, age-, and height-dependent. This tool supports interpretation and is not a diagnosis.</p>
        </Explain>
      </div>
    </Card>
  )
}

// ---- 4b) CIDP EAN/PNS 2021 motor checklist --------------------------------

interface Criterion { key: string; label: string; help: string; excludeTibial?: boolean }

const CIDP_CRITERIA: Criterion[] = [
  { key: 'dml', label: 'A · Distal motor latency prolonged', help: '≥ 50% above the upper limit of normal (≥ 1.5× ULN)' },
  { key: 'cv', label: 'B · Motor conduction velocity reduced', help: '≥ 30% below the lower limit of normal (≤ 0.7× LLN)' },
  { key: 'fwave', label: 'C · F-wave latency prolonged', help: '≥ 20% above ULN (≥ 50% if distal CMAP amplitude < 80% LLN)' },
  { key: 'fabsent', label: 'D · Absent F-waves', help: 'with distal CMAP amplitude ≥ 20% LLN' },
  { key: 'block', label: 'E · Partial motor conduction block', help: '≥ 30% proximal-vs-distal CMAP area/amplitude drop — excludes the tibial nerve', excludeTibial: true },
  { key: 'disp', label: 'F · Abnormal temporal dispersion', help: '> 30% increase in proximal-vs-distal CMAP duration' },
  { key: 'dur', label: 'G · Prolonged distal CMAP duration', help: 'median ≥ 6.6 ms · ulnar ≥ 6.7 ms · peroneal ≥ 7.6 ms · tibial ≥ 8.8 ms (LFF 2 Hz) — compute this above' },
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
