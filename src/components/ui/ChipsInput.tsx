import { useState } from 'react'

export function ChipsInput({
  label, values, onChange, suggestions = [], placeholder,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  suggestions?: string[]
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const listId = `dl-${label.replace(/\s+/g, '-').toLowerCase()}`

  function add(v: string) {
    const t = v.trim()
    if (!t) return
    if (!values.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...values, t])
    setDraft('')
  }

  return (
    <div>
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-line p-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-xs text-accent">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-accent/60 hover:text-accent">×</button>
          </span>
        ))}
        <input
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) }
          }}
          onBlur={() => add(draft)}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
    </div>
  )
}
