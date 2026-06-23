// Signature element: a thin EMG-style trace. A quiet nod to the program's
// focus on electrodiagnostics (EMG / nerve conduction). Used once, in the
// login hero and the sidebar mark.
export function Waveform({ className = '', stroke = 'currentColor' }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 240 40" className={className} fill="none" aria-hidden="true">
      <path
        d="M0 20 H60 l6 -14 6 28 6 -20 6 12 H120 l8 -8 6 16 6 -28 5 22 H240"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
