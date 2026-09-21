import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { friendly, input, primaryBtn, quietBtn, money, safeUrl } from '../../lib/conference'

// ---------------------------------------------------------------------------
// One editable list, driven by a column spec.
//
// Accommodations, catering, materials, sponsors, budget, tasks and rooms are
// all "a list of things with fields, per event". Writing seven bespoke editors
// would give seven slightly different ways to add, edit and delete; this gives
// one. Row-level security does the access control — every conf_* table is
// readable and writable only by the program's own director or admin.
// ---------------------------------------------------------------------------

export type ColType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox' | 'email' | 'url'

export interface Column {
  key: string
  label: string
  type?: ColType
  options?: { value: string; label: string }[]
  required?: boolean
  /** Shown in the editor but not as a list column. */
  formOnly?: boolean
  placeholder?: string
}

type Row = Record<string, unknown> & { id: string }

export function RecordTable({
  table, eventId, columns, title, sub, empty, addLabel, defaults = {}, orderBy = 'id', footer, onChange,
}: {
  table: string
  eventId: string
  columns: Column[]
  title: string
  sub?: string
  empty: string
  addLabel: string
  defaults?: Record<string, unknown>
  orderBy?: string
  footer?: (rows: Row[]) => ReactNode
  onChange?: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase.from(table).select('*').eq('event_id', eventId).order(orderBy)
    if (error) setMsg(friendly(error.message))
    setRows((data as Row[]) ?? [])
  }
  useEffect(() => { load() }, [table, eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  function open(row: Row | 'new') {
    setEditing(row)
    const d: Record<string, unknown> = row === 'new' ? { ...defaults } : { ...row }
    // A date column may be backed by a timestamp (conf_tasks.done_at); the
    // date input only understands YYYY-MM-DD.
    for (const c of columns) if (c.type === 'date' && typeof d[c.key] === 'string') d[c.key] = (d[c.key] as string).slice(0, 10)
    setDraft(d)
    setMsg(null)
  }

  async function save() {
    for (const c of columns) {
      if (c.required && (draft[c.key] == null || String(draft[c.key]).trim() === '')) {
        setMsg(`${c.label} is required.`)
        return
      }
    }
    setBusy(true)
    const payload: Record<string, unknown> = {}
    for (const c of columns) {
      let v = draft[c.key]
      if (c.type === 'number' || c.type === 'money') v = v === '' || v == null ? null : Number(v)
      else if (c.type === 'checkbox') v = Boolean(v)
      else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim()
      payload[c.key] = v ?? null
    }
    const res = editing === 'new'
      ? await supabase.from(table).insert({ ...payload, event_id: eventId })
      : await supabase.from(table).update(payload).eq('id', (editing as Row).id)
    setBusy(false)
    if (res.error) { setMsg(friendly(res.error.message)); return }
    setEditing(null)
    await load()
    onChange?.()
  }

  async function remove(row: Row) {
    if (!window.confirm('Delete this entry?')) return
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    if (error) { setMsg(friendly(error.message)); return }
    await load()
    onChange?.()
  }

  const listCols = columns.filter((c) => !c.formOnly)

  function show(c: Column, v: unknown): ReactNode {
    if (v == null || v === '') return <span className="text-muted">—</span>
    if (c.type === 'checkbox') return v ? 'Yes' : 'No'
    if (c.type === 'money') return money(Number(v))
    if (c.type === 'date') {
      const [y, m, d] = String(v).slice(0, 10).split('-').map(Number)
      return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    }
    if (c.type === 'select') return c.options?.find((o) => o.value === v)?.label ?? String(v)
    if (c.type === 'url') {
      const href = safeUrl(String(v))
      return href
        ? <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">Link</a>
        : <span className="text-muted">{String(v)}</span>
    }
    if (c.type === 'email') return <a href={`mailto:${v}`} className="text-accent hover:underline">{String(v)}</a>
    return String(v)
  }

  return (
    <Card>
      <CardHeader
        title={title}
        sub={sub}
        action={editing ? undefined : <button className={quietBtn} onClick={() => open('new')}>{addLabel}</button>}
      />
      {msg && <p className="border-b border-line px-5 py-2 text-sm text-rose-600">{msg}</p>}

      {editing && (
        <div className="border-b border-line bg-paper px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {columns.map((c) => (
              <label key={c.key} className={`block ${c.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                <span className="mb-1 block text-xs font-medium text-muted">
                  {c.label}{c.required && ' *'}
                </span>
                {c.type === 'textarea' ? (
                  <textarea id={`${table}-${c.key}`} rows={3} className={input} placeholder={c.placeholder}
                    value={String(draft[c.key] ?? '')} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
                ) : c.type === 'select' ? (
                  <select id={`${table}-${c.key}`} className={input} value={String(draft[c.key] ?? '')}
                    onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}>
                    {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : c.type === 'checkbox' ? (
                  <input id={`${table}-${c.key}`} type="checkbox" className="h-4 w-4"
                    checked={Boolean(draft[c.key])} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.checked })} />
                ) : (
                  <input id={`${table}-${c.key}`} className={input} placeholder={c.placeholder}
                    type={c.type === 'money' || c.type === 'number' ? 'number' : c.type === 'date' ? 'date'
                      : c.type === 'email' ? 'email' : c.type === 'url' ? 'url' : 'text'}
                    step={c.type === 'money' ? '0.01' : undefined}
                    value={draft[c.key] == null ? '' : String(draft[c.key])}
                    onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button className={quietBtn} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
                {listCols.map((c) => <th key={c.key} className="px-5 py-2 font-medium">{c.label}</th>)}
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  {listCols.map((c) => (
                    <td key={c.key} className={`px-5 py-2.5 text-ink ${c.type === 'money' || c.type === 'number' ? 'tabular-nums' : ''} ${c.type === 'date' || c.type === 'money' ? 'whitespace-nowrap' : ''}`}>
                      {show(c, r[c.key])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">
                    <button className="text-xs font-medium text-accent hover:underline" onClick={() => open(r)}>Edit</button>
                    <button className="ml-3 text-xs font-medium text-muted hover:text-rose-600" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer && rows.length > 0 && <div className="border-t border-line px-5 py-3">{footer(rows)}</div>}
    </Card>
  )
}
