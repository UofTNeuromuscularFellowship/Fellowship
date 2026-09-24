-- ---------------------------------------------------------------------------
-- 0045 — who can run conferences
--
-- Conferences were the program director's and admin's alone. The director can
-- now let other members of the program run them too, as for rounds: a list
-- of people (conf_managers), set by the director only. Everywhere a
-- conference table, file or function checked is_director_or_admin(), it now
-- checks can_manage_conferences(), which is the same test plus that list.
--
-- my_permissions() tells the portal what the signed-in person may run, so
-- the menu shows them only what they can open.
-- ---------------------------------------------------------------------------

create table if not exists public.conf_managers (
  site_id   uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  added_by  uuid references public.users(id) on delete set null default public.current_uid(),
  added_at  timestamptz not null default now(),
  primary key (site_id, user_id)
);

create or replace function public.can_manage_conferences()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_director_or_admin(), false)
      or exists (
        select 1 from public.conf_managers cm
          join public.site_memberships m on m.user_id = cm.user_id and m.site_id = cm.site_id and m.status = 'active'
         where cm.site_id = public.current_site_id() and cm.user_id = auth.uid())
$$;
revoke all on function public.can_manage_conferences() from public, anon;
grant execute on function public.can_manage_conferences() to authenticated;

alter table public.conf_managers enable row level security;
drop policy if exists conf_managers_site_isolation on public.conf_managers;
create policy conf_managers_site_isolation on public.conf_managers as restrictive for all
  using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
  with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)));
drop policy if exists conf_managers_app_definer_all on public.conf_managers;
create policy conf_managers_app_definer_all on public.conf_managers for all to app_definer using (true) with check (true);
drop policy if exists conf_managers_read on public.conf_managers;
create policy conf_managers_read on public.conf_managers for select to authenticated using (public.can_manage_conferences());
drop policy if exists conf_managers_director on public.conf_managers;
create policy conf_managers_director on public.conf_managers for all to authenticated
  using (public.current_app_role() = 'director') with check (public.current_app_role() = 'director');
revoke all on public.conf_managers from anon;
grant select, insert, delete on public.conf_managers to authenticated;
grant all on public.conf_managers to service_role, app_definer;

-- Every conference table's "manage" policy.
do $$
declare r record; v_using text; v_check text;
begin
  for r in
    select tablename, policyname, cmd, roles, qual, with_check from pg_policies
     where schemaname = 'public' and tablename like 'conf%' and tablename <> 'conf_managers'
       and (qual like '%is_director_or_admin()%' or with_check like '%is_director_or_admin()%')
  loop
    v_using := replace(r.qual, 'is_director_or_admin()', 'can_manage_conferences()');
    v_check := replace(r.with_check, 'is_director_or_admin()', 'can_manage_conferences()');
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy %I on public.%I for %s to %s%s%s',
      r.policyname, r.tablename, r.cmd, array_to_string(r.roles, ', '),
      case when v_using is not null then ' using (' || v_using || ')' else '' end,
      case when v_check is not null then ' with check (' || v_check || ')' else '' end);
  end loop;
end $$;

-- The conference files.
do $$
declare r record; v_using text; v_check text;
begin
  for r in
    select policyname, cmd, roles, qual, with_check from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'conference_files_%'
       and (qual like '%is_director_or_admin()%' or with_check like '%is_director_or_admin()%')
  loop
    v_using := replace(r.qual, 'is_director_or_admin()', 'public.can_manage_conferences()');
    v_check := replace(r.with_check, 'is_director_or_admin()', 'public.can_manage_conferences()');
    execute format('drop policy %I on storage.objects', r.policyname);
    execute format('create policy %I on storage.objects for %s to %s%s%s',
      r.policyname, r.cmd, array_to_string(r.roles, ', '),
      case when v_using is not null then ' using (' || v_using || ')' else '' end,
      case when v_check is not null then ' with check (' || v_check || ')' else '' end);
  end loop;
end $$;

-- The one gate every conference function goes through.
do $$
declare v_def text; v_hits int;
  a text := $o$if not public.is_director_or_admin() then
    raise exception 'Only the program director or admin can manage events'$o$;
  b text := $n$if not public.can_manage_conferences() then
    raise exception 'Only the program director, the admin, or someone they have allowed can manage events'$n$;
begin
  v_def := pg_get_functiondef('public.conf_require_coordinator(uuid)'::regprocedure);
  v_hits := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if v_hits <> 1 then raise exception 'conf_require_coordinator: expected 1 match, found %', v_hits; end if;
  execute replace(v_def, a, b);
end $$;

-- The logo bucket: people who run conferences can upload one too.
do $$
declare r record; v_using text; v_check text;
begin
  for r in
    select policyname, cmd, roles, qual, with_check from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'branding_%'
  loop
    v_using := replace(r.qual, 'can_manage_rounds())', 'can_manage_rounds() or public.can_manage_conferences())');
    v_check := replace(r.with_check, 'can_manage_rounds())', 'can_manage_rounds() or public.can_manage_conferences())');
    execute format('drop policy %I on storage.objects', r.policyname);
    execute format('create policy %I on storage.objects for %s to %s%s%s',
      r.policyname, r.cmd, array_to_string(r.roles, ', '),
      case when v_using is not null then ' using (' || v_using || ')' else '' end,
      case when v_check is not null then ' with check (' || v_check || ')' else '' end);
  end loop;
end $$;

-- What the signed-in person may run.
create or replace function public.my_permissions()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rounds', coalesce(public.can_manage_rounds(), false),
    'conferences', coalesce(public.can_manage_conferences(), false),
    'is_director', coalesce(public.current_app_role() = 'director', false))
$$;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

notify pgrst, 'reload schema';
