import { useState } from 'react'
import EmgAtlas from './EmgAtlas'
import NerveGuide from './NerveGuide'
import TestMode from './TestMode'

// ---------------------------------------------------------------------------
// Combined "study tools" page: a tab switcher between the EMG atlas, the
// nerve conduction (NCS) guide, and Test mode. Each tab renders the existing
// tool component. `initialTab` lets the legacy deep-link routes open directly
// on the matching tab.
// ---------------------------------------------------------------------------

export type StudyTab = 'emg' | 'ncs' | 'test'

const TABS: { key: StudyTab; label: string }[] = [
  { key: 'emg', label: 'EMG atlas' },
  { key: 'ncs', label: 'NCS guide' },
  { key: 'test', label: 'Test mode' },
]

export default function StudyTools({ initialTab = 'emg' }: { initialTab?: StudyTab }) {
  const [tab, setTab] = useState<StudyTab>(initialTab)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Study tools</h1>
        <p className="mt-1 text-sm text-muted">
          EMG needle-localization atlas, nerve conduction guide, and self-test — pick one below
        </p>
      </div>

      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Study tools">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 font-display text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'emg' && <EmgAtlas />}
        {tab === 'ncs' && <NerveGuide />}
        {tab === 'test' && <TestMode />}
      </div>
    </div>
  )
}
