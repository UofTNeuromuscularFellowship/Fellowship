import { Card } from './ui/Card'

// Reserved slot for a labelled placement diagram. If `src` is provided (a URL
// or imported asset), the image is shown; otherwise a placeholder box is drawn
// so a diagram can be dropped in later without touching the page layout.
export function DiagramPlaceholder({
  src,
  alt,
  label,
  caption,
}: {
  src?: string
  alt: string
  label: string
  caption?: string
}) {
  return (
    <Card>
      <div className="px-5 py-4">
        <h3 className="font-display text-sm font-semibold text-ink">{label}</h3>
        {src ? (
          <img src={src} alt={alt} className="mt-2 w-full rounded-md border border-line" />
        ) : (
          <div className="mt-2 flex flex-col items-center justify-center rounded-md border border-dashed border-line bg-paper/60 px-4 py-10 text-center">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <p className="mt-2 text-sm font-medium text-ink">Diagram placeholder</p>
            <p className="text-xs text-muted">{caption ?? 'A labelled placement diagram will appear here.'}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
