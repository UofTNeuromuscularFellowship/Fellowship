-- ---------------------------------------------------------------------------
-- 0040 — learners: residents and medical students on clinic rotations
--
-- Learners are not portal members. The director (or admin) adds them with
-- their contact details, school, level and rotation dates, plus days they
-- are away or must be at teaching. Their clinic days are drafted from the
-- clinic schedule already in the portal: a clinic running that day takes a
-- learner when its fellow places aren't all taken, up to the clinic's learner
-- places. Publishing emails each learner their days and each supervisor the
-- learners coming to them. At the end of each clinic day the supervisor is
-- emailed a short feedback form (meets the level expected? what went well?
-- what to improve?), which lands on the director's learner feedback page.
-- ---------------------------------------------------------------------------

alter table public.clinic_template
  add column if not exists learner_capacity smallint not null default 1 check (learner_capacity between 0 and 10);

create table if not exists public.learners (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  full_name       text not null check (length(trim(full_name)) > 0),
  email           text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone           text,
  school          text,
  learner_type    text not null default 'resident' check (learner_type in ('resident', 'medical_student', 'other')),
  level           text,
  specialty       text,
  rotation_start  date not null,
  rotation_end    date not null,
  off_rules       jsonb not null default '[]'::jsonb,
  notes           text,
  status          text not null default 'active' check (status in ('active', 'archived')),
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint learners_rotation_order check (rotation_end >= rotation_start)
);
create index if not exists learners_site on public.learners (site_id, rotation_start);

-- Days a learner can't be in clinic: away, or at mandatory teaching.
create table if not exists public.learner_off_dates (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  learner_id  uuid not null references public.learners(id) on delete cascade,
  off_date    date not null,
  kind        text not null default 'away' check (kind in ('away', 'teaching')),
  reason      text,
  recurring   boolean not null default false
);
create unique index if not exists learner_off_dates_unique on public.learner_off_dates (learner_id, off_date);

create table if not exists public.learner_rotations (
  id                    uuid primary key default gen_random_uuid(),
  site_id               uuid not null default public.current_site_id() references public.sites(id) on delete cascade,
  learner_id            uuid not null references public.learners(id) on delete cascade,
  rotation_date         date not null,
  clinic_template_id    uuid references public.clinic_template(id) on delete set null,
  site_code             text not null,
  provider_name         text,
  supervisor_id         uuid references public.users(id) on delete set null,
  is_draft              boolean not null default true,
  status                text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  feedback_token        text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  feedback_requested_at timestamptz,
  created_at            timestamptz not null default now()
);
create unique index if not exists learner_rotations_one_a_day on public.learner_rotations (learner_id, rotation_date);
create index if not exists learner_rotations_site_date on public.learner_rotations (site_id, rotation_date);

create table if not exists public.learner_feedback (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null references public.sites(id) on delete cascade,
  learner_rotation_id uuid not null unique references public.learner_rotations(id) on delete cascade,
  learner_id          uuid not null references public.learners(id) on delete cascade,
  supervisor_id       uuid references public.users(id) on delete set null,
  supervisor_name     text,
  meets_level         text not null check (meets_level in ('below', 'meets', 'above')),
  did_well            text,
  improve             text,
  submitted_at        timestamptz not null default now()
);

-- ------------------------------------------------------------------ RLS

do $$
declare t text;
begin
  foreach t in array array['learners', 'learner_off_dates', 'learner_rotations', 'learner_feedback'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_site_isolation', t);
    execute format($p$create policy %I on public.%I as restrictive for all
      using ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))
      with check ((site_id = (select public.current_site_id())) or (((select public.current_site_id()) is null) and (public.current_uid() is null)))$p$,
      t || '_site_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_app_definer_all', t);
    execute format('create policy %I on public.%I for all to app_definer using (true) with check (true)', t || '_app_definer_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_manage', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_director_or_admin()) with check (public.is_director_or_admin())', t || '_manage', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role, app_definer', t);
  end loop;
end $$;

-- a supervisor sees the learners booked into their own clinics
drop policy if exists learner_rotations_supervisor on public.learner_rotations;
create policy learner_rotations_supervisor on public.learner_rotations for select to authenticated
  using (not is_draft and public.acts_for(supervisor_id));

-- -------------------------------------------------------------- helpers

-- The program's time zone, for "end of the clinic day".
create or replace function public.site_timezone()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = 'timezone'), 'America/Toronto')
$$;

-- Learners booked into a clinic on a day.
create or replace function public.learner_day_count(p_date date, p_site text, p_provider uuid, p_pname text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.learner_rotations lr
   where lr.rotation_date = p_date and lr.status <> 'cancelled' and lr.site_code = p_site
     and lr.supervisor_id is not distinct from p_provider
     and (p_provider is not null or lr.provider_name is not distinct from p_pname)
$$;

-- ------------------------------------------------------------ the draft

-- Fill each learner's rotation with clinic days: on each weekday inside the
-- rotation that isn't a day off, a clinic with a named supervisor running that day whose fellow
-- places aren't all taken and which still has a learner place. Clinics the
-- learner has been to least come first, so they see a spread. Days already on
-- a learner's schedule are left alone. Everything lands as a draft.
create or replace function public.generate_learner_schedule(p_from date, p_to date, p_learner uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_l learners; d date; v_ct record; v_n int := 0;
begin
  if not public.is_director_or_admin() then raise exception 'not authorized' using errcode = 'insufficient_privilege'; end if;
  if p_to < p_from or p_to > p_from + 400 then raise exception 'Choose a period of at most about a year'; end if;

  for v_l in
    select * from public.learners
     where status = 'active' and (p_learner is null or id = p_learner)
       and rotation_start <= p_to and rotation_end >= p_from
     order by rotation_start, full_name
  loop
    d := greatest(p_from, v_l.rotation_start, current_date);
    while d <= least(p_to, v_l.rotation_end) loop
      if extract(isodow from d) between 1 and 5
         and not exists (select 1 from public.learner_off_dates o where o.learner_id = v_l.id and o.off_date = d)
         and not exists (select 1 from public.learner_rotations lr where lr.learner_id = v_l.id and lr.rotation_date = d) then
        select ct.* into v_ct
          from public.clinic_template ct
         where ct.learner_capacity > 0
           and ct.provider_id is not null   -- a learner needs a named supervisor (no TBD clinics)
           and ((ct.recurrence = 'weekly' and ct.weekday = extract(isodow from d)) or (ct.recurrence = 'dates' and d = any(ct.specific_dates)))
           and public.clinic_runs_on(ct.id, d)
           and public.clinic_day_count(d, ct.site_code, ct.provider_id, ct.provider_name) < ct.fellow_capacity
           and public.learner_day_count(d, ct.site_code, ct.provider_id, ct.provider_name) < ct.learner_capacity
         order by
           (select count(*) from public.learner_rotations lr
             where lr.learner_id = v_l.id and lr.site_code = ct.site_code
               and lr.supervisor_id is not distinct from ct.provider_id) asc,
           (ct.learner_capacity - public.learner_day_count(d, ct.site_code, ct.provider_id, ct.provider_name)) desc,
           ct.provider_name, ct.site_code
         limit 1;
        if found then
          insert into public.learner_rotations (site_id, learner_id, rotation_date, clinic_template_id, site_code, provider_name, supervisor_id, is_draft)
          values (v_l.site_id, v_l.id, d, v_ct.id, v_ct.site_code, v_ct.provider_name, v_ct.provider_id, true);
          v_n := v_n + 1;
        end if;
      end if;
      d := d + 1;
    end loop;
  end loop;
  return v_n;
end $$;

-- Put a learner in a clinic for a day (or take them out, p_clinic null).
-- A new day is a draft until published; a published day that changes stays
-- published and the learner and supervisors are emailed.
create or replace function public.set_learner_day(p_learner uuid, p_date date, p_clinic uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_l learners; v_ct clinic_template; v_old learner_rotations; v_portal text; v_prog text; v_sup record;
begin
  if not public.is_director_or_admin() then raise exception 'not authorized' using errcode = 'insufficient_privilege'; end if;
  select * into v_l from public.learners where id = p_learner;
  if not found then raise exception 'That learner is not in this program'; end if;
  if p_date < current_date then raise exception 'Past days can''t be changed'; end if;
  select * into v_old from public.learner_rotations where learner_id = p_learner and rotation_date = p_date;
  if p_clinic is null then
    delete from public.learner_rotations where learner_id = p_learner and rotation_date = p_date;
  else
    if p_date < v_l.rotation_start or p_date > v_l.rotation_end then raise exception 'That day is outside their rotation'; end if;
    select * into v_ct from public.clinic_template where id = p_clinic;
    if not found then raise exception 'That clinic is not in this program'; end if;
    insert into public.learner_rotations (site_id, learner_id, rotation_date, clinic_template_id, site_code, provider_name, supervisor_id, is_draft)
    values (v_l.site_id, p_learner, p_date, v_ct.id, v_ct.site_code, v_ct.provider_name, v_ct.provider_id, coalesce(v_old.is_draft, true))
    on conflict (learner_id, rotation_date) do update
      set clinic_template_id = excluded.clinic_template_id, site_code = excluded.site_code,
          provider_name = excluded.provider_name, supervisor_id = excluded.supervisor_id, status = 'confirmed',
          feedback_requested_at = null;
  end if;

  -- a published day changed: tell the learner and both supervisors
  if v_old.id is not null and not v_old.is_draft then
    select value #>> '{}' into v_portal from public.app_settings where key = 'portal_url';
    select name into v_prog from public.sites where id = v_l.site_id;
    perform public.enqueue_email('learnerday-' || v_l.id || '-' || p_date || '-' || to_char(clock_timestamp(), 'HH24MISSMS'), v_l.email,
      'Your clinic day has changed — ' || coalesce(v_prog, 'clinic rotation'),
      '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(v_l.full_name)) || ',</p><p>Your clinic on <strong>'
      || to_char(p_date, 'FMDay, FMMonth FMDD') || '</strong> is now <strong>'
      || case when p_clinic is null then 'cancelled — no clinic that day' else public.rounds_esc(v_ct.site_code || coalesce(' with ' || v_ct.provider_name, '')) end
      || '</strong> (was ' || public.rounds_esc(v_old.site_code || coalesce(' with ' || v_old.provider_name, '')) || ').</p>');
    for v_sup in
      select distinct u.email, u.full_name from public.site_users u
       where u.id in (v_old.supervisor_id, case when p_clinic is not null then v_ct.provider_id end) and u.email is not null
    loop
      perform public.enqueue_email('learnerdaysup-' || v_l.id || '-' || p_date || '-' || md5(v_sup.email) || '-' || to_char(clock_timestamp(), 'HH24MISSMS'), v_sup.email,
        'Learner change: ' || v_l.full_name || ', ' || to_char(p_date, 'FMMon FMDD'),
        '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(v_sup.full_name)) || ',</p><p><strong>' || public.rounds_esc(v_l.full_name)
        || '</strong>’s clinic on ' || to_char(p_date, 'FMDay, FMMonth FMDD') || ' is now '
        || case when p_clinic is null then 'cancelled' else public.rounds_esc(v_ct.site_code || coalesce(' with ' || v_ct.provider_name, '')) end
        || ' (was ' || public.rounds_esc(v_old.site_code || coalesce(' with ' || v_old.provider_name, '')) || ').</p>');
    end loop;
  end if;
end $$;

create or replace function public.discard_learner_drafts(p_learner uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_director_or_admin() then raise exception 'not authorized' using errcode = 'insufficient_privilege'; end if;
  delete from public.learner_rotations where is_draft and (p_learner is null or learner_id = p_learner);
  get diagnostics n = row_count;
  return n;
end $$;

-- Publish the drafts: each learner gets their days, each supervisor the
-- learners coming to their clinics.
create or replace function public.publish_learner_schedule(p_learner uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[]; v_n int; v_told int := 0; r record; v_portal text; v_prog text; v_stamp text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
  if not public.is_director_or_admin() then raise exception 'not authorized' using errcode = 'insufficient_privilege'; end if;
  with p as (
    update public.learner_rotations set is_draft = false
     where is_draft and (p_learner is null or learner_id = p_learner)
    returning id)
  select array_agg(id), count(*) into v_ids, v_n from p;
  if coalesce(v_n, 0) = 0 then return jsonb_build_object('published', 0, 'told', 0); end if;
  select value #>> '{}' into v_portal from public.app_settings where key = 'portal_url';
  select name into v_prog from public.sites where id = public.current_site_id();

  -- learners
  for r in
    select l.id, l.email, l.full_name,
           string_agg('<tr><td style="padding:4px 14px 4px 0">' || to_char(lr.rotation_date, 'FMDy FMMon FMDD') || '</td><td style="padding:4px 14px 4px 0">'
                      || public.rounds_esc(lr.site_code) || '</td><td style="padding:4px 0">' || public.rounds_esc(coalesce(lr.provider_name, '')) || '</td></tr>',
                      '' order by lr.rotation_date) as rows_html,
           count(*) as n
      from public.learner_rotations lr join public.learners l on l.id = lr.learner_id
     where lr.id = any(v_ids)
     group by l.id, l.email, l.full_name
  loop
    perform public.enqueue_email('learnersched-' || v_stamp || '-' || r.id, r.email,
      'Your clinic schedule — ' || coalesce(v_prog, 'clinic rotation'),
      '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(r.full_name)) || ',</p>'
      || '<p>Here are your clinic days (' || r.n || '):</p>'
      || '<table style="border-collapse:collapse"><tr><th align="left" style="padding:4px 14px 4px 0">Day</th><th align="left" style="padding:4px 14px 4px 0">Clinic</th><th align="left">Supervisor</th></tr>'
      || r.rows_html || '</table>'
      || '<p>If something here doesn’t work for you, please reply to the fellowship office.</p>');
    v_told := v_told + 1;
  end loop;

  -- supervisors
  for r in
    select u.id, u.email, u.full_name,
           string_agg('<li>' || to_char(lr.rotation_date, 'FMDy FMMon FMDD') || ' — <strong>' || public.rounds_esc(l.full_name) || '</strong>'
                      || coalesce(' (' || public.rounds_esc(nullif(concat_ws(', ', l.level, l.school), '')) || ')', '') || ', ' || public.rounds_esc(lr.site_code) || '</li>',
                      '' order by lr.rotation_date) as items
      from public.learner_rotations lr
      join public.learners l on l.id = lr.learner_id
      join public.site_users u on u.id = lr.supervisor_id
     where lr.id = any(v_ids) and u.email is not null and u.status = 'active'
     group by u.id, u.email, u.full_name
  loop
    perform public.enqueue_email('learnersup-' || v_stamp || '-' || r.id, r.email,
      'Learners joining your clinics — ' || coalesce(v_prog, 'clinic rotation'),
      '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(r.full_name)) || ',</p>'
      || '<p>These learners are booked into your clinics:</p><ul>' || r.items || '</ul>'
      || '<p>At the end of each clinic day you’ll get a short feedback form for the learner — it takes a minute.</p>'
      || case when v_portal is not null then '<p><a href="' || v_portal || '/clinic">Your clinics in the portal</a></p>' else '' end);
    v_told := v_told + 1;
  end loop;

  return jsonb_build_object('published', v_n, 'told', v_told);
end $$;

-- ------------------------------------------------------ end-of-day feedback

-- From 4 pm on a clinic day (program time), ask each supervisor for feedback
-- on the learner they had. Days missed while the job was down are caught up
-- for three days.
create or replace function public.enqueue_learner_feedback()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0; v_tz text; v_local timestamp; v_portal text;
begin
  for r in
    select lr.*, l.full_name as learner_name, l.level, l.school, u.email as sup_email, u.full_name as sup_name
      from public.learner_rotations lr
      join public.learners l on l.id = lr.learner_id
      join public.users u on u.id = lr.supervisor_id
     where not lr.is_draft and lr.status = 'confirmed' and lr.feedback_requested_at is null
       and lr.rotation_date between current_date - 4 and current_date + 1
       and u.email is not null
  loop
    perform set_config('app.site_id', r.site_id::text, true);
    v_tz := public.site_timezone();
    v_local := now() at time zone v_tz;
    continue when r.rotation_date > v_local::date or (r.rotation_date = v_local::date and v_local::time < time '16:00');
    continue when r.rotation_date < v_local::date - 3;
    select value #>> '{}' into v_portal from public.app_settings where key = 'portal_url';
    perform public.enqueue_email('learnerfb-' || r.id, r.sup_email,
      'Feedback on ' || r.learner_name || ' — ' || to_char(r.rotation_date, 'FMMon FMDD'),
      '<p>Hi ' || public.rounds_esc(public.conf_greeting_name(r.sup_name)) || ',</p>'
      || '<p><strong>' || public.rounds_esc(r.learner_name) || '</strong>'
      || coalesce(' (' || public.rounds_esc(nullif(concat_ws(', ', r.level, r.school), '')) || ')', '')
      || ' was in your clinic at ' || public.rounds_esc(r.site_code) || ' on ' || to_char(r.rotation_date, 'FMDay, FMMonth FMDD') || '.</p>'
      || '<p>Three quick questions: did they meet the level expected, what did they do well, and what could they work on?</p>'
      || '<p style="margin:24px 0"><a href="' || coalesce(v_portal, '') || '/learner-feedback/' || r.feedback_token
      || '" style="background:#0E7C86;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Give feedback</a></p>'
      || '<p style="font-size:12px;color:#5B6677">Only the fellowship director and program admin read it.</p>');
    update public.learner_rotations set feedback_requested_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  perform set_config('app.site_id', '', true);
  return v_n;
end $$;

-- The supervisor's form, opened from the email.
create or replace function public.learner_feedback_form(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lr learner_rotations; v_l learners; v_fb learner_feedback; v_prog text;
begin
  select * into v_lr from public.learner_rotations where feedback_token = p_token;
  if not found then raise exception 'invalid link'; end if;
  select * into v_l from public.learners where id = v_lr.learner_id;
  select * into v_fb from public.learner_feedback where learner_rotation_id = v_lr.id;
  select name into v_prog from public.sites where id = v_lr.site_id;
  return jsonb_build_object('learner', v_l.full_name, 'level', v_l.level, 'school', v_l.school,
    'learner_type', v_l.learner_type, 'date', v_lr.rotation_date, 'clinic', v_lr.site_code,
    'supervisor', v_lr.provider_name, 'program', v_prog,
    'submitted', v_fb.id is not null, 'meets_level', v_fb.meets_level, 'did_well', v_fb.did_well, 'improve', v_fb.improve);
end $$;

create or replace function public.learner_feedback_submit(p_token text, p_meets text, p_did_well text, p_improve text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lr learner_rotations;
begin
  select * into v_lr from public.learner_rotations where feedback_token = p_token;
  if not found then raise exception 'invalid link'; end if;
  if v_lr.rotation_date > current_date then raise exception 'Feedback opens on the clinic day'; end if;
  if p_meets not in ('below', 'meets', 'above') then raise exception 'Say whether they met the level expected'; end if;
  insert into public.learner_feedback (site_id, learner_rotation_id, learner_id, supervisor_id, supervisor_name, meets_level, did_well, improve)
  values (v_lr.site_id, v_lr.id, v_lr.learner_id, v_lr.supervisor_id, v_lr.provider_name, p_meets,
          nullif(left(trim(coalesce(p_did_well, '')), 4000), ''), nullif(left(trim(coalesce(p_improve, '')), 4000), ''))
  on conflict (learner_rotation_id) do update
    set meets_level = excluded.meets_level, did_well = excluded.did_well, improve = excluded.improve, submitted_at = now();
  return public.learner_feedback_form(p_token);
end $$;

-- ------------------------------------------------------------------ grants

do $$
declare f text;
begin
  foreach f in array array[
    'generate_learner_schedule(date,date,uuid)', 'set_learner_day(uuid,date,uuid)', 'discard_learner_drafts(uuid)',
    'publish_learner_schedule(uuid)', 'enqueue_learner_feedback()', 'learner_feedback_form(text)',
    'learner_feedback_submit(text,text,text,text)', 'learner_day_count(date,text,uuid,text)', 'site_timezone()'
  ] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['generate_learner_schedule(date,date,uuid)', 'set_learner_day(uuid,date,uuid)',
                           'discard_learner_drafts(uuid)', 'publish_learner_schedule(uuid)'] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['learner_feedback_form(text)', 'learner_feedback_submit(text,text,text,text)'] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- the rounds job also sends the learner feedback requests
select cron.unschedule(jobid) from cron.job where jobname = 'rounds-and-learner-emails';
select cron.schedule('rounds-and-learner-emails', '5,20,35,50 * * * *',
  'select public.enqueue_rounds_emails(); select public.enqueue_learner_feedback();');

notify pgrst, 'reload schema';
