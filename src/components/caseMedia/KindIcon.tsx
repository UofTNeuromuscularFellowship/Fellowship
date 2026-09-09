import type { MediaKind } from '../../lib/caseMedia'

// ---------------------------------------------------------------------------
// One icon per media kind, drawn on the same 24-unit grid and stroke weight as
// the portal's navigation rail, so the library's own rail reads as part of the
// same app rather than a second design borrowed from somewhere else.
// ---------------------------------------------------------------------------

const PATHS: Record<MediaKind | 'all', React.ReactNode> = {
  // Everything: a stack of sheets.
  all: (
    <>
      <rect x="3.2" y="6.5" width="13" height="11" rx="1.6" />
      <path d="M7 4.2h11a1.8 1.8 0 0 1 1.8 1.8v9" />
    </>
  ),

  // A motor unit potential on a baseline.
  waveform: (
    <>
      <path d="M3 12.4h2.6l1.5-5.2 2.4 9.6 2-11.2 2.2 8 1.3-1.2H21" />
    </>
  ),

  // The transducer and its beam fanning into tissue.
  ultrasound: (
    <>
      <rect x="8.6" y="3.2" width="6.8" height="3.6" rx="1.2" />
      <path d="M9.2 7.6 4.6 18.2a12 12 0 0 0 14.8 0L14.8 7.6" />
      <path d="M8.2 13.4a9 9 0 0 0 7.6 0" />
    </>
  ),

  // A head in a scanner bore — the one MRI image everyone recognises.
  mri: (
    <>
      <rect x="2.6" y="5" width="18.8" height="14" rx="2.4" />
      <ellipse cx="12" cy="12" rx="4.4" ry="5.4" />
      <path d="M7.2 5v14M16.8 5v14" />
    </>
  ),

  // A slide under the microscope: the frame plus fibres in cross-section.
  biopsy: (
    <>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2" />
      <circle cx="8.6" cy="9" r="2.1" />
      <circle cx="14.4" cy="8.2" r="1.7" />
      <circle cx="11" cy="14.6" r="2.4" />
      <circle cx="16.6" cy="14.8" r="1.5" />
    </>
  ),

  // A hand testing power — an examination, not a person.
  exam: (
    <>
      <path d="M8.6 12.4V5.6a1.5 1.5 0 0 1 3 0v5.2" />
      <path d="M11.6 10.4V4.9a1.5 1.5 0 0 1 3 0v5.6" />
      <path d="M14.6 10.9V6.6a1.5 1.5 0 0 1 3 0v7.6a6.2 6.2 0 0 1-6.2 6.2h-.6a5 5 0 0 1-4.2-2.3l-2.3-3.6a1.6 1.6 0 0 1 2.5-2l1.8 1.9" />
    </>
  ),
}

export function KindIcon({
  kind,
  className = 'h-5 w-5',
}: {
  kind: MediaKind | 'all'
  className?: string
}) {
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
      {PATHS[kind]}
    </svg>
  )
}
