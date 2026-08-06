// ---------------------------------------------------------------------------
// Test-mode quiz generator.
// Builds randomized multiple-choice questions from the nerve conduction guide
// and the EMG muscle atlas data. Question aspects cover innervation (nerve,
// plexus cord/trunk, root levels), activation maneuvers, and — for nerve
// studies — recording, reference and stimulation sites.
// ---------------------------------------------------------------------------

import { EMG_MUSCLES, type EmgMuscle } from './emgAtlas'
import { NERVE_STUDIES, type NerveStudy } from './nerveGuide'

export type QuizSource = 'emg' | 'nerve'

export interface QuizQuestion {
  key: string // stable itemId::aspect key, used for mistake tracking
  source: QuizSource
  itemId: string
  itemName: string
  aspect: string
  aspectLabel: string
  prompt: string
  correct: string
  options: string[]
}

export interface QuizOptions {
  count: number
  sources: QuizSource[]
}

// ---- randomness helpers ---------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- aspect definitions ---------------------------------------------------

interface AspectDef<T> {
  aspect: string
  label: string
  get: (x: T) => string | undefined
  prompt: (x: T) => string
}

const EMG_ASPECTS: AspectDef<EmgMuscle>[] = [
  { aspect: 'nerve', label: 'Innervating nerve', get: (m) => m.nerve,
    prompt: (m) => `Which peripheral nerve innervates the ${m.name}?` },
  { aspect: 'roots', label: 'Root levels', get: (m) => m.roots,
    prompt: (m) => `What nerve-root levels supply the ${m.name}?` },
  { aspect: 'cord', label: 'Plexus cord', get: (m) => m.cord,
    prompt: (m) => `Through which brachial plexus cord does the ${m.name} receive its innervation?` },
  { aspect: 'trunk', label: 'Plexus trunk', get: (m) => m.trunk,
    prompt: (m) => `Which plexus trunk carries the innervation of the ${m.name}?` },
  { aspect: 'maneuver', label: 'Activation maneuver', get: (m) => m.maneuver,
    prompt: (m) => `Which activation maneuver is used when testing the ${m.name}?` },
]

const NERVE_ASPECTS: AspectDef<NerveStudy>[] = [
  { aspect: 'recording', label: 'Recording site', get: (s) => s.recording,
    prompt: (s) => `What is the recording site for the ${s.name}?` },
  { aspect: 'active', label: 'Active (G1) electrode', get: (s) => s.active,
    prompt: (s) => `For the ${s.name}, where is the active (G1) electrode placed?` },
  { aspect: 'reference', label: 'Reference (G2) electrode', get: (s) => s.reference,
    prompt: (s) => `For the ${s.name}, where is the reference (G2) electrode placed?` },
  { aspect: 'stim', label: 'Stimulation site', get: (s) => (s.stim && s.stim.length ? s.stim[0] : undefined),
    prompt: (s) => `Where is the (first) stimulation site for the ${s.name}?` },
  { aspect: 'roots', label: 'Root levels', get: (s) => s.roots,
    prompt: (s) => `What nerve-root levels does the ${s.name} assess?` },
]

// A single candidate: an item paired with one aspect that has a value.
interface Candidate {
  source: QuizSource
  itemId: string
  itemName: string
  aspect: string
  aspectLabel: string
  prompt: string
  correct: string
  poolKey: string // source::aspect — used to gather distractors
}

function buildCandidates(): Candidate[] {
  const out: Candidate[] = []
  for (const m of EMG_MUSCLES) {
    for (const a of EMG_ASPECTS) {
      const v = a.get(m)
      if (v && v.trim()) {
        out.push({ source: 'emg', itemId: m.id, itemName: m.name, aspect: a.aspect,
          aspectLabel: a.label, prompt: a.prompt(m), correct: v, poolKey: `emg::${a.aspect}` })
      }
    }
  }
  for (const s of NERVE_STUDIES) {
    for (const a of NERVE_ASPECTS) {
      const v = a.get(s)
      if (v && v.trim()) {
        out.push({ source: 'nerve', itemId: s.id, itemName: s.name, aspect: a.aspect,
          aspectLabel: a.label, prompt: a.prompt(s), correct: v, poolKey: `nerve::${a.aspect}` })
      }
    }
  }
  return out
}

// Distractor pools: unique values per source::aspect.
function buildPools(candidates: Candidate[]): Record<string, string[]> {
  const pools: Record<string, Set<string>> = {}
  for (const c of candidates) {
    ;(pools[c.poolKey] ??= new Set()).add(c.correct)
  }
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(pools)) out[k] = Array.from(pools[k])
  return out
}

const ALL_CANDIDATES = buildCandidates()
const POOLS = buildPools(ALL_CANDIDATES)

function toQuestion(c: Candidate): QuizQuestion | null {
  const pool = POOLS[c.poolKey] ?? []
  const distractorPool = pool.filter((v) => v !== c.correct)
  if (distractorPool.length < 3) return null // need at least 4 options
  const distractors = shuffle(distractorPool).slice(0, 3)
  const options = shuffle([c.correct, ...distractors])
  return {
    key: `${c.itemId}::${c.aspect}`,
    source: c.source,
    itemId: c.itemId,
    itemName: c.itemName,
    aspect: c.aspect,
    aspectLabel: c.aspectLabel,
    prompt: c.prompt,
    correct: c.correct,
    options,
  }
}

// Total number of answerable questions available (for the "All" option).
export function quizPoolSize(sources: QuizSource[]): number {
  return ALL_CANDIDATES.filter(
    (c) => sources.includes(c.source) && (POOLS[c.poolKey]?.filter((v) => v !== c.correct).length ?? 0) >= 3,
  ).length
}

// Generate up to `count` unique questions from the chosen sources.
export function generateQuiz({ count, sources }: QuizOptions): QuizQuestion[] {
  const usable = shuffle(ALL_CANDIDATES.filter((c) => sources.includes(c.source)))
  const out: QuizQuestion[] = []
  const usedKeys = new Set<string>()
  for (const c of usable) {
    if (out.length >= count) break
    if (usedKeys.has(`${c.itemId}::${c.aspect}`)) continue
    const q = toQuestion(c)
    if (q) {
      usedKeys.add(q.key)
      out.push(q)
    }
  }
  return out
}

// Rebuild questions for specific keys (used by "study my mistakes").
export function generateFromKeys(keys: string[]): QuizQuestion[] {
  const byKey = new Map<string, Candidate>()
  for (const c of ALL_CANDIDATES) byKey.set(`${c.itemId}::${c.aspect}`, c)
  const out: QuizQuestion[] = []
  for (const k of shuffle(keys)) {
    const c = byKey.get(k)
    if (!c) continue
    const q = toQuestion(c)
    if (q) out.push(q)
  }
  return out
}
