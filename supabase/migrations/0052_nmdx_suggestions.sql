-- ---------------------------------------------------------------------------
-- NMDx suggestions.
--
-- Like a wiki's talk page: anyone in the program can flag an error in an NMDx
-- topic and propose a correction, or request a new topic, and point to source
-- material for either. Every suggestion is visible to all members with its
-- status. The director/admin reviews them, marks each accepted, declined or
-- done with a note, and is emailed when a new one arrives. The NMDx content
-- itself is not edited here; accepted changes are made to the compendium file.
--
-- All writes go through the functions below (SECURITY DEFINER), so the rules
-- live in one place; members can only read the table directly.
-- ---------------------------------------------------------------------------

create table if not exists public.nmdx_suggestions (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  kind            text not null check (kind in ('correction', 'new_topic')),
  -- correction: the NMDx entry and section it is about
  entry_id        text check (entry_id is null or entry_id ~ '^[a-z0-9-]{1,80}$'),
  entry_name      text check (length(entry_name) <= 300),
  section         text check (section is null or section in ('summary', 'clinical', 'investigations', 'differential', 'management', 'sources', 'other')),
  quote           text check (length(quote) <= 2000),
  -- new_topic: the proposed topic
  topic_name      text check (length(topic_name) <= 300),
  -- both: what is wrong / what should be added, and where it comes from
  body            text not null check (length(trim(body)) between 1 and 5000),
  sources         text check (length(sources) <= 5000),
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  status          text not null default 'open' check (status in ('open', 'accepted', 'declined', 'done', 'withdrawn')),
  resolution_note text check (length(resolution_note) <= 2000),
  resolved_by     uuid references public.users(id) on delete set null,
  resolved_at     timestamptz,
  check (kind <> 'correction' or entry_id is not null),
  check (kind <> 'new_topic' or length(trim(coalesce(topic_name, ''))) > 0)
);
create index if not exists nmdx_suggestions_site on public.nmdx_suggestions (site_id, created_at desc);
create index if not exists nmdx_suggestions_entry on public.nmdx_suggestions (site_id, entry_id);

alter table public.nmdx_suggestions enable row level security;
create policy nmdx_suggestions_site_isolation on public.nmdx_suggestions as restrictive for all
  using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
  with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)));
create policy nmdx_suggestions_app_definer_all on public.nmdx_suggestions for all to app_definer using (true) with check (true);
revoke all on public.nmdx_suggestions from anon, authenticated;
grant all on public.nmdx_suggestions to service_role, app_definer;

-- Every member can read every suggestion, as on a wiki talk page.
create policy nmdx_suggestions_read on public.nmdx_suggestions for select to authenticated
  using (public.current_app_role() is not null);
grant select on public.nmdx_suggestions to authenticated;

-- ------------------------------------------------------------ actions

create or replace function public.nmdx_require_member() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.current_uid();
begin
  if v is null or public.current_app_role() is null then
    raise exception 'Sign in as a member of this program to suggest changes to NMDx' using errcode = 'insufficient_privilege';
  end if;
  return v;
end $$;

create or replace function public.nmdx_suggest(
  p_kind text, p_entry_id text, p_entry_name text, p_section text, p_quote text,
  p_topic_name text, p_body text, p_sources text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid := public.nmdx_require_member();
  v_id uuid;
  v_site uuid := public.current_site_id();
  v_name text;
  v_who text;
  r record;
begin
  if p_kind not in ('correction', 'new_topic') then raise exception 'Unknown kind of suggestion'; end if;
  if nullif(trim(p_body), '') is null then
    raise exception '%', case when p_kind = 'correction' then 'Describe the error and the correction' else 'Describe the topic you would like added' end;
  end if;
  if p_kind = 'correction' and nullif(trim(p_entry_id), '') is null then raise exception 'Choose the topic this is about'; end if;
  if p_kind = 'new_topic' and nullif(trim(p_topic_name), '') is null then raise exception 'Name the topic you would like added'; end if;

  insert into public.nmdx_suggestions (site_id, kind, entry_id, entry_name, section, quote, topic_name, body, sources, created_by)
  values (v_site, p_kind,
          case when p_kind = 'correction' then trim(p_entry_id) end,
          case when p_kind = 'correction' then left(nullif(trim(p_entry_name), ''), 300) end,
          case when p_kind = 'correction' then coalesce(nullif(p_section, ''), 'other') end,
          case when p_kind = 'correction' then left(nullif(trim(p_quote), ''), 2000) end,
          case when p_kind = 'new_topic' then left(trim(p_topic_name), 300) end,
          left(trim(p_body), 5000), left(nullif(trim(p_sources), ''), 5000), v)
  returning id into v_id;

  v_name := case when p_kind = 'correction' then coalesce(nullif(trim(p_entry_name), ''), p_entry_id) else trim(p_topic_name) end;
  select coalesce(full_name, 'A member') into v_who from public.users where id = v;
  for r in
    select u.email from public.site_memberships m join public.users u on u.id = m.user_id
     where m.site_id = v_site and m.status = 'active' and m.role in ('director', 'admin') and u.email is not null and u.id <> v
  loop
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

-- The author can withdraw their own suggestion while it is still open.
create or replace function public.nmdx_withdraw(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.nmdx_require_member();
begin
  update public.nmdx_suggestions set status = 'withdrawn', resolved_at = now(), resolved_by = v
   where id = p_id and created_by = v and status = 'open' and site_id = public.current_site_id();
  if not found then raise exception 'You can only withdraw your own open suggestions' using errcode = 'insufficient_privilege'; end if;
end $$;

-- Director/admin: record the outcome, or reopen.
create or replace function public.nmdx_resolve(p_id uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := public.nmdx_require_member();
begin
  if not coalesce(public.is_director_or_admin(), false) then
    raise exception 'Only the program director can review NMDx suggestions' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('open', 'accepted', 'declined', 'done') then raise exception 'Unknown status'; end if;
  update public.nmdx_suggestions
     set status = p_status,
         resolution_note = left(nullif(trim(p_note), ''), 2000),
         resolved_by = case when p_status = 'open' then null else v end,
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_id and site_id = public.current_site_id();
  if not found then raise exception 'That suggestion is no longer there'; end if;
end $$;

-- Names for the list (who suggested, who reviewed).
create or replace function public.nmdx_people() returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, m.role::text
    from public.site_memberships m join public.users u on u.id = m.user_id
   where m.site_id = public.current_site_id() and public.current_app_role() is not null
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'nmdx_require_member()', 'nmdx_suggest(text,text,text,text,text,text,text,text)',
    'nmdx_withdraw(uuid)', 'nmdx_resolve(uuid,text,text)', 'nmdx_people()'] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
