import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { localToday } from '../../lib/format'
import { field, ChoiceCard, Notice } from '../../components/ui/Wizard'
import {
  ChangeFrame, StepNav, DayTable, WhoIsTold, NotifyChoice, SummaryList, Applied, Field, type DayRow,
} from '../../components/change/ChangeKit'
import {
  ROTATION_COLUMNS, cellLabel, inFellowship, rangeLabel, dateLabel, addDays, plural, isClinicRow,
  type Fellow, type Rotation, type DayOp, type Person,
} from '../../lib/schedule'

const STEPS = ['New dates', 'Check the effect', 'Confirm']
const REASONS = [
  { key: 'extension', title: 'Extension', desc: 'The fellowship carries on for longer' },
  { key: 'leave', title: 'Leave of absence', desc: 'Time out, with the end date moved' },
  { key: 'early_finish', title: 'Finishing early', desc: 'The fellowship ends sooner' },
  { key: 'correction', title: 'Correction', desc: 'The dates on file were wrong' },
]

/** New fellowship dates, and what follows for the clinic schedule. */
export default function FellowshipChange() {
  const [params] = useSearchParams()
  const today = localToday()
  const [step, setStep] = useState(0)
  const [fellows, setFellows] = useState<Fellow[]>([])
  const [fellowId, setFellowId] = useState(params.get('fellow') ?? '')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('extension')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<DayRow[]>([])
  const [lastScheduled, setLastScheduled] = useState<string | null>(null)
  const [providers, setProviders] = useState<Person[]>([])
  const [published, setPublished] = useState<Rotation[]>([])
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number } | null>(null)

  useEffect(() => {
    supabase.rpc('list_fellows', { p_all: true }).then(({ data }) => setFellows((data as Fellow[]) ?? []))
    supabase.rpc('list_providers').then(({ data }) => setProviders((data as Person[]) ?? []))
  }, [])

  const fellow = fellows.find((f) => f.id === fellowId)
  useEffect(() => {
    if (!fellow) return
    setStart(fellow.fellowship_start ?? '')
    setEnd(fellow.fellowship_end ?? '')
    setReason(fellow.fellowship_start || fellow.fellowship_end ? 'extension' : 'correction')
  }, [fellowId, fellows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const unchanged = !!fellow && (fellow.fellowship_start ?? '') === start && (fellow.fellowship_end ?? '') === end

  async function check() {
    setErr(null)
    if (!fellow) { setErr('Choose the fellow.'); return }
    if (unchanged) { setErr('The dates are the same as the ones on file.'); return }
    if (start && end && end < start) { setErr('The fellowship ends before it starts.'); return }
    setBusy(true)
    // their clinic days from today on
    const { data, error } = await supabase.from('clinic_rotations').select(ROTATION_COLUMNS)
      .eq('fellow_id', fellow.id).gte('rotation_date', today).order('rotation_date')
    setBusy(false)
    if (error) { setErr(error.message); return }
    const list = (data as Rotation[]) ?? []
    setPublished(list.filter((r) => !r.is_draft))
    setLastScheduled(list.length ? list[list.length - 1].rotation_date : null)
    const next = { fellowship_start: start || null, fellowship_end: end || null }
    setRows(list.filter((r) => !inFellowship(next, r.rotation_date)).map((r) => ({
      key: `${fellow.id}|${r.rotation_date}`, date: r.rotation_date, who: fellow.full_name,
      current: cellLabel(r) + (r.is_draft ? ' (draft)' : ''), choice: 'free',
      options: [{ value: 'free', label: 'Removed — outside the new dates' }], include: true,
    })))
    setStep(1)
  }

  const ops: DayOp[] = useMemo(() => rows.filter((r) => r.include).map((r) => {
    const [fid, d] = r.key.split('|')
    return { fellow_id: fid, date: d, mode: 'free' as const }
  }), [rows])

  const told = useMemo(() => {
    const names = new Set<string>()
    for (const op of ops) {
      const r = published.find((x) => x.rotation_date === op.date)
      if (!r) continue
      if (fellow) names.add(fellow.full_name)
      if (isClinicRow(r) && r.supervisor_id) names.add(providers.find((p) => p.id === r.supervisor_id)?.full_name ?? 'A supervisor')
    }
    return Array.from(names)
  }, [ops, published, fellow, providers])

  // After an extension: the stretch the clinic schedule doesn't cover yet.
  const toGenerate = useMemo(() => {
    if (!end) return null
    const from = [lastScheduled ? addDays(lastScheduled, 1) : null, fellow?.fellowship_end ? addDays(fellow.fellowship_end, 1) : null, today]
      .filter(Boolean).sort().pop() as string
    if (from > end) return null
    return { from, to: end }
  }, [end, lastScheduled, fellow, today])

  async function apply() {
    if (!fellow) return
    setBusy(true); setErr(null)
    const r = REASONS.find((x) => x.key === reason)?.title ?? reason
    const summary = `${fellow.full_name}’s fellowship: ${rangeLabel(fellow.fellowship_start, fellow.fellowship_end)} → ${rangeLabel(start || null, end || null)} (${r.toLowerCase()})`
    const { data, error } = await supabase.rpc('apply_clinic_changes', {
      p_kind: 'fellowship', p_summary: summary, p_ops: ops,
      p_setup: { fellowship: { user_id: fellow.id, start: start || null, end: end || null, reason, note: note.trim() || null } },
      p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(data as { changed: number; told: number })
  }

  if (done) {
    return (
      <ChangeFrame title="A fellowship is extended or ends early" steps={STEPS} current={2}>
        <Applied changed={done.changed} told={done.told}>
          <p className="text-sm text-ink">{fellow?.full_name}’s fellowship is now {rangeLabel(start || null, end || null)}. The change is kept in their record on the People page.</p>
          {toGenerate && (
            <Link to={`/clinic/setup?step=5&from=${toGenerate.from}&to=${toGenerate.to}`} className="inline-block text-sm font-medium text-accent hover:underline">
              Make the clinic schedule for {rangeLabel(toGenerate.from, toGenerate.to)} →
            </Link>
          )}
        </Applied>
      </ChangeFrame>
    )
  }

  return (
    <ChangeFrame title="A fellowship is extended or ends early" steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{fellow ? `${fellow.full_name}’s fellowship dates` : 'Whose fellowship?'}</h2>
            <p className="mt-1 text-sm text-muted">Start and end dates are kept for each fellow and can be changed at any time — for an extension, a leave, or an early finish.</p>
          </div>
          <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
            <Field label="Fellow">
              <select id="fs-fellow" className={field} value={fellowId} onChange={(e) => setFellowId(e.target.value)}>
                <option value="">Choose…</option>
                {fellows.map((f) => <option key={f.id} value={f.id}>{f.full_name}</option>)}
              </select>
            </Field>
            {fellow && (
              <>
                <p className="text-sm text-muted">Now: <span className="text-ink">{rangeLabel(fellow.fellowship_start, fellow.fellowship_end)}</span></p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Starts"><input id="fs-start" type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                  <Field label="Ends"><input id="fs-end" type="date" className={field} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></Field>
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium text-muted">Reason (kept in their record)</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {REASONS.map((r) => (
                      <ChoiceCard key={r.key} name="fs-reason" checked={reason === r.key} onChange={() => setReason(r.key)} title={r.title}>{r.desc}</ChoiceCard>
                    ))}
                  </div>
                </div>
                <Field label="Note (optional)"><input id="fs-note" className={field} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              </>
            )}
          </div>
          {fellow && (
            <Notice>
              <strong>What follows from this.</strong> Clinic days are only scheduled inside the fellowship. Teaching emails and
              feedback requests carry on until the end date, and they stay listed as a current fellow until then.
              Their cohort label doesn’t change.
            </Notice>
          )}
          <StepNav onNext={check} nextLabel="Check the effect →" busy={busy} nextDisabled={!fellow} />
        </div>
      )}
      {step === 1 && fellow && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Here’s what this changes</h2>
          <p className="text-sm text-ink">{rangeLabel(fellow.fellowship_start, fellow.fellowship_end)} → <strong>{rangeLabel(start || null, end || null)}</strong></p>
          {rows.length > 0 ? (
            <>
              <p className="text-sm text-muted">{plural(rows.length, 'clinic day')} on the schedule {rows.length === 1 ? 'falls' : 'fall'} outside the new dates and will be removed:</p>
              <DayTable rows={rows} onChange={setRows} />
            </>
          ) : (
            <Notice tone="ok">No clinic days fall outside the new dates.</Notice>
          )}
          {toGenerate && (
            <Notice>
              The clinic schedule for {fellow.full_name} can now run from {dateLabel(toGenerate.from)} to {dateLabel(toGenerate.to)},
              carrying on their pattern rotation. After you confirm, you’ll get a link to make it.
            </Notice>
          )}
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </div>
      )}
      {step === 2 && fellow && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm the change</h2>
          <SummaryList items={[
            ['Fellow', fellow.full_name],
            ['Dates', `${rangeLabel(fellow.fellowship_start, fellow.fellowship_end)} → ${rangeLabel(start || null, end || null)}`],
            ['Reason', `${REASONS.find((x) => x.key === reason)?.title}${note.trim() ? ` — ${note.trim()}` : ''}`],
            ['Clinic days', ops.length ? `${plural(ops.length, 'day')} removed` : 'None change'],
          ]} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(1)} onNext={apply} nextLabel="Apply the change" busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}
