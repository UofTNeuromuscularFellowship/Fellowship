import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { StepBar, ChoiceCard, Notice, primary, quiet, field, label as labelCls, niceDay } from '../components/ui/Wizard'
import { SummaryList } from '../components/change/ChangeKit'
import { plural, weekdaysBetween, WEEKDAY_NAMES } from '../lib/schedule'
import { expandOffRules, LEVELS, TYPE_LABEL, type LearnerType, type OffKind, type OffRule } from '../lib/learners'

// ---------------------------------------------------------------------------
// Add a resident or medical student, one step at a time: who they are, their
// training, their rotation dates, and days they can't be in clinic (picked
// one by one, or a weekly day such as academic half day). The last step can
// draft their clinic days straight away.
// ---------------------------------------------------------------------------

const STEPS = ['Who', 'Training', 'Rotation', 'Days off', 'Review']

interface OneOff { date: string; kind: OffKind; reason: string }

export default function LearnerWizard() {
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState<LearnerType>('resident')
  const [school, setSchool] = useState('')
  const [level, setLevel] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [rules, setRules] = useState<OffRule[]>([])
  const [oneOffs, setOneOffs] = useState<OneOff[]>([])
  const [pick, setPick] = useState<OneOff>({ date: '', kind: 'away', reason: '' })
  const [rule, setRule] = useState<OffRule>({ weekday: 3, kind: 'teaching', reason: 'Academic half day' })
  const [notes, setNotes] = useState('')
  const [draftNow, setDraftNow] = useState(true)

  const recurring = useMemo(() => expandOffRules(rules, start, end), [rules, start, end])
  const weekdays = start && end && end >= start ? weekdaysBetween(start, end) : []
  const offSet = new Set([...recurring.map((r) => r.off_date), ...oneOffs.map((o) => o.date)])
  const clinicDays = weekdays.filter((d) => !offSet.has(d)).length

  function check(i: number): string | null {
    if (i === 0) {
      if (!name.trim()) return 'Add their name.'
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Add an email address — their schedule is sent there.'
    }
    if (i === 1 && !level.trim()) return 'Add their level, e.g. PGY-2 or clerk.'
    if (i === 2) {
      if (!start || !end) return 'Choose the first and last day of the rotation.'
      if (end < start) return 'The rotation ends before it starts.'
      if (weekdays.length > 260) return 'That rotation is over a year long.'
    }
    return null
  }
  function next() { const e = check(step); setErr(e); if (!e) setStep(step + 1) }

  function addOneOff() {
    if (!pick.date) return
    if (start && end && (pick.date < start || pick.date > end)) { setErr('That day is outside the rotation.'); return }
    setErr(null)
    setOneOffs((xs) => [...xs.filter((x) => x.date !== pick.date), pick].sort((a, b) => a.date.localeCompare(b.date)))
    setPick({ ...pick, date: '' })
  }
  function addRule() {
    setRules((rs) => [...rs.filter((r) => r.weekday !== rule.weekday), { ...rule, reason: rule.reason?.trim() || null }].sort((a, b) => a.weekday - b.weekday))
  }

  async function save() {
    for (let i = 0; i < 3; i++) { const e = check(i); if (e) { setErr(e); setStep(i); return } }
    setBusy(true); setErr(null)
    const { data, error } = await supabase.from('learners').insert({
      full_name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() || null, school: school.trim() || null,
      learner_type: type, level: level.trim() || null, specialty: specialty.trim() || null,
      rotation_start: start, rotation_end: end, off_rules: rules, notes: notes.trim() || null,
    }).select('id').single()
    if (error || !data) { setBusy(false); setErr(error?.message ?? 'The learner couldn’t be saved.'); return }
    const id = (data as { id: string }).id
    const byDate = new Map<string, { off_date: string; kind: OffKind; reason: string | null; recurring: boolean }>()
    for (const r of recurring) byDate.set(r.off_date, { ...r, recurring: true })
    for (const o of oneOffs) byDate.set(o.date, { off_date: o.date, kind: o.kind, reason: o.reason.trim() || null, recurring: false })
    if (byDate.size) {
      const { error: e2 } = await supabase.from('learner_off_dates').insert([...byDate.values()].map((r) => ({ ...r, learner_id: id })))
      if (e2) { setBusy(false); setErr(`Saved, but the days off weren’t: ${e2.message}`); return }
    }
    let drafted = -1
    if (draftNow) {
      const { data: n } = await supabase.rpc('generate_learner_schedule', { p_from: start, p_to: end, p_learner: id })
      drafted = (n as number) ?? 0
    }
    setBusy(false)
    nav(`/learners?learner=${id}${drafted >= 0 ? `&drafted=${drafted}` : ''}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/learners/people" className="text-xs font-medium text-muted hover:text-ink">← Learner management</Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Add a learner</h1>
        <p className="mt-1 text-sm text-muted">Step {step + 1} of {STEPS.length} · Nothing is saved until the last step.</p>
      </div>
      <StepBar steps={STEPS} current={step} onJump={(i) => { setErr(null); setStep(i) }} />

      {step === 0 && (
        <section className="space-y-4">
          <L text="Full name"><input className={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></L>
          <div className="grid gap-4 sm:grid-cols-2">
            <L text="Email" hint="Their clinic schedule is emailed here."><input type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} /></L>
            <L text="Phone (optional)"><input type="tel" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} /></L>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {(['resident', 'medical_student', 'other'] as LearnerType[]).map((t) => (
              <ChoiceCard key={t} name="type" checked={type === t} onChange={() => { setType(t); setLevel('') }} title={TYPE_LABEL[t]} />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <L text="Medical school or program"><input className={field} value={school} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. University of Toronto" /></L>
            <L text="Level">
              <input className={field} list="learner-levels" value={level} onChange={(e) => setLevel(e.target.value)} placeholder={LEVELS[type][0] ?? ''} />
              <datalist id="learner-levels">{LEVELS[type].map((l) => <option key={l} value={l} />)}</datalist>
            </L>
          </div>
          {type === 'resident' && (
            <L text="Specialty (optional)"><input className={field} value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Adult neurology, PM&R" /></L>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <L text="First day"><input type="date" className={field} value={start} onChange={(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value) }} /></L>
            <L text="Last day"><input type="date" className={field} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></L>
          </div>
          {weekdays.length > 0 && <p className="text-sm text-muted">{plural(weekdays.length, 'weekday')} from {niceDay(start)} to {niceDay(end)}.</p>}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Every week</h2>
            <p className="text-xs text-muted">For example academic half day, or a weekly clinic at their home program.</p>
            <div className="flex flex-wrap items-end gap-2">
              <L text="Day">
                <select className={field} value={rule.weekday} onChange={(e) => setRule({ ...rule, weekday: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[d]}</option>)}
                </select>
              </L>
              <L text="Why">
                <select className={field} value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value as OffKind })}>
                  <option value="teaching">Mandatory teaching</option><option value="away">Away</option>
                </select>
              </L>
              <L text="Note"><input className={field} value={rule.reason ?? ''} onChange={(e) => setRule({ ...rule, reason: e.target.value })} /></L>
              <button type="button" className={quiet} onClick={addRule}>Add</button>
            </div>
            {rules.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {rules.map((r) => (
                  <li key={r.weekday} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                    Every {WEEKDAY_NAMES[r.weekday]} · {r.kind === 'teaching' ? 'teaching' : 'away'}{r.reason ? ` · ${r.reason}` : ''}
                    <button className="text-muted hover:text-ink" aria-label="Remove" onClick={() => setRules(rules.filter((x) => x.weekday !== r.weekday))}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Particular days</h2>
            <div className="flex flex-wrap items-end gap-2">
              <L text="Date"><input type="date" className={field} min={start} max={end} value={pick.date} onChange={(e) => setPick({ ...pick, date: e.target.value })} /></L>
              <L text="Why">
                <select className={field} value={pick.kind} onChange={(e) => setPick({ ...pick, kind: e.target.value as OffKind })}>
                  <option value="away">Away</option><option value="teaching">Mandatory teaching</option>
                </select>
              </L>
              <L text="Note"><input className={field} value={pick.reason} onChange={(e) => setPick({ ...pick, reason: e.target.value })} placeholder="e.g. exam, conference" /></L>
              <button type="button" className={quiet} onClick={addOneOff} disabled={!pick.date}>Add</button>
            </div>
            {oneOffs.length > 0 && (
              <ul className="divide-y divide-line rounded-md border border-line">
                {oneOffs.map((o) => (
                  <li key={o.date} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{niceDay(o.date)} · {o.kind === 'teaching' ? 'Mandatory teaching' : 'Away'}{o.reason ? ` · ${o.reason}` : ''}</span>
                    <button className="text-xs font-medium text-muted hover:text-ink" onClick={() => setOneOffs(oneOffs.filter((x) => x.date !== o.date))}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Notice>{plural(offSet.size, 'day')} off · {plural(clinicDays, 'weekday')} left for clinic.</Notice>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <SummaryList items={[
            ['Learner', <span key="n">{name}<br /><span className="text-muted">{[email, phone].filter(Boolean).join(' · ')}</span></span>],
            ['Training', [TYPE_LABEL[type], level, specialty, school].filter(Boolean).join(' · ')],
            ['Rotation', `${niceDay(start)} to ${niceDay(end)} · ${plural(weekdays.length, 'weekday')}`],
            ['Days off', offSet.size ? [
              ...rules.map((r) => `every ${WEEKDAY_NAMES[r.weekday]}${r.reason ? ` (${r.reason})` : ''}`),
              oneOffs.length ? plural(oneOffs.length, 'other day') : null,
            ].filter(Boolean).join(', ') : 'none'],
          ]} />
          <L text="Notes (optional, only you see these)"><textarea rows={2} className={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></L>
          <label className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
            <input type="checkbox" className="mt-1" checked={draftNow} onChange={(e) => setDraftNow(e.target.checked)} />
            <span>
              <span className="block font-semibold text-ink">Draft their clinic days now</span>
              <span className="block text-xs text-muted">
                Fills clinics running on their {plural(clinicDays, 'available day')} that the fellows haven’t filled, up to each clinic’s learner places.
                It stays a draft — nobody is emailed until you publish.
              </span>
            </span>
          </label>
        </section>
      )}

      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        {step > 0 && <button type="button" className={quiet} onClick={() => { setErr(null); setStep(step - 1) }} disabled={busy}>← Back</button>}
        {step < STEPS.length - 1
          ? <button type="button" className={primary} onClick={next}>Continue →</button>
          : <button type="button" className={primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add learner'}</button>}
      </div>
    </div>
  )
}

function L({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{text}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}
