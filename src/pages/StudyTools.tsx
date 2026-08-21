import TestMode from './TestMode'

// ---------------------------------------------------------------------------
// Self-test page.
//
// This used to be a tab switcher over the EMG atlas, the NCS guide and Test
// mode. The atlas and the guide now live in the 3D Atlas, which shows the same
// clinical text alongside the anatomy — including the settings, distances,
// normal limits and side-to-side values that used to be here, via the shared
// MuscleDetail and StudyDetail components. Nothing clinical was dropped when
// the tabs went; it moved.
//
// The legacy /emg-atlas and /nerve-guide deep links redirect to the 3D Atlas.
// ---------------------------------------------------------------------------

export default function StudyTools() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Test Your Anatomy Knowledge
        </h1>
        <p className="mt-1 text-sm text-muted">
          Self-test on muscles, nerves and roots — the atlas and the nerve conduction guide are
          in the 3D Atlas
        </p>
      </div>

      <TestMode />
    </div>
  )
}
