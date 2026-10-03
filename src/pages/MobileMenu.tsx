import { Link, Navigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { NavIcon } from '../components/nav/NavIcon'
import { useNavGroups } from '../components/nav/useNavGroups'
import { useAuth } from '../context/AuthContext'
import { MENU_PATH, PHONE_QUERY, isPhone, menuPath, overviewPath } from '../lib/navigation'

// ---------------------------------------------------------------------------
// The phone's home screen.
//
//   /menu            one large tile per area (the sidebar's areas)
//   /menu/:groupId   that area's tools, as smaller tiles
//
// Pages rather than an overlay, so the phone's own back gesture goes up one
// level. On a computer both addresses go to their desktop equivalents.
// ---------------------------------------------------------------------------

function usePhone() {
  const [phone, setPhone] = useState(isPhone)
  useEffect(() => {
    let mq: MediaQueryList
    try { mq = window.matchMedia(PHONE_QUERY) } catch { return }
    const on = () => setPhone(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return phone
}

export default function MobileMenu() {
  const { groupId } = useParams()
  const groups = useNavGroups()
  const { profile } = useAuth()
  const phone = usePhone()
  const group = groupId ? groups.find((g) => g.id === groupId) : undefined

  if (!phone) return <Navigate to={group ? overviewPath(group.id) : '/dashboard'} replace />
  if (groupId && !group) return <Navigate to={MENU_PATH} replace />

  if (!group) {
    const first = profile?.full_name?.split(' ')[0]
    return (
      <div>
        <h1 className="font-display text-xl font-bold text-ink">{first ? `Hi ${first}` : 'Welcome'}</h1>
        <p className="mt-1 text-sm text-muted">Where to?</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {groups.map((g) => {
            // An area holding one tool goes straight to it: a screen with a
            // single tile on it is a tap that teaches nothing.
            const single = g.items.length === 1 ? g.items[0] : null
            return (
              <Link
                key={g.id}
                to={single ? single.to : menuPath(g.id)}
                className="flex min-h-[128px] flex-col items-start rounded-2xl border border-line bg-surface p-4 text-left shadow-sm active:bg-paper"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <NavIcon name={g.icon} className="h-6 w-6" />
                </span>
                <span className="mt-3 block font-display text-base font-semibold text-ink">{g.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {single ? single.label : `${g.items.length} tools`}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link to={MENU_PATH} className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-accent">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 6l-6 6 6 6" />
        </svg>
        All areas
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
          <NavIcon name={group.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-lg font-bold text-ink">{group.label}</h1>
          <p className="text-xs text-muted">{group.tagline}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {group.items.map((i) => (
          <Link
            key={i.to}
            to={i.to}
            className="flex min-h-[92px] flex-col rounded-xl border border-line bg-surface p-3 active:bg-paper"
          >
            <span className="block text-sm font-semibold leading-snug text-ink">{i.label}</span>
            <span className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted">{i.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
