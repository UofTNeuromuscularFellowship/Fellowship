-- =====================================================================
-- 0024 — Multi-site (shared database, site_id isolation)
-- =====================================================================
-- One database serves several fellowship programs ("sites"). Decisions:
--
--   * sites            — one row per program. Toronto is seeded as the first.
--   * site_memberships — who belongs to which site, with the role and status
--                        they hold THERE. A person can belong to several sites
--                        with different roles under one login.
--   * users            — the account. role/status are now DERIVED: a BEFORE
--                        trigger copies them from the membership at the
--                        account's active_site_id on every write, so nothing a
--                        client sends in those two columns ever sticks.
--   * platform_admins  — the platform login. Lives outside every site. Can
--                        create sites, appoint a first director and switch
--                        toolkit items on and off. Has NO read on per-site
--                        tables: it is simply not a member of any site.
--   * site_tools       — which EMG Toolkit items a site may use.
--
-- Isolation mechanism (the part worth understanding before touching anything):
--
--   1. Every per-site table gains site_id (default current_site_id()) and a
--      RESTRICTIVE policy "same site only". Restrictive policies AND with the
--      existing permissive ones, so every policy written so far keeps working
--      unchanged — within a site.
--   2. SECURITY DEFINER functions used to run as `postgres`, which bypasses RLS
--      entirely. They are re-owned to a new role, app_definer, which does not.
--      Each table gets a permissive "app_definer may do anything" policy, so
--      the functions keep their old privileges — but the restrictive site
--      policy now applies to them too. Any future definer function is
--      site-scoped automatically.
--      The four helpers that RLS policies themselves call (current_app_role,
--      is_director_or_admin, acts_for, current_site_id) stay owned by postgres:
--      they must read users/memberships without recursing into RLS.
--   3. Functions that enumerate people read the site_users view instead of
--      users, so a person who is a supervisor here and a fellow elsewhere is
--      listed with the role they hold HERE.
--   4. Cron entry points run with no auth.uid(). current_site_id() then reads
--      the app.site_id setting, and enqueue_teaching_reminders_all_sites()
--      loops the sites setting it. With neither a user nor a setting the
--      restrictive policy lets everything through (service/cron context only —
--      no client role reaches that state on a per-site table).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sites, memberships, platform admins, tool entitlements
-- ---------------------------------------------------------------------
create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  short_name  text,
  institution text,
  status      text not null default 'active' check (status in ('active','suspended')),
  created_at  timestamptz not null default now()
);
comment on table public.sites is 'One row per fellowship program using the platform.';

-- Toronto: a fixed id so migrations and seeds can refer to it.
insert into public.sites (id, slug, name, short_name, institution)
values ('00000000-0000-4000-8000-000000000001', 'toronto',
        'City Wide Neuromuscular Fellowship', 'Toronto', 'University of Toronto')
on conflict (id) do nothing;

-- "platform": a pseudo-site that owns platform-wide app_settings rows (email
-- sender, PubMed terms, sync state). Never active, so it never appears in a
-- picker and nobody can be a member of it.
insert into public.sites (id, slug, name, short_name, institution, status)
values ('00000000-0000-4000-8000-000000000000', 'platform', 'Platform', 'Platform', null, 'suspended')
on conflict (id) do nothing;

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
comment on table public.platform_admins is 'Platform-level logins. Not members of any site; no access to per-site content.';

create table if not exists public.site_memberships (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       public.user_role not null default 'fellow',
  status     public.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, user_id)
);
create index if not exists site_memberships_user_idx on public.site_memberships(user_id);

create table if not exists public.site_tools (
  site_id   uuid not null references public.sites(id) on delete cascade,
  tool_key  text not null,
  enabled   boolean not null default true,
  primary key (site_id, tool_key)
);
comment on table public.site_tools is 'EMG Toolkit entitlements per site. Keys match the route segment: test-directory, atlas-3d, waveforms, library, calculators, study, ultrasound.';

alter table public.users add column if not exists active_site_id uuid references public.sites(id) on delete set null;

-- Backfill: everyone existing belongs to Toronto with the role they have today.
insert into public.site_memberships (site_id, user_id, role, status)
select '00000000-0000-4000-8000-000000000001', u.id, u.role, u.status from public.users u
on conflict (site_id, user_id) do nothing;
update public.users set active_site_id = '00000000-0000-4000-8000-000000000001' where active_site_id is null;

insert into public.site_tools (site_id, tool_key, enabled)
select '00000000-0000-4000-8000-000000000001', k, true
from unnest(array['test-directory','atlas-3d','waveforms','library','calculators','study','ultrasound']) k
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Helpers used by policies (stay owned by postgres — they bypass RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_site_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(current_setting('app.site_id', true), '')::uuid,
    (select active_site_id from public.users where id = auth.uid())
  );
$$;
revoke all on function public.current_site_id() from public;
grant execute on function public.current_site_id() to authenticated, anon, service_role;

create or replace function public.current_app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select m.role from public.site_memberships m
  where m.user_id = auth.uid() and m.site_id = public.current_site_id() and m.status = 'active';
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated, service_role;

create or replace function public.site_tool_enabled(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or exists (select 1 from public.site_tools t
                 where t.site_id = public.current_site_id() and t.tool_key = p_key and t.enabled);
$$;
revoke all on function public.site_tool_enabled(text) from public;
grant execute on function public.site_tool_enabled(text) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- 3. users.role / users.status are derived from the active membership
-- ---------------------------------------------------------------------
create or replace function public.users_sync_from_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if new.active_site_id is not null then
    select role, status into m from public.site_memberships
    where user_id = new.id and site_id = new.active_site_id;
    if found then
      new.role := m.role;
      new.status := m.status;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_users_sync_from_membership on public.users;
create trigger trg_users_sync_from_membership
  before insert or update on public.users
  for each row execute function public.users_sync_from_membership();

create or replace function public.membership_sync_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- Losing the active site: fall back to another membership, or none.
    update public.users u
       set active_site_id = (select m.site_id from public.site_memberships m
                             where m.user_id = old.user_id and m.status = 'active'
                             order by m.created_at limit 1),
           updated_at = now()
     where u.id = old.user_id and u.active_site_id = old.site_id;
    return old;
  end if;
  -- Re-run the BEFORE trigger on users so the mirrored columns follow.
  update public.users set updated_at = now()
  where id = new.user_id and active_site_id = new.site_id;
  return new;
end;
$$;
drop trigger if exists trg_membership_sync_user on public.site_memberships;
create trigger trg_membership_sync_user
  after insert or update or delete on public.site_memberships
  for each row execute function public.membership_sync_user();

-- The guard no longer needs to police role/status (they cannot be set from a
-- client at all now); it keeps protecting the cohort fields and email.
create or replace function public.guard_users_privileged_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;   -- membership sync
  if public.is_director_or_admin() then return new; end if;
  if new.email is distinct from old.email
     or new.cohort_year is distinct from old.cohort_year
     or new.duration_years is distinct from old.duration_years
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.teaching_only is distinct from old.teaching_only then
    raise exception 'These profile fields can only be changed by the fellowship director or an admin.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. site_users — the people of the current site, with their role HERE
-- ---------------------------------------------------------------------
create or replace view public.site_users with (security_invoker = true) as
  select u.id, u.email, u.full_name, m.role, m.status,
         u.cohort_year, u.duration_years, u.start_date, u.end_date, u.phone,
         u.created_at, u.updated_at, u.must_change_password, u.assistant_emails,
         u.onboarding_dismissed_at, u.teaching_only, u.active_site_id, m.site_id
  from public.users u
  join public.site_memberships m on m.user_id = u.id and m.site_id = public.current_site_id();
grant select on public.site_users to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. app_definer — the role SECURITY DEFINER functions now run as
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_definer') then
    create role app_definer nologin nobypassrls noinherit;
  end if;
end $$;
grant app_definer to postgres;
grant usage, create on schema public to app_definer;
grant all on all tables in schema public to app_definer;
grant all on all sequences in schema public to app_definer;
grant execute on all functions in schema public to app_definer;
alter default privileges for role postgres in schema public grant all on tables to app_definer;
alter default privileges for role postgres in schema public grant all on sequences to app_definer;
alter default privileges for role postgres in schema public grant execute on functions to app_definer;
-- postgres cannot grant USAGE on the auth schema, so app_definer cannot call
-- auth.uid() directly. This postgres-owned wrapper stands in for it inside
-- every re-owned function (the rewrite in section 10 swaps the calls).
create or replace function public.current_uid()
returns uuid language sql stable security definer set search_path = public as $$
  select auth.uid();
$$;
grant execute on function public.current_uid() to app_definer, authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- 6. Per-site tables: site_id, app_definer bypass, restrictive same-site
-- ---------------------------------------------------------------------
create or replace function public._site_isolation_predicate()
returns text language sql immutable as $$
  select $q$(
    site_id = (select public.current_site_id())
    or ((select public.current_site_id()) is null and public.current_uid() is null)
  )$q$;
$$;

do $$
declare
  t text;
  per_site text[] := array[
    'app_settings','cases','case_feedback','clinic_rotations','clinic_template','clinic_trades',
    'competency_targets','evaluations','fellow_away_dates','fellow_rotation','fellow_template_slots',
    'fellow_templates','handbook_pages','handbook_versions','interesting_cases','notifications',
    'protected_days','provider_assistants','provider_away_dates','resources','session_attendance',
    'session_materials','site_supervisors','teaching_case_files','teaching_cases','teaching_feedback',
    'teaching_sessions','teaching_trades','topic_provider_defaults','topic_status','vacation_requests',
    'library_documents','case_media','case_media_consent','case_media_finding','email_queue','email_log'
  ];
  nullable_site text[] := array['app_settings','email_queue','email_log'];
  pred text := public._site_isolation_predicate();
begin
  -- 6a. app_definer bypass on EVERY public table (global ones included).
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_app_definer_all', t);
    execute format('create policy %I on public.%I as permissive for all to app_definer using (true) with check (true)',
                   t || '_app_definer_all', t);
  end loop;

  -- 6b. site_id + restrictive policy on the per-site tables.
  foreach t in array per_site loop
    execute format('alter table public.%I add column if not exists site_id uuid references public.sites(id) on delete cascade default public.current_site_id()', t);
    execute format('update public.%I set site_id = %L where site_id is null', t, '00000000-0000-4000-8000-000000000001');
    if not (t = any(nullable_site)) then
      execute format('alter table public.%I alter column site_id set not null', t);
    end if;
    execute format('create index if not exists %I on public.%I(site_id)', t || '_site_idx', t);
    execute format('drop policy if exists %I on public.%I', t || '_site_isolation', t);
    if t = 'app_settings' then
      -- Platform-wide settings are readable everywhere, writable by nobody at a site.
      execute format($f$create policy %I on public.%I as restrictive for select to public
                       using (site_id = '00000000-0000-4000-8000-000000000000'::uuid or %s)$f$, t || '_site_isolation', t, pred);
      execute format('drop policy if exists %I on public.%I', t || '_site_isolation_write', t);
      execute format($f$create policy %I on public.%I as restrictive for insert to public with check (%s)$f$,
                     t || '_site_isolation_write', t, pred);
      execute format('drop policy if exists %I on public.%I', t || '_site_isolation_update', t);
      execute format($f$create policy %I on public.%I as restrictive for update to public using (%s) with check (%s)$f$,
                     t || '_site_isolation_update', t, pred, pred);
      execute format('drop policy if exists %I on public.%I', t || '_site_isolation_delete', t);
      execute format($f$create policy %I on public.%I as restrictive for delete to public using (%s)$f$,
                     t || '_site_isolation_delete', t, pred);
    else
      execute format($f$create policy %I on public.%I as restrictive for all to public using (%s) with check (%s)$f$,
                     t || '_site_isolation', t, pred, pred);
    end if;
  end loop;
end $$;

-- Global settings: these describe the platform, not a program. They live under
-- the "platform" pseudo-site, and a write with no site context (an edge
-- function using the service role) lands there too.
update public.app_settings set site_id = '00000000-0000-4000-8000-000000000000'
where key in ('email_from','gene_terms_sync','muscle_gene_table_sync','neuro_directory_sync',
              'portal_url','pubmed_last_run','pubmed_terms');
alter table public.app_settings alter column site_id set default
  coalesce(public.current_site_id(), '00000000-0000-4000-8000-000000000000'::uuid);
alter table public.app_settings alter column site_id set not null;

-- Uniqueness that was program-wide is now per site. The PK stays a real PK so
-- PostgREST upserts (which resolve conflicts on the PK) keep working.
alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add primary key (site_id, key);

alter table public.handbook_pages drop constraint if exists handbook_pages_slug_key;
create unique index if not exists handbook_pages_site_slug_uniq on public.handbook_pages(site_id, slug);

alter table public.protected_days drop constraint if exists protected_days_off_date_key;
create unique index if not exists protected_days_site_date_uniq on public.protected_days(site_id, off_date);

alter table public.topic_provider_defaults drop constraint if exists topic_provider_defaults_topic_key;
create unique index if not exists topic_provider_defaults_site_topic_uniq on public.topic_provider_defaults(site_id, topic);

alter table public.topic_status drop constraint if exists topic_status_pkey;
alter table public.topic_status add primary key (site_id, topic_key);

-- Toolkit content tables: refuse, not just hide, when a site lacks the tool.
do $$
declare r record;
begin
  for r in select * from (values
      ('neuro_test_directory','test-directory'),
      ('gene_search_terms','test-directory'),
      ('muscle_gene_table','test-directory'),
      ('atlas3d_markers','atlas-3d'),
      ('publications','library'),
      ('saved_publications','library')
    ) v(tbl, tool) loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_tool_gate', r.tbl);
    execute format('create policy %I on public.%I as restrictive for all to public using (public.site_tool_enabled(%L)) with check (public.site_tool_enabled(%L))',
                   r.tbl || '_tool_gate', r.tbl, r.tool, r.tool);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. users: only yourself and the people of your current site
-- ---------------------------------------------------------------------
drop policy if exists users_site_isolation on public.users;
create policy users_site_isolation on public.users as restrictive for all to public
  using (
    id = public.current_uid()
    or ((select public.current_site_id()) is null and public.current_uid() is null)
    or exists (select 1 from public.site_memberships m
               where m.user_id = users.id and m.site_id = (select public.current_site_id()))
  )
  with check (
    id = public.current_uid()
    or ((select public.current_site_id()) is null and public.current_uid() is null)
    or exists (select 1 from public.site_memberships m
               where m.user_id = users.id and m.site_id = (select public.current_site_id()))
  );

-- ---------------------------------------------------------------------
-- 8. Policies on the new tables
-- ---------------------------------------------------------------------
alter table public.sites enable row level security;
alter table public.platform_admins enable row level security;
alter table public.site_memberships enable row level security;
alter table public.site_tools enable row level security;

create policy sites_read on public.sites for select to authenticated using (true);
create policy sites_platform_write on public.sites for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy site_tools_read on public.site_tools for select to authenticated using (true);
create policy site_tools_platform_write on public.site_tools for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Memberships: your own; the people of your site if you run it; the platform
-- admin sees membership rows (role, status — not content) to appoint directors.
create policy memberships_self on public.site_memberships for select to authenticated
  using (user_id = auth.uid());
create policy memberships_site_admin on public.site_memberships for all to authenticated
  using (site_id = (select public.current_site_id()) and public.is_director_or_admin())
  with check (site_id = (select public.current_site_id()) and public.is_director_or_admin());
create policy memberships_platform_read on public.site_memberships for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 9. Site-aware functions for login, switching and the platform page
-- ---------------------------------------------------------------------
-- The login page lists programs before anyone is signed in.
create or replace function public.list_sites()
returns table(id uuid, slug text, name text, short_name text)
language sql stable security definer set search_path = public as $$
  select id, slug, name, short_name from public.sites where status = 'active' order by name;
$$;
revoke all on function public.list_sites() from public;
grant execute on function public.list_sites() to anon, authenticated, service_role;

create or replace function public.my_sites()
returns table(id uuid, slug text, name text, short_name text, role public.user_role, status public.user_status, is_active boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.slug, s.name, s.short_name, m.role, m.status,
         s.id = (select active_site_id from public.users where id = auth.uid())
  from public.site_memberships m
  join public.sites s on s.id = m.site_id
  where m.user_id = auth.uid() and s.status = 'active'
  order by s.name;
$$;
revoke all on function public.my_sites() from public;
grant execute on function public.my_sites() to authenticated, service_role;

create or replace function public.set_active_site(p_site uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.site_memberships m join public.sites s on s.id = m.site_id
                 where m.user_id = auth.uid() and m.site_id = p_site and m.status = 'active' and s.status = 'active') then
    raise exception 'You are not an active member of that program.';
  end if;
  update public.users set active_site_id = p_site, updated_at = now() where id = auth.uid();
end;
$$;
revoke all on function public.set_active_site(uuid) from public;
grant execute on function public.set_active_site(uuid) to authenticated;

-- Platform admin: who runs each site (names only — no content).
create or replace function public.platform_site_directors()
returns table(site_id uuid, user_id uuid, full_name text, email text, status public.user_status)
language sql stable security definer set search_path = public as $$
  select m.site_id, u.id, u.full_name, u.email, m.status
  from public.site_memberships m join public.users u on u.id = m.user_id
  where m.role = 'director' and public.is_platform_admin()
  order by u.full_name;
$$;
revoke all on function public.platform_site_directors() from public;
grant execute on function public.platform_site_directors() to authenticated;

create or replace function public.platform_site_counts()
returns table(site_id uuid, members bigint, fellows bigint)
language sql stable security definer set search_path = public as $$
  select m.site_id, count(*), count(*) filter (where m.role = 'fellow' and m.status = 'active')
  from public.site_memberships m
  where public.is_platform_admin()
  group by m.site_id;
$$;
revoke all on function public.platform_site_counts() from public;
grant execute on function public.platform_site_counts() to authenticated;

-- Cron: run the hourly reminders once per site, in that site's context.
create or replace function public.enqueue_teaching_reminders_all_sites(p_force boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in select id from public.sites where status = 'active' loop
    perform set_config('app.site_id', s.id::text, true);
    n := n + coalesce(public.enqueue_teaching_reminders(p_force), 0);
  end loop;
  perform set_config('app.site_id', '', true);
  return n;
end;
$$;
revoke all on function public.enqueue_teaching_reminders_all_sites(boolean) from public;

-- Who directs the current program — for letterheads and signatures. Any
-- member may ask; it names people, nothing else. (Re-owned to app_definer by
-- section 10, which also scopes it to the current site.)
create or replace function public.site_directors()
returns table(id uuid, full_name text, email text)
language sql stable security definer set search_path = public as $$
  select u.id, u.full_name, u.email
  from public.site_users u
  where u.role = 'director' and u.status = 'active'
    and public.current_app_role() is not null
  order by u.full_name;
$$;
revoke all on function public.site_directors() from public;
grant execute on function public.site_directors() to authenticated;

-- topic_status is keyed per site now.
create or replace function public.set_topic_status(p_key text, p_label text, p_status text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not coalesce(public.is_director_or_admin(), false) then
    raise exception 'not authorized to curate topic requests';
  end if;
  if p_status not in ('open', 'covered', 'not_planned') then
    raise exception 'unknown status %', p_status;
  end if;
  if p_status = 'open' then
    delete from public.topic_status where topic_key = p_key;
    return;
  end if;
  insert into public.topic_status (site_id, topic_key, label, status, updated_by, updated_at)
  values (public.current_site_id(), p_key, p_label, p_status, auth.uid(), now())
  on conflict (site_id, topic_key) do update
    set status = excluded.status, label = excluded.label,
        updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- New accounts: the membership comes from the invite metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r public.user_role;
  s uuid;
begin
  begin r := coalesce((m->>'role')::public.user_role, 'fellow'); exception when others then r := 'fellow'; end;
  begin s := nullif(m->>'site_id', '')::uuid; exception when others then s := null; end;
  if s is null then s := '00000000-0000-4000-8000-000000000001'; end if;

  insert into public.users (id, email, full_name, role, cohort_year, must_change_password, active_site_id)
  values (new.id, new.email, coalesce(m->>'full_name', split_part(new.email, '@', 1)), r,
          nullif(m->>'cohort_year', ''), coalesce((m->>'must_change_password')::boolean, false), s)
  on conflict (id) do update
    set email = excluded.email, full_name = excluded.full_name,
        cohort_year = excluded.cohort_year, must_change_password = excluded.must_change_password;

  insert into public.site_memberships (site_id, user_id, role, status)
  values (s, new.id, r, 'active')
  on conflict (site_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Re-own SECURITY DEFINER functions and point enumerations at site_users
-- ---------------------------------------------------------------------
do $$
declare
  f record;
  def text;
  keep_postgres text[] := array['current_app_role','is_director_or_admin','acts_for','current_site_id',
                                'current_uid','is_platform_admin','site_tool_enabled','users_sync_from_membership',
                                'membership_sync_user','list_sites','my_sites','set_active_site',
                                'platform_site_directors','platform_site_counts'];
  -- These write to users (a view is not writable) or must see the account, not the membership.
  keep_users text[] := array['clear_must_change_password','handle_new_user','guard_users_privileged_columns'];
begin
  for f in
    select p.oid, p.proname, p.prosecdef, p.prokind
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    if f.proname = any(keep_postgres) then continue; end if;
    if not f.prosecdef then continue; end if;

    def := pg_get_functiondef(f.oid);
    if not (f.proname = any(keep_users)) then
      def := replace(def, 'public.users', 'public.site_users');
    end if;
    def := replace(def, 'auth.uid()', 'public.current_uid()');
    if def <> pg_get_functiondef(f.oid) then
      execute def;
    end if;
    execute format('alter function %s owner to app_definer', f.oid::regprocedure);
  end loop;
end $$;

-- clinic_tally is SECURITY INVOKER and reads users directly; make it site-aware too.
create or replace function public.clinic_tally()
returns table(fellow_id uuid, fellow_label text, provider_name text, n bigint)
language sql stable set search_path to 'public' as $$
  select cr.fellow_id, cr.fellow_label, cr.provider_name, count(*)
  from public.clinic_rotations cr
  where cr.is_draft = false
    and cr.status <> 'cancelled'
    and cr.provider_name is not null
    and cr.fellow_id is not null
    and cr.rotation_date >= public.ay_start(current_date)
    and cr.rotation_date < public.ay_start(current_date) + interval '1 year'
    and public.is_director_or_admin()
  group by cr.fellow_id, cr.fellow_label, cr.provider_name
  order by cr.fellow_label, cr.provider_name;
$$;

-- The auth trigger must still be callable by the auth service.
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Cron: swap the hourly job to the per-site wrapper.
do $$
declare j record;
begin
  for j in select jobid from cron.job where command like '%enqueue_teaching_reminders()%' loop
    perform cron.alter_job(j.jobid, command := 'select public.enqueue_teaching_reminders_all_sites();');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. Storage: the shared buckets stay per-uid/per-role; nothing to change.
-- ---------------------------------------------------------------------

drop function if exists public._site_isolation_predicate();

-- ---------------------------------------------------------------------
-- 12. Tighten EXECUTE on SECURITY DEFINER functions (advisor findings)
-- ---------------------------------------------------------------------
-- NOTE: these revokes are largely INEFFECTIVE on their own — Postgres grants
-- EXECUTE to PUBLIC, which anon inherits, and revoking from anon does not
-- touch the PUBLIC grant. Migration 0027 is the one that actually closes
-- these. Kept here so the history reads truthfully.
-- The three helpers RLS policies call (current_uid, current_site_id,
-- site_tool_enabled) must stay callable by anon, since policies are evaluated
-- as the querying role. Everything else here is for signed-in people or cron.
revoke execute on function public.enqueue_teaching_reminders_all_sites(boolean) from anon, authenticated;
revoke execute on function public.enqueue_teaching_reminders(boolean) from anon, authenticated;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.membership_sync_user() from anon, authenticated;
revoke execute on function public.users_sync_from_membership() from anon, authenticated;
revoke execute on function public.my_sites() from anon;
revoke execute on function public.platform_site_counts() from anon;
revoke execute on function public.platform_site_directors() from anon;
revoke execute on function public.set_active_site(uuid) from anon;
revoke execute on function public.site_directors() from anon;
-- Pre-existing functions that were never meant for unauthenticated callers.
revoke execute on function public.clinic_schedule_html(date, integer) from anon;
revoke execute on function public.teaching_schedule_html(date, integer) from anon;
revoke execute on function public.confirm_teaching(uuid) from anon;
revoke execute on function public.flag_provider_conflict() from anon;
revoke execute on function public.flag_teaching_conflict(uuid, text) from anon;
revoke execute on function public.mark_teaching_attendance(uuid, boolean) from anon;
revoke execute on function public.stamp_entered_by() from anon;
revoke execute on function public.supervisor_shared_cases() from anon;

-- Seed the platform admin (Corey Bacher). Change the email to move the role.
insert into public.platform_admins (user_id, note)
select id, 'Corey Bacher — platform (master) admin' from public.users where email = 'cbacher2@gmail.com'
on conflict (user_id) do nothing;
