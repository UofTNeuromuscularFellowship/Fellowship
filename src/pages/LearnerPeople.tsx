import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card } from '../components/ui/Card'
import { Notice, primary, quiet, field, label as labelCls } from '../components/ui/Wizard'
import { dateLabel, plural, toIso, WEEKDAY_NAMES } from '../lib/schedule'
import {
  expandOffRules, LEARNER_COLUMNS, learnerSummary, LEVELS, TYPE_LABEL,
  type Learner, type LearnerType, type OffDate, type OffKind, type OffRule,
} from '../lib/learners'

// ---------------------------------------------------------------------------
// Learner management: the residents and medical students on rotation, their
// details, rotation dates and days off. New learners come in through the
// step-by-step "Add a learner".
// ---------------------------------------------------------------------------

export default function LearnerPeople() {
  const [qs] = useSearchParams()
  const [learners, setLearners] = useState<Learner[] | null>(null)
  const [open, setOpen] = useState<string | null>(qs.get('learner'))
  const [archived, setArchived] = useState(false)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('learners').select(LEARNER_COLUMNS).order('rotation_start', { ascending: false }).order('full_name')
    setLearners((data as Learner[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  if (!learners) return <p className="text-sm text-muted">Loading…</p>
  const today = toIso(new Date())
  const shown = learners
    .filter((l) => (archived ? l.status === 'archived' : l.status === 'active'))
    .filter((l) => !q.trim() || `${l.full_name} ${l.email} ${l.school ?? ''} ${l.level ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Learner management</h1>
          <p className="mt-1 text-sm text-muted">Residents and medical students — they don’t need portal accounts.</p>
        </div>
        <Link to="/learners/new" className={primary}>Add a learner</Link>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap items-end gap-3">
        <input className={`${field} max-w-xs`} placeholder="Search by name, school, level…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search learners" />
        <div role="tablist" className="flex gap-1">
          {[false, true].map((a) => (
            <button key={String(a)} role="tab" aria-selected={archived === a} onClick={() => setArchived(a)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${archived === a ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink'}`}>
              {a ? 'Archived' : 'Current'} ({learners.filter((l) => (a ? l.status === 'archived' : l.status === 'active')).length})
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {learners.length === 0 ? 'No learners yet.' : 'Nobody here.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((l) => (
            <li key={l.id}>
              <Card>
                <button className="flex w-full flex-wrap items-start justify-between gap-3 px-5 py-4 text-left" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{l.full_name}</span>
                    <span className="block text-xs text-muted">{learnerSummary(l)} · {l.email}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {dateLabel(l.rotation_start)} – {dateLabel(l.rotation_end)}
                    {l.rotation_start <= today && l.rotation_end >= today && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 font-medium text-ink">On rotation</span>}
                  </span>
                </button>
                {open === l.id && <Editor l={l} onSaved={(t, tone = 'ok') => { setMsg({ tone, text: t }); load() }} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Editor({ l, onSaved }: { l: Learner; onSaved: (t: string, tone?: 'ok' | 'bad') => void }) {
  const [d, setD] = useState(l)
  const [off, setOff] = useState<OffDate[]>([])
  const [pick, setPick] = useState<{ date: string; kind: OffKind; reason: string }>({ date: '', kind: 'away', reason: '' })
  const [rule, setRule] = useState<OffRule>({ weekday: 3, kind: 'teaching', reason: 'Academic half day' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof Learner>(k: K, v: Learner[K]) => setD((x) => ({ ...x, [k]: v }))

  const loadOff = useCallback(async () => {
    const { data } = await supabase.from('learner_off_dates').select('id, learner_id, off_date, kind, reason, recurring').eq('learner_id', l.id).order('off_date')
    setOff((data as OffDate[]) ?? [])
  }, [l.id])
  useEffect(() => { loadOff() }, [loadOff])

  /** Put the weekly days off back in step with the rules and the rotation dates. */
  async function syncRecurring(rules: OffRule[], start: string, end: string) {
    await supabase.from('learner_off_dates').delete().eq('learner_id', l.id).eq('recurring', true)
    const oneOff = new Set(off.filter((o) => !o.recurring).map((o) => o.off_date))
    const rows = expandOffRules(rules, start, end).filter((r) => !oneOff.has(r.off_date)).map((r) => ({ ...r, learner_id: l.id, recurring: true }))
    if (rows.length) await supabase.from('learner_off_dates').insert(rows)
    // a clinic day now falling on a day off comes off the schedule
    const offDays = rows.map((r) => r.off_date).filter((x) => x >= toIso(new Date()))
    if (offDays.length) {
      const { data } = await supabase.from('learner_rotations').select('rotation_date').eq('learner_id', l.id).in('rotation_date', offDays)
      for (const r of (data as { rotation_date: string }[]) ?? []) await supabase.rpc('set_learner_day', { p_learner: l.id, p_date: r.rotation_date, p_clinic: null })
    }
  }

  async function save() {
    if (!d.full_name.trim()) { setErr('Add their name.'); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim())) { setErr('The email doesn’t look right.'); return }
    if (!d.rotation_start || !d.rotation_end || d.rotation_end < d.rotation_start) { setErr('Check the rotation dates.'); return }
    setBusy(true); setErr(null)
    const { error } = await supabase.from('learners').update({
      full_name: d.full_name.trim(), email: d.email.trim().toLowerCase(), phone: d.phone?.trim() || null, school: d.school?.trim() || null,
      learner_type: d.learner_type, level: d.level?.trim() || null, specialty: d.specialty?.trim() || null,
      rotation_start: d.rotation_start, rotation_end: d.rotation_end, notes: d.notes?.trim() || null, off_rules: d.off_rules,
      updated_at: new Date().toISOString(),
    }).eq('id', l.id)
    if (error) { setBusy(false); setErr(error.message); return }
    let note = ''
    if (d.rotation_start !== l.rotation_start || d.rotation_end !== l.rotation_end) {
      await syncRecurring(d.off_rules, d.rotation_start, d.rotation_end)
      // drafts outside the new dates go; published days outside are flagged
      await supabase.from('learner_rotations').delete().eq('learner_id', l.id).eq('is_draft', true).or(`rotation_date.lt.${d.rotation_start},rotation_date.gt.${d.rotation_end}`)
      const { count } = await supabase.from('learner_rotations').select('id', { count: 'exact', head: true }).eq('learner_id', l.id)
        .or(`rotation_date.lt.${d.rotation_start},rotation_date.gt.${d.rotation_end}`)
      if (count) note = ` ${plural(count, 'published clinic day')} fall outside the new dates — clear them on the learner schedule so the supervisors are told.`
    }
    setBusy(false)
    onSaved(`Saved.${note}`)
  }

  async function addOff() {
    if (!pick.date) return
    if (pick.date < d.rotation_start || pick.date > d.rotation_end) { setErr('That day is outside the rotation.'); return }
    setErr(null)
    const { error } = await supabase.from('learner_off_dates').upsert({ learner_id: l.id, off_date: pick.date, kind: pick.kind, reason: pick.reason.trim() || null, recurring: false }, { onConflict: 'learner_id,off_date' })
    if (error) { setErr(error.message); return }
    const { data } = await supabase.from('learner_rotations').select('is_draft').eq('learner_id', l.id).eq('rotation_date', pick.date).maybeSingle()
    if (data && pick.date >= toIso(new Date())) {
      await supabase.rpc('set_learner_day', { p_learner: l.id, p_date: pick.date, p_clinic: null })
      onSaved(`Day off added. Their clinic that day was taken off the schedule${(data as { is_draft: boolean }).is_draft ? '' : ', and the learner and supervisor were emailed'}.`)
    }
    setPick({ ...pick, date: '', reason: '' })
    loadOff()
  }
  async function removeOff(o: OffDate) {
    await supabase.from('learner_off_dates').delete().eq('id', o.id)
    loadOff()
  }
  async function addRule() {
    const rules = [...d.off_rules.filter((r) => r.weekday !== rule.weekday), { ...rule, reason: rule.reason?.trim() || null }].sort((a, b) => a.weekday - b.weekday)
    set('off_rules', rules)
    await supabase.from('learners').update({ off_rules: rules }).eq('id', l.id)
    await syncRecurring(rules, d.rotation_start, d.rotation_end)
    loadOff()
  }
  async function removeRule(wd: number) {
    const rules = d.off_rules.filter((r) => r.weekday !== wd)
    set('off_rules', rules)
    await supabase.from('learners').update({ off_rules: rules }).eq('id', l.id)
    await syncRecurring(rules, d.rotation_start, d.rotation_end)
    loadOff()
  }
  async function archive(status: 'active' | 'archived') {
    if (status === 'archived' && !window.confirm(`Archive ${l.full_name}? Their draft days are discarded; published days and feedback are kept.`)) return
    if (status === 'archived') await supabase.rpc('discard_learner_drafts', { p_learner: l.id })
    await supabase.from('learners').update({ status }).eq('id', l.id)
    onSaved(status === 'archived' ? `${l.full_name} archived.` : `${l.full_name} restored.`)
  }
  async function remove() {
    if (!window.confirm(`Delete ${l.full_name} for good, with their schedule and all feedback about them? Archiving keeps the record instead.`)) return
    const { error } = await supabase.from('learners').delete().eq('id', l.id)
    onSaved(error ? error.message : `${l.full_name} deleted.`, error ? 'bad' : 'ok')
  }

  const oneOffs = off.filter((o) => !o.recurring)
  return (
    <div className="space-y-6 border-t border-line px-5 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <L text="Full name"><input className={field} value={d.full_name} onChange={(e) => set('full_name', e.target.value)} /></L>
        <L text="Email"><input type="email" className={field} value={d.email} onChange={(e) => set('email', e.target.value)} /></L>
        <L text="Phone"><input type="tel" className={field} value={d.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></L>
        <L text="Medical school or program"><input className={field} value={d.school ?? ''} onChange={(e) => set('school', e.target.value)} /></L>
        <L text="Learner">
          <select className={field} value={d.learner_type} onChange={(e) => set('learner_type', e.target.value as LearnerType)}>
            {(['resident', 'medical_student', 'other'] as LearnerType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </L>
        <L text="Level">
          <input className={field} list={`lv-${l.id}`} value={d.level ?? ''} onChange={(e) => set('level', e.target.value)} />
          <datalist id={`lv-${l.id}`}>{LEVELS[d.learner_type].map((x) => <option key={x} value={x} />)}</datalist>
        </L>
        {d.learner_type === 'resident' && <L text="Specialty"><input className={field} value={d.specialty ?? ''} onChange={(e) => set('specialty', e.target.value)} /></L>}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <L text="Rotation starts"><input type="date" className={field} value={d.rotation_start} onChange={(e) => set('rotation_start', e.target.value)} /></L>
          <L text="Rotation ends"><input type="date" className={field} value={d.rotation_end} min={d.rotation_start} onChange={(e) => set('rotation_end', e.target.value)} /></L>
        </div>
        <label className="block sm:col-span-2">
          <span className={labelCls}>Notes (only the director and admin see these)</span>
          <textarea rows={2} className={field} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      <div className="flex flex-wrap gap-3">
        <button className={primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <Link className={quiet} to={`/learners?learner=${l.id}`}>Their schedule</Link>
        <Link className={quiet} to="/learners/feedback">Feedback</Link>
      </div>

      <div className="space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">Days off</h3>
        <div className="flex flex-wrap items-end gap-2">
          <L text="Every">
            <select className={field} value={rule.weekday} onChange={(e) => setRule({ ...rule, weekday: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{WEEKDAY_NAMES[x]}</option>)}
            </select>
          </L>
          <L text="Why">
            <select className={field} value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value as OffKind })}>
              <option value="teaching">Mandatory teaching</option><option value="away">Away</option>
            </select>
          </L>
          <L text="Note"><input className={field} value={rule.reason ?? ''} onChange={(e) => setRule({ ...rule, reason: e.target.value })} /></L>
          <button className={quiet} onClick={addRule}>Add weekly day</button>
        </div>
        {d.off_rules.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {d.off_rules.map((r) => (
              <li key={r.weekday} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                Every {WEEKDAY_NAMES[r.weekday]} · {r.kind === 'teaching' ? 'teaching' : 'away'}{r.reason ? ` · ${r.reason}` : ''}
                <button className="text-muted hover:text-ink" aria-label={`Remove every ${WEEKDAY_NAMES[r.weekday]}`} onClick={() => removeRule(r.weekday)}>×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <L text="A particular day"><input type="date" className={field} value={pick.date} min={d.rotation_start} max={d.rotation_end} onChange={(e) => setPick({ ...pick, date: e.target.value })} /></L>
          <L text="Why">
            <select className={field} value={pick.kind} onChange={(e) => setPick({ ...pick, kind: e.target.value as OffKind })}>
              <option value="away">Away</option><option value="teaching">Mandatory teaching</option>
            </select>
          </L>
          <L text="Note"><input className={field} value={pick.reason} onChange={(e) => setPick({ ...pick, reason: e.target.value })} /></L>
          <button className={quiet} onClick={addOff} disabled={!pick.date}>Add day</button>
        </div>
        {oneOffs.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line">
            {oneOffs.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{dateLabel(o.off_date)} · {o.kind === 'teaching' ? 'Mandatory teaching' : 'Away'}{o.reason ? ` · ${o.reason}` : ''}</span>
                <button className="text-xs font-medium text-muted hover:text-ink" onClick={() => removeOff(o)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">{plural(off.length, 'day')} off in all. Freed-up days aren’t filled automatically — use “Draft free days” on the learner schedule.</p>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
        {l.status === 'active'
          ? <button className="font-medium text-muted hover:text-ink" onClick={() => archive('archived')}>Archive</button>
          : <button className="font-medium text-accent hover:underline" onClick={() => archive('active')}>Restore</button>}
        <button className="font-medium text-rose-700 hover:underline dark:text-rose-300" onClick={remove}>Delete</button>
      </div>
    </div>
  )
}

function L({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{text}</span>
      {children}
    </label>
  )
}
