import type { IconName } from '../../lib/navigation'

// ---------------------------------------------------------------------------
// The seven rail icons.
//
// Drawn here rather than pulled from an icon set: they are on one 24-unit grid
// with one stroke weight, and two of them (the case log, the EMG toolkit) have
// no good stock equivalent for what this fellowship actually does. A rail is
// judged on whether the icons read as one family, and mixing a stock set with
// two hand-drawn exceptions is exactly how that fails.
//
// currentColor throughout, so the rail's active and inactive states are one
// text-colour class rather than two icon variants.
// ---------------------------------------------------------------------------

const PATHS: Record<IconName, React.ReactNode> = {
  // A house — the week at a glance.
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h3.5v-4.5h3V20H17a1 1 0 0 0 1-1V9.8" />
    </>
  ),

  // A calendar with a marked day — where you are and when.
  clinic: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
      <rect x="7" y="13" width="4" height="3.5" rx="0.7" fill="currentColor" stroke="none" />
    </>
  ),

  // A lectern with a raised screen — a teaching session, not a school.
  teaching: (
    <>
      <rect x="3.5" y="4" width="17" height="10.5" rx="1.6" />
      <path d="M12 14.5V20M8.5 20h7" />
      <path d="M7.5 8h6M7.5 11h4" />
    </>
  ),

  // A clipboard with ticked lines — cases logged.
  caselog: (
    <>
      <path d="M9 4.5h6a1 1 0 0 1 1 1V7H8V5.5a1 1 0 0 1 1-1z" />
      <path d="M8 6H6.5a1.5 1.5 0 0 0-1.5 1.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V7.5A1.5 1.5 0 0 0 17.5 6H16" />
      <path d="M8.5 11.5l1.4 1.4 2.4-2.6M8.5 16.2l1.4 1.4 2.4-2.6" />
      <path d="M14.5 11.4h2.2M14.5 16.1h2.2" />
    </>
  ),

  // A motor unit potential on a baseline — the one shape every EMG tool here
  // has in common.
  emg: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M5.8 12.6h2.1l1.2-4 1.9 7.4 1.6-8.6 1.7 6.2 1-1h3.1" />
    </>
  ),

  // An open book — how the fellowship runs.
  program: (
    <>
      <path d="M12 7.2C10.4 5.9 8.3 5.3 5 5.3v12.4c3.3 0 5.4.6 7 1.9 1.6-1.3 3.7-1.9 7-1.9V5.3c-3.3 0-5.4.6-7 1.9z" />
      <path d="M12 7.2V19.6" />
    </>
  ),

  // A cog — settings.
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.2 14.2a1.5 1.5 0 0 0 .3 1.65l.05.05a1.8 1.8 0 1 1-2.55 2.55l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37V19.7a1.8 1.8 0 1 1-3.6 0v-.1a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.05.05A1.8 1.8 0 1 1 4.5 15.9l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H3.3a1.8 1.8 0 1 1 0-3.6h.1a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65L4.42 7A1.8 1.8 0 1 1 6.97 4.5l.05.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37V3.3a1.8 1.8 0 1 1 3.6 0v.1a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05A1.8 1.8 0 1 1 19.5 7l-.05.05a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.18a1.8 1.8 0 1 1 0 3.6h-.1a1.5 1.5 0 0 0-1.37.9z" />
    </>
  ),

  // Stacked buildings — the programs using this portal (platform admin only).
  platform: (
    <>
      <path d="M3.5 20h17" />
      <path d="M5 20V8.5l5-2.5v14" />
      <path d="M10 20V11l6.5-3v12" />
      <path d="M16.5 20v-8l2.5 1.2V20" />
      <path d="M7 11h1M7 14h1M12.5 12.5h1.5M12.5 15.5h1.5" />
    </>
  ),
}

export function NavIcon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}
