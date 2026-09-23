import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from '../components/ui/Card'
import { Notice, primary, quiet } from '../components/ui/Wizard'
import {
  addDays, CLINIC_COLUMNS, clinicCount, clinicRunsOn, dateLabel, dayLabel, isoWeekday, loadRotations, mondayOf, plural, toIso,
  WEEKDAY_SHORT, type Clinic, type Rotation,
} from '../lib/schedule'
import { LEARNER_COLUMNS, learnerSummary, type Learner, type LearnerDay, type OffDate } from '../lib/learners'

// ---------------------------------------------------------------------------
// The learner schedule. Clinic days are drafted into places the fellows
// haven't filled (up to each clinic's learner places), any day can be changed
// by hand, and publishing emails each learner their days and each supervisor
// the learners coming to them.
// ---------------------------------------------------------------------------

type LClinic = Clinic & { learner_capacity: number }
type Msg = { tone: 'ok' | 'bad' | 'warn'; text: string } | null

interface World {
  learners: Learner[]
  days: LearnerDay[]
  off: OffDate[]
  clinics: LClinic[]
  rotations: Rotation[]
  providerAway: Set<string>
}

export default function LearnerSchedule() {
  const [qs] = useSearchParams()
  const focus = qs.get('learner')
  const [w, setW] = useState<World | null>(null)
  const [msg, setMsg] = useState<Msg>(() => {
    const n = qs.get('drafted')
    if (n == null) return null
    return Number(n) > 0
      ? { tone: 'ok', text: `Learner added, and ${plural(Number(n), 'clinic day')} drafted. Check them below, then publish.` }
      : { tone: 'warn', text: 'Learner added, but no clinic places were free on their days. Choose clinics by hand below, or give some clinics more learner places.' }
  })
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set(focus ? [focus] : []))
  const [showPast, setShowPast] = useState(false)
  const today = toIso(new Date())

  const load = useCallback(async () => {
    const { data: ls } = await supabase.from('learners').select(LEARNER_COLUMNS).eq('status', 'active').order('rotation_start').order('full_name')
    const learners = ((ls as Learner[]) ?? [])
    const from = learners.reduce((m, l) => (l.rotation_start < m ? l.rotation_start : m), today)
    const to = learners.reduce((m, l) => (l.rotation_end > m ? l.rotation_end : m), today)
    const ids = learners.map((l) => l.id)
    const [days, off, cl, rot, pa] = await Promise.all([
      ids.length ? supabase.from('learner_rotations').select('id, learner_id, rotation_date, clinic_template_id, site_code, provider_name, supervisor_id, is_draft, status, feedback_requested_at').in('learner_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('learner_off_dates').select('id, learner_id, off_date, kind, reason, recurring').in('learner_id', ids) : Promise.resolve({ data: [] }),
      supabase.from('clinic_template').select(`${CLINIC_COLUMNS}, learner_capacity`).order('weekday').order('site_code'),
      loadRotations(from, to),
      supabase.from('provider_away_dates').select('provider_id, away_date').gte('away_date', from).lte('away_date', to),
    ])
    setW({
      learners,
      days: (days.data as LearnerDay[]) ?? [],
      off: (off.data as OffDate[]) ?? [],
      clinics: (cl.data as LClinic[]) ?? [],
      rotations: rot.data,
      providerAway: new Set(((pa.data as { provider_id: string; away_date: string }[]) ?? []).map((a) => `${a.provider_id}|${a.away_date}`)),
    })
  }, [today])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (w?.learners ?? []).filter((l) => showPast || l.rotation_end >= today), [w, showPast, today])
  const drafts = (w?.days ?? []).filter((d) => d.is_draft)
  const draftLearners = new Set(drafts.map((d) => d.learner_id))
  const draftSupervisors = new Set(drafts.map((d) => d.supervisor_id).filter(Boolean))

  async function run(fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: (d: unknown) => string) {
    setBusy(true); setMsg(null)
    const { data, error } = await fn()
    setBusy(false)
    setMsg(error ? { tone: 'bad', text: error.message } : { tone: 'ok', text: ok(data) })
    load()
  }
  const draftAll = () => {
    const ls = shown.filter((l) => l.rotation_end >= today)
    if (!ls.length) return
    const from = ls.reduce((m, l) => (l.rotation_start < m ? l.rotation_start : m), ls[0].rotation_start)
    const to = ls.reduce((m, l) => (l.rotation_end > m ? l.rotation_end : m), ls[0].rotation_end)
    run(() => supabase.rpc('generate_learner_schedule', { p_from: from < today ? today : from, p_to: to, p_learner: null }),
      (n) => (n ? `${plural(n as number, 'clinic day')} drafted. Check them, then publish.` : 'No new days to draft — every free day is already filled, or no clinic has a learner place.'))
  }
  const publish = (learner: string | null) => {
    const n = learner ? drafts.filter((d) => d.learner_id === learner).length : drafts.length
    if (!window.confirm(`Publish ${plural(n, 'draft day')}? ${learner ? 'The learner and their supervisors are' : 'Each learner and supervisor is'} emailed the days.`)) return
    run(() => supabase.rpc('publish_learner_schedule', { p_learner: learner }),
      (d) => { const r = d as { published: number; told: number }; return `${plural(r.published, 'day')} published · ${plural(r.told, 'person', 'people')} emailed.` })
  }
  const discard = (learner: string | null) => {
    if (!window.confirm('Discard the draft days? Published days stay as they are.')) return
    run(() => supabase.rpc('discard_learner_drafts', { p_learner: learner }), (n) => `${plural(n as number, 'draft day')} discarded.`)
  }

  if (!w) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Learner schedule</h1>
          <p className="mt-1 text-sm text-muted">Residents and medical students fill clinic places the fellows haven’t taken.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/learners/new" className={quiet}>Add a learner</Link>
          <button className={quiet} onClick={draftAll} disabled={busy || shown.length === 0}>Draft clinic days</button>
          <button className={primary} onClick={() => publish(null)} disabled={busy || drafts.length === 0}>
            Publish{drafts.length ? ` ${plural(drafts.length, 'day')}` : ''}
          </button>
        </div>
      </div>

      {drafts.length > 0 && (
        <Notice tone="warn">
          <strong>{plural(drafts.length, 'draft day')}</strong> for {plural(draftLearners.size, 'learner')} — nobody has been told yet.
          Publishing emails {plural(draftLearners.size, 'learner')} and {plural(draftSupervisors.size, 'supervisor')}.{' '}
          <button className="font-medium underline" onClick={() => discard(null)} disabled={busy}>Discard all drafts</button>
        </Notice>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {w.learners.length === 0 ? (
        <Card>
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-ink">No learners yet.</p>
            <p className="mt-1 text-sm text-muted">Add a resident or medical student with their rotation dates and days off.</p>
            <Link to="/learners/new" className={`${primary} mt-4`}>Add a learner</Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((l) => (
            <LearnerCard key={l.id} l={l} w={w} open={open.has(l.id)} busy={busy}
              onToggle={() => setOpen((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n })}
              onPublish={() => publish(l.id)} onDiscard={() => discard(l.id)}
              onDraft={() => run(() => supabase.rpc('generate_learner_schedule', { p_from: l.rotation_start < today ? today : l.rotation_start, p_to: l.rotation_end, p_learner: l.id }),
                (n) => (n ? `${plural(n as number, 'clinic day')} drafted for ${l.full_name}.` : `No free clinic places on ${l.full_name}’s remaining days.`))}
              onChanged={(t, tone = 'ok') => { setMsg({ tone, text: t }); load() }} />
          ))}
          {w.learners.some((l) => l.rotation_end < today) && (
            <button className="text-sm font-medium text-accent hover:underline" onClick={() => setShowPast(!showPast)}>
              {showPast ? 'Hide finished rotations' : 'Show finished rotations'}
            </button>
          )}
        </div>
      )}

      <LearnerPlaces clinics={w.clinics} onSaved={load} />
    </div>
  )
}

function LearnerCard({ l, w, open, busy, onToggle, onDraft, onPublish, onDiscard, onChanged }: {
  l: Learner; w: World; open: boolean; busy: boolean
  onToggle: () => void; onDraft: () => void; onPublish: () => void; onDiscard: () => void
  onChanged: (t: string, tone?: 'ok' | 'bad') => void
}) {
  const today = toIso(new Date())
  const mine = w.days.filter((d) => d.learner_id === l.id)
  const byDate = new Map(mine.map((d) => [d.rotation_date, d]))
  const offBy = new Map(w.off.filter((o) => o.learner_id === l.id).map((o) => [o.off_date, o]))
  const drafts = mine.filter((d) => d.is_draft).length
  const published = mine.length - drafts
  const [saving, setSaving] = useState<string | null>(null)

  const weeks: string[] = []
  for (let m = mondayOf(l.rotation_start); m <= l.rotation_end; m = addDays(m, 7)) weeks.push(m)

  async function setDay(date: string, clinic: string) {
    setSaving(date)
    const { error } = await supabase.rpc('set_learner_day', { p_learner: l.id, p_date: date, p_clinic: clinic || null })
    setSaving(null)
    const was = byDate.get(date)
    if (error) onChanged(error.message, 'bad')
    else onChanged(was && !was.is_draft ? `${dayLabel(date)} changed — ${l.full_name} and the supervisors were emailed.` : `${dayLabel(date)} updated (draft).`)
  }

  function options(date: string) {
    return w.clinics.filter((c) => c.provider_id && clinicRunsOn(c, date, w) ).map((c) => {
      const fellows = clinicCount(w, c, date)
      const learners = w.days.filter((d) => d.rotation_date === date && d.site_code === c.site_code && d.supervisor_id === c.provider_id && d.learner_id !== l.id).length
      const full = fellows >= c.fellow_capacity ? 'fellows full' : learners >= c.learner_capacity ? 'learner places full' : null
      return { id: c.id, label: `${c.site_code} · ${c.provider_name}${full ? ` (${full})` : ''}` }
    })
  }

  const rotationDays: string[] = []
  for (let d = l.rotation_start; d <= l.rotation_end; d = addDays(d, 1)) if (isoWeekday(d) <= 5) rotationDays.push(d)

  /** One day: what it is, and (for today onward) a choice of clinic. */
  function cell(d: string, heading: string) {
    const day = byDate.get(d)
    const off = offBy.get(d)
    const past = d < today
    const cls = day ? (day.is_draft ? 'border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/30' : 'border-accent/60 bg-accent-soft') : 'border-line'
    const here = day ? `${day.site_code}${day.provider_name ? ` · ${day.provider_name}` : ''}` : ''
    return (
      <div className={`rounded-md border px-1.5 py-1 ${cls}`}>
        <span className="block text-[11px] text-muted">{heading}{off ? ` · ${off.kind === 'teaching' ? 'Teaching' : 'Away'}` : ''}{day?.is_draft ? ' · draft' : ''}</span>
        {off && !day ? (
          <span className="block truncate text-xs text-muted" title={off.reason ?? ''}>{off.reason || 'Not in clinic'}</span>
        ) : past ? (
          <span className="block truncate text-xs text-ink" title={here}>{here || '—'}</span>
        ) : (
          <select aria-label={`${l.full_name} on ${dayLabel(d)}`} title={here || 'No clinic'} disabled={saving === d || busy}
            className="w-full truncate rounded border-0 bg-transparent p-0 text-xs text-ink focus:ring-1 focus:ring-accent"
            value={day?.clinic_template_id ?? ''} onChange={(e) => setDay(d, e.target.value)}>
            <option value="">No clinic</option>
            {day && !day.clinic_template_id && <option value="" disabled>{day.site_code}</option>}
            {options(d).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
      </div>
    )
  }

  return (
    <Card>
      <button className="flex w-full flex-wrap items-start justify-between gap-3 px-5 py-4 text-left" onClick={onToggle} aria-expanded={open}>
        <span className="min-w-0">
          <span className="block font-semibold text-ink">{l.full_name}</span>
          <span className="block text-xs text-muted">{learnerSummary(l)} · {dateLabel(l.rotation_start)} – {dateLabel(l.rotation_end)}</span>
        </span>
        <span className="text-right text-xs text-muted">
          {plural(published, 'published day')}
          {drafts > 0 && <span className="block font-medium text-amber-700 dark:text-amber-300">{plural(drafts, 'draft day')}</span>}
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <button className={quiet} onClick={onDraft} disabled={busy || l.rotation_end < today}>Draft free days</button>
            <button className={primary} onClick={onPublish} disabled={busy || drafts === 0}>Publish {l.full_name.split(' ')[0]}’s schedule</button>
            {drafts > 0 && <button className="px-2 text-sm font-medium text-muted hover:text-ink" onClick={onDiscard} disabled={busy}>Discard drafts</button>}
            <Link to={`/learners/people?learner=${l.id}`} className="px-2 py-2 text-sm font-medium text-accent hover:underline">Details & days off</Link>
          </div>
          {/* phones: one day per row */}
          <ul className="space-y-1.5 sm:hidden">
            {rotationDays.map((d) => <li key={d}>{cell(d, dayLabel(d))}</li>)}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[46rem] table-fixed text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  <th className="w-24 px-2 py-2">Week of</th>
                  {[1, 2, 3, 4, 5].map((d) => <th key={d} className="px-1 py-2">{WEEKDAY_SHORT[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {weeks.map((m) => (
                  <tr key={m} className="border-t border-line align-top">
                    <td className="px-2 py-2 text-xs text-muted">{dateLabel(m).replace(/, \d{4}$/, '')}</td>
                    {[0, 1, 2, 3, 4].map((i) => {
                      const d = addDays(m, i)
                      if (d < l.rotation_start || d > l.rotation_end) return <td key={d} className="px-1 py-1.5" />
                      return <td key={d} className="px-1 py-1.5">{cell(d, d.slice(8))}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            <span className="mr-3 inline-block h-3 w-3 rounded-sm border border-dashed border-amber-400 align-middle" /> draft
            <span className="ml-4 mr-3 inline-block h-3 w-3 rounded-sm border border-accent/60 bg-accent-soft align-middle" /> published
            · Changing a published day emails the learner and the supervisors straight away.
          </p>
        </div>
      )}
    </Card>
  )
}

function LearnerPlaces({ clinics, onSaved }: { clinics: LClinic[]; onSaved: () => void }) {
  const [openCard, setOpenCard] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const list = clinics.filter((c) => c.provider_id)
  async function save(c: LClinic, v: number) {
    if (!(v >= 0 && v <= 10) || v === c.learner_capacity) return
    const { error } = await supabase.from('clinic_template').update({ learner_capacity: v }).eq('id', c.id)
    setErr(error ? error.message : null)
    onSaved()
  }
  return (
    <Card>
      <CardHeader title="Learner places per clinic" sub="How many learners each clinic can take on a day, as well as its fellows. 0 means no learners."
        action={<button className="text-sm font-medium text-accent hover:underline" onClick={() => setOpenCard(!openCard)}>{openCard ? 'Close' : 'Change'}</button>} />
      {openCard && (
        <div className="px-5 py-4">
          {err && <Notice tone="bad">{err}</Notice>}
          <p className="mb-3 text-xs text-muted">Learners are only drafted into a clinic with a named supervisor, on a day its fellow places aren’t all taken.</p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {list.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-ink">{c.site_code} · {c.provider_name}</span>
                  <span className="block text-xs text-muted">{c.recurrence === 'dates' ? 'Particular dates' : `Every ${WEEKDAY_SHORT[c.weekday]}`} · {plural(c.fellow_capacity, 'fellow place')}</span>
                </span>
                <label className="flex items-center gap-2 text-xs text-muted">
                  Learners
                  <input type="number" min={0} max={10} defaultValue={c.learner_capacity} aria-label={`Learner places at ${c.site_code} with ${c.provider_name}`}
                    className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
                    onBlur={(e) => save(c, Number(e.target.value))} />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
