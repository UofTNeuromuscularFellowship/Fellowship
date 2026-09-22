// A row of choices for the sub-pages inside one section of an event.
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string, number?][]; onChange: (v: T) => void; label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
      {options.map(([k, text, badge]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${value === k ? 'bg-accent text-white' : 'text-muted hover:bg-paper hover:text-ink'}`}>
          {text}
          {badge ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${value === k ? 'bg-white/25' : 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'}`}>{badge}</span> : null}
        </button>
      ))}
    </div>
  )
}
