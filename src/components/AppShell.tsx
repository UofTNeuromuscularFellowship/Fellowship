import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useNavGroups } from './nav/useNavGroups'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { roleLabel } from '../lib/format'
import { Waveform } from './ui/Waveform'
import { NavIcon } from './nav/NavIcon'
import { AccountMenu } from './nav/AccountMenu'
import { MENU_PATH, groupForPath, landingPath, overviewPath } from '../lib/navigation'

// ---------------------------------------------------------------------------
// The shell.
//
// Desktop: an icon rail on the far left for the seven areas, a panel beside it
// listing what is in the area you are in, and the page itself in the rest. The
// panel collapses, because someone deep in the 3D atlas wants the width back.
//
// Mobile: the same model, walked one screen at a time. The rail becomes a home
// screen of large tiles (/menu, pages/MobileMenu.tsx), a tile opens the area's
// tools as smaller tiles, and a small tile opens the tool. Signing in on a
// phone lands on that home screen, and "Menu" in the header goes back to it.
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
  const { profile, signOut, site, sites, isPlatformAdmin, switchSite } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const role = profile?.role
  const [panelOpen, setPanelOpen] = useCollapsedPanel()
  // A platform admin with no program sees only the Platform area.
  const groups = useNavGroups()
  const onMenu = location.pathname === MENU_PATH || location.pathname.startsWith(MENU_PATH + '/')
  const siteName = site?.short_name ?? site?.name ?? (isPlatformAdmin ? 'Platform' : '')
  const switchable = sites.length > 1 ? sites.map((s) => ({ id: s.id, name: s.name, active: s.is_active })) : undefined
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
        <Link to="/dashboard" className="mb-2 flex flex-col items-center" aria-label="Fellowship Portal" title={site?.name ?? undefined}>
          <Waveform className="h-4 w-12 text-accent" />
          {siteName && (
            <span className="mt-1 max-w-[68px] truncate text-center text-[9px] font-semibold uppercase tracking-wide text-muted">
              {siteName}
            </span>
          )}
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
            roleName={role ? roleLabel(role) : (isPlatformAdmin ? 'Platform admin' : '')}
            siteName={site?.name}
            sites={switchable}
            onSwitchSite={(id) => switchSite(id)}
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
        {/* Mobile header. "Menu" goes to the home screen of tiles. On the
            home screen itself it gives way to the program's name. */}
        <header
          className="sticky top-0 z-20 border-b border-line bg-surface md:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            {onMenu ? (
              <span className="flex min-h-[40px] items-center gap-2">
                <Waveform className="h-4 w-10 text-accent" />
              </span>
            ) : (
              <Link
                to={MENU_PATH}
                aria-label="Menu"
                className="flex min-h-[40px] items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Menu
              </Link>
            )}
            <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-semibold text-ink">
              {onMenu ? (siteName || 'Fellowship Portal') : (active?.label ?? siteName ?? 'Fellowship Portal')}
            </span>
            {/* Top-right, the usual place on a phone, and in a header that was
                already sticky. Opens downward for the same reason. */}
            <AccountMenu
              name={profile?.full_name}
              roleName={role ? roleLabel(role) : (isPlatformAdmin ? 'Platform admin' : '')}
              siteName={site?.name}
              sites={switchable}
              onSwitchSite={(id) => switchSite(id)}
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

    </div>
  )
}
