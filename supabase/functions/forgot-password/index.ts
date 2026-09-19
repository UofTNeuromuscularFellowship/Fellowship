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
//
// v4 (multi-site): three things that were correct for one programme and wrong
// for several.
//   1. app_settings is keyed (site_id, key). Reading email_from and portal_url
//      with .maybeSingle() and no site filter throws PGRST116 the moment a
//      second programme holds a row under either key, which would silently
//      kill password resets for everyone. Both are platform-wide — one
//      deployment, one domain — so they are read from the platform site.
//   2. users.status is now only a mirror of whichever programme the person
//      last opened. Somebody active at programme B but with programme A as
//      their active site would have been refused a reset. Eligibility is an
//      active membership ANYWHERE, read from site_memberships.
//   3. The email_log row is written with the person's site so the trail is
//      attributable; the service role's own current_site_id() is null.
// The rate-limit key stays global per address — one reset email per address
// per hour is the right ceiling regardless of how many programmes they are in.

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

    // Only accounts with a live membership somewhere get reset emails
    const { data: u, error: lookupErr } = await admin
      .from('users')
      .select('id, full_name, active_site_id')
      .ilike('email', email)
      .maybeSingle()
    if (lookupErr) { console.error('pwreset lookup failed', email, lookupErr.message); return json(200, { ok: true }) }
    if (!u) { console.error('pwreset: no portal account', email); return json(200, { ok: true }) }

    const { data: memberships, error: memErr } = await admin
      .from('site_memberships')
      .select('site_id')
      .eq('user_id', u.id)
      .eq('status', 'active')
    if (memErr) { console.error('pwreset: membership lookup failed', email, memErr.message); return json(200, { ok: true }) }
    if (!memberships || memberships.length === 0) {
      console.error('pwreset: no active membership at any programme', email)
      return json(200, { ok: true })
    }
    const siteIds = memberships.map((m: { site_id: string }) => m.site_id)
    const logSite = siteIds.includes(u.active_site_id as string) ? (u.active_site_id as string) : siteIds[0]
    if (!resendKey) { console.error('pwreset: RESEND_API_KEY is not set'); return json(200, { ok: true }) }

    // Rate limit: one reset email per address per hour
    const hourKey = `pwreset-${email}-${new Date().toISOString().slice(0, 13)}`
    const { data: already } = await admin.from('email_log').select('ref_key').eq('ref_key', hourKey).maybeSingle()
    if (already) { console.log('pwreset: rate limited this hour', email); return json(200, { ok: true }) }

    // Sender identity and portal URL are platform-wide, and must be read with
    // the site filter: app_settings is keyed (site_id, key).
    const PLATFORM_SITE = '00000000-0000-4000-8000-000000000000'
    const { data: settingRows } = await admin.from('app_settings').select('key, value')
      .eq('site_id', PLATFORM_SITE).in('key', ['email_from', 'portal_url'])
    const setting = (k: string) => (settingRows ?? []).find((r: { key: string }) => r.key === k)?.value as string | undefined
    const portal = (setting('portal_url') ?? Deno.env.get('PORTAL_URL') ?? 'https://app.neuromuscular.ca').replace(/\/$/, '')

    // Same verified sender as every other portal email. Only fall back to the
    // Resend sandbox address if the setting is missing entirely.
    const from = setting('email_from')
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
    await admin.from('email_log').insert({ ref_key: hourKey, to_email: email, site_id: logSite })
    console.log('pwreset: sent', email)
    return json(200, { ok: true })
  } catch (e) {
    console.error('pwreset: unhandled', String(e))
    return json(200, { ok: true })
  }
})
