import { LOGO_HEIGHT, type PublicSponsor } from '../lib/sponsors'

const safe = (u: string | null) => (u && /^https?:\/\//.test(u) ? u : null)

/**
 * Sponsors on an attendee page: grouped under their level (or its wording),
 * higher levels first and larger. A sponsor without a logo is shown by name.
 */
export function SponsorShowcase({ sponsors, compact = false }: { sponsors: PublicSponsor[]; compact?: boolean }) {
  if (sponsors.length === 0) return null
  const groups: { heading: string; list: PublicSponsor[] }[] = []
  for (const s of sponsors) {
    const heading = s.kind === 'exhibitor' ? 'Exhibitors' : s.tier
    const last = groups[groups.length - 1]
    if (last && last.heading === heading) last.list.push(s)
    else groups.push({ heading, list: [s] })
  }
  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <div key={g.heading + gi}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g.heading}</p>
          <ul className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3">
            {g.list.map((s, i) => {
              const h = s.kind === 'exhibitor' || compact ? 'h-7' : LOGO_HEIGHT[s.level] ?? 'h-7'
              const body = s.logo_url
                ? <span className="inline-flex items-center rounded-md bg-white px-2 py-1"><img src={s.logo_url} alt={s.name} title={s.name} className={`${h} w-auto max-w-[14rem] object-contain`} /></span>
                : <span className={`font-semibold text-ink ${s.level === 'platinum' || s.level === 'gold' ? 'text-base' : 'text-sm'}`}>{s.name}</span>
              const href = safe(s.website)
              return (
                <li key={s.name + i}>
                  {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-block hover:opacity-80">{body}</a> : body}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
