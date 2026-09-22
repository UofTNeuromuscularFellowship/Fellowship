import { createClient } from 'npm:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// A speaker's invoice and expense receipts, by their private link.
//
// Speakers are not portal members, so storage policies cannot see them; this
// function is the gate. The speaker's token (from /speaker/<token>) finds
// their honorarium, and every action is checked against it:
//
//   upload        multipart: token, kind = invoice | claim, claim_id?, file
//                 PDF, JPEG or PNG, up to 10 MB, checked by content not name
//   open          a short-lived link to a file the speaker uploaded
//   delete_file   a file the speaker uploaded, until they are paid
//   delete_claim  an expense still waiting for a decision, with its receipts
//
// Files go to conference/<event>/finance/speaker/<speaker>/..., and a
// conf_receipts row records each one so the coordinator can reach it.
//
// verify_jwt is off: the caller has no account. The token is the credential.
// ---------------------------------------------------------------------------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const BUCKET = 'conference'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_PER_PARENT = 5

// The first bytes of each accepted type. The browser's own label is not
// trusted: a file is what its content says it is.
function sniff(b: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  return null
}
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const isForm = (req.headers.get('content-type') ?? '').includes('multipart/form-data')
    if (isForm && Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 64 * 1024) {
      return json({ error: 'That file is larger than 10 MB. Please send a smaller scan or photo.' }, 413)
    }
    const form = isForm ? await req.formData().catch(() => null) : null
    const body: Record<string, unknown> = isForm ? {} : await req.json().catch(() => ({}))
    const get = (k: string) => String((form ? form.get(k) : body[k]) ?? '')

    const token = get('token')
    const action = isForm ? 'upload' : get('action')
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'This link is no longer valid.' }, 400)

    const { data: sp } = await admin.from('conf_speakers').select('id, event_id, site_id').eq('token', token).maybeSingle()
    if (!sp) return json({ error: 'This link is no longer valid.' }, 404)
    const { data: h } = await admin.from('conf_honoraria')
      .select('id, paid_at, claims_allowed').eq('speaker_id', sp.id).maybeSingle()
    if (!h) return json({ error: 'There is no payment to arrange on this link.' }, 404)
    const paid = Boolean(h.paid_at)

    // ------------------------------------------------------------ open
    if (action === 'open') {
      const { data: f } = await admin.from('conf_receipts').select('storage_path, honorarium_id, claim_id, uploaded_by')
        .eq('id', get('file_id')).maybeSingle()
      if (!f || f.uploaded_by !== 'speaker' || !(await belongs(admin, f, h.id))) return json({ error: 'File not found.' }, 404)
      const { data: s, error } = await admin.storage.from(BUCKET).createSignedUrl(f.storage_path, 300)
      if (error || !s) return json({ error: 'That file could not be opened.' }, 500)
      return json({ url: s.signedUrl })
    }

    // ----------------------------------------------------- delete_file
    if (action === 'delete_file') {
      if (paid) return json({ error: 'Your payment has been made, so these files are now part of the record.' }, 409)
      const { data: f } = await admin.from('conf_receipts').select('id, storage_path, honorarium_id, claim_id, uploaded_by')
        .eq('id', get('file_id')).maybeSingle()
      if (!f || f.uploaded_by !== 'speaker' || !(await belongs(admin, f, h.id))) return json({ error: 'File not found.' }, 404)
      if (f.claim_id) {
        const { data: c } = await admin.from('conf_claims').select('status').eq('id', f.claim_id).maybeSingle()
        if (c && c.status !== 'submitted' && c.status !== 'declined') {
          return json({ error: 'That expense has been approved, so its receipts are now part of the record.' }, 409)
        }
      }
      await admin.storage.from(BUCKET).remove([f.storage_path])
      await admin.from('conf_receipts').delete().eq('id', f.id)
      return json({ ok: true })
    }

    // ---------------------------------------------------- delete_claim
    if (action === 'delete_claim') {
      if (paid) return json({ error: 'Your payment has been made. Contact the organizer to change your expenses.' }, 409)
      const { data: c } = await admin.from('conf_claims').select('id, status, honorarium_id').eq('id', get('claim_id')).maybeSingle()
      if (!c || c.honorarium_id !== h.id) return json({ error: 'Expense not found.' }, 404)
      if (c.status !== 'submitted' && c.status !== 'declined') {
        return json({ error: 'That expense has been approved. Contact the organizer to change it.' }, 409)
      }
      const { data: files } = await admin.from('conf_receipts').select('storage_path').eq('claim_id', c.id)
      const paths = (files ?? []).map((f) => f.storage_path)
      if (paths.length) await admin.storage.from(BUCKET).remove(paths)
      await admin.from('conf_claims').delete().eq('id', c.id)
      return json({ ok: true })
    }

    // ---------------------------------------------------------- upload
    if (action !== 'upload' || !form) return json({ error: 'Unknown request.' }, 400)
    if (paid) return json({ error: 'Your payment has already been made. Contact the organizer to send anything further.' }, 409)

    const kind = get('kind')
    const file = form.get('file')
    if (!(file instanceof File)) return json({ error: 'Choose a file to upload.' }, 400)
    if (file.size === 0) return json({ error: 'That file is empty.' }, 400)
    if (file.size > MAX_BYTES) return json({ error: 'That file is larger than 10 MB. Please send a smaller scan or photo.' }, 413)

    let claimId: string | null = null
    if (kind === 'claim') {
      if (!h.claims_allowed) return json({ error: 'Expense claims are not open on this link.' }, 409)
      const { data: c } = await admin.from('conf_claims').select('id, status, honorarium_id').eq('id', get('claim_id')).maybeSingle()
      if (!c || c.honorarium_id !== h.id) return json({ error: 'Expense not found.' }, 404)
      if (c.status !== 'submitted') return json({ error: 'That expense has already been decided. Contact the organizer to add to it.' }, 409)
      claimId = c.id
    } else if (kind !== 'invoice') {
      return json({ error: 'Unknown request.' }, 400)
    }

    const q = admin.from('conf_receipts').select('id', { count: 'exact', head: true })
    const { count } = claimId ? await q.eq('claim_id', claimId) : await q.eq('honorarium_id', h.id)
    if ((count ?? 0) >= MAX_PER_PARENT) {
      return json({ error: `You can attach up to ${MAX_PER_PARENT} files here. Remove one to add another.` }, 409)
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const type = sniff(bytes)
    if (!type) return json({ error: 'Please upload a PDF, JPEG or PNG file.' }, 415)

    const base = (file.name || 'file').replace(/\.[^.]*$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60) || 'file'
    const fileName = `${base}.${EXT[type]}`
    const path = `${sp.event_id}/finance/speaker/${sp.id}/${crypto.randomUUID()}-${fileName}`

    const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: false })
    if (up.error) { console.error('conf-speaker-files: upload', up.error.message); return json({ error: 'The upload failed. Please try again.' }, 500) }

    const { data: row, error } = await admin.from('conf_receipts').insert({
      site_id: sp.site_id, event_id: sp.event_id,
      honorarium_id: claimId ? null : h.id, claim_id: claimId,
      storage_path: path, file_name: fileName, mime_type: type, size_bytes: bytes.length, uploaded_by: 'speaker',
    }).select('id, file_name').single()
    if (error) {
      console.error('conf-speaker-files: record', error.message)
      await admin.storage.from(BUCKET).remove([path])
      return json({ error: 'The upload failed. Please try again.' }, 500)
    }
    return json({ file: row })
  } catch (e) {
    console.error('conf-speaker-files: unhandled', String(e))
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})

// A receipt is the speaker's if it hangs off their honorarium, or off one of
// their honorarium's claims.
async function belongs(
  admin: ReturnType<typeof createClient>,
  f: { honorarium_id: string | null; claim_id: string | null },
  honorariumId: string,
): Promise<boolean> {
  if (f.honorarium_id) return f.honorarium_id === honorariumId
  if (!f.claim_id) return false
  const { data: c } = await admin.from('conf_claims').select('honorarium_id').eq('id', f.claim_id).maybeSingle()
  return c?.honorarium_id === honorariumId
}
