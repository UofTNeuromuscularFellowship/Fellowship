-- 0027 — Lock down EXECUTE on SECURITY DEFINER functions.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and anon and
-- authenticated both inherit PUBLIC. Every "revoke execute ... from anon"
-- written so far (including in migration 0008) therefore did nothing: it
-- removed an explicit grant that never existed while the PUBLIC grant stayed.
-- The ACL shows this as a leading "=X/owner".
--
-- The consequence worth naming: public.enqueue_email(ref, to, subject, html)
-- is SECURITY DEFINER, so ANY signed-in user of ANY programme could call
-- /rest/v1/rpc/enqueue_email and send arbitrary HTML from the fellowship's own
-- sending domain to any address. Every trigger body was likewise callable.
--
-- Revoke from PUBLIC (the grant that mattered), then grant back explicitly.
-- Trigger functions get no grant at all — Postgres does not check EXECUTE
-- when firing a trigger.
do $$
declare
  f record; n int := 0;
  internal text[] := array[
    'atlas3d_markers_touch','case_media_touch','cc_assistant_emails','flag_provider_conflict',
    'guard_users_privileged_columns','handle_new_user','membership_sync_user','notify_new_evaluation',
    'notify_trade_approved','notify_trade_request','notify_vacation_decision','notify_vacation_request',
    'stamp_entered_by','users_sync_from_membership','enqueue_email','enqueue_teaching_reminders',
    'enqueue_teaching_reminders_all_sites','flag_teaching_conflict'
  ];
  -- Needed before sign-in: the first three are called by RLS policies, which
  -- are evaluated as the querying role; list_sites feeds the login page.
  anon_ok text[] := array['current_uid','current_site_id','site_tool_enabled','list_sites'];
begin
  for f in
    select p.proname, p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to app_definer, service_role', f.sig);
    if not (f.proname = any(internal)) then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.proname = any(anon_ok) then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
    n := n + 1;
  end loop;
  raise notice 'hardened % security definer functions', n;
end $$;

grant execute on function public.handle_new_user() to supabase_auth_admin;

comment on function public.enqueue_email(text, text, text, text) is
  'Internal mail plumbing. EXECUTE is deliberately withheld from anon and authenticated: it sends arbitrary HTML from the fellowship domain. Call it only from other SECURITY DEFINER functions.';
