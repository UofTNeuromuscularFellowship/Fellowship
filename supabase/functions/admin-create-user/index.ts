import { createClient } from 'npm:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Create (or add) a person at a site.
//
// Multi-site: the target site is body.site_id, defaulting to the caller's
// active site. The caller must be a director/admin of that site, or a platform
// admin (who may only appoint a first director). If an account with this email
// already exists it is NOT recreated — a membership at the target site is added
// instead, which is how one login belongs to two programs.
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_H = { ...corsHeaders, 'Content-Type': 'application/json' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_H })

function generatePassword(): string {
  const words = ['Nerve', 'Muscle', 'Axon', 'Myelin', 'Synapse', 'Motor', 'Sensory', 'Reflex']
  const w = words[Math.floor(Math.random() * words.length)]
  const digits = Math.floor(1000 + Math.random() * 9000)
  const symbols = '!@#$%'
  const s = symbols[Math.floor(Math.random() * symbols.length)]
  return `NM${w}${s}${digits}`
}

function roleBlurb(role: string): string {
  switch (role) {
    case 'fellow':
      return `<p>As a fellow you can view your clinic and teaching schedule, log EMG/NCS cases, track your competency progress, request vacation, rate teaching sessions, and subscribe the schedule to your own calendar.</p>`
    case 'supervisor':
      return `<p>As teaching/clinical faculty you can see your teaching sessions and confirm them (or flag a conflict or cancel), add Zoom links, set your away dates so schedules are built around you, submit evaluations of the fellows, and add an administrative assistant to help manage your schedule (Settings → Assistant logins).</p>`
    case 'director':
      return `<p>As the fellowship director you have full access: schedules, approvals, people management, and program settings.</p>`
    case 'admin':
      return `<p>As a program coordinator you can manage people and competency targets in the portal.</p>`
    case 'assistant':
      return `<p>As an administrative assistant you help manage a provider's schedule. Once the fellowship director (or the provider) links you to them, open the <strong>Teaching</strong>, <strong>Clinic</strong>, or <strong>Away dates</strong> page and use the <strong>“Managing schedule for”</strong> selector at the top to act on their behalf.</p>`
    default:
      return ''
  }
}

async function platformSettings(admin: ReturnType<typeof createClient>) {
  const PLATFORM = '00000000-0000-4000-8000-000000000000'
  const { data: rows } = await admin.from('app_settings').select('key, value').eq('site_id', PLATFORM).in('key', ['email_from', 'portal_url'])
  const get = (k: string) => (rows ?? []).find((r: { key: string }) => r.key === k)?.value as string | undefined
  return {
    FROM: get('email_from') ?? Deno.env.get('INVITE_FROM_EMAIL') ?? 'onboarding@resend.dev',
    PORTAL: get('portal_url') ?? Deno.env.get('PORTAL_URL') ?? '',
  }
}

async function sendEmail(admin: ReturnType<typeof createClient>, to: string, subject: string, html: string, refPrefix: string): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return false
  const { FROM } = await platformSettings(admin)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })
  if (!res.ok) { console.error('email failed', await res.text()); return false }
  try { await admin.from('email_log').insert({ ref_key: `${refPrefix}-${to}-${Date.now()}`, to_email: to }) } catch (_e) { /* log only */ }
  return true
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !userData?.user) return reply({ error: 'Not authenticated' }, 401)
    const callerId = userData.user.id

    const admin = createClient(supabaseUrl, serviceKey)
    const body = await req.json()
    const { email, full_name, role, cohort_year, phone } = body
    if (!email || !full_name || !role) return reply({ error: 'email, full_name, and role are required' }, 400)
    if (!['fellow', 'supervisor', 'director', 'admin', 'assistant'].includes(role)) return reply({ error: 'invalid role' }, 400)

    // ---- which site, and may the caller act there? ----
    const { data: callerRow } = await admin.from('users').select('active_site_id').eq('id', callerId).maybeSingle()
    const siteId: string | null = body.site_id ?? callerRow?.active_site_id ?? null
    if (!siteId) return reply({ error: 'No program selected.' }, 400)

    const { data: site } = await admin.from('sites').select('id, name, status').eq('id', siteId).maybeSingle()
    if (!site || site.status !== 'active') return reply({ error: 'Unknown or suspended program.' }, 400)

    const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', callerId).maybeSingle()
    const isPlatform = !!pa
    const { data: callerMembership } = await admin.from('site_memberships').select('role, status')
      .eq('site_id', siteId).eq('user_id', callerId).maybeSingle()
    const isSiteAdmin = callerMembership?.status === 'active' && ['director', 'admin'].includes(callerMembership.role)

    if (!isSiteAdmin) {
      if (!isPlatform) return reply({ error: 'Only a director or admin of this program can add people to it' }, 403)
      if (role !== 'director') return reply({ error: 'The platform admin can only appoint a program director. The director adds everyone else.' }, 403)
    }

    const emailLc = String(email).toLowerCase()
    const { PORTAL } = await platformSettings(admin)
    const first = (full_name ?? '').split(' ')[0] || 'there'

    // ---- existing account: add a membership instead of a second account ----
    const { data: existing } = await admin.from('users').select('id, full_name').eq('email', emailLc).maybeSingle()
    if (existing) {
      const { data: m } = await admin.from('site_memberships').select('id, status')
        .eq('site_id', siteId).eq('user_id', existing.id).maybeSingle()
      if (m && m.status === 'active') return reply({ error: 'This person is already a member of this program.' }, 400)
      const { error: mErr } = await admin.from('site_memberships').upsert(
        { site_id: siteId, user_id: existing.id, role, status: 'active', updated_at: new Date().toISOString() },
        { onConflict: 'site_id,user_id' },
      )
      if (mErr) return reply({ error: mErr.message }, 400)
      // Someone whose only membership was inactive was banned; lift it.
      await admin.auth.admin.updateUserById(existing.id, { ban_duration: 'none' })

      const html =
        `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1B2D;line-height:1.5">` +
        `<h2 style="font-family:Georgia,serif">You have been added to ${site.name}</h2>` +
        `<p>Hi ${(existing.full_name ?? '').split(' ')[0] || 'there'},</p>` +
        `<p>Your existing portal account (<strong>${emailLc}</strong>) now also belongs to <strong>${site.name}</strong>. ` +
        `Sign in as usual at <a href="${PORTAL}/login">${PORTAL}/login</a> — you will be asked which program to open.</p>` +
        roleBlurb(role) + `</div>`
      const emailed = await sendEmail(admin, emailLc, `You have been added to ${site.name}`, html, 'added')
      return reply({ ok: true, user_id: existing.id, email: emailLc, added_existing: true, welcome_emailed: emailed })
    }

    // ---- brand new account ----
    const tempPassword = generatePassword()
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emailLc,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, role, site_id: siteId, cohort_year: cohort_year ?? null, must_change_password: true },
    })
    if (createErr || !created?.user) return reply({ error: createErr?.message ?? 'auth create failed' }, 400)

    // role/status are derived from the membership the trigger just created.
    const { error: updErr } = await admin.from('users').update({
      full_name, cohort_year: cohort_year ?? null, phone: phone ?? null, must_change_password: true, active_site_id: siteId,
    }).eq('id', created.user.id)
    if (updErr) return reply({ error: updErr.message }, 400)

    const html =
      `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1B2D;line-height:1.5">` +
      `<h2 style="font-family:Georgia,serif">Welcome to the Neuromuscular Fellowship Portal</h2>` +
      `<p>Hi ${first},</p>` +
      `<p>An account has been set up for you on the fellowship portal for <strong>${site.name}</strong>.</p>` +
      `<p style="background:#F7F8FA;border:1px solid #E2E6EC;border-radius:8px;padding:12px 16px">` +
      `<strong>Sign in:</strong> <a href="${PORTAL}/login">${PORTAL}/login</a><br/>` +
      `<strong>Email:</strong> ${emailLc}<br/>` +
      `<strong>Temporary password:</strong> ${tempPassword}</p>` +
      `<p>For your security you'll be asked to choose your own password the first time you sign in.</p>` +
      roleBlurb(role) +
      `<p style="color:#5B6677;font-size:13px">Questions? Reply to this email.</p>` +
      `</div>`
    const welcomeEmailed = await sendEmail(admin, emailLc, 'Your Neuromuscular Fellowship portal access', html, 'welcome')

    return reply({ ok: true, user_id: created.user.id, email: emailLc, temp_password: tempPassword, welcome_emailed: welcomeEmailed })
  } catch (e) {
    return reply({ error: String(e) }, 500)
  }
})
