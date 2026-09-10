import { createClient } from 'npm:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Manage a person AT A SITE: role, status, password resets.
//
// Multi-site: role and status live on site_memberships, so set_role and
// set_status change the membership at the target site (body.site_id, default
// the caller's active site). The auth account is only banned when the person
// has no active membership left anywhere — being made inactive at one program
// must not lock them out of another.
// ---------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_H = { ...corsHeaders, 'Content-Type': 'application/json' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_H })

function genPassword(): string {
  const words = ['Nerve', 'Muscle', 'Axon', 'Myelin', 'Synapse', 'Motor', 'Sensory', 'Reflex']
  const w = words[Math.floor(Math.random() * words.length)]
  const d = Math.floor(1000 + Math.random() * 9000)
  const s = '!@#$%'[Math.floor(Math.random() * 5)]
  return `NM${w}${s}${d}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: who } = await caller.auth.getUser()
    if (!who?.user) return reply({ error: 'Not authenticated' }, 401)
    const callerId = who.user.id

    const admin = createClient(url, service)
    const body = await req.json()
    const { action, user_id, role, status, temp_password } = body
    if (!user_id) return reply({ error: 'user_id is required' }, 400)

    const { data: callerRow } = await admin.from('users').select('active_site_id').eq('id', callerId).maybeSingle()
    const siteId: string | null = body.site_id ?? callerRow?.active_site_id ?? null
    if (!siteId) return reply({ error: 'No program selected.' }, 400)

    const { data: pa } = await admin.from('platform_admins').select('user_id').eq('user_id', callerId).maybeSingle()
    const isPlatform = !!pa
    const { data: cm } = await admin.from('site_memberships').select('role, status').eq('site_id', siteId).eq('user_id', callerId).maybeSingle()
    const isSiteAdmin = cm?.status === 'active' && ['director', 'admin'].includes(cm.role)
    if (!isSiteAdmin && !isPlatform) return reply({ error: 'Only a director or admin of this program can manage its people' }, 403)

    const { data: target } = await admin.from('site_memberships').select('id, role, status').eq('site_id', siteId).eq('user_id', user_id).maybeSingle()
    if (!target) return reply({ error: 'That person is not a member of this program.' }, 400)

    // Never leave a program without an active director.
    if ((action === 'set_role' && role !== 'director') || (action === 'set_status' && status !== 'active')) {
      if (target.role === 'director' && target.status === 'active') {
        const { count } = await admin.from('site_memberships').select('id', { count: 'exact', head: true })
          .eq('site_id', siteId).eq('role', 'director').eq('status', 'active')
        if ((count ?? 0) <= 1) return reply({ error: 'Cannot change the only active director. Assign another director first.' }, 400)
      }
    }

    if (action === 'set_role') {
      if (!['fellow', 'supervisor', 'director', 'admin', 'assistant'].includes(role)) return reply({ error: 'invalid role' }, 400)
      const { error } = await admin.from('site_memberships').update({ role, updated_at: new Date().toISOString() }).eq('id', target.id)
      if (error) throw error
      return reply({ ok: true })
    }

    if (action === 'set_status') {
      if (!['active', 'inactive', 'alumni'].includes(status)) return reply({ error: 'invalid status' }, 400)
      const { error } = await admin.from('site_memberships').update({ status, updated_at: new Date().toISOString() }).eq('id', target.id)
      if (error) throw error
      const { count: activeElsewhere } = await admin.from('site_memberships').select('id', { count: 'exact', head: true })
        .eq('user_id', user_id).eq('status', 'active')
      await admin.auth.admin.updateUserById(user_id, { ban_duration: (activeElsewhere ?? 0) > 0 ? 'none' : '876000h' })
      return reply({ ok: true, banned: (activeElsewhere ?? 0) === 0 })
    }

    if (action === 'reset_password') {
      const temp = genPassword()
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: temp })
      if (error) throw error
      await admin.from('users').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('id', user_id)
      return reply({ ok: true, temp_password: temp })
    }

    if (action === 'email_temp_password') {
      if (!temp_password) return reply({ error: 'temp_password is required' }, 400)
      const { data: u } = await admin.from('users').select('email, full_name').eq('id', user_id).single()
      if (!u?.email) return reply({ error: 'user has no email' }, 400)
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (!resendKey) return reply({ error: 'Email is not configured (RESEND_API_KEY missing).' }, 500)
      const PLATFORM = '00000000-0000-4000-8000-000000000000'
      const { data: rows } = await admin.from('app_settings').select('key, value').eq('site_id', PLATFORM).in('key', ['email_from', 'portal_url'])
      const get = (k: string) => (rows ?? []).find((r: { key: string }) => r.key === k)?.value as string | undefined
      const FROM = get('email_from') ?? 'onboarding@resend.dev'
      const PORTAL = get('portal_url') ?? ''
      const { data: site } = await admin.from('sites').select('name').eq('id', siteId).maybeSingle()
      const first = (u.full_name ?? '').split(' ')[0]
      const html =
        `<p>Hi ${first},</p>` +
        `<p>An account has been set up for you on the fellowship portal for <strong>${site?.name ?? 'your program'}</strong>.</p>` +
        `<p><strong>Sign in:</strong> <a href="${PORTAL}/login">${PORTAL}/login</a><br/>` +
        `Email: ${u.email}<br/>` +
        `Temporary password: <strong>${temp_password}</strong></p>` +
        `<p>For your security, you'll be asked to choose your own password the first time you sign in.</p>`
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [u.email], subject: 'Your fellowship portal access', html }),
      })
      if (!res.ok) return reply({ error: 'Email send failed: ' + (await res.text()) }, 502)
      await admin.from('email_log').insert({ ref_key: 'temppw-' + user_id + '-' + Date.now(), to_email: u.email })
      return reply({ ok: true, to: u.email })
    }

    return reply({ error: 'unknown action' }, 400)
  } catch (e) {
    return reply({ error: String(e) }, 500)
  }
})
