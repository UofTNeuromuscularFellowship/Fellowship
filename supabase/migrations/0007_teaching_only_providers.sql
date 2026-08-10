-- Teaching-only providers.
--
-- Some supervisors teach in the didactic program but run no fellowship clinics
-- (e.g. faculty who only take Journal Club or a lecture slot). Before this,
-- role='supervisor' put them on the clinic schedule publish email and gave them
-- a clinic view with nothing in it.
--
-- users.teaching_only marks them. Everything teaching-related is deliberately
-- unchanged: they remain in list_providers() so they are assignable as a
-- teacher, and they keep receiving the published teaching schedule, the
-- one-week / one-day presenter reminder, Journal Club announcements, and
-- away-date requests — their away dates still shape the teaching schedule.

alter table public.users add column if not exists teaching_only boolean not null default false;

comment on column public.users.teaching_only is
  'Supervisor teaches but runs no fellowship clinics: excluded from clinic schedule emails and the clinic view. No effect on teaching assignment or teaching notifications.';

create or replace function public.publish_clinic_drafts()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int; u record; portal text; stamp text; cc jsonb; cc_email text; sched text;
begin
  if not coalesce((select role = 'director' from public.users where id = auth.uid()), false) then
    raise exception 'not authorized';
  end if;
  update public.clinic_rotations set is_draft = false where is_draft = true;
  get diagnostics n = row_count;

  if n > 0 then
    select value #>> '{}' into portal from public.app_settings where key = 'portal_url';
    stamp := to_char(now(), 'YYYYMMDDHH24MISS');
    sched := public.clinic_schedule_html(current_date, 8);

    for u in
      select email, full_name from public.users
      where status = 'active' and role in ('fellow','supervisor') and email is not null
        and teaching_only = false          -- teaching-only providers run no clinics
    loop
      perform public.enqueue_email(
        'sched-clinic-' || stamp || '-' || u.email,
        u.email,
        'Clinic schedule published — Neuromuscular Fellowship',
        '<p>Hi ' || coalesce(split_part(u.full_name, ' ', 1), '') || ',</p>' ||
        '<p>The clinic schedule has been published. The upcoming schedule is below; you can always see the live version in the ' ||
        '<a href="' || coalesce(portal, '') || '/clinic">portal</a>, and calendar subscriptions update automatically.</p>' || sched
      );
    end loop;

    select value into cc from public.app_settings where key = 'clinic_cc_emails';
    for cc_email in select jsonb_array_elements_text(coalesce(cc, '[]'::jsonb)) loop
      perform public.enqueue_email(
        'sched-clinic-cc-' || stamp || '-' || cc_email,
        cc_email,
        'Clinic schedule published — Neuromuscular Fellowship',
        '<p>The clinic schedule has been published. The upcoming schedule is below.</p>' || sched
      );
    end loop;
  end if;
  return n;
end;
$function$;

-- Remove the legacy no-argument overload: the p_audience version defaults to
-- 'everyone', so keeping both made a no-arg call ambiguous.
drop function if exists public.request_vacation_submissions();
