import { useEffect, useState } from 'react'
import { apply, readChoice, saveChoice, watchSystem, type ThemeChoice } from '../../lib/theme'

// ---------------------------------------------------------------------------
// Light / Dark / System, as a three-way segmented control.
//
// Three buttons rather than a two-state switch, because "follow my device" is a
// real answer and a switch cannot express it — a phone set to turn dark at
// sunset should take the portal with it, and a toggle forces the reader to
// choose a side and then keep re-choosing.
// ---------------------------------------------------------------------------

const OPTIONS: Array<{ id: ThemeChoice; label: string; icon: React.ReactNode }> = [
  {
    id: 'light',
    label: 'Light',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
      </>
    ),
  },
  {
    id: 'system',
    label: 'Auto',
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="12" rx="2" />
        <path d="M8.5 20h7M12 16.5V20" />
      </>
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />,
  },
]

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice())

  // While the choice is "system", a change on the device has to reach the page
  // live. Without this the portal only follows the device at page load.
  useEffect(() => {
    apply(choice)
    if (choice !== 'system') return
    return watchSystem(() => apply('system'))
  }, [choice])

  function pick(next: ThemeChoice) {
    setChoice(next)
    saveChoice(next)
  }

  return (
    <div
      role="group"
      aria-label="Appearance"
      className="inline-flex rounded-md border border-line bg-paper p-0.5"
    >
      {OPTIONS.map((o) => {
        const on = choice === o.id
        return (
          <button
            key={o.id}
            onClick={() => pick(o.id)}
            aria-pressed={on}
            title={o.id === 'system' ? 'Follow this device' : o.label}
            // Bigger in the full form, which is where a finger uses it — the
            // phone menu and the Settings page. The compact form sits in the
            // desktop rail and is only ever clicked.
            className={`flex items-center gap-1.5 rounded text-xs font-semibold transition-colors ${
              compact ? 'min-h-[30px] px-2' : 'min-h-[38px] px-3'
            } ${
              on ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {o.icon}
            </svg>
            {!compact && o.label}
            {compact && <span className="sr-only">{o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
