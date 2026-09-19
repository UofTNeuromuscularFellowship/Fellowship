import { createClient } from 'npm:@supabase/supabase-js@2'

// Scheduled dispatcher (cron): flushes the email queue and computes reminder
// emails. Fully idempotent via email_log ref keys, so repeated invocations
// never double-send.
//
// Provider teaching reminders come from the DB function
// enqueue_teaching_reminders(); assistant CCs for queued email are handled by
// the trg_cc_assistants trigger, which is AFTER INSERT on email_queue, so the
// "mark as sent" update below cannot re-trigger it.
//
// Multi-site notes, all of which were live defects before this revision:
//
//   1. app_settings is keyed (site_id, key). Reading a key with .maybeSingle()
//      and no site filter throws the moment a second programme sets its own
//      email_from or portal_url - and because that read happens before the
//      queue flush, it would have stopped ALL mail for EVERY programme.
//      Sender identity and portal URL are platform-wide (one deployment, one
//      domain), so they are read from the platform site explicitly.
//   2. Sections 2 and 3 selected from users with no site filter, and users.role
//      and users.status are now only a MIRROR of whichever programme that
//      person last opened. So they would have emailed every fellow of every
//      programme about one programme's session, and would silently skip anyone
//      whose mirrored role belongs to their other site. Rosters are now read
//      per site from site_memberships, which is the authoritative role.
//   3. email_log rows were written with no site_id. The column defaults to
//      current_site_id(), which is null under the service role, so every row
//      this function logged was unattributed and invisible to the per-site
//      RLS policy. Delivery and de-duplication were unaffected (ref_key is
//      global), but the sent-mail trail belonged to nobody. Every send now
//      carries the site it was sent on behalf of.
//
// Preview mode: ?dry=1 sends nothing and writes nothing, returning the list of
// messages that WOULD go out; &eval=1 also previews the quarterly evaluation
// reminders outside their Jan/Apr/Jul/Oct window.
//
// This endpoint runs unauthenticated because cron calls it, so preview mode is
// gated on the service-role key: without that gate any anonymous caller could
// use ?dry=1 to enumerate every fellow's and supervisor's email address.

const PLATFORM_SITE = '00000000-0000-4000-8000-000000000000'

interface Person { id: string; email: string | null; full_name: string | null; assistant_emails?: string[] | null }

function torontoDateParts(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
}

function prettyDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const wantsDry = url.searchParams.get('dry') === '1'
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const authorisedForPreview = bearer.length > 0 && bearer === serviceKey
    if (wantsDry && !authorisedForPreview) {
      return new Response(JSON.stringify({ error: 'Preview mode requires the service role key.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }
    const dry = wantsDry && authorisedForPreview
    const previewEval = dry && url.searchParams.get('eval') === '1'

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey && !dry) return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500 })

    const { data: settingRows } = await admin.from('app_settings').select('key, value')
      .eq('site_id', PLATFORM_SITE).in('key', ['email_from', 'portal_url'])
    const setting = (k: string) => (settingRows ?? []).find((r: { key: string }) => r.key === k)?.value as string | undefined
    const FROM = setting('email_from') ?? 'onboarding@resend.dev'
    const PORTAL = setting('portal_url') ?? ''

    let sent = 0
    let failed = 0
    const preview: { ref: string; to: string; subject: string }[] = []

    // siteId is the programme this message is sent on behalf of. It is written
    // to email_log so the trail is attributable and visible under RLS; the
    // service role's own current_site_id() is null and cannot supply it.
    async function send(refKey: string, to: string, subject: string, html: string, siteId: string | null): Promise<boolean> {
      const { data: existing } = await admin.from('email_log').select('ref_key').eq('ref_key', refKey).maybeSingle()
      if (existing) return false
      if (dry) { preview.push({ ref: refKey, to, subject }); return true }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [to], subject, html }),
      })
      if (!res.ok) { failed++; console.error('resend failed', refKey, await res.text()); return false }
      const { error: logErr } = await admin.from('email_log').insert({ ref_key: refKey, to_email: to, site_id: siteId })
      if (logErr) console.error('email_log insert failed', refKey, logErr.message)
      sent++
      return true
    }

    /** Active members of one programme holding one role, by membership. */
    async function roster(siteId: string, role: string): Promise<Person[]> {
      const { data, error } = await admin.from('site_memberships')
        .select('user_id, users:users!site_memberships_user_id_fkey(id, email, full_name, assistant_emails)')
        .eq('site_id', siteId).eq('role', role).eq('status', 'active')
      if (error) { console.error('roster failed', siteId, role, error.message); throw new Error('roster: ' + error.message) }
      return ((data ?? []) as { users: Person | null }[])
        .map((r) => r.users)
        .filter((u): u is Person => !!u && !!u.email)
    }

    // ---------- 1) Flush the event queue ----------
    // Site-agnostic on purpose: each queued row already carries its recipient
    // and the programme it was enqueued for.
    const { data: queued } = await admin
      .from('email_queue')
      .select('id, ref_key, to_email, subject, html, site_id')
      .is('sent_at', null)
      .limit(100)
    for (const q of queued ?? []) {
      const ok = await send(q.ref_key ?? `queue-${q.id}`, q.to_email, q.subject, q.html, q.site_id ?? null)
      if (!dry && (ok || q.ref_key)) {
        await admin.from('email_queue').update({ sent_at: new Date().toISOString() }).eq('id', q.id)
      }
    }

    const { data: sites, error: sitesErr } = await admin.from('sites').select('id, name').eq('status', 'active')
    if (sitesErr) throw new Error('sites: ' + sitesErr.message)

    // ---------- 2) Fellow reminders: day before ----------
    {
      const target = torontoDateParts(1)
      for (const site of sites ?? []) {
        const { data: sessions } = await admin
          .from('teaching_sessions')
          .select('id, session_date, start_time, end_time, topic, provider_name, zoom_link')
          .eq('site_id', site.id)
          .eq('session_date', target)
          .eq('is_break', false)
          .eq('assignment_draft', false)
          .neq('status', 'cancelled')
        if ((sessions ?? []).length === 0) continue
        const fellows = await roster(site.id, 'fellow')
        for (const s of sessions ?? []) {
          for (const f of fellows) {
            await send(
              `fellow1-${s.id}-${f.id}`,
              f.email!,
              `Teaching tomorrow: ${s.topic ?? 'TBD'}`,
              `<p>Hi ${f.full_name ?? 'there'},</p>` +
              `<p>Tomorrow's teaching session:</p>` +
              `<p><strong>${s.topic ?? 'TBD'}</strong>${s.provider_name ? ` &mdash; ${s.provider_name}` : ''}<br/>` +
              `${prettyDate(s.session_date)}, ${s.start_time.slice(0, 5)}&ndash;${s.end_time.slice(0, 5)}` +
              (s.zoom_link ? `<br/>Zoom: <a href="${s.zoom_link}">${s.zoom_link}</a>` : '') +
              `</p><p><a href="${PORTAL}/teaching">Full schedule</a></p>`,
              site.id,
            )
          }
        }
      }
    }

    // ---------- 3) Quarterly evaluation reminders (first week of Jan/Apr/Jul/Oct) ----------
    {
      const today = torontoDateParts(0)
      const [y, m, d] = today.split('-').map(Number)
      const inWindow = [1, 4, 7, 10].includes(m) && d <= 7
      if (inWindow || previewEval) {
        const qm = ([1, 4, 7, 10].includes(m) ? m : 1) as 1 | 4 | 7 | 10
        const q = { 1: 'Oct-Dec ' + (y - 1), 4: 'Jan-Mar ' + y, 7: 'Apr-Jun ' + y, 10: 'Jul-Sep ' + y }[qm]
        for (const site of sites ?? []) {
          const sups = await roster(site.id, 'supervisor')
          for (const u of sups) {
            const subject = `Quarterly fellow feedback is due - ${site.name}`
            const html =
              `<p>Hi ${u.full_name ?? 'there'},</p>` +
              `<p>Formal feedback on the fellows is due for the <strong>${q}</strong> period.</p>` +
              `<p><a href="${PORTAL}/evaluations">Submit the evaluation in the portal</a> - it goes to the fellowship director and is shared with the fellow.</p>`
            await send(`evaldue-${y}-${qm}-${u.id}`, u.email!, subject, html, site.id)

            // CC administrative assistants: typed emails + linked assistant
            // accounts. Both the link and the assistant's active membership
            // are scoped to this programme.
            const ccSet = new Set<string>()
            for (const a of ((u.assistant_emails as string[] | null) ?? [])) {
              if (a) ccSet.add(a.toLowerCase())
            }
            const { data: links } = await admin.from('provider_assistants').select('assistant_id')
              .eq('provider_id', u.id).eq('site_id', site.id)
            const ids = (links ?? []).map((l: { assistant_id: string }) => l.assistant_id)
            if (ids.length > 0) {
              const { data: au } = await admin.from('site_memberships')
                .select('users:users!site_memberships_user_id_fkey(email)')
                .eq('site_id', site.id).eq('status', 'active').in('user_id', ids)
              for (const x of (au ?? []) as { users: { email: string | null } | null }[]) {
                if (x.users?.email) ccSet.add(String(x.users.email).toLowerCase())
              }
            }
            ccSet.delete(u.email!.toLowerCase())
            let j = 0
            for (const a of ccSet) {
              j++
              await send(
                `evaldue-${y}-${qm}-${u.id}-cc${j}`,
                a,
                subject,
                `<p style="color:#5B6677;font-size:12px;margin:0 0 12px">You are receiving a copy of this email as an administrative assistant for ${u.full_name}. The original was sent to ${u.email}.</p>` + html,
                site.id,
              )
            }
          }
        }
      }
    }

    return new Response(JSON.stringify(
      dry ? { dry_run: true, would_send: preview.length, preview } : { ok: true, sent, failed },
    ), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
