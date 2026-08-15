-- Fellows can be assigned in the teaching schedule.
--
-- Journal Club is normally presented by a fellow, but the teacher picker only
-- offered supervisors and directors. list_providers() could not simply be
-- widened — the clinic template picker uses the same function, and fellows do
-- not run clinics — so this adds a separate teaching-side list that carries the
-- role, letting the picker group faculty and fellows.
--
-- Nothing else needed changing on the backend: confirm_teaching,
-- flag_teaching_conflict, cancel_teaching and set_session_zoom_link all
-- authorize through acts_for(provider_id), which is role-agnostic, and the
-- presenter reminder in enqueue_teaching_reminders() reads users.email for
-- whoever provider_id points at.

create or replace function public.list_teachers()
returns table(id uuid, full_name text, role text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(
    (select u.role in ('director', 'admin') from public.users u where u.id = auth.uid()),
    false
  ) then
    raise exception 'not authorized to list teachers';
  end if;

  return query
    select u.id, u.full_name, u.role::text
    from public.users u
    where u.role in ('supervisor', 'director', 'fellow') and u.status = 'active'
    order by (u.role = 'fellow'), u.full_name;
end;
$function$;
revoke all on function public.list_teachers() from public, anon;
grant execute on function public.list_teachers() to authenticated;

-- The attendance panel on a session needs the fellow roster to tick names off.
-- Widen list_fellows to whoever is actually teaching a session, on top of the
-- existing supervisor/director access. Names only, active fellows only.
create or replace function public.list_fellows()
returns table(id uuid, full_name text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (
    coalesce((select u.role in ('supervisor','director','admin')
              from public.users u where u.id = auth.uid()), false)
    or exists (select 1 from public.teaching_sessions ts
               where ts.provider_id = auth.uid() and ts.is_break = false)
  ) then
    raise exception 'not authorized to list fellows';
  end if;

  return query
    select u.id, u.full_name
    from public.users u
    where u.role = 'fellow' and u.status = 'active'
    order by u.full_name;
end;
$function$;
revoke all on function public.list_fellows() from public, anon;
grant execute on function public.list_fellows() to authenticated;
