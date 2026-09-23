import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Pieces shared by the step-by-step screens (Add people, first sign-in):
// the progress bar across the top, the big radio "cards" used for choices,
// and the form classes the portal's other forms use.
// ---------------------------------------------------------------------------

export const field = 'w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink'
export const label = 'mb-1 block text-xs font-medium text-muted'
export const primary =
  'inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50'
export const quiet =
  'inline-flex items-center justify-center rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink hover:border-accent disabled:opacity-50'
export const textBtn = 'text-sm font-medium text-muted hover:text-ink'

export function StepBar({ steps, current, onJump }: { steps: string[]; current: number; onJump?: (i: number) => void }) {
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Steps">
      {steps.map((s, i) => {
        const canJump = !!onJump && i < current
        const inner = (
          <>
            <span className={`block h-1.5 w-full rounded-full ${i <= current ? 'bg-accent' : 'bg-line'}`} />
            <span className={`mt-1.5 block truncate text-xs font-medium ${i === current ? 'text-ink' : 'text-muted'}`}>
              <span className="hidden sm:inline">{i + 1}. </span>{s}
            </span>
          </>
        )
        return (
          <li key={s} aria-current={i === current ? 'step' : undefined}>
            {canJump
              ? <button type="button" onClick={() => onJump!(i)} className="block w-full text-left hover:opacity-80">{inner}</button>
              : <div>{inner}</div>}
          </li>
        )
      })}
    </ol>
  )
}

/** A radio button drawn as a card, for choices that need a line of explanation. */
export function ChoiceCard({ name, checked, onChange, title, children }: {
  name: string; checked: boolean; onChange: () => void; title: string; children?: ReactNode
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${checked
      ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line bg-surface hover:border-accent'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {children && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{children}</span>}
      </span>
    </label>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'ok' | 'bad' | 'warn' | 'info'; children: ReactNode }) {
  const cls = tone === 'ok'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
    : tone === 'bad'
      ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100'
      : tone === 'warn'
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
        : 'border-line bg-paper text-ink'
  return <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

/** YYYY-MM-DD for a Date, on the viewer's own calendar. */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "Jul 1, 2027" from YYYY-MM-DD, without timezone drift. */
export function niceDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}
