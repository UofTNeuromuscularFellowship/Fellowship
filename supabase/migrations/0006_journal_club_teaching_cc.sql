-- Journal Club announcements also go to the teaching CC mailing list
-- (app_settings.teaching_cc_emails, a jsonb array of addresses managed in
-- Settings), on top of the active fellows / supervisors / directors added in
-- 0005. Addresses are trimmed, lower-cased and de-duplicated, and any address
-- that already belongs to an active portal user is skipped so nobody is emailed
-- twice. Ref keys are 'jccc-<session>-<cadence>-<md5(email)>' so the daily cron
-- stays idempotent.
create or replace function public.enqueue_teaching_reminders()
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
begin
  select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
  select value #>> '{}' into zlink from public.app_settings where key = 'zoom_link';
  select value #>> '{}' into zpass from public.app_settings where key = 'zoom_passcode';
  select value #>> '{}' into zid   from public.app_settings where key = 'zoom_meeting_id';

  -- 1) Presenter reminder (unchanged): the assigned teacher confirms / flags.
  for s in
    select ts.*, (ts.session_date - current_date) as days_out
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.provider_id is not null
      and ts.session_date in (current_date + 7, current_date + 1)
      and ((ts.session_date = current_date + 7 and ts.reminded_week = false)
        or (ts.session_date = current_date + 1 and ts.reminded_day = false))
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

  -- 2) Journal Club: notify every active fellow / supervisor / director, plus the
  --    teaching CC mailing list, one week and one day before. Matched by topic,
  --    so no special record type is needed.
  for s in
    select ts.*, (ts.session_date - current_date) as days_out
    from public.teaching_sessions ts
    where ts.is_break = false and ts.assignment_draft = false
      and ts.status <> 'cancelled'
      and ts.topic ilike '%journal club%'
      and ts.session_date in (current_date + 7, current_date + 1)
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

    -- 2a) Portal users by role.
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

    -- 2b) Teaching CC mailing list, skipping anyone already emailed above.
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

  return n;
end;
$function$;
