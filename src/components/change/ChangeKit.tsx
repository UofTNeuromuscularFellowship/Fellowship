import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { StepBar, Notice, primary, quiet, label as labelCls } from '../ui/Wizard'
import { dayLabel, plural, type ScheduleChange } from '../../lib/schedule'

// ---------------------------------------------------------------------------
// The frame and parts every "Make a change" flow shares: a title with a step
// bar, the table of affected days with a choice for each, who will be told,
// and the confirm step.
// ---------------------------------------------------------------------------

export function ChangeFrame({ title, steps, current, onJump, back = '/change', children }: {
  title: string; steps: string[]; current: number; onJump?: (i: number) => void; back?: string; children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to={back} className="text-xs font-medium text-muted hover:text-ink">← Make a change</Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">Step {current + 1} of {steps.length} · Nothing changes until you confirm.</p>
      </div>
      <StepBar steps={steps} current={current} onJump={onJump} />
      {children}
    </div>
  )
}

export function StepNav({ onBack, onNext, nextLabel = 'Continue →', nextDisabled, busy, children }: {
  onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean; children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
      {onBack && <button type="button" className={quiet} onClick={onBack} disabled={busy}>← Back</button>}
      {onNext && <button type="button" className={primary} onClick={onNext} disabled={nextDisabled || busy}>{busy ? 'Working…' : nextLabel}</button>}
      {children}
    </div>
  )
}

export interface DayRow {
  key: string
  date: string
  who: string
  current: string
  choice: string
  options: { value: string; label: string }[]
  include: boolean
  /** a warning shown under the row; the row can still be included */
  warn?: string | null
  /** why the row can't be included at all */
  blocked?: string | null
}

/** The affected days, one row each: what it is now, and what it becomes. */
export function DayTable({ rows, onChange, whoHeading = 'Fellow', emptyText, unit = 'day' }: {
  rows: DayRow[]; onChange: (rows: DayRow[]) => void; whoHeading?: string; emptyText?: string; unit?: string
}) {
  if (rows.length === 0) {
    return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{emptyText ?? 'No days are affected.'}</p>
  }
  const set = (i: number, patch: Partial<DayRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const included = rows.filter((r) => r.include && !r.blocked).length
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2 text-xs text-muted">
        <span>{plural(included, unit)} will change</span>
        {rows.some((r) => !r.blocked) && (
          <span className="flex gap-3">
            <button type="button" className="font-medium text-accent hover:underline"
              onClick={() => onChange(rows.map((r) => ({ ...r, include: !r.blocked })))}>Include all</button>
            <button type="button" className="font-medium text-accent hover:underline"
              onClick={() => onChange(rows.map((r) => ({ ...r, include: false })))}>None</button>
          </span>
        )}
      </div>
      {/* phones: one card per day */}
      <ul className="divide-y divide-line sm:hidden">
        {rows.map((r, i) => (
          <li key={r.key} className={`space-y-2 px-4 py-3 text-sm ${r.blocked || !r.include ? 'bg-paper/60' : ''}`}>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" aria-label={`Include ${dayLabel(r.date)}`} checked={r.include && !r.blocked}
                disabled={!!r.blocked} onChange={(e) => set(i, { include: e.target.checked })} />
              <span>
                <span className="block font-medium text-ink">{dayLabel(r.date)} · {r.who}</span>
                <span className="block text-xs text-muted">Now: {r.current}</span>
              </span>
            </label>
            <div className="pl-7">
              {r.options.length > 1 ? (
                <select value={r.choice} disabled={!!r.blocked || !r.include} aria-label={`Instead on ${dayLabel(r.date)}`}
                  onChange={(e) => set(i, { choice: e.target.value })}
                  className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink disabled:opacity-60">
                  {r.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : <span className="text-ink">→ {r.options[0]?.label}</span>}
              {r.blocked && <span className="mt-1 block text-xs text-muted">{r.blocked}</span>}
              {!r.blocked && r.warn && <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">{r.warn}</span>}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted">
            <th className="w-8 px-3 py-2" />
            <th className="px-2 py-2">Day</th>
            <th className="px-2 py-2">{whoHeading}</th>
            <th className="px-2 py-2">Now</th>
            <th className="px-2 py-2">Instead</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={`border-t border-line align-top ${r.blocked || !r.include ? 'bg-paper/60' : ''}`}>
              <td className="px-3 py-2.5">
                <input type="checkbox" aria-label={`Include ${dayLabel(r.date)}`} checked={r.include && !r.blocked}
                  disabled={!!r.blocked} onChange={(e) => set(i, { include: e.target.checked })} />
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 font-medium text-ink">{dayLabel(r.date)}</td>
              <td className="px-2 py-2.5 text-ink">{r.who}</td>
              <td className="px-2 py-2.5 text-muted">{r.current}</td>
              <td className="px-2 py-2.5">
                {r.options.length > 1 ? (
                  <select value={r.choice} disabled={!!r.blocked || !r.include} aria-label={`Instead on ${dayLabel(r.date)}`}
                    onChange={(e) => set(i, { choice: e.target.value })}
                    className="w-full min-w-[10rem] rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink disabled:opacity-60">
                    {r.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <span className="text-ink">{r.options[0]?.label}</span>
                )}
                {r.blocked && <span className="mt-1 block text-xs text-muted">{r.blocked}</span>}
                {!r.blocked && r.warn && <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">{r.warn}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

export function WhoIsTold({ names, notify, extra }: { names: string[]; notify: boolean; extra?: string[] }) {
  const all = [...names, ...(extra ?? [])]
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Who is told</p>
      {!notify ? (
        <p className="mt-1 text-sm text-muted">Nobody is emailed — you’ll tell people yourself.</p>
      ) : all.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Nobody needs an email — no published days change.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {all.map((n) => <li key={n} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink">{n}</li>)}
        </ul>
      )}
      {notify && all.length > 0 && <p className="mt-2 text-xs text-muted">Each person gets only their own changed days.</p>}
    </div>
  )
}

export function NotifyChoice({ notify, onChange }: { notify: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <input type="checkbox" className="mt-1" checked={notify} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold text-ink">Email the people affected</span>
        <span className="block text-xs text-muted">Leave this off only if you’ve already told them.</span>
      </span>
    </label>
  )
}

export function SummaryList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{k}</dt>
          <dd className="text-sm text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Shown after a change is applied. */
export function Applied({ changed, told, children, again, unit = 'day' }: {
  changed: number; told: number; children?: ReactNode; again?: () => void; unit?: string
}) {
  return (
    <div className="space-y-4">
      <Notice tone="ok">
        <strong>Done.</strong> {plural(changed, unit)} changed{told > 0 ? ` · ${plural(told, 'person', 'people')} emailed` : ''}.
        The change is listed under “Recent changes” on the schedule page.
      </Notice>
      {children}
      <div className="flex flex-wrap gap-3">
        <Link to="/change" className={quiet}>Make another change</Link>
        {again && <button type="button" className={quiet} onClick={again}>Start this one again</button>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

/** The last few changes to one schedule, for the bottom of the clinic and teaching pages. */
export function RecentChanges({ area }: { area: 'clinic' | 'teaching' }) {
  const [rows, setRows] = useState<(ScheduleChange & { by?: string })[] | null>(null)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('schedule_changes')
        .select('id, area, kind, summary, days_changed, people_told, changed_by, changed_at')
        .eq('area', area).order('changed_at', { ascending: false }).limit(8)
      const list = (data as ScheduleChange[]) ?? []
      const ids = Array.from(new Set(list.map((r) => r.changed_by).filter(Boolean))) as string[]
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: n } = await supabase.rpc('profile_names', { ids })
        for (const p of (n as { id: string; full_name: string }[]) ?? []) names[p.id] = p.full_name
      }
      setRows(list.map((r) => ({ ...r, by: r.changed_by ? names[r.changed_by] : undefined })))
    })()
  }, [area])
  if (!rows || rows.length === 0) return null
  return (
    <Card>
      <CardHeader title="Recent changes" sub="Made through “Make a change” or the setup steps" />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-3 text-sm">
            <p className="text-ink">{r.summary}</p>
            <p className="mt-0.5 text-xs text-muted">
              {new Date(r.changed_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
              {r.by ? ` · ${r.by}` : ''} · {plural(r.days_changed, area === 'clinic' ? 'day' : 'session')} changed
              {r.people_told > 0 ? ` · ${plural(r.people_told, 'person', 'people')} emailed` : ''}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
