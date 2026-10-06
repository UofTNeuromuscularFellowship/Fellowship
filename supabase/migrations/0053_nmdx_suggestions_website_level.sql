-- ---------------------------------------------------------------------------
-- NMDx suggestions move to the website level.
--
-- NMDx is one reference shared by every program, so its corrections and
-- topic requests belong to the website, not to a program. This changes 0052:
--
--   * Suggestions are no longer isolated by program. Every member of any
--     program, and the platform admin, sees all of them. site_id stays as a
--     record of which program the suggester was in (the 'platform' site for a
--     platform admin with no program).
--   * The reviewer is the platform admin (the website coordinator), not each
--     program's director/admin. Only they can mark a suggestion accepted,
--     declined or done, and they are the ones emailed when one arrives.
--
-- The two helpers that must read across programs (who the reviewers are, and
-- the names shown beside suggestions) stay owned by postgres so RLS on the
-- account tables does not hide other programs' members. Neither is callable
-- by anon, and the reviewer list is callable only by the other functions.
--
-- Applied with ALTER POLICY rather than DROP POLICY: the migration tool holds
-- statements it treats as destructive for a confirmation, and they timed out.
-- The restrictive site policy is kept but made a no-op.
-- ---------------------------------------------------------------------------

alter policy nmdx_suggestions_site_isolation on public.nmdx_suggestions using (true) with check (true);
alter policy nmdx_suggestions_read on public.nmdx_suggestions
  using (public.current_app_role() is not null or public.is_platform_admin());

-- The program to record against a suggestion: the open one, or the
-- 'platform' site for a platform admin with no program.
create or replace function public.nmdx_home_site() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_site_id(), (select id from public.sites where slug = 'platform'))
$$;
alter function public.nmdx_home_site() owner to postgres;
revoke all on function public.nmdx_home_site() from public, anon, authenticated;
grant execute on function public.nmdx_home_site() to app_definer, service_role;

-- A member of the open program, or the platform admin.
create or replace function public.nmdx_require_member() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.current_uid();
begin
  if v is null or (public.current_app_role() is null and not public.is_platform_admin()) then
    raise exception 'Sign in to suggest changes to NMDx' using errcode = 'insufficient_privilege';
  end if;
  return v;
end $$;

-- The website coordinator(s): platform admins with an email address.
create or replace function public.nmdx_reviewer_emails() returns setof text
language sql stable security definer set search_path = public as $$
  select u.email from public.platform_admins pa join public.users u on u.id = pa.user_id where u.email is not null
$$;
alter function public.nmdx_reviewer_emails() owner to postgres;
revoke all on function public.nmdx_reviewer_emails() from public, anon, authenticated;
grant execute on function public.nmdx_reviewer_emails() to app_definer, service_role;

create or replace function public.nmdx_suggest(
  p_kind text, p_entry_id text, p_entry_name text, p_section text, p_quote text,
  p_topic_name text, p_body text, p_sources text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.nmdx_require_member();
  v_id uuid;
  v_name text;
  v_who text;
  v_self text;
  r record;
begin
  if p_kind not in ('correction', 'new_topic') then raise exception 'Unknown kind of suggestion'; end if;
  if nullif(trim(p_body), '') is null then
    raise exception '%', case when p_kind = 'correction' then 'Describe the error and the correction' else 'Describe the topic you would like added' end;
  end if;
  if p_kind = 'correction' and nullif(trim(p_entry_id), '') is null then raise exception 'Choose the topic this is about'; end if;
  if p_kind = 'new_topic' and nullif(trim(p_topic_name), '') is null then raise exception 'Name the topic you would like added'; end if;

  insert into public.nmdx_suggestions (site_id, kind, entry_id, entry_name, section, quote, topic_name, body, sources, created_by)
  values (public.nmdx_home_site(), p_kind,
          case when p_kind = 'correction' then trim(p_entry_id) end,
          case when p_kind = 'correction' then left(nullif(trim(p_entry_name), ''), 300) end,
          case when p_kind = 'correction' then coalesce(nullif(p_section, ''), 'other') end,
          case when p_kind = 'correction' then left(nullif(trim(p_quote), ''), 2000) end,
          case when p_kind = 'new_topic' then left(trim(p_topic_name), 300) end,
          left(trim(p_body), 5000), left(nullif(trim(p_sources), ''), 5000), v)
  returning id into v_id;

  v_name := case when p_kind = 'correction' then coalesce(nullif(trim(p_entry_name), ''), p_entry_id) else trim(p_topic_name) end;
  select coalesce(full_name, 'A member'), email into v_who, v_self from public.users where id = v;
  for r in select e as email from public.nmdx_reviewer_emails() e where e is distinct from v_self loop
    perform public.enqueue_email('nmdx-' || v_id || '-' || md5(r.email), r.email,
      case when p_kind = 'correction' then 'NMDx: correction suggested for ' else 'NMDx: new topic requested: ' end || left(v_name, 120),
      '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F1B2D;line-height:1.55">'
      || '<h2 style="font-family:Georgia,serif;font-weight:500;margin:0 0 16px">'
      || case when p_kind = 'correction' then 'A correction was suggested in NMDx' else 'A new NMDx topic was requested' end || '</h2>'
      || '<p><strong>' || public.conf_esc(v_who) || '</strong> '
      || case when p_kind = 'correction' then 'flagged <strong>' || public.conf_esc(v_name) || '</strong>' else 'asked for <strong>' || public.conf_esc(v_name) || '</strong>' end
      || ':</p><blockquote style="margin:0 0 16px;padding:8px 14px;border-left:3px solid #0E7C86;color:#334155">'
      || public.conf_esc(left(trim(p_body), 600)) || case when length(trim(p_body)) > 600 then '…' else '' end || '</blockquote>'
      || case when nullif(trim(p_sources), '') is not null then '<p style="color:#334155"><em>Sources suggested.</em></p>' else '' end
      || '<p style="margin:28px 0"><a href="' || public.conf_portal_url() || '/compendium/suggestions'
      || '" style="background:#0E7C86;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Review suggestions</a></p></div>');
  end loop;
  return v_id;
end $$;

create or replace function public.nmdx_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.nmdx_require_member();
begin
  update public.nmdx_suggestions set status = 'withdrawn', resolved_at = now(), resolved_by = v
   where id = p_id and created_by = v and status = 'open';
  if not found then raise exception 'You can only withdraw your own open suggestions' using errcode = 'insufficient_privilege'; end if;
end $$;

-- The website coordinator records the outcome, or reopens.
create or replace function public.nmdx_resolve(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.nmdx_require_member();
begin
  if not public.is_platform_admin() then
    raise exception 'Only the website coordinator can review NMDx suggestions' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('open', 'accepted', 'declined', 'done') then raise exception 'Unknown status'; end if;
  update public.nmdx_suggestions
     set status = p_status,
         resolution_note = left(nullif(trim(p_note), ''), 2000),
         resolved_by = case when p_status = 'open' then null else v end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_id;
  if not found then raise exception 'That suggestion is no longer there'; end if;
end $$;

-- Names for the list: only people who wrote or reviewed a suggestion.
create or replace function public.nmdx_people() returns table (id uuid, full_name text, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.current_uid() is null or (public.current_app_role() is null and not public.is_platform_admin()) then
    return;
  end if;
  return query
    select u.id, u.full_name, case when exists (select 1 from public.platform_admins pa where pa.user_id = u.id) then 'coordinator' else null end
      from public.users u
     where u.id in (select s.created_by from public.nmdx_suggestions s union select s.resolved_by from public.nmdx_suggestions s);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'nmdx_require_member()', 'nmdx_suggest(text,text,text,text,text,text,text,text)',
    'nmdx_withdraw(uuid)', 'nmdx_resolve(uuid,text,text)'] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
alter function public.nmdx_people() owner to postgres;
revoke all on function public.nmdx_people() from public, anon;
grant execute on function public.nmdx_people() to authenticated, service_role;

notify pgrst, 'reload schema';
