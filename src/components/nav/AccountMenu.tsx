import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ThemeToggle } from './ThemeToggle'

// ---------------------------------------------------------------------------
// Who you are, how the portal looks, and the way out — in one place.
//
// These three used to sit apart and low: the appearance control at the foot of
// the icon rail, the name and Sign out at the foot of the area panel. Both
// columns stretch with the page rather than the window, so on the dashboard
// they landed around y=1346 in a 900px window — five hundred pixels below the
// fold, on a page most people never scroll to the end of.
//
// The rail is sticky and window-height now, which is the actual fix. This
// component is the second half: one button, always in the same corner, holding
// everything about "me" rather than scattering it down two columns.
// ---------------------------------------------------------------------------

/** Up to two initials. "Aaron Izenberg" -> AI, "Cher" -> C. */
function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AccountMenu({
  name,
  roleName,
  onSignOut,
  /** Which way the panel opens. The rail sits at the bottom, headers at the top. */
  align = 'up',
}: {
  name?: string | null
  roleName: string
  onSignOut: () => void
  align?: 'up' | 'down'
}) {
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null)

  // Rendered into <body>, not beside the button.
  //
  // The rail is a 76px column with overflow-y-auto, which clips a 240px panel
  // to a sliver. An absolutely-positioned menu inside it LOOKED fine to a
  // getBoundingClientRect check — the box is the right size and on screen —
  // and was visibly cut in half in a screenshot. A portal has no ancestor to
  // be clipped by.
  const MENU_W = 240
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const left = Math.min(Math.max(8, r.left), window.innerWidth - MENU_W - 8)
      setAt(
        align === 'up'
          ? { left, bottom: window.innerHeight - r.top + 8 }
          : { left: Math.min(left, window.innerWidth - MENU_W - 8), top: r.bottom + 8 },
      )
    }
    place()
    // Scrolling or resizing while it is open would leave it behind.
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // Pointerdown rather than click: a click listener closes the panel before
    // a button inside a scrolling page has finished being pressed.
    function onDown(e: PointerEvent) {
      const t = e.target as Node
      // The menu is portalled out of hostRef, so it needs its own check or a
      // click on the theme buttons would close the thing it is inside.
      if (hostRef.current?.contains(t)) return
      if ((t as Element)?.closest?.('[data-account-menu]')) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <div ref={hostRef} className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name ? `Account: ${name}` : 'Account'}
        title={name ?? 'Account'}
        className={`flex h-10 w-10 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
          open
            ? 'border-accent bg-accent text-white'
            : 'border-line bg-accent-soft text-accent hover:border-accent'
        }`}
      >
        {initials(name)}
      </button>

      {open && at && createPortal(
        <div
          role="menu"
          data-account-menu=""
          style={{ position: 'fixed', left: at.left, top: at.top, bottom: at.bottom, width: MENU_W }}
          className="z-50 rounded-lg border border-line bg-surface p-3 shadow-lg"
        >
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="text-xs text-muted">{roleName}</p>

          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Appearance
            </p>
            <ThemeToggle />
          </div>

          <button
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="mt-3 flex min-h-[38px] w-full items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-ink hover:border-accent hover:text-accent"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 17v1.6a1.9 1.9 0 0 1-1.9 1.9H5.9A1.9 1.9 0 0 1 4 18.6V5.4a1.9 1.9 0 0 1 1.9-1.9h7.2A1.9 1.9 0 0 1 15 5.4V7" />
              <path d="M10.5 12H21M17.6 8.4 21 12l-3.4 3.6" />
            </svg>
            Sign out
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
