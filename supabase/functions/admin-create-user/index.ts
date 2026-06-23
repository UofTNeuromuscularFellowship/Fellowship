import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
const ALLOWED_ROLES = ['fellow', 'supervisor', 'director', 'admin']

async function sendInviteEmail(to: string, fullName: string, link: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return false
  const from = Deno.env.get('INVITE_FROM_EMAIL') ?? 'onboarding@resend.dev'
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0F1B2D">
      <h2 style="font-family:Georgia,serif">Neuromuscular Fellowship Portal</h2>
      <p>Hi ${fullName || 'there'},</p>
      <p>You've been invited to the University of Toronto City Wide Neuromuscular
      Fellowship portal. Click below to set your password and sign in.</p>
      <p style="margin:28px 0">
        <a href="${link}" style="background:#0E7C86;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Accept invitation</a>
      </p>
      <p style="font-size:13px;color:#5B6677">If the button doesn't work, paste this link into your browser:<br>${link}</p>
    </div>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Neuromuscular Fellowship <${from}>`, to, subject: "You're invited to the Neuromuscular Fellowship Portal", html }),
  })
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const portalUrl = Deno.env.get('PORTAL_URL') ?? 'https://fellowship-sandy.vercel.app'
    const authHeader = req.headers.get('Authorization') ?? ''

    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: who } = await caller.auth.getUser()
    if (!who?.user) return json(401, { error: 'Not authenticated' })

    const admin = createClient(url, serviceKey)
    const { data: profile } = await admin.from('users').select('role').eq('id', who.user.id).single()
    if (!profile || !['director', 'admin'].includes(profile.role)) {
      return json(403, { error: 'Only directors or admins can add users' })
    }

    const body = await req.json().catch(() => ({}))
    const email = (body.email ?? '').trim().toLowerCase()
    const full_name = (body.full_name ?? '').trim()
    const role = ALLOWED_ROLES.includes(body.role) ? body.role : 'fellow'
    const cohort_year = body.cohort_year || null
    const duration_years = body.duration_years ? Number(body.duration_years) : null
    const start_date = body.start_date || null
    const end_date = body.end_date || null
    if (!email || !full_name) return json(400, { error: 'email and full_name are required' })

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite', email, options: { data: { full_name }, redirectTo: `${portalUrl}/login` },
    })
    if (linkErr || !link?.user) return json(400, { error: linkErr?.message ?? 'Could not create invitation' })

    const { error: updErr } = await admin.from('users').update({
      full_name, role, cohort_year, duration_years, start_date, end_date, updated_at: new Date().toISOString(),
    }).eq('id', link.user.id)
    if (updErr) return json(400, { error: updErr.message })

    const actionLink = link.properties?.action_link as string
    const emailed = await sendInviteEmail(email, full_name, actionLink)
    return json(200, { invited: true, email, email_sent: emailed, action_link: emailed ? undefined : actionLink })
  } catch (e) {
    return json(500, { error: String(e) })
  }
})
