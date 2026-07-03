import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { shortDate } from '../lib/format'

interface Rotation {
  id: string
  fellow_id: string | null
  fellow_label: string | null
  rotation_date: string
  site_code: string
  is_draft: boolean
  is_protected: boolean | null
}

interface AwayDate { fellow_id: string; away_date: string }
interface TemplateRow { id: string; fellow_label: string; weekday: number; site_code: string }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export default function ClinicRotations() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const isFellow = profile?.role === 'fellow'
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [away, setAway] = useState<AwayDate[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [showTemplate, setShowTemplate] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  async function load() {
    const horizon = new Date(); horizon.setDate(horizon.getDate() + 90)
    let q = supabase
      .from('clinic_rotations')
      .select('id, fellow_id, fellow_label, rotation_date, site_code, is_draft, is_protected')
      .gte('rotation_date', today)
      .lte('rotation_date', horizon.toISOString().slice(0, 10))
      .order('rotation_date')
    if (isFellow && profile) q = q.eq('fellow_id', profile.id).eq('is_draft', false)
    if (!isFellow && !isDirector) q = q.eq('is_draft', false)
    const { data, error } = await q
    if (error) setMsg(error.message)
    setRotations((data as Rotation[]) ?? [])

    if (isDirector) {
      const { data: aw } = await supabase
        .from('fellow_away_dates')
        .select('fellow_id, away_date')
        .gte('away_date', today)
      setAway((aw as AwayDate[]) ?? [])
    }
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const awaySet = useMemo(() => new Set(away.map((a) => `${a.fellow_id}|${a.away_date}`)), [away])
  const draftCount = useMemo(() => rotations.filter((r) => r.is_draft).length, [rotations])
  const conflicts = useMemo(
    () => rotations.filter((r) => r.fellow_id && awaySet.has(`${r.fellow_id}|${r.rotation_date}`)),
    [rotations, awaySet]
  )

  // Group rotations by ISO week (Monday key)
  const weeks = useMemo(() => {
    const map = new Map<string, Rotation[]>()
    for (const r of rotations) {
      const d = new Date(r.rotation_date + 'T00:00:00')
      const day = d.getDay() === 0 ? 7 : d.getDay()
      const mon = new Date(d); mon.setDate(d.getDate() - day + 1)
      const key = mon.toISOString().slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rotations])

  async function removeRotation(id: string) {
    const { error } = await supabase.from('clinic_rotations').delete().eq('id', id)
    if (error) setMsg(error.message)
    else load()
  }

  if (!profile) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Clinic schedule</h1>
        <p className="mt-1 text-sm text-muted">
          {isFellow ? 'Your upcoming clinic assignments' : 'Clinic assignments for the next 12 weeks'}
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {isDirector && conflicts.length > 0 && (
        <div className="rounded-md border-2 border-red-500 bg-surface px-4 py-3">
          <p className="text-sm font-semibold text-ink">
            ⚠ {conflicts.length} clinic assignment{conflicts.length === 1 ? '' : 's'} conflict with approved vacation
          </p>
          <p className="mt-0.5 text-xs text-muted">Conflicting days are outlined in red below — remove the fellow's name if needed.</p>
        </div>
      )}

      {isDirector && (
        <GeneratorToolbar draftCount={draftCount} onChanged={load} onError={setMsg}
          onToggleTemplate={() => setShowTemplate(!showTemplate)} showTemplate={showTemplate} />
      )}

      {isDirector && showTemplate && <TemplateEditor onError={setMsg} />}

      {weeks.length === 0 ? (
        <Card><p className="px-5 py-4 text-sm text-muted">No upcoming clinic assignments.</p></Card>
      ) : (
        weeks.map(([weekStart, rows]) => (
          <Card key={weekStart}>
            <CardHeader title={`Week of ${shortDate(weekStart)}`} />
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const conflicted = r.fellow_id && awaySet.has(`${r.fellow_id}|${r.rotation_date}`)
                const d = new Date(r.rotation_date + 'T00:00:00')
                const wd = WEEKDAYS[(d.getDay() === 0 ? 7 : d.getDay()) - 1] ?? ''
                return (
                  <li key={r.id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm ${
                      conflicted ? 'border-l-4 border-red-500 bg-red-50' : ''
                    }`}>
                    <div>
                      <span className="font-medium text-ink">{wd} {shortDate(r.rotation_date)}</span>
                      <span className="ml-2 text-ink">{r.site_code}</span>
                      {!isFellow && r.fellow_label && <span className="ml-2 text-muted">{r.fellow_label}</span>}
                      {r.is_draft && (
                        <span className="ml-2 rounded-full border border-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Draft</span>
                      )}
                      {conflicted && (
                        <span className="ml-2 rounded-full border border-red-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">On vacation</span>
                      )}
                    </div>
                    {isDirector && (
                      <button onClick={() => removeRotation(r.id)} className="text-xs font-medium text-muted hover:text-ink">
                        Remove
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  )
}

function GeneratorToolbar({ draftCount, onChanged, onError, onToggleTemplate, showTemplate }: {
  draftCount: number; onChanged: () => void; onError: (m: string) => void
  onToggleTemplate: () => void; showTemplate: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function run(kind: 'generate' | 'publish' | 'discard') {
    setBusy(kind)
    let res
    if (kind === 'generate') {
      if (!to) { setBusy(null); onError('Choose an end date (up to ~3 months out).'); return }
      res = await supabase.rpc('generate_clinic_schedule', { p_from: from, p_to: to })
    } else if (kind === 'publish') {
      res = await supabase.rpc('publish_clinic_drafts')
    } else {
      res = await supabase.rpc('discard_clinic_drafts')
    }
    setBusy(null)
    if (res.error) { onError(res.error.message); return }
    onChanged()
  }

  return (
    <Card>
      <CardHeader
        title="Generate schedule"
        sub="Fills the range from the weekly template, skipping approved vacations and away providers. Generated days land as drafts for review."
        action={
          <button onClick={onToggleTemplate} className="text-sm font-medium text-accent hover:underline">
            {showTemplate ? 'Hide template' : 'Edit weekly template'}
          </button>
        }
      />
      <div className="flex flex-wrap items-end gap-2 px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">To (max ~3 months)</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
        </div>
        <button onClick={() => run('generate')} disabled={busy !== null}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy === 'generate' ? 'Generating…' : 'Generate (draft)'}
        </button>
        {draftCount > 0 && (
          <>
            <span className="text-sm text-muted">{draftCount} draft day{draftCount === 1 ? '' : 's'} pending</span>
            <button onClick={() => run('publish')} disabled={busy !== null}
              className="rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-soft disabled:opacity-50">
              {busy === 'publish' ? 'Publishing…' : 'Publish drafts'}
            </button>
            <button onClick={() => run('discard')} disabled={busy !== null}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-muted hover:text-ink disabled:opacity-50">
              {busy === 'discard' ? 'Discarding…' : 'Discard drafts'}
            </button>
          </>
        )}
      </div>
    </Card>
  )
}

function TemplateEditor({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<TemplateRow[]>([])
  const [fellowLabel, setFellowLabel] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [site, setSite] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('clinic_template')
      .select('id, fellow_label, weekday, site_code')
      .order('fellow_label')
      .order('weekday')
    setRows((data as TemplateRow[]) ?? [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!fellowLabel.trim() || !site.trim()) return
    setBusy(true)
    const { error } = await supabase.from('clinic_template').insert({
      fellow_label: fellowLabel.trim(), weekday, site_code: site.trim(),
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    setSite(''); load()
  }

  async function remove(id: string) {
    await supabase.from('clinic_template').delete().eq('id', id)
    load()
  }

  const byFellow = new Map<string, TemplateRow[]>()
  for (const r of rows) {
    if (!byFellow.has(r.fellow_label)) byFellow.set(r.fellow_label, [])
    byFellow.get(r.fellow_label)!.push(r)
  }

  return (
    <Card>
      <CardHeader title="Weekly template" sub="The repeating pattern the generator copies into each week" />
      <div className="space-y-4 px-5 py-4">
        {Array.from(byFellow.entries()).map(([label, list]) => (
          <div key={label}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{WEEKDAYS[r.weekday - 1]} — {r.site_code}</span>
                  <button onClick={() => remove(r.id)} className="text-xs font-medium text-muted hover:text-ink">Remove</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Fellow</label>
            <input value={fellowLabel} onChange={(e) => setFellowLabel(e.target.value)} placeholder="e.g., Paula"
              className="w-32 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Day</label>
            <select value={weekday} onChange={(e) => setWeekday(parseInt(e.target.value, 10))}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Site code</label>
            <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="e.g., CK SMH"
              className="w-36 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <button onClick={add} disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            Add slot
          </button>
        </div>
      </div>
    </Card>
  )
}
