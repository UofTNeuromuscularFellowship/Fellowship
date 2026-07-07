import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Card, CardHeader } from '../components/ui/Card'
import { shortDate } from '../lib/format'

interface Request {
  id: string
  fellow_id: string
  start_date: string
  end_date: string
  note: string | null
  status: 'pending' | 'approved' | 'denied'
  created_at: string
}

export default function Vacation() {
  const { profile } = useAuth()
  const isDirector = profile?.role === 'director'
  const isFellow = profile?.role === 'fellow'
  const isProvider = profile?.role === 'supervisor' || profile?.role === 'director'
  const [requests, setRequests] = useState<Request[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('vacation_requests')
      .select('id, fellow_id, start_date, end_date, note, status, created_at')
      .order('created_at', { ascending: false })
    if (error) setMsg(error.message)
    const rows = (data as Request[]) ?? []
    setRequests(rows)
    if (isDirector && rows.length > 0) {
      try {
        const ids = Array.from(new Set(rows.map((r) => r.fellow_id)))
        const { data: n } = await supabase.rpc('profile_names', { ids })
        const map: Record<string, string> = {}
        for (const x of (n as { id: string; full_name: string }[]) ?? []) map[x.id] = x.full_name
        setNames(map)
      } catch { /* names optional */ }
    }
  }

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!start || !end || !profile) return
    if (end < start) { setMsg('End date must be on or after the start date.'); return }
    setBusy(true)
    const { error } = await supabase.from('vacation_requests').insert({
      fellow_id: profile.id, start_date: start, end_date: end, note: note.trim() || null,
    })
    setBusy(false)
    if (error) { setMsg(error.message); return }
    setStart(''); setEnd(''); setNote(''); load()
  }

  async function decide(id: string, approve: boolean) {
    const { error } = await supabase.rpc('decide_vacation', { p_request: id, p_approve: approve })
    if (error) setMsg(error.message)
    else load()
  }

  const statusStyle: Record<string, string> = {
    pending: 'text-muted',
    approved: 'text-accent font-semibold',
    denied: 'text-muted line-through',
  }

  if (!profile) return null
  const pending = requests.filter((r) => r.status === 'pending')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Vacation & away dates</h1>
        <p className="mt-1 text-sm text-muted">
          {isFellow
            ? 'Request vacation days — the fellowship director reviews each request.'
            : 'Mark the dates you are away. Away dates are skipped during schedule generation, and any conflict with an already-published clinic is flagged for the director.'}
        </p>
      </div>

      {msg && (
        <div className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {msg} <button className="ml-2 font-medium text-accent" onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      {isProvider && profile && <ProviderAwayDates providerId={profile.id} onError={setMsg} />}

      {isFellow && (
        <Card>
          <CardHeader title="Request vacation" />
          <div className="flex flex-wrap items-end gap-2 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">First day away</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Last day away</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-muted">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
            </div>
            <button onClick={submit} disabled={busy || !start || !end}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? 'Sending…' : 'Submit request'}
            </button>
          </div>
        </Card>
      )}

      {isDirector && (
        <Card>
          <CardHeader title="Pending requests" sub={pending.length === 0 ? 'Nothing waiting on you' : `${pending.length} awaiting a decision`} />
          {pending.length > 0 && (
            <ul className="divide-y divide-line">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <span className="font-medium text-ink">{names[r.fellow_id] ?? 'Fellow'}</span>
                    <span className="ml-2 text-muted">{shortDate(r.start_date)} – {shortDate(r.end_date)}</span>
                    {r.note && <span className="ml-2 text-muted">· {r.note}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => decide(r.id, true)}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                      Approve
                    </button>
                    <button onClick={() => decide(r.id, false)}
                      className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink">
                      Deny
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title={isDirector ? 'All requests' : 'Your requests'} />
        {requests.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                <div>
                  {isDirector && <span className="font-medium text-ink">{names[r.fellow_id] ?? 'Fellow'} · </span>}
                  <span className="text-ink">{shortDate(r.start_date)} – {shortDate(r.end_date)}</span>
                  {r.note && <span className="ml-2 text-muted">{r.note}</span>}
                </div>
                <span className={statusStyle[r.status]}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

interface AwayRow { id: string; away_date: string; reason: string | null }

function ProviderAwayDates({ providerId, onError }: { providerId: string; onError: (m: string) => void }) {
  const [rows, setRows] = useState<AwayRow[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('provider_away_dates')
      .select('id, away_date, reason')
      .eq('provider_id', providerId)
      .gte('away_date', today)
      .order('away_date')
    setRows((data as AwayRow[]) ?? [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function eachDate(from: string, to: string): string[] {
    const out: string[] = []
    const d = new Date(from + 'T00:00:00')
    const last = new Date(to + 'T00:00:00')
    while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
    return out
  }

  async function add() {
    if (!start) return
    const to = end || start
    if (to < start) { onError('End date must be on or after the start date.'); return }
    setBusy(true)
    const payload = eachDate(start, to).map((away_date) => ({ provider_id: providerId, away_date, reason: reason.trim() || null }))
    const { error } = await supabase.from('provider_away_dates').upsert(payload, { onConflict: 'provider_id,away_date' })
    setBusy(false)
    if (error) { onError(error.message); return }
    setStart(''); setEnd(''); setReason(''); load()
  }

  async function remove(id: string) {
    await supabase.from('provider_away_dates').delete().eq('id', id)
    load()
  }

  return (
    <Card>
      <CardHeader
        title="My away dates"
        sub="Add the days you're unavailable. The scheduler skips these and substitutes an alternate clinic; if you add a date after the schedule is published, the director is alerted to any conflict."
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">First day away</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Last day away (optional)</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Conference, Vacation"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
          </div>
          <button onClick={add} disabled={busy || !start}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Adding…' : 'Add away dates'}
          </button>
        </div>

        {rows.length > 0 && (
          <ul className="divide-y divide-line pt-1">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{shortDate(r.away_date)}{r.reason ? ` · ${r.reason}` : ''}</span>
                <button onClick={() => remove(r.id)} className="text-xs font-medium text-muted hover:text-ink">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
