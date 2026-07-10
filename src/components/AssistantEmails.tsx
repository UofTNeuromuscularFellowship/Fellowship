import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, CardHeader } from './ui/Card'

export function AssistantEmailsCard({ userId }: { userId: string }) {
  const [emails, setEmails] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<'idle' | 'saved' | string>('idle')

  useEffect(() => {
    supabase.from('users').select('assistant_emails').eq('id', userId).maybeSingle()
      .then(({ data }) => setEmails(((data?.assistant_emails as string[]) ?? [])))
  }, [userId])

  async function save(next: string[]) {
    setEmails(next)
    const { error } = await supabase.from('users')
      .update({ assistant_emails: next, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) { setStatus(error.message); return }
    setStatus('saved'); setTimeout(() => setStatus('idle'), 2000)
  }

  function add() {
    const v = draft.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { setStatus('Please enter a valid email address.'); return }
    if (emails.includes(v)) { setDraft(''); return }
    save([...emails, v]); setDraft('')
  }

  return (
    <Card>
      <CardHeader
        title="My admin assistant"
        sub="Add your assistant's email and they'll receive a copy of every email the portal sends you — teaching reminders, schedule updates, and requests — so they can manage your schedule."
      />
      <div className="space-y-3 px-5 py-4">
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {emails.map((e) => (
              <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink">
                {e}
                <button onClick={() => save(emails.filter((x) => x !== e))} className="text-muted hover:text-ink">×</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder="assistant@hospital.ca, then press Enter"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <button onClick={add}
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-accent hover:underline">
            Add
          </button>
        </div>
        <p className="text-xs text-muted">
          {status === 'saved' ? 'Saved ✓' : status !== 'idle' ? status : 'Changes save automatically.'}
        </p>
      </div>
    </Card>
  )
}
