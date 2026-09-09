import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { roleLabel } from '../lib/format'
import { Waveform } from './ui/Waveform'
import { NavIcon } from './nav/NavIcon'
import { AccountMenu } from './nav/AccountMenu'
import { groupForPath, landingPath, navFor, overviewPath, type NavGroup } from '../lib/navigation'

// ---------------------------------------------------------------------------
// The shell.
//
// Desktop: an icon rail on the far left for the seven areas, a panel beside it
// listing what is in the area you are in, and the page itself in the rest. The
// panel collapses, because someone deep in the 3D atlas wants the width back.
//
// Mobile: the same model, walked one screen at a time. The rail becomes a home
// screen of tiles, a tile opens the area's list, and the list opens the tool.
// Back is always one tap and always goes up exactly one level.
//
// Both read from lib/navigation.ts. Neither has a list of its own, which is
// what stops the two drifting apart.
// ---------------------------------------------------------------------------

const PANEL_KEY = 'nmf-panel-open'

function useCollapsedPanel() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(PANEL_KEY) !== 'closed'
    } catch {
      return true
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed')
    } catch {
      // A forgotten preference is not worth failing a render over.
    }
  }, [open])
  return [open, setOpen] as const
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const role = profile?.role
  const [panelOpen, setPanelOpen] = useCollapsedPanel()
  const [mobileNav, setMobileNav] = useState(false)

  const hideClinic = role === 'supervisor' && profile?.teaching_only === true
  const groups = navFor(role, { hideClinic })
  const active = groupForPath(groups, location.pathname) ?? groups[0]

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-paper">
      {/* ================= desktop: the icon rail ================= */}
      {/* sticky + h-screen + self-start is the fix for the controls at the foot
          of this column drifting off the bottom of the page. A flex child
          stretches to the height of the TALLEST sibling by default, so on a
          1400px dashboard the rail was 1400px tall and mt-auto put the account
          controls 500px below the fold. Pinned to the window instead, its foot
          is always the foot of the screen. */}
      <nav
        aria-label="Areas"
        className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col items-center gap-1 self-start overflow-y-auto border-r border-line bg-surface py-3 md:flex"
      >
        {/* A plain Link, not a NavLink: it points at the dashboard, so on the
            dashboard a NavLink would mark itself aria-current alongside the
            Home icon and a screen reader would hear two current items. */}
        <Link to="/dashboard" className="mb-2 flex flex-col items-center" aria-label="Fellowship Portal">
          <Waveform className="h-4 w-12 text-accent" />
        </Link>

        {groups.map((g) => {
          const on = active?.id === g.id
          return (
            <NavLink
              key={g.id}
              to={landingPath(g)}
              aria-current={on ? 'page' : undefined}
              className={`flex w-[64px] flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition-colors ${
                on ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-paper hover:text-ink'
              }`}
            >
              <NavIcon name={g.icon} />
              <span className="text-[10px] font-semibold leading-tight">{g.label}</span>
            </NavLink>
          )
        })}

        {/* Bottom-left, the usual home for an account control in an icon rail,
            and now genuinely always on screen. Name, role, appearance and sign
            out are all behind it rather than spread down two columns. */}
        <div className="mt-auto flex flex-col items-center gap-2 pt-3">
          <AccountMenu
            name={profile?.full_name}
            roleName={role ? roleLabel(role) : ''}
            onSignOut={handleSignOut}
            align="up"
          />
        </div>
      </nav>

      {/* ================= desktop: the area panel ================= */}
      {active && (
        <div
          className={`print:hide-panel sticky top-0 hidden h-screen shrink-0 self-start border-r border-line bg-surface md:flex md:flex-col ${
            panelOpen ? 'w-64' : 'w-[44px]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-3">
            {panelOpen && (
              <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-ink">
                {active.label}
              </p>
            )}
            <button
              onClick={() => setPanelOpen((o) => !o)}
              aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'}
              title={panelOpen ? 'Collapse' : 'Expand'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-paper hover:text-ink"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d={panelOpen ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6'} />
              </svg>
            </button>
          </div>

          {panelOpen && (
            <div className="flex-1 overflow-y-auto p-2">
              {/* No Overview entry for an area with one tool — it would list a
                  single card describing the only other link in this panel. */}
              {active.items.length > 1 && (
                <NavLink
                  to={overviewPath(active.id)}
                  className={({ isActive }) =>
                    `mb-1 block rounded-md px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-paper hover:text-ink'
                    }`
                  }
                >
                  Overview
                </NavLink>
              )}
              {active.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-paper hover:text-ink'
                    }`
                  }
                >
                  {i.label}
                </NavLink>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ================= the page ================= */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header. "Menu" opens the home screen of areas rather than a
            long flat list — the same model as the desktop rail, one level at a
            time. */}
        <header
          className="sticky top-0 z-20 border-b border-line bg-surface md:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <button
              onClick={() => setMobileNav(true)}
              aria-label="Menu"
              className="flex min-h-[40px] items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Menu
            </button>
            <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-semibold text-ink">
              {active?.label ?? 'Fellowship Portal'}
            </span>
            {/* Top-right, the usual place on a phone, and in a header that was
                already sticky. Opens downward for the same reason. */}
            <AccountMenu
              name={profile?.full_name}
              roleName={role ? roleLabel(role) : ''}
              onSignOut={handleSignOut}
              align="down"
            />
          </div>
        </header>

        <main
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          {children}
        </main>
      </div>

      {mobileNav && (
        <MobileNav
          groups={groups}
          activeId={active?.id}
          onClose={() => setMobileNav(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/**
 * The phone's navigation: a home screen of areas, then that area's list.
 *
 * Two levels, never more, and the back arrow always goes up exactly one. The
 * old mobile menu was one long scroll of every page in the portal, which is
 * fine at eight items and unusable at eighteen.
 *
 * Navigation only. Who you are, the appearance control and sign out live in
 * the account button in the header, which is one tap away and does not need a
 * second copy in here that would then have to stay in step with the first.
 */
function MobileNav({
  groups,
  activeId,
  onClose,
}: {
  groups: NavGroup[]
  activeId?: string
  onClose: () => void
}) {
  // Opens on the home screen, not on the area you happen to be in: the reason
  // to open the menu is usually to go somewhere else.
  const [openGroup, setOpenGroup] = useState<NavGroup | null>(null)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') (openGroup ? setOpenGroup(null) : onClose())
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [openGroup, onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-paper md:hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-3">
        {openGroup ? (
          <button
            onClick={() => setOpenGroup(null)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-accent"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 6l-6 6 6 6" />
            </svg>
            All areas
          </button>
        ) : (
          <span className="px-2 font-display text-base font-semibold text-ink">Where to?</span>
        )}
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md border border-line text-muted"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {!openGroup ? (
          <>
            {/* The home screen: one tile per area, two across. */}
            <div className="grid grid-cols-2 gap-3">
              {groups.map((g) => {
                // An area with one thing in it goes straight there. Making
                // someone tap through a list of one is a step that teaches
                // nothing.
                const single = g.items.length === 1 ? g.items[0] : null
                const inner = (
                  <>
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-lg ${
                        activeId === g.id ? 'bg-accent text-white' : 'bg-accent-soft text-accent'
                      }`}
                    >
                      <NavIcon name={g.icon} className="h-6 w-6" />
                    </span>
                    <span className="mt-2 block text-sm font-semibold text-ink">{g.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted">
                      {single ? single.label : `${g.items.length} tools`}
                    </span>
                  </>
                )
                const cls =
                  'flex min-h-[112px] flex-col items-start rounded-xl border border-line bg-surface p-3 text-left active:bg-paper'
                return single ? (
                  <NavLink key={g.id} to={single.to} onClick={onClose} className={cls}>
                    {inner}
                  </NavLink>
                ) : (
                  <button key={g.id} onClick={() => setOpenGroup(g)} className={cls}>
                    {inner}
                  </button>
                )
              })}
            </div>

          </>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <NavIcon name={openGroup.icon} />
              </span>
              <div>
                <p className="font-display text-base font-semibold text-ink">{openGroup.label}</p>
                <p className="text-xs text-muted">{openGroup.tagline}</p>
              </div>
            </div>
            <div className="space-y-2">
              {openGroup.items.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  onClick={onClose}
                  className="block rounded-xl border border-line bg-surface px-4 py-3 active:bg-paper"
                >
                  <span className="block text-sm font-semibold text-ink">{i.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{i.blurb}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
