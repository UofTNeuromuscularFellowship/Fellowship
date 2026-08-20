-- Post-session emails move from "the morning after" to "the same day at
-- 9:00 AM Toronto time" — the minute the standard 08:00–09:00 session ends.
--
-- A fixed UTC cron cannot hold 9:00 AM local across daylight saving (13:00 UTC
-- is 9:00 EDT but 8:00 EST), so the job becomes hourly and the function itself
-- checks the Toronto clock and returns immediately on the other 23 runs. That
-- also fixes the pre-existing drift in the 7-day and 1-day advance reminders,
-- which have been arriving an hour early every winter.
--
-- Sections 3 and 4 gain an end_time guard. At the 09:00 run a session that
-- finished at 09:00 qualifies; one scheduled for the afternoon does not, and is
-- instead picked up by the next morning's run through the session_date <
-- local_date branch. A 7-day lookback bounds that catch-up so a session that
-- was cancelled, rescheduled or simply missed cannot resurface weeks later.
--
-- Companion cron change, applied separately (pg_cron lives outside the
-- migration stream):
--
--   select cron.schedule('teaching-emails-hourly', '0 * * * *',
--                        'select public.enqueue_teaching_reminders();');
--   select cron.unschedule('teaching-reminders-daily');

drop function if exists public.enqueue_teaching_reminders();

create or replace function public.enqueue_teaching_reminders(p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record; r record; c record;
  portal text; zlink text; zpass text; zid text;
  n int := 0; pname text; cadence text;
  jc_subject text; jc_body text;
  fb_subject text; fb_body text;
  local_ts timestamp; local_date date; local_time time;
begin
  -- Everything in this function is a 9:00 AM Toronto activity. The job that
  -- calls it runs hourly; 23 of those runs stop right here. p_force exists so
  -- the behaviour can be exercised from a psql session without waiting for 9am.
  local_ts   := now() at time zone 'America/Toronto';
  local_date := local_ts::date;
  local_time := local_ts::time;

  if not p_force and extract(hour from local_ts) <> 9 then
    return 0;
  end if;

  select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
  select value #>> '{}' into zlink from public.app_settings where key = 'zoom_link';
  select value #>> '{}' into zpass from public.app_settings where key = 'zoom_passcode';
  select value #>> '{}' into zid   from public.app_settings where key = 'zoom_meeting_id';

  -- 1) Presenter reminder: the assigned teacher confirms / flags.
  for s in
    select ts.*, (ts.session_date - local_date) as days_out
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.provider_id is not null
      and ts.session_date in (local_date + 7, local_date + 1)
      and ((ts.session_date = local_date + 7 and ts.reminded_week = false)
        or (ts.session_date = local_date + 1 and ts.reminded_day = false))
  loop
    select full_name into pname from public.users where id = s.provider_id;
    perform public.enqueue_email(
      'teachrem-' || s.id || '-' || (case when s.days_out = 7 then 'w' else 'd' end),
      (select email from public.users where id = s.provider_id),
      'Teaching reminder: ' || coalesce(s.topic, 'session') || ' on ' || to_char(s.session_date, 'FMDay, Mon DD'),
      '<p>Hi ' || coalesce(pname, 'there') || ',</p>' ||
      '<p>This is a reminder that <strong>' || coalesce(pname, 'the provider') || '</strong> is scheduled to teach <strong>' || coalesce(s.topic, 'a session') || '</strong>.</p>' ||
      '<p><strong>Date:</strong> ' || to_char(s.session_date, 'FMDay, Mon DD, YYYY') || '<br>' ||
      '<strong>Time:</strong> ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI') || '<br>' ||
      '<strong>Zoom:</strong> <a href="' || coalesce(zlink, '') || '">Join here</a><br>' ||
      '<strong>Meeting ID:</strong> ' || coalesce(zid, '') || '<br>' ||
      '<strong>Passcode:</strong> ' || coalesce(zpass, '') || '</p>' ||
      '<p>Please <a href="' || coalesce(portal, '') || '/my-teaching">confirm this session in the portal</a>, or flag a conflict there if it needs to be covered or rescheduled.</p>'
    );
    if s.days_out = 7 then update public.teaching_sessions set reminded_week = true where id = s.id;
    else update public.teaching_sessions set reminded_day = true where id = s.id; end if;
    n := n + 1;
  end loop;

  -- 2) Journal Club announcements.
  for s in
    select ts.*, (ts.session_date - local_date) as days_out
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.topic ilike '%journal club%'
      and ts.session_date in (local_date + 7, local_date + 1)
  loop
    cadence := case when s.days_out = 7 then 'w' else 'd' end;
    select full_name into pname from public.users where id = s.provider_id;

    jc_subject := 'Journal Club — ' || to_char(s.session_date, 'FMDay, Mon DD')
      || (case when s.days_out = 1 then ' (tomorrow)' else '' end);

    jc_body :=
      '<p>This is a reminder that <strong>Journal Club</strong> is coming up'
        || (case when s.days_out = 1 then ' <strong>tomorrow</strong>' else ' in one week' end) || '.</p>' ||
      (case when pname is not null then '<p><strong>Presenter:</strong> ' || pname || '</p>' else '' end) ||
      '<p><strong>Date:</strong> ' || to_char(s.session_date, 'FMDay, Mon DD, YYYY') || '<br>' ||
      '<strong>Time:</strong> ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI') || '<br>' ||
      '<strong>Zoom:</strong> <a href="' || coalesce(zlink, '') || '">Join here</a><br>' ||
      '<strong>Meeting ID:</strong> ' || coalesce(zid, '') || '<br>' ||
      '<strong>Passcode:</strong> ' || coalesce(zpass, '') || '</p>' ||
      '<p>See the <a href="' || coalesce(portal, '') || '/teaching">teaching schedule</a> for details.</p>';

    for r in
      select id, email, full_name from public.users
      where role in ('fellow', 'supervisor', 'director') and status = 'active' and email is not null
    loop
      perform public.enqueue_email(
        'jcann-' || s.id || '-' || cadence || '-' || r.id,
        r.email,
        jc_subject,
        '<p>Hi ' || coalesce(r.full_name, 'there') || ',</p>' || jc_body
      );
      n := n + 1;
    end loop;

    for c in
      select distinct lower(trim(addr)) as email
      from public.app_settings st,
           lateral jsonb_array_elements_text(st.value) as addr
      where st.key = 'teaching_cc_emails'
        and jsonb_typeof(st.value) = 'array'
        and trim(addr) <> ''
        and lower(trim(addr)) not in (
          select lower(u.email) from public.users u
          where u.role in ('fellow', 'supervisor', 'director')
            and u.status = 'active' and u.email is not null
        )
    loop
      perform public.enqueue_email(
        'jccc-' || s.id || '-' || cadence || '-' || md5(c.email),
        c.email,
        jc_subject,
        '<p>Hi there,</p>' || jc_body
      );
      n := n + 1;
    end loop;
  end loop;

  -- 3) Same day: ask the teacher for the session report, once it has finished.
  for s in
    select ts.*
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.provider_id is not null
      and ts.session_date between local_date - 7 and local_date
      and (ts.session_date < local_date or ts.end_time <= local_time)
      and ts.report_requested = false
      and ts.report_submitted_at is null
  loop
    select full_name into pname from public.users where id = s.provider_id;
    perform public.enqueue_email(
      'sessrep-' || s.id,
      (select email from public.users where id = s.provider_id),
      'Session report: ' || coalesce(s.topic, 'teaching session') || ' — ' || to_char(s.session_date, 'FMMon DD'),
      '<p>Hi ' || coalesce(pname, 'there') || ',</p>' ||
      '<p>Thank you for teaching <strong>' || coalesce(s.topic, 'today''s session') || '</strong> on ' ||
        to_char(s.session_date, 'FMDay, Mon DD, YYYY') || '.</p>' ||
      '<p>While it is fresh, please open the session in the portal and complete the short report:</p>' ||
      '<ul>' ||
      '<li>Confirm which fellows attended</li>' ||
      '<li>Record the topics you discussed</li>' ||
      '<li>Note any learning gaps you identified, and suggest topics for future sessions</li>' ||
      '</ul>' ||
      '<p><a href="' || coalesce(portal, '') || '/my-teaching">Complete the session report</a></p>' ||
      '<p>This takes about a minute and feeds directly into curriculum planning. Once filed, you can also ' ||
      'download a teaching completion letter for your CPD records from the same page.</p>'
    );
    update public.teaching_sessions set report_requested = true where id = s.id;
    n := n + 1;
  end loop;

  -- 4) Same day: ask every active fellow for feedback and topic requests.
  for s in
    select ts.*
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.session_date between local_date - 7 and local_date
      and (ts.session_date < local_date or ts.end_time <= local_time)
      and ts.feedback_requested = false
      and (ts.provider_id is not null or ts.provider_name is not null)
  loop
    select coalesce(u.full_name, s.provider_name) into pname
    from public.users u where u.id = s.provider_id;
    pname := coalesce(pname, s.provider_name);

    fb_subject := 'Your feedback: ' || coalesce(s.topic, 'teaching session') || ' — ' || to_char(s.session_date, 'FMMon DD');

    fb_body :=
      '<p>The teaching session on ' || to_char(s.session_date, 'FMDay, Mon DD') || ' was <strong>' ||
        coalesce(s.topic, 'a didactic session') || '</strong>' ||
        (case when pname is not null then ', taught by <strong>' || pname || '</strong>' else '' end) || '.</p>' ||
      '<p>Please take a minute to rate it and tell us what you would like covered in future sessions.</p>' ||
      '<p><a href="' || coalesce(portal, '') || '/rate-teaching">Give feedback</a></p>' ||
      '<p>Ratings and comments are shown to the teacher <strong>without your name</strong>; only the fellowship ' ||
      'director can see who submitted what. If you were not at this session, you can ignore this email.</p>';

    for r in
      select id, email, full_name from public.users
      where role = 'fellow' and status = 'active' and email is not null
    loop
      perform public.enqueue_email(
        'sesfb-' || s.id || '-' || r.id,
        r.email,
        fb_subject,
        '<p>Hi ' || coalesce(r.full_name, 'there') || ',</p>' || fb_body
      );
      n := n + 1;
    end loop;

    update public.teaching_sessions set feedback_requested = true where id = s.id;
  end loop;

  return n;
end;
$function$;

revoke all on function public.enqueue_teaching_reminders(boolean) from public, anon;

-- Historical sessions are not retroactively chased. Anything before today is
-- marked as already requested so the new 7-day lookback cannot flood inboxes.
update public.teaching_sessions
set report_requested = true, feedback_requested = true
where session_date < (now() at time zone 'America/Toronto')::date;
