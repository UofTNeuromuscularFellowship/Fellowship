import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader } from '../components/ui/Card'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  generateQuiz,
  generateFromKeys,
  quizPoolSize,
  type QuizQuestion,
  type QuizSource,
} from '../data/quiz'

// ---------------------------------------------------------------------------
// Test mode — self-quiz drawn from the nerve conduction guide and EMG atlas.
// Pick sources and a question count; questions and options are randomized.
// Missed questions are remembered (per browser) so they can be reviewed later.
// ---------------------------------------------------------------------------

const MISTAKES_KEY = 'nmf-quiz-mistakes-v1'

interface Mistake {
  key: string
  source: QuizSource
  itemName: string
  aspectLabel: string
  prompt: string
  correct: string
  ts: number
}

// Local (per-browser) store used when the fellow is signed out, and as an
// offline fallback if the account sync ever fails. Degrades to in-memory if
// localStorage is unavailable.
let memoryStore: Mistake[] | null = null
function loadLocal(): Mistake[] {
  if (memoryStore) return memoryStore
  try {
    const raw = window.localStorage.getItem(MISTAKES_KEY)
    return raw ? (JSON.parse(raw) as Mistake[]) : []
  } catch {
    return memoryStore ?? []
  }
}
function saveLocal(list: Mistake[]) {
  memoryStore = list
  try {
    window.localStorage.setItem(MISTAKES_KEY, JSON.stringify(list))
  } catch {
    /* in-memory only */
  }
}

type Phase = 'setup' | 'active' | 'result'

export default function TestMode() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [useEmg, setUseEmg] = useState(true)
  const [useNerve, setUseNerve] = useState(true)
  const [count, setCount] = useState(10)

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [wrongKeys, setWrongKeys] = useState<QuizQuestion[]>([])
  const [correctCount, setCorrectCount] = useState(0)

  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const [mistakes, setMistakes] = useState<Mistake[]>([])
  const [synced, setSynced] = useState(false)

  // Load the review list: from the fellow's account when signed in (synced
  // across devices), otherwise from this browser's local store.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (userId) {
        const { data, error } = await supabase
          .from('quiz_review_items')
          .select('item_key, source, item_name, aspect_label, prompt, correct, created_at')
          .order('created_at', { ascending: true })
        if (cancelled) return
        if (!error && data) {
          setSynced(true)
          setMistakes(
            data.map((r: {
              item_key: string
              source: QuizSource
              item_name: string
              aspect_label: string
              prompt: string
              correct: string
              created_at: string | null
            }) => ({
              key: r.item_key,
              source: r.source,
              itemName: r.item_name,
              aspectLabel: r.aspect_label,
              prompt: r.prompt,
              correct: r.correct,
              ts: r.created_at ? Date.parse(r.created_at) : 0,
            })),
          )
        } else {
          // account fetch failed — fall back to the local copy
          setSynced(false)
          setMistakes(loadLocal())
        }
      } else {
        setSynced(false)
        setMistakes(loadLocal())
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const sources: QuizSource[] = useMemo(() => {
    const s: QuizSource[] = []
    if (useEmg) s.push('emg')
    if (useNerve) s.push('nerve')
    return s
  }, [useEmg, useNerve])

  const poolSize = useMemo(() => quizPoolSize(sources), [sources])

  function startQuiz(qs: QuizQuestion[]) {
    if (qs.length === 0) return
    setQuestions(qs)
    setIdx(0)
    setPicked(null)
    setWrongKeys([])
    setCorrectCount(0)
    setPhase('active')
  }

  function begin() {
    startQuiz(generateQuiz({ count: Math.min(count, poolSize), sources }))
  }

  function studyMistakes() {
    const qs = generateFromKeys(mistakes.map((m) => m.key))
    startQuiz(qs)
  }

  // Persist one change to the fellow's account (or local store when signed
  // out). `nextList` is the resulting review list, used for the local fallback.
  function persistAdd(q: QuizQuestion, nextList: Mistake[]) {
    if (userId) {
      supabase
        .from('quiz_review_items')
        .upsert(
          {
            user_id: userId,
            item_key: q.key,
            source: q.source,
            item_name: q.itemName,
            aspect_label: q.aspectLabel,
            prompt: q.prompt,
            correct: q.correct,
          },
          { onConflict: 'user_id,item_key' },
        )
        .then(({ error }: { error: unknown }) => {
          if (error) saveLocal(nextList)
        })
    } else {
      saveLocal(nextList)
    }
  }

  function persistRemove(key: string, nextList: Mistake[]) {
    if (userId) {
      supabase
        .from('quiz_review_items')
        .delete()
        .eq('user_id', userId)
        .eq('item_key', key)
        .then(({ error }: { error: unknown }) => {
          if (error) saveLocal(nextList)
        })
    } else {
      saveLocal(nextList)
    }
  }

  function recordResult(q: QuizQuestion, isCorrect: boolean) {
    setMistakes((prev) => {
      const exists = prev.some((m) => m.key === q.key)
      if (isCorrect && exists) {
        // mastered → drop from the review list
        const next = prev.filter((m) => m.key !== q.key)
        persistRemove(q.key, next)
        return next
      }
      if (!isCorrect && !exists) {
        const next = [
          ...prev,
          {
            key: q.key,
            source: q.source,
            itemName: q.itemName,
            aspectLabel: q.aspectLabel,
            prompt: q.prompt,
            correct: q.correct,
            ts: Date.now(),
          },
        ]
        persistAdd(q, next)
        return next
      }
      return prev
    })
  }

  function choose(option: string) {
    if (picked !== null) return
    setPicked(option)
    const q = questions[idx]
    const isCorrect = option === q.correct
    if (isCorrect) setCorrectCount((c) => c + 1)
    else setWrongKeys((w) => [...w, q])
    recordResult(q, isCorrect)
  }

  function next() {
    if (idx + 1 >= questions.length) {
      setPhase('result')
    } else {
      setIdx((i) => i + 1)
      setPicked(null)
    }
  }

  function clearMistakes() {
    setMistakes([])
    if (userId) {
      supabase
        .from('quiz_review_items')
        .delete()
        .eq('user_id', userId)
        .then(({ error }: { error: unknown }) => {
          if (error) saveLocal([])
        })
    } else {
      saveLocal([])
    }
  }

  // ---- SETUP --------------------------------------------------------------
  if (phase === 'setup') {
    const canStart = sources.length > 0 && poolSize > 0
    const countChoices = [5, 10, 20, 40].filter((n) => n <= poolSize)
    if (!countChoices.includes(poolSize)) countChoices.push(poolSize) // "All"
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Test mode</h1>
          <p className="mt-1 text-sm text-muted">
            Self-quiz on innervation and electrode/needle placement, drawn from the nerve guide and EMG atlas
          </p>
        </div>

        <Card>
          <CardHeader title="Build a quiz" sub="Questions and answer choices are randomized each time" />
          <div className="space-y-5 px-5 py-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Question sources</span>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => setUseEmg((v) => !v)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${useEmg ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-accent-soft/30'}`}
                >
                  EMG muscle atlas
                </button>
                <button
                  onClick={() => setUseNerve((v) => !v)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${useNerve ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-accent-soft/30'}`}
                >
                  Nerve conduction guide
                </button>
              </div>
              {sources.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">Select at least one source.</p>
              )}
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Number of questions</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {countChoices.map((n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${count === n ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-accent-soft/30'}`}
                  >
                    {n === poolSize ? `All (${poolSize})` : n}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">{poolSize} questions available from the current sources.</p>
            </div>

            <div>
              <button
                onClick={begin}
                disabled={!canStart}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start quiz
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Review list"
            sub={
              synced
                ? 'Synced to your account — available on any device'
                : 'Saved on this browser — sign in to sync across devices'
            }
          />
          <div className="px-5 py-4">
            {mistakes.length === 0 ? (
              <p className="text-sm text-muted">
                No saved mistakes yet. Questions you miss are saved here{synced ? ' to your account' : ''} so you
                can study them later; answering one correctly removes it from the list.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={studyMistakes}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
                  >
                    Study my {mistakes.length} mistake{mistakes.length === 1 ? '' : 's'}
                  </button>
                  <button
                    onClick={clearMistakes}
                    className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-accent-soft/30"
                  >
                    Clear list
                  </button>
                </div>
                <ul className="divide-y divide-line/60">
                  {mistakes.map((m) => (
                    <li key={m.key} className="py-2">
                      <p className="text-sm text-ink">{m.prompt}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="font-medium text-accent">{m.correct}</span>
                        <span className="ml-2">· {m.itemName} · {m.aspectLabel}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  // ---- ACTIVE -------------------------------------------------------------
  if (phase === 'active') {
    const q = questions[idx]
    const answered = picked !== null
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-ink">Test mode</h1>
          <span className="text-sm text-muted">
            Question {idx + 1} of {questions.length}
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full bg-accent transition-all" style={{ width: `${((idx + (answered ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>

        <Card>
          <div className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {q.source === 'emg' ? 'EMG atlas' : 'Nerve guide'} · {q.aspectLabel}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-ink">{q.prompt}</h2>
            <div className="mt-4 space-y-2">
              {q.options.map((opt) => {
                const isCorrect = opt === q.correct
                const isPicked = opt === picked
                let cls = 'border-line hover:border-accent hover:bg-accent-soft/30'
                if (answered && isCorrect) cls = 'border-emerald-500 bg-emerald-50'
                else if (answered && isPicked && !isCorrect) cls = 'border-rose-400 bg-rose-50'
                else if (answered) cls = 'border-line opacity-70'
                return (
                  <button
                    key={opt}
                    onClick={() => choose(opt)}
                    disabled={answered}
                    className={`block w-full rounded-md border px-4 py-2.5 text-left text-sm text-ink transition-colors ${cls} disabled:cursor-default`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>

            {answered && (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm font-medium">
                  {picked === q.correct ? (
                    <span className="text-emerald-600">Correct</span>
                  ) : (
                    <span className="text-rose-600">Not quite — saved for review</span>
                  )}
                </p>
                <button
                  onClick={next}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
                >
                  {idx + 1 >= questions.length ? 'See results' : 'Next question'}
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  // ---- RESULT -------------------------------------------------------------
  const total = questions.length
  const pct = total ? Math.round((correctCount / total) * 100) : 0
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Quiz results</h1>

      <Card>
        <div className="px-5 py-6 text-center">
          <p className="font-display text-4xl font-bold text-accent">{pct}%</p>
          <p className="mt-1 text-sm text-muted">
            {correctCount} of {total} correct
          </p>
        </div>
      </Card>

      {wrongKeys.length > 0 && (
        <Card>
          <CardHeader title="Questions to review" sub="These are saved to your review list" />
          <div className="px-5 py-4">
            <ul className="divide-y divide-line/60">
              {wrongKeys.map((q) => (
                <li key={q.key} className="py-2">
                  <p className="text-sm text-ink">{q.prompt}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="font-medium text-accent">{q.correct}</span>
                    <span className="ml-2">· {q.itemName} · {q.aspectLabel}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={begin}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
        >
          New quiz
        </button>
        {mistakes.length > 0 && (
          <button
            onClick={studyMistakes}
            className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft/40"
          >
            Study my {mistakes.length} mistake{mistakes.length === 1 ? '' : 's'}
          </button>
        )}
        <button
          onClick={() => setPhase('setup')}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-accent-soft/30"
        >
          Back to setup
        </button>
      </div>
    </div>
  )
}
