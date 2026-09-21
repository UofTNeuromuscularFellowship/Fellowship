import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { ConfEvent, ConfInvitee } from '../lib/conference'

// Name badges, eight to a US-letter page (a standard 4" x 3" badge insert
// sheet), for everyone attending in person — or everyone, with ?all=1.

export default function ConferenceBadges() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<ConfEvent | null>(null)
  const [people, setPeople] = useState<ConfInvitee[]>([])
  const all = new URLSearchParams(window.location.search).get('all') === '1'

  useEffect(() => {
    (async () => {
      const [e, p] = await Promise.all([
        supabase.from('conf_events').select('*').eq('id', id).maybeSingle(),
        supabase.from('conf_invitees').select('*').eq('event_id', id).order('full_name'),
      ])
      setEvent(e.data as ConfEvent | null)
      const list = (p.data as ConfInvitee[]) ?? []
      setPeople(all ? list.filter((x) => x.rsvp_status !== 'declined') : list.filter((x) => x.rsvp_status === 'in_person'))
    })()
  }, [id, all])

  if (!event) return <p style={{ padding: 24 }}>Loading…</p>

  return (
    <div className="badges-page">
      <style>{`
        @page { size: letter; margin: 0.5in 0.25in; }
        .badges-page { min-height: 100vh; background: #fff; color: #0F1B2D; font-family: Inter, Arial, sans-serif; }
        .badges-toolbar { padding: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #ddd; }
        .badges-toolbar button { background: #0E7C86; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
        .badges-grid { display: grid; grid-template-columns: repeat(2, 4in); grid-auto-rows: 3in; gap: 0; justify-content: center; padding: 16px 0; }
        .badge { box-sizing: border-box; border: 1px dashed #bbb; padding: 0.3in; display: flex; flex-direction: column; justify-content: center; text-align: center; break-inside: avoid; }
        .badge .ev { font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; color: #5B6677; }
        .badge .nm { font-family: Georgia, serif; font-size: 24pt; line-height: 1.1; margin: 10px 0 6px; overflow-wrap: anywhere; }
        .badge .in { font-size: 11pt; color: #3a4a55; }
        .badge .rl { font-size: 9pt; color: #5B6677; margin-top: 4px; }
        @media print { .badges-toolbar { display: none; } .badges-grid { padding: 0; } .badge { border-color: #eee; } }
      `}</style>
      <div className="badges-toolbar">
        <strong>{people.length} badge{people.length === 1 ? '' : 's'}</strong>
        <span style={{ color: '#5B6677' }}>{all ? 'Everyone who has not declined' : 'Everyone attending in person'} · 8 per page, 4″ × 3″</span>
        <button onClick={() => window.print()}>Print</button>
        <a href={all ? '?' : '?all=1'} style={{ color: '#0E7C86' }}>{all ? 'In person only' : 'Include online and waitlist'}</a>
      </div>
      <div className="badges-grid">
        {people.map((p) => (
          <div key={p.id} className="badge">
            <div className="ev">{event.name}</div>
            <div className="nm">{p.full_name || p.email}</div>
            {p.institution && <div className="in">{p.institution}</div>}
            {p.role_title && <div className="rl">{p.role_title}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
