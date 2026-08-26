// ---------------------------------------------------------------------------
// Viewer control bar.
//
// Every control the anatomy needs, in one row, in the order people reach for
// them: what dragging does, then zoom, then get-me-back-to-something-sensible.
//
// The controls that were here before were spread between a checkbox labelled
// "Drag to pan", two text buttons, and a sentence in the card header that
// nobody reads. Rotate and Pan are now a visible pair showing which one is
// live, zoom is a button as well as a wheel gesture, and the hint line says
// what the mouse does in six words.
//
// Icons are inline SVG on purpose: the portal ships no icon font or library,
// and one <svg> is cheaper than either.
// ---------------------------------------------------------------------------

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const RotateIcon = (
  <Icon>
    <path d="M12 4a8 8 0 1 1-5.7 2.4" />
    <path d="M6 3v3.5h3.5" />
    <ellipse cx="12" cy="12" rx="8" ry="3.4" />
  </Icon>
)

const PanIcon = (
  <Icon>
    <path d="M12 3v18M3 12h18" />
    <path d="M12 3 9.8 5.4M12 3l2.2 2.4M12 21l-2.2-2.4M12 21l2.2-2.4" />
    <path d="M3 12l2.4-2.2M3 12l2.4 2.2M21 12l-2.4-2.2M21 12l-2.4 2.2" />
  </Icon>
)

const ZoomInIcon = (
  <Icon>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
  </Icon>
)

const ZoomOutIcon = (
  <Icon>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21M7.5 10.5h6" />
  </Icon>
)

const CentreIcon = (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icon>
)

const ResetIcon = (
  <Icon>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v4.5h4.5" />
  </Icon>
)

function Button({
  label,
  icon,
  onClick,
  active,
  title,
  disabled,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
  title: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line text-muted hover:text-ink'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function ViewerToolbar({
  panMode,
  onPanMode,
  onZoomIn,
  onZoomOut,
  onCentre,
  onReset,
  canCentre,
}: {
  panMode: boolean
  onPanMode: (on: boolean) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onCentre: () => void
  onReset: () => void
  /** Centre needs something highlighted to centre ON. */
  canCentre: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line bg-paper/60 px-5 py-2.5">
      {/* Rotate and Pan are one either/or choice, so they sit together in a
          single group with the live one filled in. */}
      <div className="flex items-center gap-1 rounded-md" role="group" aria-label="Drag mode">
        <Button
          label="Rotate"
          icon={RotateIcon}
          active={!panMode}
          onClick={() => onPanMode(false)}
          title="Rotate: drag to turn the limb"
        />
        <Button
          label="Pan"
          icon={PanIcon}
          active={panMode}
          onClick={() => onPanMode(true)}
          title="Pan: drag to slide the limb across the screen"
        />
      </div>

      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />

      <Button label="Zoom in" icon={ZoomInIcon} onClick={onZoomIn} title="Zoom in" />
      <Button label="Zoom out" icon={ZoomOutIcon} onClick={onZoomOut} title="Zoom out" />

      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />

      <Button
        label="Centre"
        icon={CentreIcon}
        onClick={onCentre}
        disabled={!canCentre}
        title={
          canCentre
            ? 'Centre the highlighted structure on screen, keeping the angle and zoom'
            : 'Select a muscle or study first — Centre moves the view onto what is highlighted'
        }
      />
      <Button label="Reset" icon={ResetIcon} onClick={onReset} title="Back to the starting view" />

      {/* Right-drag is always the OTHER one, because the buttons swap which
          gesture the left button does. Saying "right-drag to pan" while pan is
          already on the left button would send someone hunting for a control
          they already have. */}
      <p className="ml-auto text-xs text-muted">
        {panMode
          ? 'Drag to pan · right-drag to rotate · scroll to zoom'
          : 'Drag to rotate · right-drag or two fingers to pan · scroll to zoom'}
      </p>
    </div>
  )
}
