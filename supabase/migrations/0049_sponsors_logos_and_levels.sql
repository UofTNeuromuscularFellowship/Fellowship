-- ---------------------------------------------------------------------------
-- Sponsors with logos and levels, for courses/conferences and rounds series.
--
--   level     platinum | gold | silver | bronze | supporter — sets the order
--             and how large the logo is shown
--   tier      optional wording shown instead of the level's name
--             ("Educational grant", "Presenting sponsor")
--   logo_url  a public image in the 'branding' bucket
--   website   where the logo links to
--
-- Acknowledged sponsors are shown on the attendee pages (event page, course
-- materials, rounds RSVP page) and at the foot of EVERY email for that event
-- or series: the strip is added inside conf_email_html and rounds_email_html,
-- which all of those emails already go through.
--
-- Applied to the live database in parts (0049a … 0049e); this file is the
-- whole of it.
-- ---------------------------------------------------------------------------

create or replace function public.sponsor_level_rank(p text)
returns int language sql immutable set search_path = public as $$
  select coalesce(array_position(array['platinum', 'gold', 'silver', 'bronze', 'supporter'], p), 6)
$$;

-- ------------------------------------------------------------ courses

alter table public.conf_sponsors
  add column if not exists level    text not null default 'supporter',
  add column if not exists logo_url text,
  add column if not exists website  text;
do $$ begin
  alter table public.conf_sponsors add constraint conf_sponsors_level check (level in ('platinum', 'gold', 'silver', 'bronze', 'supporter'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.conf_sponsors add constraint conf_sponsors_logo_https check (logo_url is null or logo_url ~ '^https://');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.conf_sponsors add constraint conf_sponsors_website_http check (website is null or website ~ '^https?://');
exception when duplicate_object then null; end $$;

-- A tier typed as one of the levels becomes that level.
update public.conf_sponsors
   set level = lower(trim(tier)), tier = null
 where lower(trim(tier)) in ('platinum', 'gold', 'silver', 'bronze', 'supporter');

-- ------------------------------------------------------------- rounds

create table if not exists public.rounds_sponsors (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  series_id    uuid not null references public.rounds_series(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  level        text not null default 'supporter' check (level in ('platinum', 'gold', 'silver', 'bronze', 'supporter')),
  tier         text,
  logo_url     text check (logo_url is null or logo_url ~ '^https://'),
  website      text check (website is null or website ~ '^https?://'),
  acknowledged boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists rounds_sponsors_series on public.rounds_sponsors (series_id);

alter table public.rounds_sponsors enable row level security;
drop policy if exists rounds_sponsors_site_isolation on public.rounds_sponsors;
create policy rounds_sponsors_site_isolation on public.rounds_sponsors as restrictive for all
  using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
  with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)));
drop policy if exists rounds_sponsors_app_definer_all on public.rounds_sponsors;
create policy rounds_sponsors_app_definer_all on public.rounds_sponsors for all to app_definer using (true) with check (true);
drop policy if exists rounds_sponsors_manage on public.rounds_sponsors;
create policy rounds_sponsors_manage on public.rounds_sponsors for all to authenticated
  using (public.can_manage_rounds()) with check (public.can_manage_rounds());
revoke all on public.rounds_sponsors from anon;
grant all on public.rounds_sponsors to service_role, app_definer;
grant select, insert, update, delete on public.rounds_sponsors to authenticated;

-- ------------------------------------------------- what attendees see

create or replace function public.conf_sponsors_json(p_event uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', sp.name, 'kind', sp.kind, 'level', sp.level,
           'tier', coalesce(nullif(trim(sp.tier), ''), initcap(sp.level)),
           'logo_url', sp.logo_url, 'website', sp.website)
         order by sp.kind = 'exhibitor', public.sponsor_level_rank(sp.level), sp.name), '[]'::jsonb)
    from public.conf_sponsors sp
   where sp.event_id = p_event and sp.acknowledged
$$;

create or replace function public.rounds_sponsors_json(p_series uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', sp.name, 'kind', 'sponsor', 'level', sp.level,
           'tier', coalesce(nullif(trim(sp.tier), ''), initcap(sp.level)),
           'logo_url', sp.logo_url, 'website', sp.website)
         order by public.sponsor_level_rank(sp.level), sp.name), '[]'::jsonb)
    from public.rounds_sponsors sp
   where sp.series_id = p_series and sp.acknowledged
$$;

-- The strip at the foot of an email. Grouped by level, larger logos for
-- higher levels; a sponsor without a logo is shown by name.
create or replace function public.sponsors_strip_html(p jsonb)
returns text language plpgsql stable security definer set search_path = public as $$
declare e jsonb; v text := ''; v_group text; v_prev text := null; h int; w int; v_item text;
begin
  if p is null or jsonb_array_length(p) = 0 then return ''; end if;
  for e in select x from jsonb_array_elements(p) x loop
    v_group := case when e->>'kind' = 'exhibitor' then 'Exhibitors' else e->>'tier' end;
    if v_prev is distinct from v_group then
      v := v || case when v_prev is not null then '</p>' else '' end
             || '<p style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5B6677;margin:12px 0 4px">'
             || public.conf_esc(v_group) || '</p><p style="margin:0">';
      v_prev := v_group;
    end if;
    h := case when e->>'kind' = 'exhibitor' then 26 else
         case e->>'level' when 'platinum' then 60 when 'gold' then 48 when 'silver' then 38 when 'bronze' then 30 else 26 end end;
    w := h * 4;
    v_item := case when nullif(e->>'logo_url', '') is not null
      then '<img src="' || public.conf_esc(e->>'logo_url') || '" alt="' || public.conf_esc(e->>'name') || '" height="' || h
           || '" style="display:inline-block;max-height:' || h || 'px;max-width:' || w || 'px;height:auto;width:auto;margin:4px 10px;vertical-align:middle;border:0">'
      else '<span style="display:inline-block;margin:4px 10px;font-weight:600;font-size:' || case when h >= 38 then 15 else 13 end
           || 'px;color:#0F1B2D;vertical-align:middle">' || public.conf_esc(e->>'name') || '</span>' end;
    if nullif(e->>'website', '') is not null and e->>'website' ~ '^https?://' then
      v_item := '<a href="' || public.conf_esc(e->>'website') || '" style="text-decoration:none">' || v_item || '</a>';
    end if;
    v := v || v_item;
  end loop;
  return '<div style="margin:28px 0 0;padding:14px 0 0;border-top:1px solid #E2E6E2;text-align:center">'
      || '<p style="font-size:12px;font-weight:600;color:#0F1B2D;margin:0">With thanks to our sponsors</p>'
      || v || '</p></div>';
end $$;

create or replace function public.conf_sponsors_html(p_event uuid)
returns text language sql stable security definer set search_path = public as $$
  select public.sponsors_strip_html(public.conf_sponsors_json(p_event))
$$;
create or replace function public.rounds_sponsors_html(p_series uuid)
returns text language sql stable security definer set search_path = public as $$
  select public.sponsors_strip_html(public.rounds_sponsors_json(p_series))
$$;

do $$
declare f text;
begin
  foreach f in array array['conf_sponsors_json(uuid)', 'rounds_sponsors_json(uuid)', 'sponsors_strip_html(jsonb)',
                           'conf_sponsors_html(uuid)', 'rounds_sponsors_html(uuid)'] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    -- the email wrappers run as whoever sends: a definer function, the
    -- scheduler, or occasionally a signed-in organizer
    execute format('grant execute on function public.%s to authenticated, app_definer, service_role', f);
  end loop;
end $$;

-- ------------------------------------------------ patch the live functions

-- every course email
do $$
declare v_def text; v_hits int;
  a text := $o$    || '<hr style="border:none;border-top:1px solid #E2E6E2;margin:28px 0 14px">'$o$;
  b text := $n$    || public.conf_sponsors_html(p_ev.id)
    || '<hr style="border:none;border-top:1px solid #E2E6E2;margin:28px 0 14px">'$n$;
begin
  v_def := pg_get_functiondef('public.conf_email_html(public.conf_events,text,text,text,text,text)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'conf_email_html: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

-- every rounds email
do $$
declare v_def text; v_hits int;
  a text := $o$    || '<hr style="border:none;border-top:1px solid #E2E6E2;margin:28px 0 14px">'$o$;
  b text := $n$    || public.rounds_sponsors_html(p_series.id)
    || '<hr style="border:none;border-top:1px solid #E2E6E2;margin:28px 0 14px">'$n$;
begin
  v_def := pg_get_functiondef('public.rounds_email_html(public.rounds_series,text,text,text,text,text)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'rounds_email_html: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

-- the course page: logos, levels and links
do $$
declare v_def text; v_hits int;
  a text := $o$    'sponsors', coalesce((
      select jsonb_agg(jsonb_build_object('name', sp.name, 'tier', sp.tier, 'kind', sp.kind)
        order by sp.kind, sp.tier nulls last, sp.name)
      from public.conf_sponsors sp where sp.event_id = v_ev.id and sp.acknowledged), '[]'::jsonb),$o$;
  b text := $n$    'sponsors', public.conf_sponsors_json(v_ev.id),$n$;
begin
  v_def := pg_get_functiondef('public.conf_public_event(text)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'conf_public_event: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

-- the rounds RSVP page
do $$
declare v_def text; v_hits int;
  a text := $o$    'unsubscribed', exists$o$;
  b text := $n$    'sponsors', public.rounds_sponsors_json(v_ser.id),
    'unsubscribed', exists$n$;
begin
  v_def := pg_get_functiondef('public.rounds_public(text)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'rounds_public: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

notify pgrst, 'reload schema';
