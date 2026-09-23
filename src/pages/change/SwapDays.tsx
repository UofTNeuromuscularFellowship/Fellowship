import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localToday } from '../../lib/format'
import { field, Notice } from '../../components/ui/Wizard'
import { ChangeFrame, StepNav, WhoIsTold, NotifyChoice, SummaryList, Applied, Field } from '../../components/change/ChangeKit'
import {
  loadClinicWorld, cellLabel, rowFor, rowIsClinic, isClinicRow, inFellowship, whoIsTold, dayLabel,
  type ClinicWorld, type Fellow, type DayOp, type Rotation,
} from '../../lib/schedule'

const STEPS = ['The swap', 'Confirm']

/** On each chosen day, two fellows trade places. */
export default function SwapDays() {
  const today = localToday()
  const [step, setStep] = useState(0)
  const [fellows, setFellows] = useState<Fellow[]>([])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [world, setWorld] = useState<ClinicWorld | null>(null)
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number } | null>(null)

  useEffect(() => {
    supabase.rpc('list_fellows', { p_from: today, p_to: null, p_all: true })
      .then(({ data }) => setFellows(((data as Fellow[]) ?? []).filter((f) => !f.fellowship_end || f.fellowship_end >= today)))
  }, [today])

  const dates = useMemo(() => Array.from(new Set([d1, d2].filter(Boolean))).sort(), [d1, d2])

  // reload the two fellows' days whenever the choice is complete
  useEffect(() => {
    if (!a || !b || dates.length === 0 || dates[0] < today) { setWorld(null); return }
    let live = true
    loadClinicWorld(dates[0], dates[dates.length - 1]).then((w) => { if (live) setWorld(w) }).catch((e) => setErr((e as Error).message))
    return () => { live = false }
  }, [a, b, dates, today])

  const nameOf = (id: string) => fellows.find((f) => f.id === id)?.full_name ?? 'Fellow'

  /** The op that gives `to` the day `from` has now. */
  function opFor(w: ClinicWorld, fromRow: Rotation | undefined, to: string, d: string): DayOp | string {
    if (!fromRow || (!isClinicRow(fromRow) && !fromRow.is_protected)) {
      if (fromRow?.is_away) return 'away'
      return { fellow_id: to, date: d, mode: fromRow?.is_protected ? 'protected' : 'free' }
    }
    if (fromRow.is_protected) return { fellow_id: to, date: d, mode: 'protected' }
    const c = w.clinics.find((x) => rowIsClinic(fromRow, x))
    if (!c) return 'unknown'
    return { fellow_id: to, date: d, mode: 'clinic', clinic_id: c.id }
  }

  const plan = useMemo(() => {
    if (!world || !a || !b) return null
    const problems: string[] = []
    const ops: DayOp[] = []
    const lines: { d: string; aNow: string; bNow: string }[] = []
    const fa = world.fellows.find((f) => f.id === a) ?? fellows.find((f) => f.id === a)
    const fb = world.fellows.find((f) => f.id === b) ?? fellows.find((f) => f.id === b)
    for (const d of dates) {
      const ra = rowFor(world, a, d)
      const rb = rowFor(world, b, d)
      lines.push({ d, aNow: cellLabel(ra), bNow: cellLabel(rb) })
      if (!inFellowship(fa, d)) problems.push(`${nameOf(a)} isn’t in their fellowship on ${dayLabel(d)}.`)
      if (!inFellowship(fb, d)) problems.push(`${nameOf(b)} isn’t in their fellowship on ${dayLabel(d)}.`)
      if (ra?.is_away || world.fellowAway.has(`${a}|${d}`)) problems.push(`${nameOf(a)} is away on ${dayLabel(d)}.`)
      if (rb?.is_away || world.fellowAway.has(`${b}|${d}`)) problems.push(`${nameOf(b)} is away on ${dayLabel(d)}.`)
      if (cellLabel(ra) === cellLabel(rb)) problems.push(`They have the same thing on ${dayLabel(d)} — nothing to swap.`)
      const toB = opFor(world, ra, b, d)
      const toA = opFor(world, rb, a, d)
      for (const o of [toA, toB]) {
        if (o === 'unknown') problems.push(`A clinic on ${dayLabel(d)} is no longer in the clinic list, so it can’t be swapped here.`)
        else if (typeof o !== 'string') ops.push(o)
      }
    }
    return { problems: Array.from(new Set(problems)), ops, lines }
  }, [world, a, b, dates, fellows]) // eslint-disable-line react-hooks/exhaustive-deps

  const told = world && plan ? whoIsTold(world, plan.ops) : []

  async function apply() {
    if (!plan) return
    setBusy(true); setErr(null)
    const summary = `${nameOf(a)} and ${nameOf(b)} swap ${dates.map(dayLabel).join(' and ')}`
    const { data, error } = await supabase.rpc('apply_clinic_changes', {
      p_kind: 'swap', p_summary: summary, p_ops: plan.ops, p_setup: {}, p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(data as { changed: number; told: number })
  }

  if (done) return <ChangeFrame title="Two fellows swap days" steps={STEPS} current={1}><Applied changed={done.changed} told={done.told} /></ChangeFrame>

  const ready = !!plan && plan.problems.length === 0 && plan.ops.length > 0

  return (
    <ChangeFrame title="Two fellows swap days" steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Which days are swapping?</h2>
            <p className="mt-1 text-sm text-muted">On each day you choose, the two fellows trade places. Choose a second day if they’re swapping one day for another.</p>
          </div>
          <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
            <Field label="Fellow">
              <select id="sw-a" className={field} value={a} onChange={(e) => setA(e.target.value)}>
                <option value="">Choose…</option>
                {fellows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
              </select>
            </Field>
            <Field label="Swaps with">
              <select id="sw-b" className={field} value={b} onChange={(e) => setB(e.target.value)}>
                <option value="">Choose…</option>
                {fellows.filter((f) => f.id !== a).map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
              </select>
            </Field>
            <Field label="Day"><input id="sw-d1" type="date" min={today} className={field} value={d1} onChange={(e) => setD1(e.target.value)} /></Field>
            <Field label="Second day (optional)"><input id="sw-d2" type="date" min={today} className={field} value={d2} onChange={(e) => setD2(e.target.value)} /></Field>
          </div>

          {plan && (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead><tr className="bg-paper text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="px-3 py-2">Day</th><th className="px-3 py-2">{nameOf(a)}</th><th className="px-3 py-2">{nameOf(b)}</th>
                </tr></thead>
                <tbody>
                  {plan.lines.map((l) => (
                    <tr key={l.d} className="border-t border-line">
                      <td className="px-3 py-2 font-medium text-ink">{dayLabel(l.d)}</td>
                      <td className="px-3 py-2 text-ink">{l.aNow} <span className="text-muted">→ {l.bNow}</span></td>
                      <td className="px-3 py-2 text-ink">{l.bNow} <span className="text-muted">→ {l.aNow}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {plan && (
            <ul className="space-y-1 text-sm">
              {plan.problems.length === 0 ? (
                <>
                  <li className="text-emerald-700 dark:text-emerald-300">✓ Both fellows are in their fellowship and not away</li>
                  <li className="text-emerald-700 dark:text-emerald-300">✓ Each clinic keeps the same number of fellows</li>
                </>
              ) : plan.problems.map((p) => <li key={p} className="text-rose-700 dark:text-rose-300">✕ {p}</li>)}
            </ul>
          )}
          <StepNav onNext={() => setStep(1)} nextDisabled={!ready} />
        </div>
      )}
      {step === 1 && plan && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm the swap</h2>
          <SummaryList items={plan.lines.map((l) => [dayLabel(l.d), `${nameOf(a)}: ${l.bNow} · ${nameOf(b)}: ${l.aNow}`] as [string, string])} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(0)} onNext={apply} nextLabel="Apply the swap" busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}
