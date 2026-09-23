import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { localToday } from '../../lib/format'
import { field, Notice } from '../../components/ui/Wizard'
import {
  ChangeFrame, StepNav, DayTable, WhoIsTold, NotifyChoice, SummaryList, Applied, Field, type DayRow,
} from '../../components/change/ChangeKit'
import {
  loadClinicWorld, isClinicRow, clinicsWithRoom, clinicName, cellLabel, choiceToOp, whoIsTold, daysBetween,
  rangeLabel, plural, capacityWarnings, type ClinicWorld, type Person, type DayOp,
} from '../../lib/schedule'

const STEPS = ['Who and when', 'Cover their days', 'Confirm']

export default function ProviderAway() {
  const today = localToday()
  const [step, setStep] = useState(0)
  const [providers, setProviders] = useState<Person[]>([])
  const [providerId, setProviderId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [world, setWorld] = useState<ClinicWorld | null>(null)
  const [rows, setRows] = useState<DayRow[]>([])
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ changed: number; told: number } | null>(null)

  useEffect(() => {
    supabase.rpc('list_providers').then(({ data }) => setProviders((data as Person[]) ?? []))
  }, [])

  const provider = providers.find((p) => p.id === providerId)
  const last = to || from

  async function check() {
    setErr(null)
    if (!providerId || !from) { setErr('Choose who is away and their first day away.'); return }
    if (from < today) { setErr('Choose a first day from today on.'); return }
    if (last < from) { setErr('The last day is before the first day.'); return }
    setBusy(true)
    try {
      const w = await loadClinicWorld(from, last)
      setWorld(w)
      setRows(buildRows(w, providerId))
      setStep(1)
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  const ops: DayOp[] = useMemo(() => {
    const out: DayOp[] = []
    for (const r of rows) {
      if (!r.include || r.blocked) continue
      const [fellowId, date] = r.key.split('|')
      const op = choiceToOp(fellowId, date, r.choice)
      if (op) out.push(op)
    }
    return out
  }, [rows])

  const told = world ? whoIsTold(world, ops) : []
  const warnings = world ? capacityWarnings(world, rows) : new Map<string, string>()
  const shown = rows.map((r) => ({ ...r, warn: warnings.get(r.key) ?? (r.choice === 'protected' ? r.warn : null) }))

  async function apply() {
    setBusy(true); setErr(null)
    const dates = daysBetween(from, last)
    const summary = `${provider?.full_name ?? 'A provider'} away ${rangeLabel(from, last)}${reason.trim() ? ` (${reason.trim()})` : ''}: ${plural(ops.length, 'fellow day')} covered`
    const { data, error } = await supabase.rpc('apply_clinic_changes', {
      p_kind: 'provider_away', p_summary: summary, p_ops: ops,
      p_setup: { away: { provider_id: providerId, dates, reason: reason.trim() || null } },
      p_notify: notify,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const res = data as { changed: number; told: number }
    setDone({ changed: res.changed, told: res.told })
  }

  if (done) {
    return (
      <ChangeFrame title="A provider is away" steps={STEPS} current={2}>
        <Applied changed={done.changed} told={done.told}>
          <p className="text-sm text-muted">
            {provider?.full_name}’s away dates are saved, so generating the schedule again won’t put fellows back in their clinic on those days.
          </p>
        </Applied>
      </ChangeFrame>
    )
  }

  return (
    <ChangeFrame title="A provider is away" steps={STEPS} current={step} onJump={(i) => setStep(i)}>
      {err && <Notice tone="bad">{err}</Notice>}

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Who is away, and when?</h2>
          <div className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Provider">
                <select id="pa-provider" className={field} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                  <option value="">Choose…</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="First day away"><input id="pa-from" type="date" min={today} className={field} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Last day away" hint="Leave empty for a single day"><input id="pa-to" type="date" min={from || today} className={field} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <Field label="Reason (optional)"><input id="pa-reason" className={field} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Conference" /></Field>
            </div>
          </div>
          <StepNav onNext={check} nextLabel="Check their days →" busy={busy} />
        </div>
      )}

      {step === 1 && world && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Cover {provider?.full_name}’s clinic days</h2>
            <p className="mt-1 text-sm text-muted">
              Away {rangeLabel(from, last)}. {rows.length === 0
                ? 'No fellow is booked with them then — their away dates are simply saved.'
                : (() => { const n = new Set(rows.map((r) => r.who)).size; return `${plural(n, 'fellow')} ${n === 1 ? 'has' : 'have'} ${rows.length === 1 ? 'a day' : 'days'} with them; a suggestion is filled in for each. Suggestions only use clinics with room that day.` })()}
            </p>
          </div>
          <DayTable rows={shown} onChange={setRows} emptyText="No fellow days to cover." />
          {rows.length > 0 && (
            <button type="button" className="text-sm font-medium text-accent hover:underline"
              onClick={() => setRows(buildRows(world, providerId))}>Use all suggestions again</button>
          )}
          <WhoIsTold names={told} notify={notify} />
          <p className="text-xs text-muted">Their away dates are saved too, so generating the schedule again won’t put fellows back in.</p>
          <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
        </div>
      )}

      {step === 2 && world && (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-semibold text-ink">Confirm the change</h2>
          <SummaryList items={[
            ['Away', `${provider?.full_name} · ${rangeLabel(from, last)}${reason.trim() ? ` · ${reason.trim()}` : ''}`],
            ['Clinic days', ops.length === 0 ? 'None change' : plural(ops.length, 'fellow day') + ' covered'],
            ['Left as they are', rows.filter((r) => !r.include || r.choice === 'keep').length === 0 ? 'None'
              : `${plural(rows.filter((r) => !r.include || r.choice === 'keep').length, 'day')} — flagged on the schedule for you to sort out`],
          ]} />
          <NotifyChoice notify={notify} onChange={setNotify} />
          <WhoIsTold names={told} notify={notify} />
          <StepNav onBack={() => setStep(1)} onNext={apply} nextLabel="Apply the change" busy={busy} />
        </div>
      )}
    </ChangeFrame>
  )
}

function buildRows(w: ClinicWorld, providerId: string): DayRow[] {
  const affected = w.rotations
    .filter((r) => r.fellow_id && r.supervisor_id === providerId && isClinicRow(r))
    .sort((a, b) => a.rotation_date.localeCompare(b.rotation_date) || (a.fellow_label ?? '').localeCompare(b.fellow_label ?? ''))
  const mine = new Set(w.clinics.filter((c) => c.provider_id === providerId).map((c) => c.id))
  const taken = new Map<string, number>()
  return affected.map((r) => {
    const d = r.rotation_date
    const withRoom = clinicsWithRoom(w, d, { exclude: mine, ignoreFellows: new Set([r.fellow_id!]), taken })
    const best = withRoom[0]?.clinic
    if (best) taken.set(`${best.id}|${d}`, (taken.get(`${best.id}|${d}`) ?? 0) + 1)
    const options = [
      ...withRoom.map(({ clinic, room }) => ({ value: clinic.id, label: `${clinicName(clinic)} (${plural(room, 'place')} free)` })),
      { value: 'protected', label: 'Protected day' },
      { value: 'free', label: 'Nothing scheduled' },
      { value: 'keep', label: 'Leave it — I’ll sort it out' },
    ]
    const fellow = w.fellows.find((f) => f.id === r.fellow_id)
    return {
      key: `${r.fellow_id}|${d}`,
      date: d,
      who: fellow?.full_name ?? r.fellow_label ?? 'Fellow',
      current: cellLabel(r) + (r.is_draft ? ' (draft)' : ''),
      choice: best ? best.id : 'protected',
      options,
      include: true,
      warn: best ? null : 'No other clinic has room that day',
    }
  })
}
