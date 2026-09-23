-- ---------------------------------------------------------------------------
-- 0038 — teaching: set up a year step by step, and make changes
--
-- create_teaching_year() takes the year the setup steps built (session dates,
-- dates off, topics and teachers) and adds it in one go, then emails
-- teachers their sessions and everyone the schedule.
--
-- apply_teaching_changes() moves, reassigns, cancels or adds sessions all at
-- once and tells each person only what changed for them.
--
-- Teachers are now kept by account: the usual teacher for each topic and the
-- Waveform Rounds rotation store the person's account, so reminders reach
-- them even when a name is typed differently. Names typed before this keep
-- working.
-- ---------------------------------------------------------------------------

-- Is a teacher away that day? By account when known, else by name.
create or replace function public.teacher_is_away(p_id uuid, p_name text, p_d date)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_id is not null then
      exists (select 1 from public.provider_away_dates where provider_id = p_id and away_date = p_d)
      or exists (select 1 from public.fellow_away_dates where fellow_id = p_id and away_date = p_d)
    when coalesce(p_name, '') <> '' then
      exists (select 1 from public.provider_away_dates pad
                join public.site_users u on u.id = pad.provider_id
               where u.full_name = p_name and pad.away_date = p_d)
    else false
  end
$$;

-- --------------------------------------------------------------- auto-assign

-- Same as before, but by account: a topic's usual teacher is taken from
-- default_provider_id when set, and the Waveform Rounds rotation from
-- waveform_teachers ([{provider_id, weight}]) when set. The older name-based
-- settings still work.
create or replace function public.auto_assign_teaching(p_from date, p_to date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  wf_ids uuid[]; wf_names text[]; wf_len int; wf_counter int := 0;
  s record; cand_id uuid; cand_name text; tries int; assigned int := 0;
begin
  if not coalesce((select role = 'director' from public.site_users where id = public.current_uid()), false) then
    raise exception 'not authorized';
  end if;

  select array_agg(x.pid order by x.ord), array_agg(x.pname order by x.ord) into wf_ids, wf_names
    from (
      select u.id as pid, u.full_name as pname, gs::float / greatest((e ->> 'weight')::int, 1) as ord
        from public.app_settings a
        cross join lateral jsonb_array_elements(case when jsonb_typeof(a.value) = 'array' then a.value else '[]'::jsonb end) e
        join public.site_users u on u.id = (e ->> 'provider_id')::uuid and u.status = 'active'
        cross join lateral generate_series(1, greatest((e ->> 'weight')::int, 0)) gs
       where a.key = 'waveform_teachers'
    ) x;
  if wf_ids is null then
    select array_agg(x.pid order by x.ord), array_agg(x.name order by x.ord) into wf_ids, wf_names
      from (
        select (select u.id from public.site_users u
                 where u.full_name = w.name and u.role in ('supervisor', 'director') and u.status = 'active'
                 limit 1) as pid,
               w.name, gs::float / w.weight as ord
          from (select e.key as name, greatest((e.value)::int, 0) as weight
                  from public.app_settings a, jsonb_each_text(a.value) e
                 where a.key = 'waveform_allocation' and jsonb_typeof(a.value) = 'object') w,
               generate_series(1, w.weight) gs
      ) x;
  end if;
  wf_len := coalesce(array_length(wf_names, 1), 0);

  for s in
    select id, session_date, topic from public.teaching_sessions
     where session_date between p_from and p_to and is_break = false and status <> 'cancelled'
       and coalesce(provider_name, '') = '' and provider_id is null
     order by session_date
  loop
    cand_id := null; cand_name := null;
    if s.topic = 'Waveform Rounds' and wf_len > 0 then
      tries := 0;
      while tries < wf_len loop
        cand_id := wf_ids[((wf_counter + tries) % wf_len) + 1];
        cand_name := wf_names[((wf_counter + tries) % wf_len) + 1];
        exit when not public.teacher_is_away(cand_id, cand_name, s.session_date);
        tries := tries + 1;
      end loop;
      if tries >= wf_len then cand_id := null; cand_name := null; end if;
      wf_counter := wf_counter + 1;
    else
      select d.default_provider_id, coalesce(u.full_name, d.default_provider_name)
        into cand_id, cand_name
        from public.topic_provider_defaults d
        left join public.site_users u on u.id = d.default_provider_id and u.status = 'active'
       where d.topic = s.topic;
      if cand_id is null and cand_name is not null then
        select u.id into cand_id from public.site_users u
         where u.full_name = cand_name and u.role in ('supervisor', 'director', 'fellow') and u.status = 'active'
         limit 1;
      end if;
      if cand_name is not null and public.teacher_is_away(cand_id, cand_name, s.session_date) then
        cand_id := null; cand_name := null;
      end if;
    end if;
    if cand_name is not null then
      update public.teaching_sessions
         set provider_name = cand_name, provider_id = cand_id, assignment_draft = true,
             provider_confirmed = false, updated_at = now()
       where id = s.id;
      assigned := assigned + 1;
    end if;
  end loop;
  return assigned;
end;
$$;

-- ------------------------------------------------------------- a new year

-- p_sessions [{date, start, end, topic, provider_id, provider_name, is_break, break_label}]
-- p_topics   [{topic, provider_id, provider_name}]  the usual teacher per topic
-- p_waveform [{provider_id, weight}]                 the Waveform Rounds rotation
-- Dates that already have a session or a break are left alone.
create or replace function public.create_teaching_year(
  p_sessions jsonb,
  p_topics   jsonb default '[]'::jsonb,
  p_waveform jsonb default null,
  p_notify   boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_site    uuid := public.current_site_id();
  v_me      uuid := public.current_uid();
  v_s       jsonb;
  v_d       date;
  v_pid     uuid;
  v_pname   text;
  v_new     int := 0;
  v_breaks  int := 0;
  v_skipped int := 0;
  v_from    date;
  v_to      date;
  v_told    int := 0;
  v_portal  text;
  v_prog    text;
  v_stamp   text;
  v_sched   text;
  r         record;
  v_cc      jsonb;
  v_cc_email text;
  v_names   jsonb;
  v_u       record;
begin
  if not coalesce(public.current_app_role() = 'director', false) then
    raise exception 'Only the fellowship director can set up the teaching year'
      using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(coalesce(p_sessions, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_sessions) = 0 then
    raise exception 'There are no sessions to add';
  end if;

  for v_s in select value from jsonb_array_elements(p_sessions) loop
    v_d := (v_s ->> 'date')::date;
    if v_d is null then raise exception 'A session has no date'; end if;
    if v_d < current_date then
      raise exception 'Sessions can''t be added in the past (%)', to_char(v_d, 'FMMon DD, YYYY');
    end if;
    if exists (select 1 from public.teaching_sessions where session_date = v_d) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if coalesce((v_s ->> 'is_break')::boolean, false) then
      insert into public.teaching_sessions (session_date, is_break, break_label, assignment_draft, status)
      values (v_d, true, coalesce(nullif(trim(v_s ->> 'break_label'), ''), 'No session'), false, 'confirmed');
      v_breaks := v_breaks + 1;
      continue;
    end if;
    v_pid := nullif(v_s ->> 'provider_id', '')::uuid;
    v_pname := nullif(trim(coalesce(v_s ->> 'provider_name', '')), '');
    if v_pid is not null then
      select full_name into v_pname from public.site_users
       where id = v_pid and role in ('supervisor', 'director', 'fellow') and status = 'active';
      if not found then raise exception 'A teacher is not in this program'; end if;
    end if;
    insert into public.teaching_sessions
      (session_date, start_time, end_time, topic, provider_id, provider_name, is_break,
       assignment_draft, provider_confirmed, status)
    values
      (v_d, coalesce((v_s ->> 'start')::time, '08:00'), coalesce((v_s ->> 'end')::time, '09:00'),
       nullif(trim(coalesce(v_s ->> 'topic', '')), ''), v_pid, v_pname, false, false, false, 'confirmed');
    v_new := v_new + 1;
    v_from := least(coalesce(v_from, v_d), v_d);
    v_to := greatest(coalesce(v_to, v_d), v_d);
  end loop;

  -- the usual teacher for each topic
  for v_s in select value from jsonb_array_elements(coalesce(p_topics, '[]'::jsonb)) loop
    continue when coalesce(trim(v_s ->> 'topic'), '') = '';
    v_pid := nullif(v_s ->> 'provider_id', '')::uuid;
    v_pname := nullif(trim(coalesce(v_s ->> 'provider_name', '')), '');
    if v_pid is not null then
      select full_name into v_pname from public.site_users where id = v_pid;
    end if;
    insert into public.topic_provider_defaults (topic, default_provider_id, default_provider_name)
    values (trim(v_s ->> 'topic'), v_pid, v_pname)
    on conflict (site_id, topic) do update
      set default_provider_id = excluded.default_provider_id,
          default_provider_name = excluded.default_provider_name;
  end loop;

  -- the Waveform Rounds rotation, by account (and by name for older readers)
  if p_waveform is not null and jsonb_typeof(p_waveform) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('provider_id', u.id, 'weight', greatest((e ->> 'weight')::int, 0))), '[]'::jsonb),
           coalesce(jsonb_object_agg(u.full_name, greatest((e ->> 'weight')::int, 0)), '{}'::jsonb)
      into v_s, v_names
      from jsonb_array_elements(p_waveform) e
      join public.site_users u on u.id = (e ->> 'provider_id')::uuid and u.status = 'active';
    insert into public.app_settings (site_id, key, value, updated_at) values (v_site, 'waveform_teachers', v_s, now())
      on conflict (site_id, key) do update set value = excluded.value, updated_at = now();
    insert into public.app_settings (site_id, key, value, updated_at) values (v_site, 'waveform_allocation', v_names, now())
      on conflict (site_id, key) do update set value = excluded.value, updated_at = now();
  end if;

  -- a draft of the setup steps is no longer needed
  delete from public.app_settings where key = 'teaching_setup_draft';

  if p_notify and v_new > 0 then
    select value #>> '{}' into v_portal from public.app_settings where key = 'portal_url';
    select name into v_prog from public.sites where id = v_site;
    v_prog := coalesce(v_prog, 'the fellowship');
    v_stamp := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

    v_sched := public.teaching_schedule_html(v_from, ((v_to - v_from) / 7) + 1);

    -- teachers: their own sessions to confirm, then the whole schedule
    for r in
      select ts.provider_id as pid,
             string_agg('<li>' || to_char(ts.session_date, 'FMDy Mon DD, YYYY') || ', ' || to_char(ts.start_time, 'HH24:MI') ||
                        ' — ' || coalesce(ts.topic, 'topic to be confirmed') || '</li>', '' order by ts.session_date) as items,
             count(*) as n
        from public.teaching_sessions ts
       where ts.provider_id is not null and ts.is_break = false
         and ts.created_at = now()          -- added by this call
       group by ts.provider_id
    loop
      select email, full_name into v_u from public.site_users where id = r.pid and status = 'active';
      continue when not found or v_u.email is null;
      perform public.enqueue_email(
        'teachyear-' || v_stamp || '-' || r.pid,
        v_u.email,
        'Your teaching sessions — ' || v_prog,
        '<p>Hi ' || public.conf_greeting_name(v_u.full_name) || ',</p>' ||
        '<p>The teaching schedule has been set, and you are down to teach ' || r.n ||
        case when r.n = 1 then ' session' else ' sessions' end || ':</p><ul>' || r.items || '</ul>' ||
        '<p>Please confirm each one, or flag a clash, on <a href="' || coalesce(v_portal, '') || '/my-teaching">My Teaching</a>.</p>' ||
        '<p>The whole schedule:</p>' || v_sched
      );
      v_told := v_told + 1;
    end loop;

    -- fellows in their fellowship then, and supervisors not teaching: the schedule
    for r in
      select u.email, u.full_name from public.site_users u
       where u.status = 'active' and u.email is not null and u.role in ('fellow', 'supervisor')
         and (u.role <> 'fellow' or public.fellowship_overlaps(u.fellowship_start, u.fellowship_end, v_from, v_to))
         and not exists (select 1 from public.teaching_sessions ts
                          where ts.provider_id = u.id and ts.created_at = now())
    loop
      perform public.enqueue_email(
        'teachyear-' || v_stamp || '-' || r.email,
        r.email,
        'Teaching schedule — ' || v_prog,
        '<p>Hi ' || public.conf_greeting_name(r.full_name) || ',</p>' ||
        '<p>The teaching schedule from ' || to_char(v_from, 'FMMonth DD, YYYY') || ' to ' || to_char(v_to, 'FMMonth DD, YYYY') ||
        ' is below. The live version is always in the <a href="' || coalesce(v_portal, '') || '/teaching">portal</a>.</p>' || v_sched
      );
      v_told := v_told + 1;
    end loop;

    select value into v_cc from public.app_settings where key = 'teaching_cc_emails';
    for v_cc_email in select jsonb_array_elements_text(coalesce(v_cc, '[]'::jsonb)) loop
      perform public.enqueue_email(
        'teachyear-' || v_stamp || '-cc-' || v_cc_email, v_cc_email,
        'Teaching schedule — ' || v_prog,
        '<p>The teaching schedule from ' || to_char(v_from, 'FMMonth DD, YYYY') || ' to ' || to_char(v_to, 'FMMonth DD, YYYY') ||
        ' is below.</p>' || v_sched
      );
      v_told := v_told + 1;
    end loop;
  end if;

  insert into public.schedule_changes (site_id, area, kind, summary, details, days_changed, people_told, changed_by)
  values (v_site, 'teaching', 'setup',
          'Teaching year set up: ' || v_new || case when v_new = 1 then ' session' else ' sessions' end ||
          case when v_from is not null then ', ' || to_char(v_from, 'FMMon DD, YYYY') || ' – ' || to_char(v_to, 'FMMon DD, YYYY') else '' end,
          jsonb_build_object('created', v_new, 'breaks', v_breaks, 'skipped', v_skipped),
          v_new + v_breaks, v_told, v_me);

  return jsonb_build_object('created', v_new, 'breaks', v_breaks, 'skipped', v_skipped, 'told', v_told,
                            'from', v_from, 'to', v_to);
end $$;

-- ------------------------------------------------------------ changes

-- p_changes [{session_id, date, start, end, topic, teacher: {provider_id, provider_name} | null,
--             cancel, reason}]  — keys left out stay as they are;
--           [{add: true, date, start, end, topic, teacher}] adds a one-off session.
-- Teachers are told about their own sessions (and asked to confirm new or
-- moved ones), fellows in their fellowship on the day about every change,
-- and the teaching CC list gets the whole change.
create or replace function public.apply_teaching_changes(
  p_kind    text,
  p_summary text,
  p_changes jsonb,
  p_notify  boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_site    uuid := public.current_site_id();
  v_me      uuid := public.current_uid();
  v_c       jsonb;
  v_old     public.teaching_sessions;
  v_new     public.teaching_sessions;
  v_added   boolean;
  v_date    date;
  v_start   time;
  v_end     time;
  v_topic   text;
  v_pid     uuid;
  v_pname   text;
  v_who_changed boolean;
  v_when_changed boolean;
  v_log     jsonb := '[]'::jsonb;
  v_n       int := 0;
  v_told    int := 0;
  v_portal  text;
  v_prog    text;
  v_stamp   text;
  r         record;
  v_u       record;
  v_rows    text;
  v_cc      jsonb;
  v_cc_email text;
  v_sum     text := replace(replace(replace(trim(coalesce(p_summary, '')), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
begin
  if not public.is_director_or_admin() then
    raise exception 'Only the fellowship director or an admin can change the teaching schedule'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_summary), '') = '' then raise exception 'Describe the change'; end if;

  for v_c in select value from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) loop
    v_added := coalesce((v_c ->> 'add')::boolean, false);
    if v_added then
      v_old := null;
    else
      select * into v_old from public.teaching_sessions
       where id = (v_c ->> 'session_id')::uuid and is_break = false;
      if not found then raise exception 'That session is not in this program'; end if;
      if v_old.session_date < current_date then
        raise exception 'Sessions in the past can''t be changed (%)', to_char(v_old.session_date, 'FMMon DD, YYYY');
      end if;
    end if;

    v_date  := coalesce((v_c ->> 'date')::date, v_old.session_date);
    v_start := coalesce((v_c ->> 'start')::time, v_old.start_time, '08:00');
    v_end   := coalesce((v_c ->> 'end')::time, v_old.end_time, '09:00');
    v_topic := case when v_c ? 'topic' then nullif(trim(coalesce(v_c ->> 'topic', '')), '') else v_old.topic end;
    if v_c ? 'teacher' then
      v_pid := nullif(v_c #>> '{teacher,provider_id}', '')::uuid;
      v_pname := nullif(trim(coalesce(v_c #>> '{teacher,provider_name}', '')), '');
      if v_pid is not null then
        select full_name into v_pname from public.site_users
         where id = v_pid and role in ('supervisor', 'director', 'fellow') and status = 'active';
        if not found then raise exception 'That teacher is not in this program'; end if;
      end if;
    else
      v_pid := v_old.provider_id; v_pname := v_old.provider_name;
    end if;
    if v_date is null then raise exception 'A session needs a date'; end if;
    if v_date < current_date then
      raise exception 'Sessions can''t be moved into the past (%)', to_char(v_date, 'FMMon DD, YYYY');
    end if;
    if v_end <= v_start then raise exception 'A session has to end after it starts'; end if;

    if v_added then
      insert into public.teaching_sessions
        (session_date, start_time, end_time, topic, provider_id, provider_name, is_break,
         assignment_draft, provider_confirmed, status)
      values (v_date, v_start, v_end, v_topic, v_pid, v_pname, false, false, false, 'confirmed')
      returning * into v_new;
    elsif coalesce((v_c ->> 'cancel')::boolean, false) then
      if v_old.status = 'cancelled' then raise exception 'That session is already cancelled'; end if;
      update public.teaching_sessions
         set status = 'cancelled', provider_confirmed = false, conflict_flagged = false,
             notes = coalesce(nullif(trim(coalesce(v_c ->> 'reason', '')), ''), notes), updated_at = now()
       where id = v_old.id
      returning * into v_new;
    else
      v_who_changed := v_pid is distinct from v_old.provider_id or v_pname is distinct from v_old.provider_name;
      v_when_changed := v_date <> v_old.session_date or v_start <> v_old.start_time or v_end <> v_old.end_time;
      update public.teaching_sessions
         set session_date = v_date, start_time = v_start, end_time = v_end, topic = v_topic,
             provider_id = v_pid, provider_name = v_pname,
             status = 'confirmed', assignment_draft = false,
             provider_confirmed = case when v_who_changed or v_when_changed or v_old.status = 'cancelled'
                                       then false else provider_confirmed end,
             conflict_flagged = case when v_who_changed or v_when_changed then false else conflict_flagged end,
             conflict_reason = case when v_who_changed or v_when_changed then null else conflict_reason end,
             reminded_week = case when v_when_changed then false else reminded_week end,
             reminded_day = case when v_when_changed then false else reminded_day end,
             updated_at = now()
       where id = v_old.id
      returning * into v_new;
    end if;

    if v_added or v_old.status is distinct from v_new.status
       or v_old.session_date is distinct from v_new.session_date or v_old.start_time is distinct from v_new.start_time
       or v_old.end_time is distinct from v_new.end_time or v_old.topic is distinct from v_new.topic
       or v_old.provider_id is distinct from v_new.provider_id or v_old.provider_name is distinct from v_new.provider_name then
      v_n := v_n + 1;
      v_log := v_log || jsonb_build_object(
        'session_id', v_new.id, 'added', v_added, 'cancelled', v_new.status = 'cancelled',
        'reinstated', v_old.status = 'cancelled' and v_new.status <> 'cancelled',
        'date_before', v_old.session_date, 'date', v_new.session_date,
        'time_before', to_char(v_old.start_time, 'HH24:MI'), 'time', to_char(v_new.start_time, 'HH24:MI'),
        'end', to_char(v_new.end_time, 'HH24:MI'),
        'topic_before', v_old.topic, 'topic', v_new.topic,
        'teacher_before_id', v_old.provider_id, 'teacher_before', v_old.provider_name,
        'teacher_id', v_new.provider_id, 'teacher', v_new.provider_name,
        'reason', nullif(trim(coalesce(v_c ->> 'reason', '')), ''));
    end if;
  end loop;

  if p_notify and v_n > 0 then
    select value #>> '{}' into v_portal from public.app_settings where key = 'portal_url';
    select name into v_prog from public.sites where id = v_site;
    v_prog := coalesce(v_prog, 'the fellowship');
    v_stamp := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

    -- teachers: their own sessions
    for r in
      select tid, string_agg('<li>' || line || '</li>', '' order by dt) as items, bool_or(ask) as ask
        from (
          -- no longer teaching it (moved to someone else, or cancelled)
          select (e ->> 'teacher_before_id')::uuid as tid, (e ->> 'date_before')::date as dt, false as ask,
                 coalesce(e ->> 'topic_before', 'Your session') || ' on ' || to_char((e ->> 'date_before')::date, 'FMDy Mon DD') ||
                 case when (e ->> 'cancelled')::boolean then ' is <strong>cancelled</strong>' ||
                           coalesce(' (' || (e ->> 'reason') || ')', '')
                      else ' — you are <strong>no longer teaching it</strong>' end as line
            from jsonb_array_elements(v_log) e
           where e ->> 'teacher_before_id' is not null
             and ((e ->> 'cancelled')::boolean or (e ->> 'teacher_before_id') is distinct from (e ->> 'teacher_id'))
          union all
          -- newly teaching it
          select (e ->> 'teacher_id')::uuid, (e ->> 'date')::date, true,
                 '<strong>Please teach ' || coalesce(e ->> 'topic', 'a session') || '</strong> on ' ||
                 to_char((e ->> 'date')::date, 'FMDy Mon DD, YYYY') || ', ' || (e ->> 'time') || '–' || (e ->> 'end')
            from jsonb_array_elements(v_log) e
           where e ->> 'teacher_id' is not null and not (e ->> 'cancelled')::boolean
             and (e ->> 'teacher_before_id') is distinct from (e ->> 'teacher_id')
          union all
          -- same teacher, new day, time or topic
          select (e ->> 'teacher_id')::uuid, (e ->> 'date')::date, true,
                 coalesce(e ->> 'topic', 'Your session') || ' is now <strong>' ||
                 to_char((e ->> 'date')::date, 'FMDy Mon DD, YYYY') || ', ' || (e ->> 'time') || '–' || (e ->> 'end') ||
                 '</strong>' || case when (e ->> 'date_before') is not null
                   then ' (was ' || to_char((e ->> 'date_before')::date, 'FMDy Mon DD') || ', ' || (e ->> 'time_before') ||
                        coalesce(case when (e ->> 'topic_before') is distinct from (e ->> 'topic') then ', ' || (e ->> 'topic_before') end, '') || ')'
                   else '' end
            from jsonb_array_elements(v_log) e
           where e ->> 'teacher_id' is not null and not (e ->> 'cancelled')::boolean
             and (e ->> 'teacher_before_id') = (e ->> 'teacher_id')
        ) x
       group by tid
    loop
      select email, full_name into v_u from public.site_users where id = r.tid and status = 'active';
      continue when not found or v_u.email is null;
      perform public.enqueue_email(
        'teachchange-' || v_stamp || '-' || r.tid,
        v_u.email,
        'Your teaching has changed — ' || v_prog,
        '<p>Hi ' || public.conf_greeting_name(v_u.full_name) || ',</p><ul>' || r.items || '</ul>' ||
        case when r.ask then '<p>Please confirm, or flag a clash, on <a href="' || coalesce(v_portal, '') || '/my-teaching">My Teaching</a>.</p>'
             else '<p>The schedule is in the <a href="' || coalesce(v_portal, '') || '/teaching">portal</a>.</p>' end
      );
      v_told := v_told + 1;
    end loop;

    -- one line per change, for fellows and the CC list
    select string_agg('<li>' ||
             case
               when (e ->> 'added')::boolean then 'New session: <strong>' || coalesce(e ->> 'topic', 'topic to be confirmed') ||
                    '</strong>, ' || to_char((e ->> 'date')::date, 'FMDy Mon DD') || ', ' || (e ->> 'time')
               when (e ->> 'cancelled')::boolean then '<strong>Cancelled:</strong> ' || coalesce(e ->> 'topic', 'session') ||
                    ', ' || to_char((e ->> 'date')::date, 'FMDy Mon DD')
               else coalesce(e ->> 'topic', 'Session') || ', ' || to_char((e ->> 'date')::date, 'FMDy Mon DD') || ', ' || (e ->> 'time') ||
                    case when (e ->> 'date') <> (e ->> 'date_before') or (e ->> 'time') <> (e ->> 'time_before')
                         then ' (moved from ' || to_char((e ->> 'date_before')::date, 'FMDy Mon DD') || ', ' || (e ->> 'time_before') || ')' else '' end ||
                    case when (e ->> 'teacher') is distinct from (e ->> 'teacher_before')
                         then ' — now taught by ' || coalesce(e ->> 'teacher', 'a teacher to be confirmed') else '' end ||
                    case when (e ->> 'topic') is distinct from (e ->> 'topic_before')
                         then ' (was ' || coalesce(e ->> 'topic_before', 'no topic') || ')' else '' end ||
                    case when (e ->> 'reinstated')::boolean then ' — back on' else '' end
             end || '</li>', '' order by e ->> 'date')
      into v_rows
      from jsonb_array_elements(v_log) e;

    -- fellows in their fellowship on at least one of the days
    for r in
      select u.email, u.full_name from public.site_users u
       where u.role = 'fellow' and u.status = 'active' and u.email is not null
         and exists (select 1 from jsonb_array_elements(v_log) e
                      where public.in_fellowship(u.fellowship_start, u.fellowship_end, (e ->> 'date')::date))
    loop
      perform public.enqueue_email(
        'teachchange-' || v_stamp || '-' || r.email,
        r.email,
        'Teaching schedule change — ' || v_prog,
        '<p>Hi ' || public.conf_greeting_name(r.full_name) || ',</p><p>The teaching schedule has changed:</p><ul>' ||
        v_rows || '</ul><p>The live schedule is in the <a href="' || coalesce(v_portal, '') || '/teaching">portal</a>.</p>'
      );
      v_told := v_told + 1;
    end loop;

    select value into v_cc from public.app_settings where key = 'teaching_cc_emails';
    for v_cc_email in select jsonb_array_elements_text(coalesce(v_cc, '[]'::jsonb)) loop
      perform public.enqueue_email(
        'teachchange-' || v_stamp || '-cc-' || v_cc_email, v_cc_email,
        'Teaching schedule change — ' || v_prog,
        '<p>' || v_sum || '</p><ul>' || v_rows || '</ul>'
      );
      v_told := v_told + 1;
    end loop;
  end if;

  insert into public.schedule_changes (site_id, area, kind, summary, details, days_changed, people_told, changed_by)
  values (v_site, 'teaching', coalesce(nullif(trim(p_kind), ''), 'change'), left(trim(p_summary), 500),
          jsonb_build_object('sessions', v_log), v_n, v_told, v_me);

  return jsonb_build_object('changed', v_n, 'told', v_told);
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'teacher_is_away(uuid,text,date)', 'auto_assign_teaching(date,date)',
    'create_teaching_year(jsonb,jsonb,jsonb,boolean)', 'apply_teaching_changes(text,text,jsonb,boolean)'
  ] loop
    execute format('alter function public.%s owner to app_definer', f);
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- helpers used only inside other functions: not callable from the API
revoke execute on function public.clinic_runs_on(uuid, date) from authenticated;
revoke execute on function public.teacher_is_away(uuid, text, date) from authenticated;
