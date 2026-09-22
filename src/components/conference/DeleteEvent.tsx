import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Card, CardHeader } from '../ui/Card'
import { friendly, input, type ConfEvent } from '../../lib/conference'
import { removeEventFiles } from './money/data'

// ---------------------------------------------------------------------------
// Delete an event for good: its program, invitations, RSVPs, messages,
// feedback, logistics, money and files, and any of its emails still waiting
// to go out. Typing the name is the confirmation. Archiving (in Settings) is
// the gentler option and is offered first once anyone has been invited.
// ---------------------------------------------------------------------------

export function DeleteEvent({ event, compact = false }: { event: ConfEvent; compact?: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const matches = typed.trim().toLowerCase() === event.name.trim().toLowerCase()

  async function remove() {
    setBusy(true); setErr(null)
    await removeEventFiles(event.id)
    const { error } = await supabase.rpc('conf_delete_event', { p_event: event.id })
    setBusy(false)
    if (error) { setErr(friendly(error.message)); return }
    navigate('/events', { replace: true, state: { deleted: event.name } })
  }

  const body = (
    <div className="space-y-3 text-sm">
      <p>
        This permanently deletes <strong>{event.name}</strong> and everything in it — the program, speakers, invitations
        and replies, messages, feedback, logistics, budget, payments, receipts and uploaded files. People you invited will
        no longer be able to open their links. This can’t be undone.
      </p>
      {event.status !== 'draft' && (
        <p className="text-muted">If you only want to close it, archive it instead: attendees keep their itinerary, feedback and letters.</p>
      )}
      <label className="block max-w-md">
        <span className="mb-1 block text-xs font-medium text-muted">Type the event’s name to confirm</span>
        <input id="del-name" className={input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      {err && <p className="text-rose-600">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          disabled={!matches || busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete this event'}</button>
        <button className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-accent"
          onClick={() => { setOpen(false); setTyped('') }}>Cancel</button>
      </div>
    </div>
  )

  if (compact) {
    return open ? <div className="rounded-lg border border-rose-300 bg-surface p-4 dark:border-rose-900">{body}</div> : (
      <button className="text-xs font-medium text-muted hover:text-rose-600" onClick={() => setOpen(true)}>Discard this event</button>
    )
  }
  return (
    <Card className="border-rose-300 dark:border-rose-900">
      <CardHeader title="Delete event" sub="Remove this event and everything in it."
        action={open ? undefined : (
          <button className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
            onClick={() => setOpen(true)}>Delete…</button>
        )} />
      {open && <div className="px-5 py-4">{body}</div>}
    </Card>
  )
}
