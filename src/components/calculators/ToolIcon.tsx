// ---------------------------------------------------------------------------
// One icon per calculator, on the same 24-unit grid and stroke weight as the
// portal's navigation rail and the image library's kind rail. Three rails in
// this app now; they have to look like they were drawn by the same hand.
//
// Each is deliberately two or three strokes. A first pass drew the anatomy
// faithfully — a myelin sheath with nodes, an F wave after an M wave — and at
// the 20px the rail actually renders it, the demyelination icon read as a
// strikethrough and the late-response icon read as noise. Detail that does not
// survive the size it is used at is decoration, so these say the ONE thing the
// tool measures: a ratio is two bars, a late response is a big spike then a
// small one, demyelination is a gap in a line.
// ---------------------------------------------------------------------------

export type ToolIconName = 'all' | 'tli' | 'fh' | 'srar' | 'cidp' | 'temp' | 'filter'

const PATHS: Record<ToolIconName, React.ReactNode> = {
  // A stack of sheets — every tool.
  all: (
    <>
      <rect x="3.4" y="7" width="12.6" height="10.6" rx="1.8" />
      <path d="M7.4 4.6h10.8a1.8 1.8 0 0 1 1.8 1.8v9" />
    </>
  ),

  // Terminal latency INDEX, set out as a fraction because that is what the
  // index is. The two terms differ sharply in length — a short distal segment
  // over a long proximal one — since three evenly-sized lines read as a
  // hamburger menu.
  tli: (
    <>
      <path d="M9.6 7.2h4.8" />
      <path d="M3.2 12h17.6" />
      <path d="M4.4 16.8h15.2" />
    </>
  ),

  // A late response: the big direct wave, then the small one that comes back.
  fh: (
    <>
      <path d="M2.6 17h2.4l2-9.6 2 9.6h2.6" />
      <path d="M11.6 17h2.2l1.4-5 1.4 5h2.8" />
    </>
  ),

  // A ratio of two amplitudes: one bar tall, one short.
  srar: (
    <>
      <path d="M3.2 19.6h17.6" />
      <path d="M8.2 19.6V5.6" />
      <path d="M15.6 19.6v-7.4" />
    </>
  ),

  // Demyelination: a nerve with a length of sheath missing from the middle.
  cidp: (
    <>
      <path d="M2.6 12h18.8" />
      <rect x="3" y="8.4" width="5.6" height="7.2" rx="2.4" />
      <rect x="15.4" y="8.4" width="5.6" height="7.2" rx="2.4" />
    </>
  ),

  // A thermometer.
  temp: (
    <>
      <path d="M13.6 13.4V5.2a2.4 2.4 0 0 0-4.8 0v8.2a4.2 4.2 0 1 0 4.8 0z" />
      <path d="M17.2 7.4h3.4M17.2 11h3.4" />
    </>
  ),

  // A band-pass: everything outside the band rolls away.
  filter: (
    <>
      <path d="M2.6 18.2h3.4c2.6 0 3-11 6-11s3.4 11 6 11h3.4" />
    </>
  ),
}

export function ToolIcon({
  name,
  className = 'h-6 w-6',
}: {
  name: ToolIconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}
