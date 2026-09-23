import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// The frame around every page an invitee or speaker opens from an email.
//
// These people are not portal members and should not be shown the portal:
// no rail, no sign-in prompt, no program menu. The frame says whose event
// this is and who to contact, and nothing else.
// ---------------------------------------------------------------------------

export function PublicFrame({
  title, kicker, organizer, organizerEmail, children, footer, topRight, logoUrl,
}: {
  title?: string
  kicker?: string
  organizer?: string | null
  organizerEmail?: string | null
  children: ReactNode
  footer?: ReactNode
  /** e.g. "Signed in as … · My courses · Sign out" */
  topRight?: ReactNode
  /** The event's or series' logo, above the title. */
  logoUrl?: string | null
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface print:hidden">
        <div className="mx-auto max-w-3xl px-4 py-5">
          {topRight && <div className="mb-3 flex justify-end">{topRight}</div>}
          {logoUrl && <img src={logoUrl} alt="" className="mb-3 block max-h-14 max-w-[220px] object-contain" />}
          {kicker && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{kicker}</p>}
          {title && <h1 className="mt-1 font-display text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>}
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">{children}</main>
      <footer className="border-t border-line print:hidden">
        <div className="mx-auto max-w-3xl space-y-1 px-4 py-6 text-xs text-muted">
          {organizer && (
            <p>
              Organized by {organizer}
              {organizerEmail && <> · <a className="text-accent hover:underline" href={`mailto:${organizerEmail}`}>{organizerEmail}</a></>}
            </p>
          )}
          {footer}
          <p>This page is private to you. Please don’t forward the link.</p>
        </div>
      </footer>
    </div>
  )
}

export function Panel({ title, sub, children, tone }: { title?: string; sub?: string; children: ReactNode; tone?: 'accent' }) {
  return (
    <section className={`rounded-lg border ${tone === 'accent' ? 'border-accent bg-accent-soft' : 'border-line bg-surface'} p-5`}>
      {title && <h2 className="font-display text-lg font-semibold">{title}</h2>}
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      <div className={title || sub ? 'mt-3' : ''}>{children}</div>
    </section>
  )
}

export function Notice({ tone, children }: { tone: 'ok' | 'bad' | 'info'; children: ReactNode }) {
  const cls = tone === 'ok'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
    : tone === 'bad'
      ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100'
      : 'border-line bg-paper text-ink'
  return <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>
}

export function Invalid({ what = 'invitation' }: { what?: string }) {
  return (
    <PublicFrame title="This link isn’t working">
      <Panel>
        <p className="text-sm">
          We couldn’t find this {what}. The link may have been copied incompletely, or the event may no longer be
          available. Please use the most recent email you received, or reply to it to reach the organizer.
        </p>
      </Panel>
    </PublicFrame>
  )
}

/** Supabase RPC errors arrive as "message"; strip Postgres framing for display. */
export function rpcMessage(e: { message?: string } | null | undefined, fallback: string): string {
  const m = e?.message?.trim()
  if (!m) return fallback
  if (/invalid link/i.test(m)) return 'This link is no longer valid.'
  return m.charAt(0).toUpperCase() + m.slice(1)
}
