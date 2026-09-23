-- ---------------------------------------------------------------------------
-- 0036 — fellowship dates, the "add people" wizard, and first sign-in
--
-- Fellowship dates belong to a fellow's place in a PROGRAM, so they live on
-- the membership, not the account: the same login can be a fellow in one
-- program and faculty in another. Only the program's director or admin can
-- write memberships, so a fellow cannot move their own dates (the old
-- users.start_date / end_date / duration_years columns were never used by the
-- portal and are left alone).
--
-- Dates change - an extension, a leave, finishing early - so every change is
-- made through set_fellowship_dates(), which records who changed what and why.
--
-- users.welcomed_at marks that someone has been through the first sign-in
-- steps. Everyone who already has an account counts as welcomed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------- fellowship dates

alter table public.site_memberships
  add column if not exists fellowship_start date,
  add column if not exists fellowship_end   date;

alter table public.site_memberships
  add constraint site_memberships_fellowship_dates
  check (fellowship_start is null or fellowship_end is null or fellowship_end >= fellowship_start);

-- carry across anything that was ever typed into the old columns
update public.site_memberships m
   set fellowship_start = u.start_date, fellowship_end = u.end_date
  from public.users u
 where u.id = m.user_id and m.role = 'fellow'
   and (u.start_date is not null or u.end_date is not null)
   and m.fellowship_start is null and m.fellowship_end is null;

create table public.fellowship_changes (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  old_start   date,
  old_end     date,
  new_start   date,
  new_end     date,
  reason      text not null check (reason in ('initial', 'extension', 'leave', 'early_finish', 'correction')),
  note        text,
  changed_by  uuid references public.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index fellowship_changes_user on public.fellowship_changes (user_id, changed_at desc);
create index fellowship_changes_site on public.fellowship_changes (site_id);

alter table public.fellowship_changes enable row level security;
create policy fellowship_changes_site_isolation on public.fellowship_changes as restrictive for all
  using ((site_id = (select public.current_site_id()))
         or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
  with check ((site_id = (select public.current_site_id()))
         or (((select public.current_site_id()) is null) and (public.current_uid() is null)));
-- read by the director or admin; written only by set_fellowship_dates()
create policy fellowship_changes_read on public.fellowship_changes for select to authenticated
  using (public.is_director_or_admin());
create policy fellowship_changes_app_definer_all on public.fellowship_changes for all to app_definer
  using (true) with check (true);
revoke all on public.fellowship_changes from anon;
grant select on public.fellowship_changes to authenticated;
grant all on public.fellowship_changes to service_role, app_definer;

-- The one way fellowship dates change after an account exists.
create or replace function public.set_fellowship_dates(
  p_user uuid, p_start date, p_end date, p_reason text, p_note text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_site uuid := public.current_site_id();
  v_m    public.site_memberships;
begin
  if not public.is_director_or_admin() then
    raise exception 'Only the fellowship director or an admin can change fellowship dates'
      using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or p_reason not in ('initial', 'extension', 'leave', 'early_finish', 'correction') then
    raise exception 'Choose why the dates are changing';
  end if;
  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'The fellowship ends before it starts';
  end if;
  select * into v_m from public.site_memberships
   where site_id = v_site and user_id = p_user for update;
  if not found then raise exception 'That person is not in this program'; end if;
  if v_m.role <> 'fellow' then raise exception 'Fellowship dates are only kept for fellows'; end if;
  if v_m.fellowship_start is not distinct from p_start and v_m.fellowship_end is not distinct from p_end then
    return false;
  end if;

  update public.site_memberships
     set fellowship_start = p_start, fellowship_end = p_end, updated_at = now()
   where id = v_m.id;
  insert into public.fellowship_changes
    (site_id, user_id, old_start, old_end, new_start, new_end, reason, note, changed_by)
  values
    (v_site, p_user, v_m.fellowship_start, v_m.fellowship_end, p_start, p_end, p_reason,
     nullif(left(trim(coalesce(p_note, '')), 500), ''), public.current_uid());
  return true;
end $$;

-- ------------------------------------------------------- people, by program

-- Same view, two columns added at the end (existing columns keep their order).
create or replace view public.site_users with (security_invoker = true) as
  select u.id, u.email, u.full_name, m.role, m.status, u.cohort_year, u.duration_years,
         u.start_date, u.end_date, u.phone, u.created_at, u.updated_at, u.must_change_password,
         u.assistant_emails, u.onboarding_dismissed_at, u.teaching_only, u.active_site_id, m.site_id,
         m.fellowship_start, m.fellowship_end
    from public.users u
    join public.site_memberships m on m.user_id = u.id and m.site_id = public.current_site_id();

-- For the "add people" wizard: does this address already have a login, and
-- is it already in this program? Answers the director or admin only, and says
-- nothing about which other program an address belongs to.
create or replace function public.people_email_status(p_email text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid   uuid;
  v_m     public.site_memberships;
begin
  if not public.is_director_or_admin() then
    raise exception 'not authorized' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('valid', false); end if;
  select public.conf_user_for_email(v_email) into v_uid;
  if v_uid is null then return jsonb_build_object('valid', true, 'exists', false); end if;
  select * into v_m from public.site_memberships where user_id = v_uid and site_id = public.current_site_id();
  return jsonb_build_object('valid', true, 'exists', true,
    'member_here', found, 'active_here', found and v_m.status = 'active',
    'role_here', case when found then v_m.role::text end);
end $$;

-- --------------------------------------------------------- first sign-in

alter table public.users add column if not exists welcomed_at timestamptz;
-- everyone who already has an account has, in effect, been welcomed
update public.users set welcomed_at = coalesce(onboarding_dismissed_at, created_at, now()) where welcomed_at is null;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array['set_fellowship_dates(uuid,date,date,text,text)', 'people_email_status(text)'] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
