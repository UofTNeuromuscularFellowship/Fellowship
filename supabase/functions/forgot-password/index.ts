import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Public endpoint: emails a password-reset link to an existing, active
// portal account. Always answers { ok: true } so callers can't probe which
// email addresses have accounts. Rate-limited to one email per address per
// hour via email_log ref keys.
//
// v2: send from the same verified address every other portal email uses
// (the email_from app setting), and log why a send failed. v1 fell back to
// Resend's onboarding@resend.dev sandbox sender, which Resend only delivers
// to the account owner's own address — so resets to hospital addresses were
// rejected while the caller still saw a success response.
//
// v3: link to the portal's own /change-password page carrying the token hash,
// instead of Supabase's /verify endpoint. Hospital mail systems pre-open every
// link in an incoming message to scan it, which spent the one-time token before
// the recipient could click — they then landed on an "email link is invalid or
// has expired" page. A scanner that fetches the new link just gets HTML; the
// token is only redeemed when the page's JavaScript runs verifyOtp.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const admin = createClient(url, serviceKey)

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) return json(200, { ok: true })

    // Only active portal accounts get reset emails
    const { data: u, error: lookupErr } = await admin
      .from('users')
      .select('id, full_name, status')
      .ilike('email', email)
      .maybeSingle()
    if (lookupErr) { console.error('pwreset lookup failed', email, lookupErr.message); return json(200, { ok: true }) }
    if (!u) { console.error('pwreset: no portal account', email); return json(200, { ok: true }) }
    if (u.status !== 'active') { console.error('pwreset: account not active', email, u.status); return json(200, { ok: true }) }
    if (!resendKey) { console.error('pwreset: RESEND_API_KEY is not set'); return json(200, { ok: true }) }

    // Rate limit: one reset email per address per hour
    const hourKey = `pwreset-${email}-${new Date().toISOString().slice(0, 13)}`
    const { data: already } = await admin.from('email_log').select('ref_key').eq('ref_key', hourKey).maybeSingle()
    if (already) { console.log('pwreset: rate limited this hour', email); return json(200, { ok: true }) }

    const { data: fromRow } = await admin.from('app_settings').select('value').eq('key', 'email_from').maybeSingle()
    const { data: portalRow } = await admin.from('app_settings').select('value').eq('key', 'portal_url').maybeSingle()
    const portal = ((portalRow?.value as string) ?? Deno.env.get('PORTAL_URL') ?? 'https://www.neuromuscularto.ca').replace(/\/$/, '')

    // Same verified sender as every other portal email. Only fall back to the
    // Resend sandbox address if the setting is missing entirely.
    const from = (fromRow?.value as string)
      ?? Deno.env.get('INVITE_FROM_EMAIL')
      ?? 'Neuromuscular Fellowship <onboarding@resend.dev>'

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery', email, options: { redirectTo: `${portal}/change-password` },
    })
    if (linkErr || !link) { console.error('pwreset: generateLink failed', email, linkErr?.message); return json(200, { ok: true }) }

    // Point at our own page, not Supabase's /verify, so a link scanner cannot
    // burn the token. The page redeems it client-side.
    const tokenHash = link.properties?.hashed_token as string | undefined
    if (!tokenHash) { console.error('pwreset: no hashed_token returned', email); return json(200, { ok: true }) }
    const actionLink = `${portal}/change-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`

    const first = (u.full_name ?? '').split(' ')[0]
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0F1B2D">
        <h2 style="font-family:Georgia,serif">Neuromuscular Fellowship Portal</h2>
        <p>Hi ${first || 'there'},</p>
        <p>We received a request to reset the password for this account. Click below to choose a new one.</p>
        <p style="margin:28px 0">
          <a href="${actionLink}" style="background:#0E7C86;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Reset password</a>
        </p>
        <p style="font-size:13px;color:#5B6677">If the button doesn't work, paste this link into your browser:<br>${actionLink}</p>
        <p style="font-size:13px;color:#5B6677">This link can only be used once. Didn't request it? You can safely ignore this email — your password is unchanged.</p>
      </div>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'Reset your Fellowship Portal password', html }),
    })
    if (!res.ok) {
      console.error('pwreset: resend rejected', res.status, await res.text(), 'from=', from, 'to=', email)
      return json(200, { ok: true })
    }
    await admin.from('email_log').insert({ ref_key: hourKey, to_email: email })
    console.log('pwreset: sent', email)
    return json(200, { ok: true })
  } catch (e) {
    console.error('pwreset: unhandled', String(e))
    return json(200, { ok: true })
  }
})
