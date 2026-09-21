import { createClient } from 'npm:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Create an attendee account from a conference invitation.
//
// The invitation link was emailed to the invitee's address, so holding its
// token is taken as proof of that address and the account is created
// already confirmed. The account belongs to no program: handle_new_user
// (0033) only adds a program membership when app_metadata names one, and
// this function never does. It is linked to the invitation, and can then
// see that invitation's joining details, slides, feedback and letter.
//
// If the address already has an account, nothing is created and the page is
// told to ask for that password instead.
//
// verify_jwt is off because the caller has no account yet; the token is the
// credential, and each invitation can create at most one account.
// ---------------------------------------------------------------------------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '')
    const password = String(body.password ?? '')
    const fullName = String(body.full_name ?? '').trim()
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: 'This link is not valid.' }, 400)
    if (password.length < 8) return json({ error: 'Choose a password of at least 8 characters.' }, 400)
    if (password.length > 72) return json({ error: 'That password is too long.' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: inv } = await admin.from('conf_invitees')
      .select('id, email, full_name, user_id, event_id').eq('token', token).maybeSingle()
    if (!inv) return json({ error: 'This link is not valid.' }, 400)
    if (inv.user_id) return json({ error: 'This invitation already has an account. Sign in instead.', linked: true }, 409)

    const { data: ev } = await admin.from('conf_events').select('status').eq('id', inv.event_id).maybeSingle()
    if (!ev || ev.status === 'draft') return json({ error: 'This event is not open.' }, 400)

    const email = String(inv.email).toLowerCase()
    const { data: existing } = await admin.from('users').select('id').eq('email', email).maybeSingle()
    if (existing) return json({ exists: true, email })

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || inv.full_name || '' },
      app_metadata: { attendee: true },
    })
    if (error || !created?.user) {
      if (/already|registered|exists/i.test(error?.message ?? '')) return json({ exists: true, email })
      console.error('conf-account: create failed', error?.message)
      return json({ error: 'We could not create your account. Please try again.' }, 500)
    }

    const { error: linkErr } = await admin.from('conf_invitees')
      .update({ user_id: created.user.id }).eq('id', inv.id).is('user_id', null)
    if (linkErr) console.error('conf-account: link failed', linkErr.message)

    return json({ ok: true, email })
  } catch (e) {
    console.error('conf-account: unhandled', String(e))
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})
