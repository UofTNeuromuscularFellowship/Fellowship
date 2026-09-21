import { createClient } from 'npm:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Presentations for one attendee, as short-lived signed links.
//
// Attendees are not program members, so storage policies cannot see them.
// This function is the gate instead. It needs BOTH the invitation's private
// token and the signed-in account that invitation belongs to (0033): a
// forwarded link on its own opens nothing. Then it checks that the event has
// presentations switched on and that this person is attending, and only
// then signs links to that one event's files.
//
// verify_jwt is off so a missing or expired session gets the same quiet
// empty answer as an unknown token, rather than a gateway error the page
// would have to tell apart.
// ---------------------------------------------------------------------------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const TTL_SECONDS = 3600

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { token } = await req.json().catch(() => ({ token: '' }))
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return json({ files: [] })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Who is asking. An anon key or no header resolves to nobody.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } }
    const uid = who?.user?.id
    if (!uid) return json({ files: [], signed_in: false })

    const { data: inv } = await admin.from('conf_invitees')
      .select('event_id, rsvp_status, checked_in_at, user_id').eq('token', token).maybeSingle()
    if (!inv || inv.user_id !== uid) return json({ files: [] })
    if (!['in_person', 'virtual'].includes(inv.rsvp_status) && !inv.checked_in_at) return json({ files: [] })

    const { data: ev } = await admin.from('conf_events')
      .select('presentations_enabled, status').eq('id', inv.event_id).maybeSingle()
    if (!ev || !ev.presentations_enabled || ev.status === 'draft') return json({ files: [] })

    const { data: rows } = await admin.from('conf_presentations')
      .select('id, title, file_name, mime_type, size_bytes, storage_path, session_id')
      .eq('event_id', inv.event_id).order('created_at')
    const list = rows ?? []
    if (list.length === 0) return json({ files: [] })

    const { data: signed, error } = await admin.storage.from('conference')
      .createSignedUrls(list.map((r) => r.storage_path), TTL_SECONDS)
    if (error) { console.error('conf-presentations: sign failed', error.message); return json({ files: [] }) }

    // A row whose file is missing from storage (a failed upload, a manual
    // delete) signs to null; leave it out rather than hand the page a dead link.
    const urlFor = new Map((signed ?? []).filter((s) => !s.error && s.signedUrl).map((s) => [s.path, s.signedUrl]))
    return json({
      files: list
        .filter((r) => urlFor.has(r.storage_path))
        .map((r) => ({
          id: r.id, title: r.title, file_name: r.file_name, mime_type: r.mime_type,
          size_bytes: r.size_bytes, session_id: r.session_id, url: urlFor.get(r.storage_path)!,
        })),
    })
  } catch (e) {
    console.error('conf-presentations: unhandled', String(e))
    return json({ files: [] })
  }
})
