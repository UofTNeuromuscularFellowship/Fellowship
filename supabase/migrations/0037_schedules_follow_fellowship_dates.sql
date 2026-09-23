-- ---------------------------------------------------------------------------
-- 0037 — schedules follow each fellow's fellowship dates; clinic changes
--
-- 0036 started storing when each fellow's fellowship starts and ends. This
-- makes the schedules use those dates:
--
--   * The clinic generator only places a fellow on days inside their
--     fellowship, and the three-monthly pattern rotation counts from the day
--     their fellowship starts (from July 1 when no start date is on file, as
--     before).
--   * The fellow lists on the clinic page, teaching attendance and
--     evaluations show the fellows who are in their fellowship on those days.
--   * Teaching feedback requests, cancellation notices, schedule emails and
--     requests for away dates go to fellows whose fellowship covers the dates
--     concerned.
--
-- A fellow with no dates on file is treated as they always were: in their
-- fellowship every day.
--
-- It also adds what the "Make a change" steps on the clinic page need: a
-- start date, end date and paused days for each clinic, a history of schedule
-- changes, and apply_clinic_changes(), which makes a whole change at once and
-- tells each person only about their own days.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------------ helpers

-- Is a date inside a fellowship? Missing dates are open-ended.
create or replace function public.in_fellowship(p_start date, p_end date, p_d date)
returns boolean language sql immutable set search_path = public as $$
  select (p_start is null or p_start <= p_d) and (p_end is null or p_end >= p_d)
$$;

-- Does a fellowship overlap the period p_from .. p_to?
create or replace function public.fellowship_overlaps(p_start date, p_end date, p_from date, p_to date)
returns boolean language sql immutable set search_path = public as $$
  select (p_start is null or p_start <= p_to) and (p_end is null or p_end >= p_from)
$$;

-- What a clinic-schedule cell says, for change emails and the change history.
create or replace function public.clinic_cell_label(
  p_site text, p_provider text, p_protected boolean, p_away boolean, p_status text
) returns text language sql immutable set search_path = public as $$
  select case
    when p_away then 'Away'
    when p_protected then 'Protected'
    when p_status = 'cancelled' then 'Cancelled clinic'
    when coalesce(p_site, '') = '' then 'Free'
    else p_site || coalesce(' · ' || nullif(p_provider, ''), '')
  end
$$;

-- ------------------------------------------------ clinics: start, end, pause

alter table public.clinic_template
  add column if not exists active_from  date,
  add column if not exists active_until date,
  add column if not exists paused_dates date[] not null default '{}';

alter table public.clinic_template drop constraint if exists clinic_template_active_range;
alter table public.clinic_template
  add constraint clinic_template_active_range
  check (active_from is null or active_until is null or active_until >= active_from);

-- Does this clinic run on that date? (Its start and end dates, paused days,
-- and whether its provider is away. The caller checks the weekday.)
create or replace function public.clinic_runs_on(p_clinic uuid, p_d date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clinic_template ct
     where ct.id = p_clinic
       and (ct.active_from is null or ct.active_from <= p_d)
       and (ct.active_until is null or ct.active_until >= p_d)
       and not (p_d = any (coalesce(ct.paused_dates, '{}'::date[])))
       and (ct.provider_id is null or not exists (
             select 1 from public.provider_away_dates pad
              where pad.provider_id = ct.provider_id and pad.away_date = p_d))
  )
$$;

-- --------------------------------------------- the pattern each fellow is on

-- Fellows move to the next weekly pattern every three months, counted from
-- the day their fellowship starts. With no start date on file, count from the
-- start of the academic year (July 1), as before.
create or replace function public.fellow_active_template(p_fellow uuid, p_d date)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  tmpl_ids uuid[]; n int; start_idx int := 0; st uuid;
  v_anchor date; v_age interval; q int;
begin
  select array_agg(id order by sort_order, created_at) into tmpl_ids from public.fellow_templates;
  n := coalesce(array_length(tmpl_ids, 1), 0);
  if n = 0 then return null; end if;
  select start_template_id into st from public.fellow_rotation where fellow_id = p_fellow;
  if st is not null then
    start_idx := coalesce(array_position(tmpl_ids, st), 1) - 1;
  end if;
  select m.fellowship_start into v_anchor from public.site_memberships m
   where m.user_id = p_fellow and m.site_id = public.current_site_id();
  if v_anchor is null or v_anchor > p_d then
    v_anchor := public.ay_start(p_d);
  end if;
  v_age := age(p_d, v_anchor);
  q := (extract(year from v_age)::int * 12 + extract(month from v_age)::int) / 3;
  return tmpl_ids[((start_idx + q) % n) + 1];
end $$;

-- ------------------------------------------------------- the clinic generator

-- Same as before, except that fellows are only placed inside their
-- fellowship, and a clinic that has not started yet, has ended or is paused
-- that day is treated like one whose provider is away.
create or replace function public.generate_clinic_schedule(p_from date, p_to date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  d date; created int := 0;
  f record; slot record; ct record; eff_ct record; alt record; dc record; cand record;
  active_tmpl uuid; assigned uuid[]; cnt int; used_this_month int;
  chosen_site text; chosen_provider uuid; chosen_pname text;
  v_designated date[]; v_reason text; v_ok boolean;
begin
  if not public.is_director_or_admin() then
    raise exception 'not authorized';
  end if;
  if p_to < p_from or p_to > p_from + interval '13 months' then
    raise exception 'range must be forward and at most ~1 year';
  end if;

  d := p_from;
  while d <= p_to loop
    if extract(isodow from d) between 1 and 5 then
      assigned := '{}';

      -- 0) Date-specific clinics: auto-assign available fellows first
      for dc in
        select * from public.clinic_template
        where recurrence = 'dates' and d = any(specific_dates)
      loop
        if not public.clinic_runs_on(dc.id, d) then
          continue;
        end if;
        cnt := public.clinic_day_count(d, dc.site_code, dc.provider_id, dc.provider_name);
        for cand in
          select u.id, u.full_name
          from public.site_users u
          where u.role = 'fellow' and u.status = 'active'
            and public.in_fellowship(u.fellowship_start, u.fellowship_end, d)
            and not (u.id = any(assigned))
            and not exists (select 1 from public.clinic_rotations cr
                            where cr.fellow_id = u.id and cr.rotation_date = d
                              and cr.status <> 'cancelled')
            and not exists (select 1 from public.fellow_away_dates fa
                            where fa.fellow_id = u.id and fa.away_date = d)
            and not exists (select 1 from public.fellow_template_slots s
                            where s.template_id = public.fellow_active_template(u.id, d)
                              and s.weekday = extract(isodow from d)::smallint
                              and s.slot_type = 'protected')
          order by (select count(*) from public.clinic_rotations cr
                    where cr.fellow_id = u.id
                      and cr.site_code = dc.site_code
                      and cr.rotation_date >= public.ay_start(d)) asc,
                   u.full_name
        loop
          exit when cnt >= dc.fellow_capacity;
          insert into public.clinic_rotations
            (fellow_id, fellow_label, rotation_date, site_code, provider_name, supervisor_id, is_draft, is_protected)
          values (cand.id, cand.full_name, d, dc.site_code, dc.provider_name, dc.provider_id, true, false);
          assigned := assigned || cand.id;
          created := created + 1; cnt := cnt + 1;
        end loop;
      end loop;

      -- 1) Weekly pattern pass for everyone else in their fellowship that day
      for f in
        select u.id, u.full_name, u.fellowship_start, u.fellowship_end
        from public.site_users u
        where u.role = 'fellow' and u.status = 'active'
          and public.in_fellowship(u.fellowship_start, u.fellowship_end, d)
        order by u.full_name
      loop
        -- A fellow-day that already has a row (draft or published, from an
        -- earlier generation or a manual placement) is left untouched.
        if exists (select 1 from public.clinic_rotations cr
                   where cr.fellow_id = f.id and cr.rotation_date = d
                     and cr.status <> 'cancelled') then
          continue;
        end if;

        if exists (select 1 from public.fellow_away_dates fa where fa.fellow_id = f.id and fa.away_date = d) then
          insert into public.clinic_rotations
            (fellow_id, fellow_label, rotation_date, site_code, is_draft, is_protected, is_away)
          values (f.id, f.full_name, d, 'Away', true, false, true);
          created := created + 1;
          continue;
        end if;

        if f.id = any(assigned) then continue; end if;

        active_tmpl := public.fellow_active_template(f.id, d);
        if active_tmpl is null then continue; end if;

        select * into slot from public.fellow_template_slots
          where template_id = active_tmpl and weekday = extract(isodow from d)::smallint;
        if not found then continue; end if;

        if slot.slot_type = 'protected' then
          insert into public.clinic_rotations
            (fellow_id, fellow_label, rotation_date, site_code, is_draft, is_protected)
          values (f.id, f.full_name, d, 'PROTECTED', true, true);
          created := created + 1;
          continue;
        end if;

        select * into ct from public.clinic_template where id = slot.clinic_template_id;
        if not found then continue; end if;

        eff_ct := ct;
        if slot.monthly_cap is not null then
          select count(*) into used_this_month
          from public.clinic_rotations cr
          where cr.fellow_id = f.id
            and cr.status <> 'cancelled'
            and cr.rotation_date >= date_trunc('month', d)::date
            and cr.rotation_date <  (date_trunc('month', d) + interval '1 month')::date
            and cr.site_code = ct.site_code
            and cr.supervisor_id is not distinct from ct.provider_id
            and (ct.provider_id is not null or cr.provider_name is not distinct from ct.provider_name);

          select coalesce(array_agg(picked.dt), '{}'::date[]) into v_designated
          from (
            select days.dt
            from (
              select gs::date as dt
              from generate_series(
                     date_trunc('month', d)::date,
                     (date_trunc('month', d) + interval '1 month' - interval '1 day')::date,
                     interval '1 day') gs
              where extract(isodow from gs) = extract(isodow from d)
            ) days
            where days.dt >= p_from
              and public.in_fellowship(f.fellowship_start, f.fellowship_end, days.dt)
              and public.clinic_runs_on(ct.id, days.dt)
              and not exists (select 1 from public.fellow_away_dates fa
                              where fa.fellow_id = f.id and fa.away_date = days.dt)
            order by
              (slot.fallback_clinic_template_id is not null
                 and not public.clinic_runs_on(slot.fallback_clinic_template_id, days.dt)) desc,
              days.dt asc
            limit slot.monthly_cap
          ) picked(dt);

          if used_this_month >= slot.monthly_cap or not (d = any(v_designated)) then
            if slot.fallback_clinic_template_id is null then
              continue;
            end if;
            select * into eff_ct from public.clinic_template where id = slot.fallback_clinic_template_id;
            if not found then continue; end if;
          end if;
        end if;

        chosen_site := eff_ct.site_code; chosen_provider := eff_ct.provider_id; chosen_pname := eff_ct.provider_name;
        v_ok := true; v_reason := null;

        if not public.clinic_runs_on(eff_ct.id, d) then
          v_ok := false;
          v_reason := case
            when eff_ct.provider_id is not null and exists (
                   select 1 from public.provider_away_dates pad
                    where pad.provider_id = eff_ct.provider_id and pad.away_date = d)
              then 'Provider away — needs manual reassignment'
            else 'Clinic not running that day — needs manual reassignment'
          end;
        elsif public.clinic_day_count(d, eff_ct.site_code, eff_ct.provider_id, eff_ct.provider_name) >= eff_ct.fellow_capacity then
          v_ok := false; v_reason := 'Clinic at fellow capacity — needs manual reassignment';
        end if;

        if not v_ok then
          select ct2.* into alt from public.clinic_template ct2
            where ct2.recurrence = 'weekly'
              and ct2.weekday = extract(isodow from d)::smallint
              and ct2.id <> eff_ct.id
              and public.clinic_runs_on(ct2.id, d)
              and public.clinic_day_count(d, ct2.site_code, ct2.provider_id, ct2.provider_name) < ct2.fellow_capacity
            order by (ct2.fellow_capacity - public.clinic_day_count(d, ct2.site_code, ct2.provider_id, ct2.provider_name)) desc
            limit 1;
          if found then
            chosen_site := alt.site_code; chosen_provider := alt.provider_id; chosen_pname := alt.provider_name;
          else
            insert into public.clinic_rotations
              (fellow_id, fellow_label, rotation_date, site_code, provider_name, is_draft, is_protected, has_conflict, notes)
            values (f.id, f.full_name, d, coalesce(eff_ct.site_code, ''), eff_ct.provider_name, true, false, true, v_reason);
            created := created + 1;
            continue;
          end if;
        end if;

        insert into public.clinic_rotations
          (fellow_id, fellow_label, rotation_date, site_code, provider_name, supervisor_id, is_draft, is_protected)
        values (f.id, f.full_name, d, chosen_site, chosen_pname, chosen_provider, true, false);
        created := created + 1;
      end loop;
    end if;
    d := d + 1;
  end loop;

  return created;
end;
$$;

-- For the "a new clinic starts" change: which pattern each fellow is on for
-- each weekday in a period, inside their fellowship.
create or replace function public.clinic_pattern_days(p_from date, p_to date)
returns table (fellow_id uuid, d date, template_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_director_or_admin() then
    raise exception 'not authorized';
  end if;
  if p_to < p_from or p_to > p_from + 400 then
    raise exception 'Choose a period of at most about a year';
  end if;
  return query
    select u.id, gs::date, public.fellow_active_template(u.id, gs::date)
      from public.site_users u
      cross join generate_series(p_from, p_to, interval '1 day') gs
     where u.role = 'fellow' and u.status = 'active'
       and extract(isodow from gs) between 1 and 5
       and public.in_fellowship(u.fellowship_start, u.fellowship_end, gs::date)
     order by 1, 2;
end $$;

-- ------------------------------------------------------------- fellow lists

-- Fellows whose fellowship overlaps p_from .. p_to (today when left out).
-- p_all lists every active fellow in the program whatever their dates.
drop function if exists public.list_fellows();
create function public.list_fellows(p_from date default null, p_to date default null, p_all boolean default false)
returns table (id uuid, full_name text, fellowship_start date, fellowship_end date)
language plpgsql stable security definer set search_path = public as $$
declare
  a date := coalesce(p_from, current_date);
  b date := coalesce(p_to, p_from, current_date);
begin
  if not (
    coalesce((select u.role in ('supervisor','director','admin')
              from public.site_users u where u.id = public.current_uid()), false)
    or exists (select 1 from public.teaching_sessions ts
               where ts.provider_id = public.current_uid() and ts.is_break = false)
  ) then
    raise exception 'not authorized to list fellows';
  end if;

  return query
    select u.id, u.full_name, u.fellowship_start, u.fellowship_end
      from public.site_users u
     where u.role = 'fellow' and u.status = 'active'
       and (p_all or public.fellowship_overlaps(u.fellowship_start, u.fellowship_end, least(a, b), greatest(a, b)))
     order by u.full_name;
end $$;

-- --------------------------------------- emails and lists that name fellows
--
-- These functions exist only in the live database (they predate the repo's
-- migrations), so each is changed by replacing one exact piece of its text.
-- The migration stops if a piece is not found exactly once.

do $$
declare
  v_patch record;
  v_def   text;
  v_hits  int;
begin
  for v_patch in
    select * from (values
      -- session feedback requests: fellows in their fellowship on the session date
      ('public.enqueue_teaching_reminders(boolean)'::regprocedure,
       $o$where role = 'fellow' and status = 'active' and email is not null$o$,
       $n$where role = 'fellow' and status = 'active' and email is not null and public.in_fellowship(fellowship_start, fellowship_end, s.session_date)$n$),
      -- a cancelled teaching session: the fellows who would have been there
      ('public.cancel_teaching(uuid,text)'::regprocedure,
       $o$(u.role in ('director','admin') or u.role = 'fellow' or u.id = s.provider_id)$o$,
       $n$(u.role in ('director','admin') or (u.role = 'fellow' and public.in_fellowship(u.fellowship_start, u.fellowship_end, s.session_date)) or u.id = s.provider_id)$n$),
      -- the teaching schedule email: fellows in their fellowship in the next 8 weeks
      ('public.publish_teaching_drafts()'::regprocedure,
       $o$where status = 'active' and role in ('fellow','supervisor') and email is not null loop$o$,
       $n$where status = 'active' and role in ('fellow','supervisor') and email is not null and (role <> 'fellow' or public.fellowship_overlaps(fellowship_start, fellowship_end, current_date, current_date + 56)) loop$n$),
      -- the clinic schedule email: fellows whose fellowship overlaps what was published
      ('public.publish_clinic_drafts()'::regprocedure,
       $o$where status = 'active' and role = 'fellow' and email is not null$o$,
       $n$where status = 'active' and role = 'fellow' and email is not null and public.fellowship_overlaps(fellowship_start, fellowship_end, v_from, v_to)$n$),
      -- "please send your away dates": fellows in their fellowship during that period
      ('public.request_vacation_submissions(text,date,date)'::regprocedure,
       $o$(p_audience = 'supervisors' and role = 'supervisor')$o$,
       $n$(p_audience = 'supervisors' and role = 'supervisor')
      ) and (role <> 'fellow' or public.fellowship_overlaps(fellowship_start, fellowship_end,
             coalesce(a, current_date), coalesce((b + interval '1 month' - interval '1 day')::date, current_date + 365))$n$),
      -- away dates can be entered for current and incoming fellows, not past ones
      ('public.away_people()'::regprocedure,
       $o$and u.role in ('fellow', 'supervisor', 'director')$o$,
       $n$and u.role in ('fellow', 'supervisor', 'director')
    and (u.role <> 'fellow' or u.fellowship_end is null or u.fellowship_end >= current_date)$n$),
      ('public.list_teachers()'::regprocedure,
       $o$where u.role in ('supervisor', 'director', 'fellow') and u.status = 'active'$o$,
       $n$where u.role in ('supervisor', 'director', 'fellow') and u.status = 'active'
      and (u.role <> 'fellow' or u.fellowship_end is null or u.fellowship_end >= current_date)$n$),
      -- reassigning a cancelled clinic from the grid left it marked cancelled
      ('public.set_clinic_cell(uuid,date,text,uuid)'::regprocedure,
       $o$set site_code = v_site, provider_name = v_pname, supervisor_id = v_pid,$o$,
       $n$set site_code = v_site, provider_name = v_pname, supervisor_id = v_pid, status = 'confirmed',$n$)
    ) as t(fn, old_text, new_text)
  loop
    v_def := pg_get_functiondef(v_patch.fn);
    v_hits := (length(v_def) - length(replace(v_def, v_patch.old_text, ''))) / length(v_patch.old_text);
    if v_hits <> 1 then
      raise exception 'Expected the text to change exactly once in %, found it % times', v_patch.fn, v_hits;
    end if;
    execute replace(v_def, v_patch.old_text, v_patch.new_text);
  end loop;
end $$;

-- ------------------------------------------------ who may edit clinic setup
--
-- These three checked the account-wide role, which says nothing about the
-- program being edited, and fellow_rotation also let supervisors change which
-- pattern a fellow starts on. They now follow the program role, like the
-- other clinic tables.

alter policy ftpl_manage on public.fellow_templates
  using (public.is_director_or_admin()) with check (public.is_director_or_admin());
alter policy fslot_manage on public.fellow_template_slots
  using (public.is_director_or_admin()) with check (public.is_director_or_admin());
alter policy frot_manage on public.fellow_rotation
  using (public.is_director_or_admin()) with check (public.is_director_or_admin());

-- ---------------------------------------------------------- change history

create table if not exists public.schedule_changes (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  area          text not null check (area in ('clinic', 'teaching')),
  kind          text not null,
  summary       text not null,
  details       jsonb not null default '{}'::jsonb,
  days_changed  integer not null default 0,
  people_told   integer not null default 0,
  changed_by    uuid references public.users(id) on delete set null,
  changed_at    timestamptz not null default now()
);
create index if not exists schedule_changes_site_time on public.schedule_changes (site_id, changed_at desc);

alter table public.schedule_changes enable row level security;
drop policy if exists schedule_changes_site_isolation on public.schedule_changes;
create policy schedule_changes_site_isolation on public.schedule_changes as restrictive for all
  using ((site_id = (select public.current_site_id()))
         or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
  with check ((site_id = (select public.current_site_id()))
         or (((select public.current_site_id()) is null) and (public.current_uid() is null)));
drop policy if exists schedule_changes_read on public.schedule_changes;
create policy schedule_changes_read on public.schedule_changes for select to authenticated
  using (public.is_director_or_admin());
drop policy if exists schedule_changes_app_definer_all on public.schedule_changes;
create policy schedule_changes_app_definer_all on public.schedule_changes for all to app_definer
  using (true) with check (true);
revoke all on public.schedule_changes from anon;
grant select on public.schedule_changes to authenticated;
grant all on public.schedule_changes to service_role, app_definer;

-- ------------------------------------------------------ making a change

-- One change to the clinic schedule, made all at once.
--
-- p_ops    the days that change: [{fellow_id, date, mode, clinic_id, note}],
--          mode 'clinic' | 'protected' | 'away' | 'free'. clinic_id 'new'
--          means the clinic created by p_setup.start.
-- p_setup  what changes besides days (each key optional):
--          fellowship {user_id, start, end, reason, note}
--          start      {provider_id, provider_name, weekday, site_code, capacity, from, until, patterns[]}
--          move       {clinic_id, weekday, site_code}
--          capacity   {clinic_id, value}
--          pause      {clinic_id, dates[]}
--          stop       {clinic_id, from}
--          away       {provider_id, dates[], reason}   (saved after the days change)
--
-- Published days that change are emailed: each fellow gets their own days,
-- each supervisor the fellows joining or leaving their clinics, and the
-- clinic CC list the whole change. Days still in a draft are changed quietly.
create or replace function public.apply_clinic_changes(
  p_kind    text,
  p_summary text,
  p_ops     jsonb default '[]'::jsonb,
  p_setup   jsonb default '{}'::jsonb,
  p_notify  boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_site     uuid := public.current_site_id();
  v_me       uuid := public.current_uid();
  v_director boolean := coalesce(public.current_app_role() = 'director', false);
  v_setup    jsonb := coalesce(p_setup, '{}'::jsonb);
  v_x        jsonb;
  v_new      uuid;
  v_ct       public.clinic_template;
  v_wd       smallint;
  v_moved    jsonb := '[]'::jsonb;
  v_cleared  jsonb := '[]'::jsonb;
  v_slot     record;
  v_op       jsonb;
  v_f        uuid;
  v_d        date;
  v_mode     text;
  v_cid      uuid;
  v_fellow   record;
  v_old      record;
  v_had      boolean;
  v_site_code text; v_pname text; v_pid uuid; v_prot boolean; v_away boolean;
  v_before   text; v_after text; v_bsup uuid; v_asup uuid; v_pub boolean;
  v_log      jsonb := '[]'::jsonb;
  v_changed  int := 0;
  v_told     int := 0;
  v_portal   text;
  v_prog     text;
  v_stamp    text;
  r          record;
  v_rows     text;
  v_cc       jsonb;
  v_cc_email text;
  v_sum      text := replace(replace(replace(trim(coalesce(p_summary, '')), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
begin
  if not public.is_director_or_admin() then
    raise exception 'Only the fellowship director or an admin can change the clinic schedule'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_summary), '') = '' then
    raise exception 'Describe the change';
  end if;
  if (v_setup ?| array['start', 'move', 'capacity', 'pause', 'stop']) and not v_director then
    raise exception 'Only the fellowship director can change clinics or weekly patterns'
      using errcode = 'insufficient_privilege';
  end if;

  -- 1) fellowship dates first, so the days below are checked against them
  if v_setup ? 'fellowship' then
    v_x := v_setup -> 'fellowship';
    perform public.set_fellowship_dates((v_x ->> 'user_id')::uuid,
      nullif(v_x ->> 'start', '')::date, nullif(v_x ->> 'end', '')::date,
      v_x ->> 'reason', v_x ->> 'note');
  end if;

  -- 2) a new clinic, placed in the chosen weekly patterns
  if v_setup ? 'start' then
    v_x := v_setup -> 'start';
    if coalesce(trim(v_x ->> 'site_code'), '') = '' or coalesce(trim(v_x ->> 'provider_name'), '') = '' then
      raise exception 'A new clinic needs a provider and a location';
    end if;
    v_wd := (v_x ->> 'weekday')::smallint;
    if v_wd is null or v_wd not between 1 and 5 then
      raise exception 'Choose the weekday the new clinic runs on';
    end if;
    if nullif(v_x ->> 'provider_id', '') is not null and not exists (
         select 1 from public.site_users
          where id = (v_x ->> 'provider_id')::uuid and role in ('supervisor', 'director')) then
      raise exception 'That provider is not in this program';
    end if;
    insert into public.clinic_template
      (provider_id, provider_name, weekday, site_code, fellow_capacity, recurrence, specific_dates, active_from, active_until)
    values
      (nullif(v_x ->> 'provider_id', '')::uuid, trim(v_x ->> 'provider_name'), v_wd, trim(v_x ->> 'site_code'),
       greatest(1, least(coalesce((v_x ->> 'capacity')::int, 1), 20)), 'weekly', '{}',
       nullif(v_x ->> 'from', '')::date, nullif(v_x ->> 'until', '')::date)
    returning id into v_new;
    for v_slot in select value #>> '{}' as tid from jsonb_array_elements(coalesce(v_x -> 'patterns', '[]'::jsonb)) loop
      if not exists (select 1 from public.fellow_templates where id = v_slot.tid::uuid) then
        raise exception 'That weekly pattern is not in this program';
      end if;
      delete from public.fellow_template_slots where template_id = v_slot.tid::uuid and weekday = v_wd;
      insert into public.fellow_template_slots (template_id, weekday, slot_type, clinic_template_id)
      values (v_slot.tid::uuid, v_wd, 'clinic', v_new);
    end loop;
  end if;

  -- 3) a clinic moves to another day and/or location
  if v_setup ? 'move' then
    v_x := v_setup -> 'move';
    select * into v_ct from public.clinic_template where id = (v_x ->> 'clinic_id')::uuid;
    if not found then raise exception 'That clinic is not in this program'; end if;
    v_wd := coalesce((v_x ->> 'weekday')::smallint, v_ct.weekday);
    if v_wd <> v_ct.weekday and v_ct.recurrence <> 'weekly' then
      raise exception 'Only a weekly clinic can move to another day';
    end if;
    if v_ct.recurrence = 'weekly' and v_wd not between 1 and 5 then
      raise exception 'Choose a weekday';
    end if;
    update public.clinic_template
       set weekday = v_wd,
           site_code = coalesce(nullif(trim(v_x ->> 'site_code'), ''), site_code)
     where id = v_ct.id;
    if v_wd <> v_ct.weekday then
      -- Each weekly pattern that had this clinic moves it to the new day when
      -- that day is free in the pattern; otherwise its old day is cleared.
      for v_slot in
        select s.id, s.template_id, t.name
          from public.fellow_template_slots s join public.fellow_templates t on t.id = s.template_id
         where s.clinic_template_id = v_ct.id
      loop
        if exists (select 1 from public.fellow_template_slots o
                    where o.template_id = v_slot.template_id and o.weekday = v_wd) then
          delete from public.fellow_template_slots where id = v_slot.id;
          v_cleared := v_cleared || to_jsonb(v_slot.name);
        else
          update public.fellow_template_slots
             set weekday = v_wd, monthly_cap = null, fallback_clinic_template_id = null
           where id = v_slot.id;
          v_moved := v_moved || to_jsonb(v_slot.name);
        end if;
      end loop;
      update public.fellow_template_slots set fallback_clinic_template_id = null
       where fallback_clinic_template_id = v_ct.id and weekday <> v_wd;
    end if;
  end if;

  -- 4) places per day
  if v_setup ? 'capacity' then
    v_x := v_setup -> 'capacity';
    update public.clinic_template
       set fellow_capacity = greatest(1, least((v_x ->> 'value')::int, 20))
     where id = (v_x ->> 'clinic_id')::uuid;
    if not found then raise exception 'That clinic is not in this program'; end if;
  end if;

  -- 5) paused for a while
  if v_setup ? 'pause' then
    v_x := v_setup -> 'pause';
    update public.clinic_template
       set paused_dates = array(
             select distinct x from unnest(
               coalesce(paused_dates, '{}'::date[])
               || array(select (e #>> '{}')::date from jsonb_array_elements(coalesce(v_x -> 'dates', '[]'::jsonb)) e)
             ) x order by x)
     where id = (v_x ->> 'clinic_id')::uuid;
    if not found then raise exception 'That clinic is not in this program'; end if;
  end if;

  -- 6) stops from a date: it leaves the weekly patterns
  if v_setup ? 'stop' then
    v_x := v_setup -> 'stop';
    select * into v_ct from public.clinic_template where id = (v_x ->> 'clinic_id')::uuid;
    if not found then raise exception 'That clinic is not in this program'; end if;
    if nullif(v_x ->> 'from', '') is null then raise exception 'Choose the first day it no longer runs'; end if;
    update public.clinic_template set active_until = (v_x ->> 'from')::date - 1 where id = v_ct.id;
    for v_slot in
      select s.id, t.name from public.fellow_template_slots s join public.fellow_templates t on t.id = s.template_id
       where s.clinic_template_id = v_ct.id
    loop
      delete from public.fellow_template_slots where id = v_slot.id;
      v_cleared := v_cleared || to_jsonb(v_slot.name);
    end loop;
    update public.fellow_template_slots set fallback_clinic_template_id = null
     where fallback_clinic_template_id = v_ct.id;
  end if;

  -- 7) the days
  for v_op in select value from jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) loop
    v_f := (v_op ->> 'fellow_id')::uuid;
    v_d := (v_op ->> 'date')::date;
    v_mode := v_op ->> 'mode';
    if v_mode is null or v_mode not in ('clinic', 'protected', 'away', 'free') then
      raise exception 'Unknown change for a day';
    end if;
    if v_d < current_date then
      raise exception 'Days in the past can''t be changed (%)', to_char(v_d, 'FMMon DD, YYYY');
    end if;
    select id, full_name, email, fellowship_start, fellowship_end into v_fellow
      from public.site_users where id = v_f and role = 'fellow';
    if not found then raise exception 'That person is not a fellow in this program'; end if;
    if v_mode <> 'free' and not public.in_fellowship(v_fellow.fellowship_start, v_fellow.fellowship_end, v_d) then
      raise exception '% is not in their fellowship on %', v_fellow.full_name, to_char(v_d, 'FMMon DD, YYYY');
    end if;

    v_site_code := null; v_pname := null; v_pid := null; v_prot := false; v_away := false;
    if v_mode = 'clinic' then
      v_cid := case when v_op ->> 'clinic_id' = 'new' then v_new else nullif(v_op ->> 'clinic_id', '')::uuid end;
      select * into v_ct from public.clinic_template where id = v_cid;
      if not found then raise exception 'That clinic is not in this program'; end if;
      v_site_code := v_ct.site_code; v_pname := v_ct.provider_name; v_pid := v_ct.provider_id;
    elsif v_mode = 'protected' then
      v_site_code := 'PROTECTED'; v_prot := true;
    elsif v_mode = 'away' then
      v_site_code := 'Away'; v_away := true;
    end if;

    select * into v_old from public.clinic_rotations
     where fellow_id = v_f and rotation_date = v_d
     order by (status <> 'cancelled') desc, is_draft asc, created_at
     limit 1;
    v_had := found;
    if v_had then
      v_before := public.clinic_cell_label(v_old.site_code, v_old.provider_name, v_old.is_protected, v_old.is_away, v_old.status::text);
      v_bsup := case when v_old.status <> 'cancelled' and not v_old.is_protected and not v_old.is_away then v_old.supervisor_id end;
      v_pub := not v_old.is_draft;
    else
      v_before := 'Free'; v_bsup := null; v_pub := true;
    end if;

    if v_mode = 'free' then
      delete from public.clinic_rotations where fellow_id = v_f and rotation_date = v_d;
      v_after := 'Free'; v_asup := null;
    else
      if v_had then
        update public.clinic_rotations
           set site_code = v_site_code, provider_name = v_pname, supervisor_id = v_pid,
               is_protected = v_prot, is_away = v_away, status = 'confirmed',
               has_conflict = false, notes = nullif(trim(coalesce(v_op ->> 'note', '')), ''),
               fellow_label = v_fellow.full_name
         where id = v_old.id;
        delete from public.clinic_rotations
         where fellow_id = v_f and rotation_date = v_d and id <> v_old.id;
      else
        insert into public.clinic_rotations
          (fellow_id, fellow_label, rotation_date, site_code, provider_name, supervisor_id,
           is_draft, is_protected, is_away, notes)
        values
          (v_f, v_fellow.full_name, v_d, v_site_code, v_pname, v_pid, false, v_prot, v_away,
           nullif(trim(coalesce(v_op ->> 'note', '')), ''));
      end if;
      v_after := public.clinic_cell_label(v_site_code, v_pname, v_prot, v_away, 'confirmed');
      v_asup := v_pid;
    end if;

    if v_before is distinct from v_after or v_bsup is distinct from v_asup then
      v_changed := v_changed + 1;
      v_log := v_log || jsonb_build_object(
        'fellow_id', v_f, 'fellow', v_fellow.full_name, 'date', v_d,
        'before', v_before, 'after', v_after,
        'before_sup', v_bsup, 'after_sup', v_asup, 'published', v_pub);
    end if;
  end loop;

  -- 8) a provider's away dates, saved after the days so the covered ones are
  --    not flagged as conflicts
  if v_setup ? 'away' then
    v_x := v_setup -> 'away';
    if not exists (select 1 from public.site_users
                    where id = (v_x ->> 'provider_id')::uuid and role in ('supervisor', 'director')) then
      raise exception 'That provider is not in this program';
    end if;
    insert into public.provider_away_dates (provider_id, away_date, reason, entered_by)
    select (v_x ->> 'provider_id')::uuid, (e #>> '{}')::date, nullif(trim(coalesce(v_x ->> 'reason', '')), ''), v_me
      from jsonb_array_elements(coalesce(v_x -> 'dates', '[]'::jsonb)) e
    on conflict (provider_id, away_date) do nothing;
  end if;

  -- 9) tell people about published days that changed
  if p_notify and exists (select 1 from jsonb_array_elements(v_log) e where (e ->> 'published')::boolean) then
    select value #>> '{}' into v_portal from public.app_settings where key = 'portal_url';
    select name into v_prog from public.sites where id = v_site;
    v_prog := coalesce(v_prog, 'the fellowship');
    v_stamp := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

    -- each fellow: their own days
    for r in
      select (e ->> 'fellow_id')::uuid as fid,
             string_agg('<tr><td style="padding:4px 12px 4px 0">' || to_char((e ->> 'date')::date, 'FMDy Mon DD') ||
                        '</td><td style="padding:4px 12px 4px 0;color:#777">' || (e ->> 'before') ||
                        '</td><td style="padding:4px 0"><strong>' || (e ->> 'after') || '</strong></td></tr>',
                        '' order by e ->> 'date') as rows_html,
             count(*) as n
        from jsonb_array_elements(v_log) e
       where (e ->> 'published')::boolean
       group by 1
    loop
      select email, full_name into v_fellow from public.site_users where id = r.fid;
      continue when v_fellow.email is null;
      perform public.enqueue_email(
        'clinicchange-' || v_stamp || '-' || r.fid,
        v_fellow.email,
        'Your clinic schedule has changed — ' || v_prog,
        '<p>Hi ' || public.conf_greeting_name(v_fellow.full_name) || ',</p>' ||
        '<p>' || r.n || case when r.n = 1 then ' day' else ' days' end || ' of your clinic schedule changed:</p>' ||
        '<table style="border-collapse:collapse"><tr><th align="left" style="padding:4px 12px 4px 0">Day</th>' ||
        '<th align="left" style="padding:4px 12px 4px 0">Was</th><th align="left">Now</th></tr>' || r.rows_html || '</table>' ||
        '<p>Your full schedule is in the <a href="' || coalesce(v_portal, '') || '/clinic">portal</a>, and calendar subscriptions update automatically.</p>'
      );
      v_told := v_told + 1;
    end loop;

    -- each supervisor: fellows joining or leaving their clinics
    for r in
      select sup,
             string_agg('<li>' || to_char(dt, 'FMDy Mon DD') || ' — ' || line || '</li>', '' order by dt) as rows_html
        from (
          select (e ->> 'before_sup')::uuid as sup, (e ->> 'date')::date as dt,
                 '<strong>' || (e ->> 'fellow') || '</strong> is no longer with you' as line
            from jsonb_array_elements(v_log) e
           where (e ->> 'published')::boolean and e ->> 'before_sup' is not null
             and (e ->> 'before_sup') is distinct from (e ->> 'after_sup')
          union all
          select (e ->> 'after_sup')::uuid, (e ->> 'date')::date,
                 '<strong>' || (e ->> 'fellow') || '</strong> joins you: ' || (e ->> 'after')
            from jsonb_array_elements(v_log) e
           where (e ->> 'published')::boolean and e ->> 'after_sup' is not null
             and (e ->> 'before_sup') is distinct from (e ->> 'after_sup')
          union all
          select (e ->> 'after_sup')::uuid, (e ->> 'date')::date,
                 '<strong>' || (e ->> 'fellow') || '</strong> is now at ' || (e ->> 'after')
            from jsonb_array_elements(v_log) e
           where (e ->> 'published')::boolean and e ->> 'after_sup' is not null
             and (e ->> 'before_sup') = (e ->> 'after_sup') and (e ->> 'before') <> (e ->> 'after')
        ) x
       group by sup
    loop
      select email, full_name into v_fellow from public.site_users where id = r.sup and status = 'active';
      continue when not found or v_fellow.email is null;
      perform public.enqueue_email(
        'clinicchange-' || v_stamp || '-' || r.sup,
        v_fellow.email,
        'Fellows in your clinics have changed — ' || v_prog,
        '<p>Hi ' || public.conf_greeting_name(v_fellow.full_name) || ',</p>' ||
        '<p>The clinic schedule changed for these days:</p><ul>' || r.rows_html || '</ul>' ||
        '<p>The full schedule is in the <a href="' || coalesce(v_portal, '') || '/clinic">portal</a>.</p>'
      );
      v_told := v_told + 1;
    end loop;

    -- the clinic CC list: the whole change
    select string_agg('<tr><td style="padding:4px 12px 4px 0">' || to_char((e ->> 'date')::date, 'FMDy Mon DD') ||
                      '</td><td style="padding:4px 12px 4px 0">' || (e ->> 'fellow') ||
                      '</td><td style="padding:4px 12px 4px 0;color:#777">' || (e ->> 'before') ||
                      '</td><td style="padding:4px 0"><strong>' || (e ->> 'after') || '</strong></td></tr>',
                      '' order by e ->> 'date', e ->> 'fellow')
      into v_rows
      from jsonb_array_elements(v_log) e where (e ->> 'published')::boolean;
    select value into v_cc from public.app_settings where key = 'clinic_cc_emails';
    for v_cc_email in select jsonb_array_elements_text(coalesce(v_cc, '[]'::jsonb)) loop
      perform public.enqueue_email(
        'clinicchange-' || v_stamp || '-cc-' || v_cc_email,
        v_cc_email,
        'Clinic schedule change — ' || v_prog,
        '<p>' || v_sum || '</p>' ||
        '<table style="border-collapse:collapse"><tr><th align="left" style="padding:4px 12px 4px 0">Day</th>' ||
        '<th align="left" style="padding:4px 12px 4px 0">Fellow</th><th align="left" style="padding:4px 12px 4px 0">Was</th>' ||
        '<th align="left">Now</th></tr>' || coalesce(v_rows, '') || '</table>'
      );
      v_told := v_told + 1;
    end loop;
  end if;

  insert into public.schedule_changes (site_id, area, kind, summary, details, days_changed, people_told, changed_by)
  values (v_site, 'clinic', coalesce(nullif(trim(p_kind), ''), 'change'), left(trim(p_summary), 500),
          jsonb_build_object('days', v_log, 'setup', v_setup, 'patterns_moved', v_moved, 'patterns_cleared', v_cleared),
          v_changed, v_told, v_me);

  return jsonb_build_object('changed', v_changed, 'told', v_told, 'clinic_id', v_new,
                            'patterns_moved', v_moved, 'patterns_cleared', v_cleared);
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'clinic_runs_on(uuid,date)', 'fellow_active_template(uuid,date)', 'generate_clinic_schedule(date,date)',
    'clinic_pattern_days(date,date)', 'list_fellows(date,date,boolean)',
    'apply_clinic_changes(text,text,jsonb,jsonb,boolean)'
  ] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- pure helpers
  foreach f in array array[
    'in_fellowship(date,date,date)', 'fellowship_overlaps(date,date,date,date)',
    'clinic_cell_label(text,text,boolean,boolean,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role, app_definer', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
