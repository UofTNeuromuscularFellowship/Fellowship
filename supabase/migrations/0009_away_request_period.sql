-- Name the months an away-dates request covers.
--
-- "Please submit your away dates" left recipients guessing which stretch of the
-- year to fill in. The director can now pass an optional month range, which the
-- email states in its subject and body. Both bounds are optional and either one
-- alone means a single month; with neither set the email reads exactly as it
-- did before, so existing behaviour is preserved.
--
-- Replaces the single-argument version rather than overloading it: with default
-- arguments on the new signature, keeping both would make a one-argument call
-- ambiguous.

drop function if exists public.request_vacation_submissions(text);

create or replace function public.request_vacation_submissions(
  p_audience text default 'everyone',
  p_from date default null,
  p_to date default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  u record; portal text; n int := 0; stamp text;
  a date; b date; period text; subject text;
begin
  if not exists (select 1 from public.users where id = auth.uid() and role in ('director','admin')) then
    raise exception 'not authorized';
  end if;
  if p_audience not in ('fellows','supervisors','everyone') then
    raise exception 'invalid audience';
  end if;

  -- Normalise to month starts; tolerate a single bound or a reversed pair.
  a := date_trunc('month', coalesce(p_from, p_to))::date;
  b := date_trunc('month', coalesce(p_to, p_from))::date;
  if a is not null and b is not null and b < a then
    select a, b into b, a;
  end if;

  if a is null then
    period := null;
  elsif a = b then
    period := to_char(a, 'FMMonth YYYY');
  elsif to_char(a, 'YYYY') = to_char(b, 'YYYY') then
    period := to_char(a, 'FMMonth') || ' – ' || to_char(b, 'FMMonth YYYY');
  else
    period := to_char(a, 'FMMonth YYYY') || ' – ' || to_char(b, 'FMMonth YYYY');
  end if;

  subject := case when period is null
    then 'Please submit away dates — Neuromuscular Fellowship'
    else 'Please submit away dates for ' || period || ' — Neuromuscular Fellowship'
  end;

  select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
  stamp := to_char(now(), 'YYYYMMDDHH24MISS');

  for u in
    select email, full_name, role from public.users
    where status = 'active' and email is not null
      and (
        (p_audience = 'everyone'    and role in ('fellow','supervisor')) or
        (p_audience = 'fellows'     and role = 'fellow') or
        (p_audience = 'supervisors' and role = 'supervisor')
      )
  loop
    perform public.enqueue_email(
      'vacreq-' || stamp || '-' || u.email,
      u.email,
      subject,
      '<p>Hi ' || coalesce(u.full_name, 'there') || ',</p>' ||
      '<p>The fellowship is preparing the upcoming clinic and teaching schedules. Please submit ' ||
      coalesce(u.full_name || '''s', 'your') || ' vacation or away dates' ||
      (case when period is null then '' else ' for <strong>' || period || '</strong>' end) ||
      ' in the <a href="' || coalesce(portal, '') || '/vacation">portal</a> ' ||
      'so the schedule can be built around them.</p>' ||
      (case when period is null then ''
            else '<p>If you have no time away during ' || period || ', there is nothing to submit.</p>' end)
    );
    n := n + 1;
  end loop;

  return n;
end;
$function$;
revoke all on function public.request_vacation_submissions(text, date, date) from public, anon;
grant execute on function public.request_vacation_submissions(text, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Reporting fix: the count returned above covered only the primary recipients.
-- Administrative-assistant copies are added afterwards by the
-- cc_assistant_emails trigger on email_queue, so a send to 4 supervisors who
-- between them have 3 assistants reported "Emailed 4 people" — which reads as
-- though the assistants were left out. Count the queue instead and return the
-- split, so the confirmation states both numbers.
-- ---------------------------------------------------------------------------
drop function if exists public.request_vacation_submissions(text, date, date);

create function public.request_vacation_submissions(
  p_audience text default 'everyone',
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  u record; portal text; n int := 0; stamp text;
  a date; b date; period text; subject text; total int;
begin
  if not exists (select 1 from public.users where id = auth.uid() and role in ('director','admin')) then
    raise exception 'not authorized';
  end if;
  if p_audience not in ('fellows','supervisors','everyone') then
    raise exception 'invalid audience';
  end if;

  a := date_trunc('month', coalesce(p_from, p_to))::date;
  b := date_trunc('month', coalesce(p_to, p_from))::date;
  if a is not null and b is not null and b < a then
    select a, b into b, a;
  end if;

  if a is null then
    period := null;
  elsif a = b then
    period := to_char(a, 'FMMonth YYYY');
  elsif to_char(a, 'YYYY') = to_char(b, 'YYYY') then
    period := to_char(a, 'FMMonth') || ' – ' || to_char(b, 'FMMonth YYYY');
  else
    period := to_char(a, 'FMMonth YYYY') || ' – ' || to_char(b, 'FMMonth YYYY');
  end if;

  subject := case when period is null
    then 'Please submit away dates — Neuromuscular Fellowship'
    else 'Please submit away dates for ' || period || ' — Neuromuscular Fellowship'
  end;

  select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
  stamp := to_char(now(), 'YYYYMMDDHH24MISS');

  for u in
    select email, full_name, role from public.users
    where status = 'active' and email is not null
      and (
        (p_audience = 'everyone'    and role in ('fellow','supervisor')) or
        (p_audience = 'fellows'     and role = 'fellow') or
        (p_audience = 'supervisors' and role = 'supervisor')
      )
  loop
    perform public.enqueue_email(
      'vacreq-' || stamp || '-' || u.email,
      u.email,
      subject,
      '<p>Hi ' || coalesce(u.full_name, 'there') || ',</p>' ||
      '<p>The fellowship is preparing the upcoming clinic and teaching schedules. Please submit ' ||
      coalesce(u.full_name || '''s', 'your') || ' vacation or away dates' ||
      (case when period is null then '' else ' for <strong>' || period || '</strong>' end) ||
      ' in the <a href="' || coalesce(portal, '') || '/vacation">portal</a> ' ||
      'so the schedule can be built around them.</p>' ||
      (case when period is null then ''
            else '<p>If you have no time away during ' || period || ', there is nothing to submit.</p>' end)
    );
    n := n + 1;
  end loop;

  -- Includes the assistant copies the trigger queued while we were looping.
  select count(*) into total from public.email_queue
  where ref_key like 'vacreq-' || stamp || '-%';

  return jsonb_build_object(
    'recipients', n,
    'assistant_copies', greatest(total - n, 0),
    'total', total,
    'period', period
  );
end;
$function$;
revoke all on function public.request_vacation_submissions(text, date, date) from public, anon;
grant execute on function public.request_vacation_submissions(text, date, date) to authenticated;
